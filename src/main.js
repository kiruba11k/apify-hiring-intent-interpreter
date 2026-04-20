import { Actor } from 'apify';
import { interpretHiringIntent } from './interpreter.js';
import { validateInput } from './validator.js';
import { log } from './logger.js';

await Actor.init();

try {
    const input = await Actor.getInput();

    if (!input) {
        throw new Error('No input provided. Please provide job data via actor input.');
    }

    log.info('Hiring Intent Interpreter started', { inputKeys: Object.keys(input) });

    // Support both single job and batch array input
    const jobs = Array.isArray(input.jobs) ? input.jobs : [input];

    log.info(`Processing ${jobs.length} job(s)...`);

    const results = [];
    const dataset = await Actor.openDataset();

    for (let i = 0; i < jobs.length; i++) {
        const job = jobs[i];

        // Validate input fields
        const validation = validateInput(job);
        if (!validation.valid) {
            log.warning(`Job ${i + 1} skipped - validation failed`, { errors: validation.errors, job });
            await dataset.pushData({
                company_name: job.company_name || 'Unknown',
                error: `Validation failed: ${validation.errors.join(', ')}`,
                skipped: true,
            });
            continue;
        }

        try {
            log.info(`Interpreting job ${i + 1}/${jobs.length}: ${job.job_title} @ ${job.company_name}`);

            const result = await interpretHiringIntent(job);
            results.push(result);

            await dataset.pushData(result);
            log.info(`✓ Job ${i + 1} interpreted`, {
                company: result.company_name,
                score: result.intent_score,
                type: result.intent_type,
            });

        } catch (err) {
            log.error(`Failed to interpret job ${i + 1}`, { error: err.message, job });
            await dataset.pushData({
                company_name: job.company_name || 'Unknown',
                job_title: job.job_title || 'Unknown',
                error: err.message,
                failed: true,
            });
        }

        // Respect rate limits between API calls
        if (i < jobs.length - 1) {
            await new Promise(r => setTimeout(r, 300));
        }
    }

    // Summary stats
    const summary = buildSummary(results);
    log.info('Processing complete', summary);

    await Actor.setValue('SUMMARY', summary);

    log.info(`✅ Done. ${results.length} job(s) interpreted successfully.`);

} catch (err) {
    log.error('Actor failed', { error: err.message, stack: err.stack });
    throw err;
} finally {
    await Actor.exit();
}

function buildSummary(results) {
    const highIntent = results.filter(r => r.intent_score >= 75).length;
    const medIntent = results.filter(r => r.intent_score >= 40 && r.intent_score < 75).length;
    const lowIntent = results.filter(r => r.intent_score < 40).length;

    const categoryCount = {};
    for (const r of results) {
        for (const cat of (r.intent_categories || [])) {
            categoryCount[cat] = (categoryCount[cat] || 0) + 1;
        }
    }

    const topCategories = Object.entries(categoryCount)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([cat, count]) => ({ category: cat, count }));

    return {
        total_processed: results.length,
        high_intent_count: highIntent,
        medium_intent_count: medIntent,
        low_intent_count: lowIntent,
        top_categories: topCategories,
        avg_intent_score: results.length
            ? Math.round(results.reduce((sum, r) => sum + (r.intent_score || 0), 0) / results.length)
            : 0,
    };
}
