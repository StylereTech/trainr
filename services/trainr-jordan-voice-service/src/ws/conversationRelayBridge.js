import WebSocket from 'ws';
import { config } from '../config.js';
import { log } from '../lib/logger.js';
import { buildJordanPrompt } from '../agent/jordanPrompt.js';
import { appendTranscript, persistSession, upsertSession } from '../agent/sessionStore.js';

function parseJson(raw) {
  try { return JSON.parse(raw.toString()); } catch { return null; }
}

function sendJson(ws, payload) {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(payload));
}

function extractResponseText(data) {
  if (data.output_text) return data.output_text;
  const parts = [];
  for (const item of data.output || []) {
    for (const content of item.content || []) {
      if (content.text) parts.push(content.text);
    }
  }
  return parts.join('\n').trim();
}

async function generateTextReply({ history, callSid, from, prompt }) {
  if (!config.openaiApiKey) {
    return "I can help with Trainr onboarding, but the OpenAI key is not configured on this service yet.";
  }

  const input = [
    { role: 'system', content: buildJordanPrompt({ callSid, from, resumeReason: 'conversation_relay' }) },
    ...history.slice(-16),
    { role: 'user', content: prompt },
  ];

  const res = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.openaiApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: config.openaiTextModel,
      input,
      max_output_tokens: 450,
    }),
  });

  const data = await res.json();
  if (!res.ok) {
    log.warn('ConversationRelay text generation failed', { status: res.status, data });
    return "I hit a temporary issue, but I can still help. Tell me what sport you train and where you're located.";
  }
  return extractResponseText(data) || "Tell me what sport you train and what kind of athletes you work with.";
}

export function attachConversationRelaySocket(ws, req) {
  const context = {
    callSid: '',
    from: '',
    to: '',
    sessionId: '',
    history: [],
  };

  log.info('ConversationRelay socket connected', { ip: req.socket.remoteAddress });

  ws.on('message', async (raw) => {
    const msg = parseJson(raw);
    if (!msg) return;

    if (msg.type === 'setup') {
      context.callSid = msg.callSid || '';
      context.from = msg.from || '';
      context.to = msg.to || '';
      context.sessionId = msg.sessionId || '';
      upsertSession(context.callSid, {
        call_sid: context.callSid,
        from: context.from,
        to: context.to,
        transport: 'twilio_conversation_relay',
      });
      return;
    }

    if (msg.type === 'prompt' && msg.voicePrompt) {
      appendTranscript(context.callSid, 'user', msg.voicePrompt);
      context.history.push({ role: 'user', content: msg.voicePrompt });
      const reply = await generateTextReply({
        history: context.history,
        callSid: context.callSid,
        from: context.from,
        prompt: msg.voicePrompt,
      });
      context.history.push({ role: 'assistant', content: reply });
      appendTranscript(context.callSid, 'assistant', reply);
      sendJson(ws, { type: 'text', token: reply, last: true, interruptible: true });
      return;
    }

    if (msg.type === 'dtmf') {
      appendTranscript(context.callSid, 'caller_dtmf', `Caller pressed ${msg.digit}`);
      return;
    }

    if (msg.type === 'interrupt') {
      appendTranscript(context.callSid, 'interrupt', msg.utteranceUntilInterrupt || 'caller interrupted');
      return;
    }

    if (msg.type === 'error') {
      log.warn('ConversationRelay error message', { description: msg.description });
    }
  });

  ws.on('close', async () => {
    if (context.callSid) await persistSession(context.callSid, 'conversation_relay_close').catch(() => null);
  });

  ws.on('error', (error) => log.error('ConversationRelay socket error', { error: error.message }));
}
