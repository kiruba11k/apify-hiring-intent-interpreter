import { log } from './logger.js';

const VALID_DOMAINS = ['ERP', 'Cloud', 'Data', 'Security', 'QA', 'AI', 'None'];
const VALID_INTENT_TYPES = ['Implementation', 'Migration', 'Optimization', 'Expansion', 'None'];
const VALID_CRITICALITY = ['Core', 'Supporting', 'Peripheral'];

/**
 * Parses the raw LLM text output into a validated structured object.
 * Handles common LLM quirks: markdown fences, trailing commas, etc.
 */
export function parseAndValidateOutput(rawContent, company_name) {
    let parsed;

    try {
        // Strip markdown fences if present
        const cleaned = rawContent
            .replace(/```json\s*/gi, '')
            .replace(/```\s*/g, '')
            .trim();

        // Extract JSON object (handles cases where model adds preamble)
        const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
        if (!jsonMatch) throw new Error('No JSON object found in response');

        parsed = JSON.parse(jsonMatch[0]);
    } catch (err) {
        log.warning('JSON parse failed, using safe fallback', { error: err.message, rawContent });
        return safeDefault(company_name, 'Failed to parse LLM response: ' + err.message);
    }

    // ── intent_domain ──────────────────────────────────────────────────────
    let intentDomain = 'None';
    if (typeof parsed.intent_domain === 'string') {
        const normalized = parsed.intent_domain.trim();
        // Case-insensitive match
        const match = VALID_DOMAINS.find(d => d.toLowerCase() === normalized.toLowerCase());
        intentDomain = match || 'None';
    }

    // ── intent_subtype ─────────────────────────────────────────────────────
    let intentSubtype = '';
    if (typeof parsed.intent_subtype === 'string' && parsed.intent_subtype.trim().length > 0) {
        intentSubtype = parsed.intent_subtype.trim();
    }

    // ── intent_type ────────────────────────────────────────────────────────
    let intentType = 'None';
    if (typeof parsed.intent_type === 'string') {
        const normalized = parsed.intent_type.trim();
        intentType = VALID_INTENT_TYPES.includes(normalized) ? normalized : 'None';
    }

    // ── intent_score — must be 0-100 integer ──────────────────────────────
    let score = 0;
    if (typeof parsed.intent_score === 'number') {
        score = Math.max(0, Math.min(95, Math.round(parsed.intent_score)));
    } else if (typeof parsed.intent_score === 'string') {
        const n = parseInt(parsed.intent_score, 10);
        if (!isNaN(n)) score = Math.max(0, Math.min(95, n));
    }

    // If no domain but score is high, something's off — cap it
    if (intentDomain === 'None' && score > 20) {
        log.warning('No domain detected but high score — capping at 20');
        score = Math.min(score, 20);
    }

    // ── tech_stack_structured — array of clean tag strings ─────────────────
    let techStack = [];
    if (Array.isArray(parsed.tech_stack_structured)) {
        techStack = parsed.tech_stack_structured
            .filter(s => typeof s === 'string' && s.trim().length > 0)
            .map(s => s.trim());
    }

    // ── primary_tools — top 2-3 tools ─────────────────────────────────────
    let primaryTools = [];
    if (Array.isArray(parsed.primary_tools)) {
        primaryTools = parsed.primary_tools
            .filter(s => typeof s === 'string' && s.trim().length > 0)
            .map(s => s.trim())
            .slice(0, 3);
    } else if (techStack.length > 0) {
        // Fallback: take first 2 from tech stack
        primaryTools = techStack.slice(0, 2);
    }

    // ── role_criticality ──────────────────────────────────────────────────
    let roleCriticality = 'Supporting';
    if (typeof parsed.role_criticality === 'string') {
        const normalized = parsed.role_criticality.trim();
        roleCriticality = VALID_CRITICALITY.includes(normalized) ? normalized : 'Supporting';
    }

    // ── reasoning — must be non-empty string ──────────────────────────────
    let reasoning = '';
    if (typeof parsed.reasoning === 'string' && parsed.reasoning.trim().length > 10) {
        reasoning = parsed.reasoning.trim();
    } else {
        reasoning = 'No clear technology buying intent signals detected in the job description.';
    }

    // ── signals — array of strings ────────────────────────────────────────
    let signals = [];
    if (Array.isArray(parsed.signals)) {
        signals = parsed.signals.filter(s => typeof s === 'string' && s.trim().length > 0);
    }

    return {
        intent_domain: intentDomain,
        intent_subtype: intentSubtype,
        intent_type: intentType,
        intent_score: score,
        tech_stack_structured: techStack,
        primary_tools: primaryTools,
        role_criticality: roleCriticality,
        reasoning,
        signals,
    };
}

function safeDefault(company_name, reason) {
    return {
        intent_domain: 'None',
        intent_subtype: '',
        intent_type: 'None',
        intent_score: 0,
        tech_stack_structured: [],
        primary_tools: [],
        role_criticality: 'Peripheral',
        reasoning: reason,
        signals: [],
    };
}
