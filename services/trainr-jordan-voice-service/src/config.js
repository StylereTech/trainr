import dotenv from 'dotenv';

dotenv.config();

function boolEnv(name, fallback = false) {
  const value = process.env[name];
  if (value === undefined || value === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase());
}

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function publicWsBaseUrl() {
  const base = config.publicBaseUrl.replace(/\/$/, '');
  return base.replace(/^https:/, 'wss:').replace(/^http:/, 'ws:');
}

export const config = {
  port: Number(process.env.PORT || 8080),
  nodeEnv: process.env.NODE_ENV || 'development',
  logLevel: process.env.LOG_LEVEL || 'info',
  publicBaseUrl: (process.env.PUBLIC_BASE_URL || '').replace(/\/$/, ''),

  openaiApiKey: process.env.OPENAI_API_KEY || '',
  openaiRealtimeWsUrl: process.env.OPENAI_REALTIME_WS_URL || 'wss://api.openai.com/v1/realtime',
  openaiRealtimeModel: process.env.OPENAI_REALTIME_MODEL || 'gpt-realtime',
  openaiRealtimeVoice: process.env.OPENAI_REALTIME_VOICE || 'marin',
  openaiTextModel: process.env.OPENAI_TEXT_MODEL || 'gpt-4o-mini',
  openaiTranscriptionModel: process.env.OPENAI_TRANSCRIPTION_MODEL || 'gpt-4o-mini-transcribe',

  twilioAccountSid: process.env.TWILIO_ACCOUNT_SID || '',
  twilioAuthToken: process.env.TWILIO_AUTH_TOKEN || '',
  twilioValidateSignatures: boolEnv('TWILIO_VALIDATE_SIGNATURES', false),

  trainrCrmBaseUrl: (process.env.TRAINR_CRM_BASE_URL || '').replace(/\/$/, ''),
  trainrCrmApiKey: process.env.TRAINR_CRM_API_KEY || '',
  trainrCrmToolUrl: process.env.TRAINR_CRM_TOOL_URL || '',
  trainrVoiceToolSecret: process.env.TRAINR_VOICE_TOOL_SECRET || '',

  paymentConnector: process.env.TRAINR_PAYMENT_CONNECTOR || 'Trainr_Stripe',
  defaultPlanId: process.env.TRAINR_DEFAULT_PLAN_ID || 'trainr_onboarding',
  defaultPlanAmount: process.env.TRAINR_DEFAULT_PLAN_AMOUNT || '149.00',
  currency: process.env.TRAINR_CURRENCY || 'USD',

  maxCallMs: Number(process.env.TRAINR_MAX_CALL_MS || 59 * 60 * 1000),
  heartbeatMs: Number(process.env.TRAINR_WS_HEARTBEAT_MS || 15_000),
};

export function assertRuntimeConfig() {
  requiredEnv('OPENAI_API_KEY');
  if (!config.publicBaseUrl) {
    throw new Error('Missing PUBLIC_BASE_URL. Example: https://trainr-jordan-voice-service.fly.dev');
  }
}

export function urls() {
  const http = config.publicBaseUrl;
  const ws = publicWsBaseUrl();
  return {
    http,
    ws,
    twilioRealtimeWs: `${ws}/voice/trainr/realtime`,
    conversationRelayWs: `${ws}/voice/trainr/conversation-relay`,
    twiml: `${http}/voice/trainr/twiml`,
    paymentTwiml: `${http}/voice/trainr/payment-twiml`,
    paymentComplete: `${http}/voice/trainr/payment-complete`,
    streamStatus: `${http}/voice/trainr/stream-status`,
    callStatus: `${http}/voice/trainr/call-status`,
  };
}
