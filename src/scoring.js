import { log } from './logger.js';

/**
 * Post-processing boost rules applied AFTER LLM scoring.
 * These rules implement deterministic business logic that shouldn't
 * be left purely to the LLM.
 */
export function applyBoostRules(parsed, { historical_job_count, job_title, job_description }) {
    let {
        intent_score,
        intent_domain,
        intent_subtype,
        intent_type,
        reasoning,
        signals,
        tech_stack_structured,
        primary_tools,
        role_criticality,
    } = parsed;

    const desc = (job_description || '').toLowerCase();
    const title = (job_title || '').toLowerCase();

    // ── RULE 1: Repeated hiring boost ─────────────────────────────────────
    if (historical_job_count >= 5) {
        intent_score = Math.min(95, intent_score + 15);
    } else if (historical_job_count >= 3) {
        intent_score = Math.min(95, intent_score + 10);
    } else if (historical_job_count >= 2) {
        intent_score = Math.min(95, intent_score + 5);
    }

    // ── RULE 2: Seniority signals → strategic decisions ───────────────────
    const seniorityKeywords = ['vp ', 'vice president', 'director', 'head of', 'chief', 'cto', 'ciso',
        'principal', 'staff engineer', 'distinguished'];
    if (seniorityKeywords.some(k => title.includes(k) || desc.slice(0, 500).includes(k))) {
        intent_score = Math.min(95, intent_score + 10);
        // Escalate criticality if seniority detected
        if (role_criticality === 'Supporting') role_criticality = 'Core';
    }

    // ── RULE 3: Urgency language ──────────────────────────────────────────
    const urgencyKeywords = ['immediately', 'asap', 'urgent', 'as soon as possible',
        'starting immediately', 'critical hire', 'priority hire', '90 days'];
    if (urgencyKeywords.some(k => desc.includes(k))) {
        intent_score = Math.min(95, intent_score + 8);
    }

    // ── RULE 4: Penalize generic roles with no domain ─────────────────────
    if (intent_domain === 'None') {
        intent_score = Math.min(intent_score, 15);
        if (intent_type !== 'None') {
            intent_type = 'None';
        }
        role_criticality = 'Peripheral';
    }

    // ── RULE 5: Core role boost ───────────────────────────────────────────
    // Core roles carry higher conviction than supporting ones
    if (role_criticality === 'Core') {
        intent_score = Math.min(95, intent_score + 8);
    }

    // ── RULE 6: Transformation language boost ────────────────────────────
    const transformKeywords = ['digital transformation', 'modernization', 'cloud-first',
        'greenfield', 'platform rebuild', 'replatform', 'legacy replacement',
        'enterprise rollout', 'global deployment'];
    if (transformKeywords.some(k => desc.includes(k))) {
        intent_score = Math.min(95, intent_score + 10);
    }

    // ── RULE 7: Budget / procurement signals ─────────────────────────────
    const budgetKeywords = ['budget ownership', 'vendor selection', 'rfi', 'rfp',
        'proof of concept', 'poc', 'vendor evaluation', 'tool selection',
        'technology roadmap', 'build vs buy'];
    if (budgetKeywords.some(k => desc.includes(k))) {
        intent_score = Math.min(95, intent_score + 12);
    }

    // ── RULE 8: Team building signals ────────────────────────────────────
    const teamBuildKeywords = ['build the team', 'build a team', 'grow the team',
        'first hire', 'founding engineer', 'scale the team', 'hire and mentor'];
    if (teamBuildKeywords.some(k => desc.includes(k))) {
        intent_score = Math.min(95, intent_score + 7);
        if (intent_type === 'None') intent_type = 'Expansion';
    }

    log.debug('Scoring complete', { finalScore: intent_score, domain: intent_domain, subtype: intent_subtype });

    return {
        intent_domain,
        intent_subtype,
        intent_type,
        intent_score,
        tech_stack_structured,
        primary_tools,
        role_criticality,
        reasoning,
        signals,
    };
}
