import http from 'node:http';
import express from 'express';
import helmet from 'helmet';
import { WebSocketServer } from 'ws';
import { config, assertRuntimeConfig } from './config.js';
import { log } from './lib/logger.js';
import { validateTwilioSignature, validateTwilioUpgrade } from './lib/twilioSecurity.js';
import { trainrVoiceRateLimit } from './lib/rateLimit.js';
import { metricsContentType, metricsText } from './lib/metrics.js';
import { registerTwimlRoutes } from './routes/twiml.js';
import { registerPaymentRoutes } from './routes/payment.js';
import { attachTwilioRealtimeSocket } from './ws/openaiRealtimeBridge.js';
import { attachConversationRelaySocket } from './ws/conversationRelayBridge.js';

if (process.env.NODE_ENV !== 'test') {
  assertRuntimeConfig();
}

const app = express();
app.set('trust proxy', true);
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.urlencoded({ extended: false, limit: '64kb' }));
app.use(express.json({ limit: '64kb' }));

app.get('/', (_req, res) => {
  res.json({
    ok: true,
    service: 'trainr-jordan-voice-service',
    agent: 'Jordan',
    transport: 'twilio-media-streams-openai-realtime',
  });
});

app.get('/healthz', (_req, res) => {
  res.json({ ok: true, ts: new Date().toISOString() });
});

app.get('/health/live', (_req, res) => {
  res.json({ ok: true, live: true, ts: new Date().toISOString() });
});

app.get('/health/ready', (_req, res) => {
  const checks = {
    publicBaseUrl: Boolean(config.publicBaseUrl),
    openai: Boolean(config.openaiApiKey),
    twilioAuth: Boolean(config.twilioAuthToken || !config.twilioValidateSignatures),
    crmTool: Boolean(config.trainrCrmToolUrl || config.trainrCrmBaseUrl),
  };
  const ready = Object.values(checks).every(Boolean);
  res.status(ready ? 200 : 503).json({ ok: ready, ready, checks, ts: new Date().toISOString() });
});

app.get('/metrics', async (_req, res) => {
  res.set('Content-Type', metricsContentType());
  res.send(await metricsText());
});

app.use('/voice/trainr', validateTwilioSignature);
app.use('/voice/trainr', trainrVoiceRateLimit);
registerTwimlRoutes(app);
registerPaymentRoutes(app);

const server = http.createServer(app);
const twilioRealtimeWss = new WebSocketServer({ noServer: true });
const conversationRelayWss = new WebSocketServer({ noServer: true });

twilioRealtimeWss.on('connection', attachTwilioRealtimeSocket);
conversationRelayWss.on('connection', attachConversationRelaySocket);

server.on('upgrade', (req, socket, head) => {
  const url = new URL(req.url || '/', 'http://localhost');
  const isTrainrVoiceSocket = url.pathname === '/voice/trainr/realtime' || url.pathname === '/voice/trainr/conversation-relay';

  if (isTrainrVoiceSocket && !validateTwilioUpgrade(req)) {
    socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
    socket.destroy();
    return;
  }

  if (url.pathname === '/voice/trainr/realtime') {
    twilioRealtimeWss.handleUpgrade(req, socket, head, (ws) => {
      twilioRealtimeWss.emit('connection', ws, req);
    });
    return;
  }

  if (url.pathname === '/voice/trainr/conversation-relay') {
    conversationRelayWss.handleUpgrade(req, socket, head, (ws) => {
      conversationRelayWss.emit('connection', ws, req);
    });
    return;
  }

  socket.write('HTTP/1.1 404 Not Found\r\n\r\n');
  socket.destroy();
});

app.use((err, req, res, next) => {
  log.error('Unhandled HTTP error', {
    path: req.path,
    method: req.method,
    error: err?.message || String(err),
    stack: config.nodeEnv === 'development' ? err?.stack : undefined,
  });
  if (res.headersSent) return next(err);
  res.status(500).json({ error: 'Internal server error' });
});

server.listen(config.port, () => {
  log.info('Trainr Jordan voice service listening', {
    port: config.port,
    publicBaseUrl: config.publicBaseUrl,
    realtimeModel: config.openaiRealtimeModel,
    voice: config.openaiRealtimeVoice,
  });
});

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

function shutdown() {
  log.info('Shutting down Trainr Jordan voice service');
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 10_000).unref();
}
