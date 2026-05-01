import { config } from '../config.js';

const levels = new Map([
  ['debug', 0],
  ['info', 1],
  ['warn', 2],
  ['error', 3],
]);

const activeLevel = levels.get(config.logLevel) ?? 1;

function safe(value) {
  if (value === undefined) return undefined;
  try {
    return JSON.parse(JSON.stringify(value, (_, v) => {
      if (typeof v === 'string') {
        if (/\b\d{12,19}\b/.test(v)) return '[redacted_possible_card]';
        if (/sk-[A-Za-z0-9_-]+/.test(v)) return '[redacted_openai_key]';
      }
      return v;
    }));
  } catch {
    return String(value);
  }
}

function write(level, message, details) {
  if ((levels.get(level) ?? 1) < activeLevel) return;
  const payload = {
    ts: new Date().toISOString(),
    level,
    message,
    ...(details ? { details: safe(details) } : {}),
  };
  // eslint-disable-next-line no-console
  console[level === 'error' ? 'error' : 'log'](JSON.stringify(payload));
}

export const log = {
  debug: (message, details) => write('debug', message, details),
  info: (message, details) => write('info', message, details),
  warn: (message, details) => write('warn', message, details),
  error: (message, details) => write('error', message, details),
};
