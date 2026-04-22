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
                domain: result.intent_domain,
                subtype: result.intent_subtype,
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

    // Count by intent_domain
    const domainCount = {};
    for (const r of results) {
        if (r.intent_domain && r.intent_domain !== 'None') {
            domainCount[r.intent_domain] = (domainCount[r.intent_domain] || 0) + 1;
        }
    }
    const topDomains = Object.entries(domainCount)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([domain, count]) => ({ domain, count }));

    // Count by intent_subtype
    const subtypeCount = {};
    for (const r of results) {
        if (r.intent_subtype) {
            subtypeCount[r.intent_subtype] = (subtypeCount[r.intent_subtype] || 0) + 1;
        }
    }
    const topSubtypes = Object.entries(subtypeCount)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([subtype, count]) => ({ subtype, count }));

    // Count by role_criticality
    const criticalityCount = { Core: 0, Supporting: 0, Peripheral: 0 };
    for (const r of results) {
        if (r.role_criticality && criticalityCount[r.role_criticality] !== undefined) {
            criticalityCount[r.role_criticality]++;
        }
    }

    // UK-specific count (useful for region filtering)
    const ukCount = results.filter(r =>
        r.location_country && r.location_country.toLowerCase().includes('uk') ||
        r.location_country && r.location_country.toLowerCase().includes('united kingdom')
    ).length;

    return {
        total_processed: results.length,
        high_intent_count: highIntent,
        medium_intent_count: medIntent,
        low_intent_count: lowIntent,
        top_domains: topDomains,
        top_subtypes: topSubtypes,
        role_criticality_breakdown: criticalityCount,
        uk_jobs_count: ukCount,
        avg_intent_score: results.length
            ? Math.round(results.reduce((sum, r) => sum + (r.intent_score || 0), 0) / results.length)
            : 0,
    };
}
