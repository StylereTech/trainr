import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from '../config.js';
import { postJson } from '../lib/httpJson.js';
import { log } from '../lib/logger.js';

const sessions = new Map();
const dataDir = path.join(process.cwd(), 'data', 'calls');

export function getSession(callSid) {
  if (!callSid) return null;
  return sessions.get(callSid) || null;
}

export function redactSensitive(value) {
  if (typeof value === 'string') {
    return value
      .replace(/\b(?:\d[\s-]?){12,19}\b/g, '[REDACTED_POSSIBLE_CARD]')
      .replace(/\b(?:cvv|cvc|security code)\s*(?:is|:)?\s*\d{3,4}\b/gi, '[REDACTED_SECURITY_CODE]')
      .replace(/\b(?:routing|account)\s*(?:number|#)?\s*(?:is|:)?\s*\d{6,17}\b/gi, '[REDACTED_BANK_DETAIL]');
  }
  if (Array.isArray(value)) return value.map(redactSensitive);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, redactSensitive(v)]));
  }
  return value;
}

export function upsertSession(callSid, patch = {}) {
  if (!callSid) return null;
  const current = sessions.get(callSid) || {
    call_sid: callSid,
    created_at: new Date().toISOString(),
    transcript: [],
    trainer_identity: {},
    training_profile: {},
    business_operations: {},
    sales_status: {},
    tool_events: [],
  };
  const next = deepMerge(current, redactSensitive(patch), { updated_at: new Date().toISOString() });
  sessions.set(callSid, next);
  return next;
}

export function appendTranscript(callSid, role, text, meta = {}) {
  if (!callSid || !text) return;
  const session = upsertSession(callSid);
  session.transcript.push({
    ts: new Date().toISOString(),
    role,
    text: redactSensitive(text),
    ...redactSensitive(meta),
  });
}

export function appendToolEvent(callSid, name, args, result) {
  if (!callSid) return;
  const session = upsertSession(callSid);
  session.tool_events.push({
    ts: new Date().toISOString(),
    name,
    args: redactSensitive(args),
    result: redactSensitive(result),
  });
}

export async function persistSession(callSid, reason = 'update') {
  const session = getSession(callSid);
  if (!session) return null;
  const payload = redactSensitive({ ...session, persist_reason: reason });

  if (config.trainrCrmBaseUrl) {
    try {
      const headers = config.trainrCrmApiKey ? { Authorization: `Bearer ${config.trainrCrmApiKey}` } : {};
      return await postJson(`${config.trainrCrmBaseUrl}/voice/trainr/calls`, payload, { headers, timeoutMs: 15_000 });
    } catch (error) {
      log.warn('CRM persist failed; falling back to local JSONL', { callSid, error: error.message });
    }
  }

  await fs.mkdir(dataDir, { recursive: true });
  const file = path.join(dataDir, `${callSid}.jsonl`);
  await fs.appendFile(file, `${JSON.stringify(payload)}\n`, 'utf8');
  return { ok: true, fallback_file: file };
}

export function deepMerge(...objects) {
  const output = {};
  for (const obj of objects) {
    if (!obj || typeof obj !== 'object') continue;
    for (const [key, value] of Object.entries(obj)) {
      if (value && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date)) {
        output[key] = deepMerge(output[key], value);
      } else if (value !== undefined) {
        output[key] = value;
      }
    }
  }
  return output;
}
