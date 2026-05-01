import { randomUUID } from 'crypto'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { stripe, stripeRuntimeStatus } from '@/lib/stripe'
import { toAbsoluteAppUrl } from '@/lib/app-url'
import { trainrPhoneOnboardingSchema, type TrainrPhoneOnboarding } from '@/lib/trainr-phone-agent'

type JsonRecord = Record<string, unknown>

function asInputJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value ?? {})) as Prisma.InputJsonValue
}

function normalizePhone(phone?: string | null) {
  if (!phone) return ''
  const digits = phone.replace(/\D/g, '')
  if (digits.length === 10) return `+1${digits}`
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`
  return phone.trim()
}

function splitName(name = '') {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  return {
    firstName: parts[0] || 'Trainer',
    lastName: parts.slice(1).join(' ') || 'Lead',
  }
}

function slugify(input: string) {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || `trainer-${Date.now()}`
}

function mergeJson(existing: unknown, incoming: unknown) {
  if (!incoming || typeof incoming !== 'object') return (existing || {}) as JsonRecord
  if (!existing || typeof existing !== 'object') return incoming as JsonRecord
  return { ...(existing as JsonRecord), ...(incoming as JsonRecord) }
}

export async function lookupTrainerByPhone(phone?: string | null) {
  const normalized = normalizePhone(phone)
  if (!normalized) return null

  const [trainer, lead] = await Promise.all([
    prisma.trainerProfile.findFirst({ where: { phone: normalized }, include: { user: { select: { email: true } } } }),
    prisma.trainerPhoneLead.findFirst({ where: { callerPhone: normalized }, orderBy: { updatedAt: 'desc' } }),
  ])

  return { normalizedPhone: normalized, trainer, lead }
}

export async function saveOnboardingProgress(input: {
  twilioCallSid?: string
  callerPhone?: string
  onboarding?: Partial<TrainrPhoneOnboarding>
  transcriptEntry?: JsonRecord
  status?: string
}) {
  const parsed = trainrPhoneOnboardingSchema.partial().parse(input.onboarding || {})
  const callerPhone = normalizePhone(input.callerPhone || parsed.trainer_identity?.phone || '')
  const existing = input.twilioCallSid
    ? await prisma.trainerPhoneLead.findUnique({ where: { twilioCallSid: input.twilioCallSid } })
    : callerPhone
      ? await prisma.trainerPhoneLead.findFirst({ where: { callerPhone }, orderBy: { updatedAt: 'desc' } })
      : null

  const transcript = input.transcriptEntry
    ? [...((existing?.transcript as JsonRecord[] | null) || []), input.transcriptEntry]
    : existing?.transcript || undefined

  const data = {
    twilioCallSid: input.twilioCallSid || existing?.twilioCallSid,
    callerPhone: callerPhone || existing?.callerPhone,
    status: input.status || existing?.status || 'in_progress',
    recordingConsent: parsed.call_metadata?.recording_consent ?? existing?.recordingConsent ?? true,
    aiDisclosureGiven: parsed.call_metadata?.ai_disclosure_given ?? existing?.aiDisclosureGiven ?? true,
    smsConsent: parsed.call_metadata?.sms_consent ?? existing?.smsConsent ?? true,
    trainerIdentity: asInputJson(mergeJson(existing?.trainerIdentity, parsed.trainer_identity)),
    trainingProfile: asInputJson(mergeJson(existing?.trainingProfile, parsed.training_profile)),
    businessOperations: asInputJson(mergeJson(existing?.businessOperations, parsed.business_operations)),
    salesStatus: asInputJson(mergeJson(existing?.salesStatus, parsed.sales_status)),
    callMetadata: asInputJson(mergeJson(existing?.callMetadata, parsed.call_metadata)),
    transcript: transcript ? asInputJson(transcript) : undefined,
    summary: parsed.call_metadata?.call_summary || existing?.summary,
  }

  if (existing) {
    return prisma.trainerPhoneLead.update({ where: { id: existing.id }, data })
  }

  return prisma.trainerPhoneLead.create({ data })
}

export async function createTrainerProfileDraft(leadId: string) {
  const lead = await prisma.trainerPhoneLead.findUnique({ where: { id: leadId } })
  if (!lead) throw new Error('Trainer phone lead not found')

  const identity = (lead.trainerIdentity || {}) as any
  const training = (lead.trainingProfile || {}) as any
  const business = (lead.businessOperations || {}) as any
  const email = String(identity.email || '').trim().toLowerCase()
  if (!email) throw new Error('Email required before profile draft creation')

  const name = splitName(identity.legal_name || identity.preferred_name)
  const baseSlug = slugify(`${name.firstName}-${name.lastName}-${identity.city || 'trainr'}`)
  let slug = baseSlug
  let suffix = 1
  while (await prisma.trainerProfile.findUnique({ where: { slug } })) {
    suffix += 1
    slug = `${baseSlug}-${suffix}`
  }

  const user = await prisma.user.upsert({
    where: { email },
    update: { role: 'TRAINER' },
    create: {
      email,
      passwordHash: `phone-onboarding:${randomUUID()}`,
      role: 'TRAINER',
    },
  })

  const headlineSport = Array.isArray(training.sports) && training.sports[0] ? training.sports[0] : 'Youth Sports'
  const headline = `${headlineSport} trainer in ${identity.city || 'your area'}`.slice(0, 100)
  const bioParts = [
    training.playing_background,
    training.coaching_background,
    training.skill_specialties?.length ? `Specialties: ${training.skill_specialties.join(', ')}` : '',
    business.availability ? `Availability: ${business.availability}` : '',
  ].filter(Boolean)

  const trainer = await prisma.trainerProfile.upsert({
    where: { userId: user.id },
    update: {
      firstName: name.firstName,
      lastName: name.lastName,
      headline,
      bio: bioParts.join('\n\n').slice(0, 2000),
      phone: normalizePhone(identity.phone || lead.callerPhone),
      yearsExperience: Number.parseInt(String(training.years_experience || '0'), 10) || 0,
      locationType: identity.in_person && identity.online ? 'BOTH' : identity.online ? 'VIRTUAL' : 'IN_PERSON',
      city: identity.city || undefined,
      state: identity.state || undefined,
      travelRadius: Number.parseInt(String(identity.service_radius_miles || '25'), 10) || 25,
      completionPercentage: 65,
    },
    create: {
      userId: user.id,
      firstName: name.firstName,
      lastName: name.lastName,
      slug,
      headline,
      bio: bioParts.join('\n\n').slice(0, 2000),
      phone: normalizePhone(identity.phone || lead.callerPhone),
      yearsExperience: Number.parseInt(String(training.years_experience || '0'), 10) || 0,
      locationType: identity.in_person && identity.online ? 'BOTH' : identity.online ? 'VIRTUAL' : 'IN_PERSON',
      city: identity.city || undefined,
      state: identity.state || undefined,
      travelRadius: Number.parseInt(String(identity.service_radius_miles || '25'), 10) || 25,
      completionPercentage: 65,
    },
  })

  await prisma.trainerPhoneLead.update({
    where: { id: lead.id },
    data: { trainerProfileId: trainer.id, status: 'profile_draft_created' },
  })

  return trainer
}

export async function startSecurePayment(input: {
  leadId: string
  plan?: 'founding_listing' | 'founding_package'
  amountInCents?: number
}) {
  const runtime = stripeRuntimeStatus()
  if (!runtime.secretConfigured) throw new Error('Stripe is not configured')

  const lead = await prisma.trainerPhoneLead.findUnique({ where: { id: input.leadId } })
  if (!lead) throw new Error('Trainer phone lead not found')
  const identity = (lead.trainerIdentity || {}) as any
  const email = String(identity.email || '').trim().toLowerCase() || undefined
  const plan = input.plan || 'founding_listing'
  const amountInCents = input.amountInCents || (plan === 'founding_package' ? 29900 : 9900)
  const name = plan === 'founding_package' ? 'Trainr Founding Trainer Package' : 'Trainr Founding Dallas Trainer Listing'

  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    payment_method_types: ['card'],
    customer_email: email,
    line_items: [{
      price_data: {
        currency: 'usd',
        unit_amount: amountInCents,
        product_data: { name, description: 'Trainr trainer onboarding launch offer' },
      },
      quantity: 1,
    }],
    success_url: toAbsoluteAppUrl('/trainer/onboarding?phonePayment=success'),
    cancel_url: toAbsoluteAppUrl('/for-trainers?phonePayment=cancelled'),
    metadata: { trainerPhoneLeadId: lead.id, plan },
  })

  await prisma.trainerPhoneLead.update({
    where: { id: lead.id },
    data: {
      status: 'payment_link_created',
      salesStatus: asInputJson(mergeJson(lead.salesStatus, { payment_status: 'checkout_created', plan_selected: plan, checkout_session_id: session.id })),
    },
  })

  return { checkoutUrl: session.url, checkoutSessionId: session.id, amountInCents, plan }
}
