import client from 'prom-client';

export const register = new client.Registry();
client.collectDefaultMetrics({ register });

const httpRequestsTotal = new client.Counter({
  name: 'trainr_voice_http_requests_total',
  help: 'Total HTTP requests handled by the Trainr Jordan voice service',
  labelNames: ['method', 'route', 'status'],
  registers: [register],
});

const activeSockets = new client.Gauge({
  name: 'trainr_voice_active_sockets',
  help: 'Currently active Trainr Jordan voice WebSocket connections',
  labelNames: ['transport'],
  registers: [register],
});

const socketEventsTotal = new client.Counter({
  name: 'trainr_voice_socket_events_total',
  help: 'Total WebSocket lifecycle events',
  labelNames: ['transport', 'event'],
  registers: [register],
});

const toolCallsTotal = new client.Counter({
  name: 'trainr_voice_tool_calls_total',
  help: 'Total Trainr tool calls from Jordan voice service',
  labelNames: ['tool', 'status'],
  registers: [register],
});

const callDurationSeconds = new client.Histogram({
  name: 'trainr_voice_call_duration_seconds',
  help: 'Observed voice socket call duration in seconds',
  buckets: [30, 60, 120, 300, 600, 1200, 2400, 3600],
  labelNames: ['transport', 'reason'],
  registers: [register],
});

export function recordHttp(route) {
  return function httpMetrics(req, res, next) {
    res.on('finish', () => {
      httpRequestsTotal.inc({ method: req.method, route: route || req.route?.path || req.path, status: String(res.statusCode) });
    });
    next();
  };
}

export function socketOpened(transport) {
  activeSockets.inc({ transport });
  socketEventsTotal.inc({ transport, event: 'open' });
}

export function socketClosed(transport, reason, durationMs = 0) {
  activeSockets.dec({ transport });
  socketEventsTotal.inc({ transport, event: reason || 'close' });
  if (durationMs > 0) callDurationSeconds.observe({ transport, reason: reason || 'close' }, durationMs / 1000);
}

export function recordToolCall(tool, ok) {
  toolCallsTotal.inc({ tool, status: ok ? 'ok' : 'error' });
}

export async function metricsText() {
  return register.metrics();
}

export function metricsContentType() {
  return register.contentType;
}
