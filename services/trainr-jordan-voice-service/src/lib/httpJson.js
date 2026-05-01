import { log } from './logger.js';

export async function postJson(url, body, { headers = {}, timeoutMs = 10_000 } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...headers,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const text = await res.text();
    let json = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = { raw: text };
    }
    if (!res.ok) {
      const err = new Error(`POST ${url} failed with ${res.status}`);
      err.status = res.status;
      err.response = json;
      throw err;
    }
    return json;
  } catch (error) {
    log.warn('postJson failed', { url, error: error.message });
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
