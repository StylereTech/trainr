import { NextRequest, NextResponse } from 'next/server'
import { TRAINR_PHONE_AGENT_PROMPT, TRAINR_PHONE_TOOLS } from '@/lib/trainr-phone-agent'
import { createTrainerProfileDraft, lookupTrainerByPhone, saveOnboardingProgress, startSecurePayment } from '@/lib/trainr-phone-tools'

export const runtime = 'nodejs'

function authorized(req: NextRequest) {
  const secret = process.env.TRAINR_VOICE_TOOL_SECRET
  if (!secret) return true
  return req.headers.get('x-trainr-voice-secret') === secret
}

export async function GET() {
  return NextResponse.json({
    agent: 'Jordan',
    disclosureRequired: true,
    paymentSafety: 'Never collect raw card data conversationally; hand off to Twilio Pay or Stripe Checkout.',
    prompt: TRAINR_PHONE_AGENT_PROMPT,
    tools: TRAINR_PHONE_TOOLS,
  })
}

export async function POST(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const tool = String(body.tool || body.name || '')
  const args = body.arguments || body.args || body

  try {
    switch (tool) {
      case 'lookup_trainer_by_phone': {
        const result = await lookupTrainerByPhone(args.phone || args.callerPhone)
        return NextResponse.json({ ok: true, result })
      }
      case 'save_onboarding_progress': {
        const lead = await saveOnboardingProgress({
          twilioCallSid: args.twilioCallSid,
          callerPhone: args.callerPhone,
          onboarding: args.onboarding,
          transcriptEntry: args.transcriptEntry,
          status: args.status,
        })
        return NextResponse.json({ ok: true, lead })
      }
      case 'create_trainer_profile_draft': {
        const trainer = await createTrainerProfileDraft(args.leadId)
        return NextResponse.json({ ok: true, trainer })
      }
      case 'start_secure_payment': {
        const payment = await startSecurePayment({
          leadId: args.leadId,
          plan: args.plan,
          amountInCents: args.amountInCents,
        })
        return NextResponse.json({ ok: true, payment })
      }
      case 'send_sms':
      case 'send_email':
      case 'schedule_human_callback':
      case 'escalate_to_human':
      case 'end_call_with_summary': {
        const lead = await saveOnboardingProgress({
          twilioCallSid: args.twilioCallSid,
          callerPhone: args.callerPhone,
          onboarding: args.onboarding,
          transcriptEntry: { role: 'tool', tool, args, at: new Date().toISOString() },
          status: tool === 'end_call_with_summary' ? 'completed' : args.status,
        })
        return NextResponse.json({ ok: true, queued: true, tool, leadId: lead.id })
      }
      default:
        return NextResponse.json({ error: `Unknown Trainr phone tool: ${tool}` }, { status: 400 })
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Tool failed'
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
