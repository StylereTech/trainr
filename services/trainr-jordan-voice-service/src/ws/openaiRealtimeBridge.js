import WebSocket from 'ws';
import { config } from '../config.js';
import { log } from '../lib/logger.js';
import { buildJordanPrompt } from '../agent/jordanPrompt.js';
import { trainrToolSchemas } from '../agent/toolSchemas.js';
import { executeTrainrTool } from '../agent/tools.js';
import { appendTranscript, persistSession, upsertSession } from '../agent/sessionStore.js';
import { ensureFinalSummary } from '../agent/summary.js';
import { socketClosed, socketOpened } from '../lib/metrics.js';

function parseJson(raw) {
  try {
    return JSON.parse(raw.toString());
  } catch {
    return null;
  }
}

function sendJson(ws, payload) {
  if (ws?.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(payload));
    return true;
  }
  return false;
}

function paramsFromStart(start = {}) {
  const params = start.customParameters || {};
  return {
    from: params.from || start.from || '',
    to: params.to || start.to || '',
    resumeReason: params.resumeReason || 'new_call',
    tenant: params.tenant || 'trainr',
    agent: params.agent || 'jordan',
  };
}

function buildRealtimeSession(context) {
  return {
    type: 'session.update',
    session: {
      type: 'realtime',
      model: config.openaiRealtimeModel,
      instructions: buildJordanPrompt(context),
      output_modalities: ['audio'],
      audio: {
        input: {
          format: { type: 'audio/pcmu' },
          transcription: { model: config.openaiTranscriptionModel },
          turn_detection: {
            type: 'server_vad',
            threshold: 0.5,
            prefix_padding_ms: 300,
            silence_duration_ms: 700,
            create_response: true,
            interrupt_response: true,
          },
        },
        output: {
          format: { type: 'audio/pcmu' },
          voice: config.openaiRealtimeVoice,
          speed: 1,
        },
      },
      tools: trainrToolSchemas,
      tool_choice: 'auto',
      max_output_tokens: 'inf',
    },
  };
}

function openaiUrl() {
  const base = config.openaiRealtimeWsUrl.replace(/\/$/, '');
  return `${base}?model=${encodeURIComponent(config.openaiRealtimeModel)}`;
}

function normalizeFunctionCall(event) {
  if (event.type === 'response.function_call_arguments.done') {
    return {
      call_id: event.call_id,
      name: event.name,
      arguments: event.arguments || '{}',
    };
  }

  const item = event.item || event.output || event.response?.output?.[0];
  if (item?.type === 'function_call') {
    return {
      call_id: item.call_id,
      name: item.name,
      arguments: item.arguments || '{}',
    };
  }

  return null;
}

function maybeExtractFunctionCallsFromResponseDone(event) {
  const output = event.response?.output;
  if (!Array.isArray(output)) return [];
  return output
    .filter((item) => item?.type === 'function_call')
    .map((item) => ({
      call_id: item.call_id,
      name: item.name,
      arguments: item.arguments || '{}',
    }));
}

export function attachTwilioRealtimeSocket(twilioWs, req) {
  const context = {
    transport: 'twilio_media_streams_openai_realtime',
    callSid: '',
    streamSid: '',
    from: '',
    to: '',
    resumeReason: 'new_call',
    mediaQueue: [],
    existingLead: null,
    handledToolCallIds: new Set(),
    connectedAt: Date.now(),
    openaiReady: false,
    openaiWs: null,
    cleanedUp: false,
  };

  log.info('Twilio realtime socket connected', { ip: req.socket.remoteAddress });
  socketOpened(context.transport);

  const heartbeat = setInterval(() => {
    try {
      if (twilioWs.readyState === WebSocket.OPEN) twilioWs.ping();
      if (context.openaiWs?.readyState === WebSocket.OPEN) context.openaiWs.ping();
    } catch (error) {
      log.warn('heartbeat ping failed', { error: error.message });
    }
  }, config.heartbeatMs);

  const maxCallTimer = setTimeout(async () => {
    log.info('Max call duration reached; closing sockets', { callSid: context.callSid });
    if (context.callSid) {
      await executeTrainrTool('end_call_with_summary', {
        call_sid: context.callSid,
        disposition: 'needs_follow_up',
        summary: 'Call reached configured maximum duration and was closed by the voice service.',
        next_action: 'review_long_call_and_follow_up',
      }, context);
    }
    closeBoth(1000, 'max_call_duration');
  }, config.maxCallMs);

  twilioWs.on('message', async (raw) => {
    const msg = parseJson(raw);
    if (!msg) return;
    await handleTwilioMessage(msg);
  });

  twilioWs.on('close', async () => {
    await cleanup('twilio_close');
  });

  twilioWs.on('error', async (error) => {
    log.error('Twilio WebSocket error', { error: error.message });
    await cleanup('twilio_error');
  });

  async function handleTwilioMessage(msg) {
    switch (msg.event) {
      case 'connected':
        log.debug('Twilio connected event');
        break;

      case 'start': {
        context.streamSid = msg.streamSid || msg.start?.streamSid || '';
        context.callSid = msg.start?.callSid || msg.start?.call_sid || '';
        Object.assign(context, paramsFromStart(msg.start));
        upsertSession(context.callSid, {
          call_sid: context.callSid,
          stream_sid: context.streamSid,
          from: context.from,
          to: context.to,
          resume_reason: context.resumeReason,
          transport: context.transport,
          sales_status: { lead_source: 'phone' },
        });
        log.info('Twilio media stream started', {
          callSid: context.callSid,
          streamSid: context.streamSid,
          from: context.from,
          resumeReason: context.resumeReason,
        });
        const lookup = await executeTrainrTool('lookup_trainer_by_phone', { phone: context.from }, context);
        context.existingLead = lookup?.existing_lead || null;
        connectOpenAI();
        break;
      }

      case 'media': {
        const payload = msg.media?.payload;
        if (!payload) return;
        const event = { type: 'input_audio_buffer.append', audio: payload };
        if (!context.openaiReady) {
          if (context.mediaQueue.length < 500) context.mediaQueue.push(event);
          return;
        }
        sendJson(context.openaiWs, event);
        break;
      }

      case 'dtmf': {
        const digit = msg.dtmf?.digit;
        if (digit) {
          appendTranscript(context.callSid, 'caller_dtmf', `Caller pressed ${digit}`);
          sendJson(context.openaiWs, {
            type: 'conversation.item.create',
            item: {
              type: 'message',
              role: 'user',
              content: [{ type: 'input_text', text: `Caller pressed DTMF digit ${digit}. Do not treat this as card data.` }],
            },
          });
          sendJson(context.openaiWs, { type: 'response.create' });
        }
        break;
      }

      case 'mark':
        break;

      case 'stop':
        log.info('Twilio stream stopped', { callSid: context.callSid, streamSid: context.streamSid });
        await cleanup('twilio_stop');
        break;

      default:
        log.debug('Unhandled Twilio event', { event: msg.event });
    }
  }

  function connectOpenAI() {
    if (context.openaiWs) return;
    if (!config.openaiApiKey) {
      log.error('OPENAI_API_KEY missing; cannot connect OpenAI Realtime');
      closeBoth(1011, 'missing_openai_api_key');
      return;
    }

    const ws = new WebSocket(openaiUrl(), {
      headers: {
        Authorization: `Bearer ${config.openaiApiKey}`,
      },
    });
    context.openaiWs = ws;

    ws.on('open', () => {
      log.info('OpenAI Realtime connected', { callSid: context.callSid, model: config.openaiRealtimeModel });
      context.openaiReady = true;
      sendJson(ws, buildRealtimeSession(context));
      flushQueuedMedia();
      sendJson(ws, {
        type: 'response.create',
        response: {
          instructions: context.resumeReason === 'payment_complete'
            ? 'The secure payment step just completed. Briefly confirm next steps and finish onboarding naturally.'
            : 'Start the phone call now with the Trainr/Jordan opening. Sound warm, confident, and sales-forward.',
        },
      });
    });

    ws.on('message', async (raw) => {
      const event = parseJson(raw);
      if (!event) return;
      await handleOpenAIEvent(event);
    });

    ws.on('close', async (code, reason) => {
      log.info('OpenAI Realtime socket closed', { callSid: context.callSid, code, reason: reason?.toString() });
      context.openaiReady = false;
      await cleanup('openai_close');
    });

    ws.on('error', (error) => {
      log.error('OpenAI Realtime error', { callSid: context.callSid, error: error.message });
    });
  }

  function flushQueuedMedia() {
    if (!context.mediaQueue.length) return;
    for (const event of context.mediaQueue.splice(0)) {
      sendJson(context.openaiWs, event);
    }
  }

  async function handleOpenAIEvent(event) {
    switch (event.type) {
      case 'session.created':
      case 'session.updated':
      case 'conversation.created':
      case 'response.created':
      case 'response.output_item.added':
      case 'response.content_part.added':
      case 'response.output_audio.done':
        break;

      case 'response.output_audio.delta':
      case 'response.audio.delta':
        sendTwilioAudio(event.delta);
        break;

      case 'response.output_audio_transcript.done':
        appendTranscript(context.callSid, 'assistant', event.transcript || '', { item_id: event.item_id });
        break;

      case 'conversation.item.input_audio_transcription.completed':
        appendTranscript(context.callSid, 'user', event.transcript || '', { item_id: event.item_id });
        break;

      case 'input_audio_buffer.speech_started':
        sendTwilioClear();
        break;

      case 'response.function_call_arguments.done':
      case 'response.output_item.done':
      case 'conversation.item.done': {
        const call = normalizeFunctionCall(event);
        if (call) await handleFunctionCall(call);
        break;
      }

      case 'response.done': {
        const calls = maybeExtractFunctionCallsFromResponseDone(event);
        for (const call of calls) await handleFunctionCall(call);
        break;
      }

      case 'error':
        log.error('OpenAI Realtime server error', { callSid: context.callSid, error: event.error || event });
        break;

      default:
        if (event.type?.includes('function_call')) {
          log.debug('OpenAI function-call event', { type: event.type });
        }
    }
  }

  async function handleFunctionCall(call) {
    if (!call.call_id || context.handledToolCallIds.has(call.call_id)) return;
    context.handledToolCallIds.add(call.call_id);

    let args = {};
    try {
      args = call.arguments ? JSON.parse(call.arguments) : {};
    } catch (error) {
      log.warn('Could not parse function arguments', { name: call.name, arguments: call.arguments, error: error.message });
    }

    const result = await executeTrainrTool(call.name, args, context);
    sendJson(context.openaiWs, {
      type: 'conversation.item.create',
      item: {
        type: 'function_call_output',
        call_id: call.call_id,
        output: JSON.stringify(result),
      },
    });

    if (call.name !== 'start_secure_payment') {
      sendJson(context.openaiWs, {
        type: 'response.create',
        response: {
          instructions: 'Continue the Trainr onboarding call naturally. Keep it concise, sales-forward, and ask the next best question.',
        },
      });
    }
  }

  function sendTwilioAudio(base64Pcmu) {
    if (!base64Pcmu || !context.streamSid) return;
    sendJson(twilioWs, {
      event: 'media',
      streamSid: context.streamSid,
      media: { payload: base64Pcmu },
    });
    sendJson(twilioWs, {
      event: 'mark',
      streamSid: context.streamSid,
      mark: { name: `openai-${Date.now()}` },
    });
  }

  function sendTwilioClear() {
    if (!context.streamSid) return;
    sendJson(twilioWs, { event: 'clear', streamSid: context.streamSid });
  }

  function closeBoth(code = 1000, reason = 'normal') {
    try {
      if (context.openaiWs?.readyState === WebSocket.OPEN) context.openaiWs.close(code, reason);
    } catch {}
    try {
      if (twilioWs.readyState === WebSocket.OPEN) twilioWs.close(code, reason);
    } catch {}
  }

  async function cleanup(reason) {
    if (context.cleanedUp) return;
    context.cleanedUp = true;
    clearInterval(heartbeat);
    clearTimeout(maxCallTimer);
    socketClosed(context.transport, reason, Date.now() - context.connectedAt);
    if (context.callSid) {
      upsertSession(context.callSid, { closed_at: new Date().toISOString(), close_reason: reason });
      await ensureFinalSummary(context.callSid, reason).catch((error) => log.warn('summary on cleanup failed', { error: error.message }));
      await persistSession(context.callSid, reason).catch((error) => log.warn('persist on cleanup failed', { error: error.message }));
    }
    try {
      if (context.openaiWs?.readyState === WebSocket.OPEN) context.openaiWs.close(1000, reason);
    } catch {}
  }
}
