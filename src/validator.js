/**
 * Validates a single job input record.
 * Returns { valid: boolean, errors: string[] }
 */
export function validateInput(job) {
    const errors = [];

    if (!job || typeof job !== 'object') {
        return { valid: false, errors: ['Input must be an object'] };
    }

    // ── Required fields ──────────────────────────────────────────────────
    if (!job.job_title || typeof job.job_title !== 'string' || job.job_title.trim().length < 2) {
        errors.push('job_title is required and must be a non-empty string');
    }

    if (!job.job_description || typeof job.job_description !== 'string') {
        errors.push('job_description is required and must be a string');
    } else if (job.job_description.trim().length < 30) {
        errors.push('job_description is too short (minimum 30 characters) — not enough signal to interpret');
    }

    if (!job.company_name || typeof job.company_name !== 'string' || job.company_name.trim().length < 1) {
        errors.push('company_name is required');
    }

    // ── Optional field type checks ───────────────────────────────────────
    if (job.historical_job_count !== undefined) {
        const count = Number(job.historical_job_count);
        if (isNaN(count) || count < 0) {
            errors.push('historical_job_count must be a non-negative number');
        }
    }

    // ── Location fields (optional, but must be strings if provided) ──────
    if (job.location_country !== undefined && job.location_country !== null) {
        if (typeof job.location_country !== 'string' || job.location_country.trim().length < 1) {
            errors.push('location_country must be a non-empty string if provided');
        }
    }

    if (job.location_city !== undefined && job.location_city !== null) {
        if (typeof job.location_city !== 'string' || job.location_city.trim().length < 1) {
            errors.push('location_city must be a non-empty string if provided');
        }
    }

    return { valid: errors.length === 0, errors };
}
