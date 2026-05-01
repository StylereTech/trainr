function toPositiveInteger(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function normalizeKey(value = '') {
  return String(value || 'anonymous').replace(/[^a-zA-Z0-9:+_-]/g, '').slice(0, 120) || 'anonymous';
}

export function createRateLimiter({ name = 'request', windowMs = 60_000, maxRequests = 60, keyGenerator } = {}) {
  const buckets = new Map();
  const ttlMs = toPositiveInteger(windowMs, 60_000);
  const limit = toPositiveInteger(maxRequests, 60);

  return function rateLimiter(req, res, next) {
    const now = Date.now();
    const key = normalizeKey(keyGenerator?.(req) || req.ip || 'anonymous');
    const bucket = buckets.get(key);

    if (!bucket || now - bucket.startedAt >= ttlMs) {
      buckets.set(key, { count: 1, startedAt: now });
      res.set('X-RateLimit-Remaining', String(Math.max(limit - 1, 0)));
      next();
      return;
    }

    bucket.count += 1;
    const remaining = Math.max(limit - bucket.count, 0);
    res.set('X-RateLimit-Remaining', String(remaining));

    if (bucket.count > limit) {
      const retryAfter = Math.ceil((bucket.startedAt + ttlMs - now) / 1000);
      res.set('Retry-After', String(Math.max(retryAfter, 1)));
      res.status(429).json({ error: `${name} rate limit exceeded`, retryAfter: Math.max(retryAfter, 1) });
      return;
    }

    if (buckets.size > 5_000) {
      for (const [entryKey, entryValue] of buckets.entries()) {
        if (now - entryValue.startedAt >= ttlMs) buckets.delete(entryKey);
      }
    }

    next();
  };
}

export const trainrVoiceRateLimit = createRateLimiter({
  name: 'trainr_voice',
  windowMs: process.env.TRAINR_VOICE_RATE_LIMIT_WINDOW_MS || 60_000,
  maxRequests: process.env.TRAINR_VOICE_RATE_LIMIT_MAX || 60,
  keyGenerator: (req) => req.body?.CallSid || req.body?.From || req.ip,
});
