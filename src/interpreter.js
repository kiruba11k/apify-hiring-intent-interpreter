import { log } from './logger.js';
import { buildPrompt } from './prompt.js';
import { parseAndValidateOutput } from './parser.js';
import { applyBoostRules } from './scoring.js';

/**
 * Main interpretation function.
 * Takes a job record and returns a structured intent signal.
 */
export async function interpretHiringIntent(job) {
    const {
        job_title,
        job_description,
        company_name,
        historical_job_count = 1,
    } = job;

    // ── 1. Build the LLM prompt ──────────────────────────────────────────────
    const prompt = buildPrompt({ job_title, job_description, company_name, historical_job_count });

    // ── 2. Call Groq model ───────────────────────────────────────────────────
    const groqApiKey = process.env.GROQ_API_KEY;
    if (!groqApiKey) {
        throw new Error('Missing GROQ_API_KEY environment variable');
    }

    let rawContent;
    try {
        const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${groqApiKey}`,
            },
            body: JSON.stringify({
                model: process.env.GROQ_MODEL || 'llama-3.3-70b-versatile',
                max_tokens: 1024,
                temperature: 0,
                messages: [
                    { role: 'system', content: SYSTEM_PROMPT },
                    { role: 'user', content: prompt },
                ],
            }),
        });

        if (!response.ok) {
            const errText = await response.text();
            throw new Error(`HTTP ${response.status}: ${errText}`);
        }

        const data = await response.json();
        rawContent = data.choices?.[0]?.message?.content || '';
    } catch (err) {
        throw new Error(`Groq API call failed: ${err.message}`);
    }

    log.debug('Raw LLM output', { rawContent });

    // ── 3. Parse + validate structured output ────────────────────────────────
    const parsed = parseAndValidateOutput(rawContent, company_name);

    // ── 4. Apply boost rules (repeated hiring, seniority, urgency) ───────────
    const boosted = applyBoostRules(parsed, { historical_job_count, job_title, job_description });

    // ── 5. Attach metadata ───────────────────────────────────────────────────
    return {
        company_name,
        job_title,
        intent_categories: boosted.intent_categories,
        intent_type: boosted.intent_type,
        intent_score: boosted.intent_score,
        intent_strength: scoreToStrength(boosted.intent_score),
        reasoning: boosted.reasoning,
        signals: boosted.signals || [],
        boost_applied: boosted.boost_applied || [],
        historical_job_count,
        interpreted_at: new Date().toISOString(),
    };
}

function scoreToStrength(score) {
    if (score >= 75) return 'High';
    if (score >= 40) return 'Medium';
    return 'Low';
}

// ── System prompt ─────────────────────────────────────────────────────────────
const SYSTEM_PROMPT = `You are an expert B2B sales intelligence analyst specializing in detecting technology buying intent from job postings.

Your task is to analyze a job posting and extract structured buying-intent signals that indicate a company's technology investment priorities.

CATEGORIES (only return applicable ones):
- ERP: SAP, Oracle, NetSuite, Dynamics 365, Workday, Epicor, IFS
- Cloud: AWS, Azure, GCP, cloud migration, cloud-native, DevOps, Kubernetes, Terraform
- Data: data warehouse, data lake, Snowflake, dbt, Spark, Databricks, analytics, BI, Tableau, Power BI
- Security: SIEM, SOC, IAM, zero trust, penetration testing, CSPM, compliance (SOC2/ISO27001/HIPAA)
- QA: test automation, Selenium, Cypress, SDET, QA engineering, testing frameworks
- AI: machine learning, LLM, GenAI, MLOps, NLP, computer vision, AI/ML platform

INTENT TYPES:
- Implementation: net-new technology rollout, "build", "launch", "deploy", "greenfield"
- Migration: moving from legacy/competitor, "migrate", "transition", "replace", "modernize"
- Optimization: improving existing stack, "optimize", "scale", "enhance", "improve performance"
- Expansion: growing existing team/capability (use when historical_job_count >= 3)

SCORING GUIDE (0–100):
- Start at 30 (baseline for any tech job)
- +20 if highly specific technology stack mentioned
- +15 if senior/lead/architect level (strategic decision maker)
- +15 if role implies transformation (migration, implementation)
- +10 if urgency signals ("immediately", "ASAP", "growing team")
- +10 if multiple related roles in history (historical_job_count ≥ 3)
- -15 if role is generic (e.g. "Software Engineer" with no specific tech)
- -20 if purely support/maintenance with no change indicated
- Cap at 95 maximum

RULES:
1. Only include categories with clear evidence from the job description
2. Do NOT hallucinate technology names not present in the text
3. reasoning must cite specific phrases or keywords from the job description
4. If the role is clearly generic HR/admin/sales with no tech buying signal, return intent_score: 5 and intent_categories: []
5. signals must be a list of exact keywords/phrases extracted from the text

OUTPUT: Respond ONLY with a valid JSON object. No markdown, no explanation outside JSON.

JSON schema:
{
  "intent_categories": ["string"],
  "intent_type": "Implementation|Migration|Optimization|Expansion|None",
  "intent_score": 0-100,
  "reasoning": "string (2-4 sentences citing evidence)",
  "signals": ["exact phrase from job description"]
}`;
