import { log } from './logger.js';

/**
 * Post-processing boost rules applied AFTER LLM scoring.
 * These rules implement deterministic business logic that shouldn't
 * be left purely to the LLM.
 */
export function applyBoostRules(parsed, { historical_job_count, job_title, job_description }) {
    let { intent_score, intent_categories, intent_type, reasoning, signals } = parsed;
    const boostApplied = [];
    const desc = (job_description || '').toLowerCase();
    const title = (job_title || '').toLowerCase();

    // ── RULE 1: Repeated hiring boost ─────────────────────────────────────
    // Strong signal: company is scaling/committed to this tech
    if (historical_job_count >= 5) {
        intent_score = Math.min(95, intent_score + 15);
        boostApplied.push(`repeated_hiring_strong (+15, count=${historical_job_count})`);
    } else if (historical_job_count >= 3) {
        intent_score = Math.min(95, intent_score + 10);
        boostApplied.push(`repeated_hiring_moderate (+10, count=${historical_job_count})`);
    } else if (historical_job_count >= 2) {
        intent_score = Math.min(95, intent_score + 5);
        boostApplied.push(`repeated_hiring_mild (+5, count=${historical_job_count})`);
    }

    // ── RULE 2: Seniority signals → strategic decisions ───────────────────
    const seniorityKeywords = ['vp ', 'vice president', 'director', 'head of', 'chief', 'cto', 'ciso',
        'principal', 'staff engineer', 'distinguished'];
    if (seniorityKeywords.some(k => title.includes(k) || desc.slice(0, 500).includes(k))) {
        intent_score = Math.min(95, intent_score + 10);
        boostApplied.push('seniority_boost (+10)');
    }

    // ── RULE 3: Urgency language ──────────────────────────────────────────
    const urgencyKeywords = ['immediately', 'asap', 'urgent', 'as soon as possible',
        'starting immediately', 'critical hire', 'priority hire', '90 days'];
    if (urgencyKeywords.some(k => desc.includes(k))) {
        intent_score = Math.min(95, intent_score + 8);
        boostApplied.push('urgency_language (+8)');
    }

    // ── RULE 4: Penalize generic roles with no categories ─────────────────
    if (intent_categories.length === 0) {
        intent_score = Math.min(intent_score, 15);
        if (intent_type !== 'None') {
            intent_type = 'None';
            boostApplied.push('no_category_penalty (type reset to None)');
        }
    }

    // ── RULE 5: Multiple category boost ──────────────────────────────────
    // Company investing across multiple tech domains = higher conviction
    if (intent_categories.length >= 3) {
        intent_score = Math.min(95, intent_score + 8);
        boostApplied.push(`multi_category_boost (+8, categories=${intent_categories.length})`);
    } else if (intent_categories.length === 2) {
        intent_score = Math.min(95, intent_score + 4);
        boostApplied.push('dual_category_boost (+4)');
    }

    // ── RULE 6: Transformation language boost ────────────────────────────
    const transformKeywords = ['digital transformation', 'modernization', 'cloud-first',
        'greenfield', 'platform rebuild', 'replatform', 'legacy replacement',
        'enterprise rollout', 'global deployment'];
    const transformMatches = transformKeywords.filter(k => desc.includes(k));
    if (transformMatches.length > 0) {
        intent_score = Math.min(95, intent_score + 10);
        boostApplied.push(`transformation_language (+10, matched: ${transformMatches.join(', ')})`);
    }

    // ── RULE 7: Budget / procurement signals ─────────────────────────────
    const budgetKeywords = ['budget ownership', 'vendor selection', 'rfi', 'rfp',
        'proof of concept', 'poc', 'vendor evaluation', 'tool selection',
        'technology roadmap', 'build vs buy'];
    if (budgetKeywords.some(k => desc.includes(k))) {
        intent_score = Math.min(95, intent_score + 12);
        boostApplied.push('budget_procurement_signal (+12)');
    }

    // ── RULE 8: Team building (hiring multiple layers) ───────────────────
    const teamBuildKeywords = ['build the team', 'build a team', 'grow the team',
        'first hire', 'founding engineer', 'scale the team', 'hire and mentor'];
    if (teamBuildKeywords.some(k => desc.includes(k))) {
        intent_score = Math.min(95, intent_score + 7);
        boostApplied.push('team_building_signal (+7)');
        if (intent_type === 'None') intent_type = 'Expansion';
    }

    if (boostApplied.length > 0) {
        log.debug('Boost rules applied', { boostApplied, finalScore: intent_score });
    }

    return {
        intent_categories,
        intent_type,
        intent_score,
        reasoning,
        signals,
        boost_applied: boostApplied,
    };
}
