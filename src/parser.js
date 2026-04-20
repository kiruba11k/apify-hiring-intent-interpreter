import { log } from './logger.js';

const VALID_CATEGORIES = ['ERP', 'Cloud', 'Data', 'Security', 'QA', 'AI'];
const VALID_INTENT_TYPES = ['Implementation', 'Migration', 'Optimization', 'Expansion', 'None'];

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

    // ── Validate & sanitize fields ─────────────────────────────────────────

    // intent_categories — must be array of valid category strings
    let categories = [];
    if (Array.isArray(parsed.intent_categories)) {
        categories = parsed.intent_categories
            .map(c => normalizeCategory(c))
            .filter(Boolean);
    }

    // intent_type
    let intentType = 'None';
    if (typeof parsed.intent_type === 'string') {
        const normalized = parsed.intent_type.trim();
        intentType = VALID_INTENT_TYPES.includes(normalized) ? normalized : 'None';
    }

    // intent_score — must be 0-100 integer
    let score = 0;
    if (typeof parsed.intent_score === 'number') {
        score = Math.max(0, Math.min(95, Math.round(parsed.intent_score)));
    } else if (typeof parsed.intent_score === 'string') {
        const n = parseInt(parsed.intent_score, 10);
        if (!isNaN(n)) score = Math.max(0, Math.min(95, n));
    }

    // If no categories but score is high, something's off — cap it
    if (categories.length === 0 && score > 20) {
        log.warning('No categories detected but high score — capping at 20');
        score = Math.min(score, 20);
    }

    // reasoning — must be non-empty string
    let reasoning = '';
    if (typeof parsed.reasoning === 'string' && parsed.reasoning.trim().length > 10) {
        reasoning = parsed.reasoning.trim();
    } else {
        reasoning = 'No clear technology buying intent signals detected in the job description.';
    }

    // signals — array of strings
    let signals = [];
    if (Array.isArray(parsed.signals)) {
        signals = parsed.signals.filter(s => typeof s === 'string' && s.trim().length > 0);
    }

    return {
        intent_categories: categories,
        intent_type: intentType,
        intent_score: score,
        reasoning,
        signals,
    };
}

function normalizeCategory(raw) {
    if (typeof raw !== 'string') return null;
    const upper = raw.trim().toUpperCase();
    // Allow case-insensitive match
    const match = VALID_CATEGORIES.find(c => c.toUpperCase() === upper);
    return match || null;
}

function safeDefault(company_name, reason) {
    return {
        intent_categories: [],
        intent_type: 'None',
        intent_score: 0,
        reasoning: reason,
        signals: [],
    };
}
