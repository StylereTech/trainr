const memoryStore = new Map();

function scopedKey(scope, key) {
  return `trainr-jordan:${scope}:${key}`;
}

function prune(now = Date.now()) {
  for (const [key, entry] of memoryStore.entries()) {
    if (entry.expiresAt <= now) memoryStore.delete(key);
  }
}

export function getTwilioIdempotencyToken(req) {
  return req.get?.('i-twilio-idempotency-token') || req.get?.('x-twilio-idempotency-token') || null;
}

export function buildTwilioCacheKey(req, routeName, callSid = '') {
  const token = getTwilioIdempotencyToken(req);
  if (!token) return null;
  return `${routeName}:${callSid || 'unknown'}:${token}`;
}

export async function getStoredValue(scope, key) {
  prune();
  const entry = memoryStore.get(scopedKey(scope, key));
  return entry ? entry.value : null;
}

export async function storeValue(scope, key, value, ttlSeconds = 6 * 60 * 60) {
  prune();
  memoryStore.set(scopedKey(scope, key), {
    value,
    expiresAt: Date.now() + ttlSeconds * 1000,
  });
  return true;
}

export async function restoreCachedTwilioXml(req, res, routeName, callSid = '') {
  const cacheKey = buildTwilioCacheKey(req, routeName, callSid);
  if (!cacheKey) return { restored: false, cacheKey: null };
  const cached = await getStoredValue('twilio-response', cacheKey);
  if (!cached?.body) return { restored: false, cacheKey };
  res.type('text/xml').send(cached.body);
  return { restored: true, cacheKey };
}

export async function sendAndCacheTwilioXml(req, res, routeName, callSid, xmlBody) {
  const cacheKey = buildTwilioCacheKey(req, routeName, callSid);
  if (cacheKey) await storeValue('twilio-response', cacheKey, { body: xmlBody });
  res.type('text/xml').send(xmlBody);
}

setInterval(() => prune(), 60_000).unref();
