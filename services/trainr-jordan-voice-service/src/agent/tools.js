import twilio from 'twilio';
import { config, urls } from '../config.js';
import { postJson } from '../lib/httpJson.js';
import { log } from '../lib/logger.js';
import { appendToolEvent, persistSession, upsertSession, getSession, deepMerge } from './sessionStore.js';
import { recordToolCall } from '../lib/metrics.js';

function crmHeaders() {
  const headers = {};
  if (config.trainrCrmApiKey) headers.Authorization = `Bearer ${config.trainrCrmApiKey}`;
  if (config.trainrVoiceToolSecret) headers['x-trainr-voice-secret'] = config.trainrVoiceToolSecret;
  return headers;
}

function crmToolUrl() {
  if (config.trainrCrmToolUrl) return config.trainrCrmToolUrl;
  if (config.trainrCrmBaseUrl) return `${config.trainrCrmBaseUrl}/api/voice/trainr/tools`;
  return '';
}

async function crmPost(path, body) {
  if (!config.trainrCrmBaseUrl) return null;
  return await postJson(`${config.trainrCrmBaseUrl}${path}`, body, { headers: crmHeaders(), timeoutMs: 12_000 });
}

async function crmTool(name, args) {
  const url = crmToolUrl();
  if (!url) return null;
  return await postJson(url, { tool: name, arguments: args }, { headers: crmHeaders(), timeoutMs: 15_000 });
}

function twilioClientOrNull() {
  if (!config.twilioAccountSid || !config.twilioAuthToken) return null;
  return twilio(config.twilioAccountSid, config.twilioAuthToken);
}

function normalizeCallSid(args, context) {
  return args.call_sid || args.callSid || context.callSid || context.call_sid || '';
}

export async function executeTrainrTool(name, rawArgs = {}, context = {}) {
  const args = rawArgs && typeof rawArgs === 'object' ? rawArgs : {};
  const callSid = normalizeCallSid(args, context);
  let result;

  try {
    switch (name) {
      case 'lookup_trainer_by_phone': {
        result = await lookupTrainerByPhone(args, context);
        break;
      }
      case 'save_onboarding_progress': {
        result = await saveOnboardingProgress({ ...args, call_sid: callSid }, context);
        break;
      }
      case 'create_trainer_profile_draft': {
        result = await createTrainerProfileDraft({ ...args, call_sid: callSid }, context);
        break;
      }
      case 'send_sms': {
        result = await sendSms(args, context);
        break;
      }
      case 'send_email': {
        result = await sendEmail(args, context);
        break;
      }
      case 'start_secure_payment': {
        result = await startSecurePayment({ ...args, call_sid: callSid }, context);
        break;
      }
      case 'schedule_human_callback': {
        result = await scheduleHumanCallback({ ...args, call_sid: callSid }, context);
        break;
      }
      case 'end_call_with_summary': {
        result = await endCallWithSummary({ ...args, call_sid: callSid }, context);
        break;
      }
      default:
        result = { ok: false, error: `Unknown tool: ${name}` };
    }
  } catch (error) {
    result = { ok: false, error: error.message };
    log.error('Tool execution failed', { name, callSid, args, error: error.message });
  }

  recordToolCall(name, Boolean(result?.ok));
  appendToolEvent(callSid, name, args, result);
  return result;
}

async function lookupTrainerByPhone(args, context) {
  const phone = args.phone || context.from || '';
  let crmResult = null;
  if (phone) {
    try {
      crmResult = await crmTool('lookup_trainer_by_phone', { phone });
    } catch (error) {
      log.warn('lookup_trainer_by_phone CRM tool failed', { phone, error: error.message });
    }
  }

  const leadId = crmResult?.result?.lead?.id || crmResult?.result?.leadId || crmResult?.lead?.id || '';
  if (leadId) context.trainrLeadId = leadId;

  if (context.callSid) {
    upsertSession(context.callSid, {
      trainer_identity: { phone },
      sales_status: { lead_source: 'phone', lookup_completed: true },
      existing_lead: crmResult,
      trainr_lead_id: leadId || undefined,
    });
  }
  return { ok: true, phone, existing_lead: crmResult, lead_id: leadId };
}

async function saveOnboardingProgress(args, context = {}) {
  const callSid = args.call_sid;
  const patch = {
    trainer_identity: args.trainer_identity || {},
    training_profile: args.training_profile || {},
    business_operations: args.business_operations || {},
    sales_status: args.sales_status || {},
    notes: args.notes,
  };
  upsertSession(callSid, patch);
  await persistSession(callSid, 'onboarding_progress');

  let crmResult = null;
  try {
    crmResult = await crmTool('save_onboarding_progress', {
      twilioCallSid: callSid,
      callerPhone: args.phone || context.from,
      onboarding: {
        trainer_identity: patch.trainer_identity,
        training_profile: patch.training_profile,
        business_operations: patch.business_operations,
        sales_status: patch.sales_status,
        call_metadata: { twilio_call_sid: callSid, ai_disclosure_given: true, recording_consent: true, sms_consent: true },
      },
      transcriptEntry: args.notes ? { role: 'assistant', content: args.notes, at: new Date().toISOString() } : undefined,
      status: args.status,
    });
  } catch (error) {
    log.warn('save_onboarding_progress CRM tool failed', { callSid, error: error.message });
  }

  const leadId = crmResult?.lead?.id || crmResult?.result?.id || crmResult?.result?.lead?.id || '';
  if (leadId) {
    context.trainrLeadId = leadId;
    upsertSession(callSid, { trainr_lead_id: leadId });
  }
  return { ok: true, saved: true, call_sid: callSid, crm: crmResult, lead_id: leadId };
}

async function createTrainerProfileDraft(args, context = {}) {
  const callSid = args.call_sid;
  const session = upsertSession(callSid, {
    profile_draft: {
      profile: args.profile || {},
      recommended_headline: args.recommended_headline || '',
      recommended_bio: args.recommended_bio || '',
      portfolio_gaps: args.portfolio_gaps || [],
      status: 'draft',
    },
    sales_status: { profile_draft_created: true },
  });

  let crmResult = null;
  const leadId = args.leadId || args.lead_id || context.trainrLeadId || session.trainr_lead_id;
  if (leadId) {
    try {
      crmResult = await crmTool('create_trainer_profile_draft', { leadId });
    } catch (error) {
      log.warn('profile draft CRM tool failed', { callSid, leadId, error: error.message });
    }
  }

  await persistSession(callSid, 'profile_draft');
  return { ok: true, profile_draft_created: true, crm: crmResult, lead_id: leadId || '' };
}

async function sendSms(args, context) {
  const to = args.to || context.from;
  const message = args.message;
  const payload = { to, message, purpose: args.purpose || 'other', call_sid: context.callSid };
  let crmResult = null;
  try {
    crmResult = await crmTool('send_sms', { ...payload, callerPhone: context.from, twilioCallSid: context.callSid });
  } catch (error) {
    log.warn('send_sms CRM tool failed', { to, error: error.message });
  }
  return { ok: true, queued: Boolean(crmResult), fallback: !crmResult, to, message_preview: message?.slice(0, 160) };
}

async function sendEmail(args, context) {
  const payload = { ...args, call_sid: context.callSid };
  let crmResult = null;
  try {
    crmResult = await crmTool('send_email', { ...payload, twilioCallSid: context.callSid, callerPhone: context.from });
  } catch (error) {
    log.warn('send_email CRM tool failed', { to: args.to, error: error.message });
  }
  return { ok: true, queued: Boolean(crmResult), fallback: !crmResult, to: args.to };
}

async function startSecurePayment(args, context) {
  const callSid = args.call_sid || context.callSid;
  const planId = args.plan_id || config.defaultPlanId;
  const amount = args.amount || config.defaultPlanAmount;
  const currency = args.currency || config.currency;

  upsertSession(callSid, {
    sales_status: {
      payment_status: 'handoff_started',
      plan_selected: planId,
      amount,
      currency,
    },
    payment_context: {
      plan_id: planId,
      amount,
      currency,
      trainer_name: args.trainer_name || '',
      trainer_email: args.trainer_email || '',
    },
  });
  await persistSession(callSid, 'payment_handoff_started');

  const client = twilioClientOrNull();
  if (!client) {
    return {
      ok: false,
      payment_handoff_started: false,
      error: 'Missing TWILIO_ACCOUNT_SID/TWILIO_AUTH_TOKEN, so the service cannot redirect the live call to Twilio Pay yet.',
      payment_url: `${urls().paymentTwiml}?callSid=${encodeURIComponent(callSid)}&planId=${encodeURIComponent(planId)}&amount=${encodeURIComponent(amount)}&currency=${encodeURIComponent(currency)}`,
    };
  }

  const paymentUrl = `${urls().paymentTwiml}?planId=${encodeURIComponent(planId)}&amount=${encodeURIComponent(amount)}&currency=${encodeURIComponent(currency)}`;
  await client.calls(callSid).update({ url: paymentUrl, method: 'POST' });
  return { ok: true, payment_handoff_started: true, call_sid: callSid, plan_id: planId, amount, currency };
}

async function scheduleHumanCallback(args, context) {
  const callSid = args.call_sid || context.callSid;
  upsertSession(callSid, {
    sales_status: {
      callback_requested: true,
      callback_reason: args.reason,
      next_action: 'human_callback',
    },
  });
  let crmResult = null;
  try {
    crmResult = await crmTool('schedule_human_callback', { ...args, twilioCallSid: callSid, callerPhone: args.phone || context.from });
  } catch (error) {
    log.warn('callback CRM tool failed', { callSid, error: error.message });
  }
  await persistSession(callSid, 'callback_requested');
  return { ok: true, callback_requested: true, crm: crmResult };
}

async function endCallWithSummary(args, context) {
  const callSid = args.call_sid || context.callSid;
  const session = getSession(callSid) || {};
  const patch = {
    final_summary: {
      disposition: args.disposition || 'needs_follow_up',
      summary: args.summary,
      next_action: args.next_action,
      missing_fields: args.missing_fields || [],
      objections: args.objections || [],
    },
    sales_status: {
      disposition: args.disposition || 'needs_follow_up',
      next_action: args.next_action,
      objections: args.objections || session.sales_status?.objections || [],
    },
  };
  upsertSession(callSid, deepMerge(session, patch));
  await crmTool('end_call_with_summary', { twilioCallSid: callSid, callerPhone: context.from, onboarding: { sales_status: patch.sales_status, call_metadata: { call_summary: args.summary } }, status: patch.sales_status.disposition }).catch(() => null);
  await persistSession(callSid, 'final_summary');
  return { ok: true, summary_saved: true, call_sid: callSid };
}
