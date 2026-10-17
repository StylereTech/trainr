import { NextRequest, NextResponse } from 'next/server'
import { timingSafeEqual } from 'node:crypto'
import { z } from 'zod'
import { TRAINR_PHONE_AGENT_PROMPT, TRAINR_PHONE_TOOLS } from '@/lib/trainr-phone-agent'
import { createTrainerProfileDraft, lookupTrainerByPhone, saveOnboardingProgress, startSecurePayment } from '@/lib/trainr-phone-tools'

export const runtime = 'nodejs'

function authorized(req: NextRequest) {
  const secret = process.env.TRAINR_VOICE_TOOL_SECRET
  const supplied = req.headers.get('x-trainr-voice-secret')
  if (!secret || !supplied) return false
  const actual = Buffer.from(supplied), expected = Buffer.from(secret)
  return actual.length === expected.length && timingSafeEqual(actual, expected)
}

const paymentArgs = z.object({
  leadId: z.string().trim().min(1).max(128),
  plan: z.enum(['founding_listing', 'founding_package']).optional(),
}).strict()

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
  if (!process.env.TRAINR_VOICE_TOOL_SECRET) return NextResponse.json({ error: 'Voice tools are not configured' }, { status: 503 })
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
        const parsed = paymentArgs.safeParse(args)
        if (!parsed.success) return NextResponse.json({ error: 'A valid lead and plan are required; price cannot be supplied by the caller.' }, { status: 400 })
        const payment = await startSecurePayment({
          leadId: parsed.data.leadId,
          plan: parsed.data.plan,
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
