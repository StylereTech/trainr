import { config, urls } from '../config.js';
import { escapeXml, twiml } from '../lib/xml.js';
import { upsertSession } from '../agent/sessionStore.js';

function streamParameter(name, value) {
  if (value === undefined || value === null || value === '') return '';
  return `<Parameter name="${escapeXml(name)}" value="${escapeXml(String(value).slice(0, 500))}" />`;
}

export function registerTwimlRoutes(app) {
  app.post('/voice/trainr/twiml', (req, res) => {
    const callSid = req.body?.CallSid || req.query?.CallSid || '';
    const from = req.body?.From || req.query?.From || '';
    const to = req.body?.To || req.query?.To || '';
    const resumeReason = req.query?.resume || req.body?.resume || 'new_call';

    if (callSid) {
      upsertSession(callSid, {
        call_sid: callSid,
        from,
        to,
        resume_reason: resumeReason,
        sales_status: { lead_source: 'phone' },
      });
    }

    const xml = twiml(`
      <Connect>
        <Stream url="${escapeXml(urls().twilioRealtimeWs)}" name="trainr-jordan" statusCallback="${escapeXml(urls().streamStatus)}" statusCallbackMethod="POST">
          ${streamParameter('tenant', 'trainr')}
          ${streamParameter('agent', 'jordan')}
          ${streamParameter('resumeReason', resumeReason)}
          ${streamParameter('from', from)}
          ${streamParameter('to', to)}
        </Stream>
      </Connect>
      <Redirect method="POST">${escapeXml(urls().twiml)}?resume=stream_ended</Redirect>
    `);

    res.type('text/xml').send(xml);
  });

  app.post('/voice/trainr/conversation-relay-twiml', (req, res) => {
    const callSid = req.body?.CallSid || '';
    const from = req.body?.From || '';
    if (callSid) upsertSession(callSid, { call_sid: callSid, from, transport: 'conversation_relay' });

    const xml = twiml(`
      <Connect>
        <ConversationRelay
          url="${escapeXml(urls().conversationRelayWs)}"
          welcomeGreeting="Thanks for calling Trainr. I'm Jordan, Trainr's AI onboarding specialist. I can walk you through how Trainr works and help get your trainer profile started today. What type of training do you do?"
          language="en-US"
          interruptible="any"
          dtmfDetection="true">
          ${streamParameter('tenant', 'trainr')}
          ${streamParameter('agent', 'jordan')}
          ${streamParameter('from', from)}
        </ConversationRelay>
      </Connect>
    `);

    res.type('text/xml').send(xml);
  });

  app.post('/voice/trainr/stream-status', (req, res) => {
    const callSid = req.body?.CallSid;
    if (callSid) {
      upsertSession(callSid, {
        stream_status: {
          stream_sid: req.body?.StreamSid,
          event: req.body?.StreamEvent,
          error: req.body?.StreamError,
          timestamp: req.body?.Timestamp,
        },
      });
    }
    res.status(204).send();
  });

  app.post('/voice/trainr/call-status', (req, res) => {
    const callSid = req.body?.CallSid;
    if (callSid) {
      upsertSession(callSid, {
        call_status: {
          status: req.body?.CallStatus,
          duration: req.body?.CallDuration,
          direction: req.body?.Direction,
        },
      });
    }
    res.status(204).send();
  });

  app.get('/voice/trainr/dev-twiml', (_req, res) => {
    const xml = twiml(`
      <Say>Connecting to the Trainr Jordan development voice agent.</Say>
      <Redirect method="POST">${escapeXml(urls().twiml)}?resume=dev</Redirect>
    `);
    res.type('text/xml').send(xml);
  });
}
