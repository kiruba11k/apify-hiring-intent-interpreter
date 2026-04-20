// Simple structured logger that integrates with Apify's log system
import { log as apifyLog } from 'apify';

const DEBUG = (process.env.LOG_LEVEL || '').toUpperCase() === 'DEBUG';

export const log = {
    info: (msg, data = {}) => apifyLog.info(msg, data),
    warning: (msg, data = {}) => apifyLog.warning(msg, data),
    error: (msg, data = {}) => apifyLog.error(msg, data),
    debug: (msg, data = {}) => {
        if (DEBUG) apifyLog.debug(msg, data);
    },
};
