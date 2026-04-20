/**
 * Builds the user-turn prompt sent to Claude.
 * Keeps it structured so the model can focus on analysis.
 */
export function buildPrompt({ job_title, job_description, company_name, historical_job_count }) {
    // Truncate extremely long descriptions to avoid token bloat (keep ~3000 chars)
    const truncatedDesc = job_description && job_description.length > 3000
        ? job_description.slice(0, 3000) + '\n[...description truncated for length...]'
        : (job_description || 'Not provided');

    const historySignal = historical_job_count > 1
        ? `\nNOTE: This company has posted ${historical_job_count} similar roles historically — treat this as a strong repeated-hiring signal.`
        : '';

    return `Analyze the following job posting for technology buying intent signals.

COMPANY: ${company_name}
JOB TITLE: ${job_title}
HISTORICAL SIMILAR JOB POSTINGS: ${historical_job_count}${historySignal}

JOB DESCRIPTION:
---
${truncatedDesc}
---

Return a JSON object following the schema in your instructions. Be specific and evidence-based.`;
}
