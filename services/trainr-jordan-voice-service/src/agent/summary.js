import { config } from '../config.js';
import { log } from '../lib/logger.js';
import { getSession, upsertSession } from './sessionStore.js';

function extractResponseText(data) {
  if (data?.output_text) return data.output_text;
  const parts = [];
  for (const item of data?.output || []) {
    for (const content of item.content || []) {
      if (content.text) parts.push(content.text);
    }
  }
  return parts.join('\n').trim();
}

function safeJsonParse(text) {
  if (!text) return null;
  const trimmed = text.trim().replace(/^```json\s*/i, '').replace(/```$/i, '').trim();
  try { return JSON.parse(trimmed); } catch { return null; }
}

function fallbackSummary(session, reason) {
  const identity = session.trainer_identity || {};
  const profile = session.training_profile || {};
  const sales = session.sales_status || {};
  const transcript = session.transcript || [];
  const lastUser = [...transcript].reverse().find((m) => m.role === 'user')?.text || '';
  return {
    disposition: sales.disposition || sales.payment_status || 'needs_follow_up',
    summary: [
      identity.preferred_name || identity.full_name ? `Trainer: ${identity.preferred_name || identity.full_name}.` : '',
      profile.sports?.length ? `Sports: ${profile.sports.join(', ')}.` : '',
      profile.positions?.length ? `Positions: ${profile.positions.join(', ')}.` : '',
      sales.plan_selected ? `Plan selected: ${sales.plan_selected}.` : '',
      lastUser ? `Last caller statement: ${lastUser}` : '',
      `Close reason: ${reason}.`,
    ].filter(Boolean).join(' '),
    next_action: sales.next_action || 'review_call_and_follow_up',
    missing_fields: [],
    objections: sales.objections || [],
  };
}

export async function ensureFinalSummary(callSid, reason = 'call_closed') {
  const session = getSession(callSid);
  if (!session || session.final_summary?.summary) return session?.final_summary || null;

  const transcriptText = (session.transcript || [])
    .slice(-120)
    .map((m) => `${m.role}: ${m.text}`)
    .join('\n')
    .slice(-14_000);

  if (!config.openaiApiKey || !transcriptText) {
    const fallback = fallbackSummary(session, reason);
    upsertSession(callSid, { final_summary: fallback, sales_status: { disposition: fallback.disposition, next_action: fallback.next_action } });
    return fallback;
  }

  try {
    const res = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.openaiApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: config.openaiTextModel,
        input: [
          {
            role: 'system',
            content: 'You summarize Trainr trainer onboarding sales calls for CRM. Return only JSON with keys: disposition, summary, next_action, missing_fields, objections. Never include payment card data.',
          },
          {
            role: 'user',
            content: JSON.stringify({
              close_reason: reason,
              trainer_identity: session.trainer_identity || {},
              training_profile: session.training_profile || {},
              business_operations: session.business_operations || {},
              sales_status: session.sales_status || {},
              transcript: transcriptText,
            }),
          },
        ],
        max_output_tokens: 650,
      }),
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data?.error?.message || `OpenAI summary status ${res.status}`);
    const parsed = safeJsonParse(extractResponseText(data));
    const summary = parsed || fallbackSummary(session, reason);
    upsertSession(callSid, {
      final_summary: summary,
      sales_status: {
        disposition: summary.disposition || 'needs_follow_up',
        next_action: summary.next_action || 'review_call_and_follow_up',
        objections: summary.objections || session.sales_status?.objections || [],
      },
    });
    return summary;
  } catch (error) {
    log.warn('AI summary generation failed; using fallback summary', { callSid, error: error.message });
    const fallback = fallbackSummary(session, reason);
    upsertSession(callSid, { final_summary: fallback, sales_status: { disposition: fallback.disposition, next_action: fallback.next_action } });
    return fallback;
  }
}
