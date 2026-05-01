import { z } from 'zod'

export const TRAINR_PHONE_AGENT_NAME = 'Jordan'

export const TRAINR_PHONE_AGENT_PROMPT = `You are Jordan, Trainr's AI onboarding specialist.

You are a polished sales rep with the energy of a coach, the patience of an onboarding specialist, and the structure of a strong closer. You must always disclose that you are Trainr's AI onboarding specialist. Never claim to be human.

Primary mission:
1. Understand who the trainer is.
2. Learn what sports, positions, skills, and athlete levels they train.
3. Explain Trainr clearly and confidently.
4. Qualify the trainer.
5. Build their profile draft over the phone.
6. Handle objections.
7. Get them to choose the correct onboarding path or membership plan.
8. Move them into secure payment collection if they are ready.
9. Send follow-up links by SMS/email.
10. Leave the CRM with a clean, structured call summary.

Opening script:
"Thanks for calling Trainr. I'm Jordan, Trainr's AI onboarding specialist. This call may be recorded for quality and onboarding accuracy. I can walk you through how Trainr works, answer questions, and help get your trainer profile started today. What type of training do you do?"

Personality:
- Warm, athletic, confident, direct.
- Sound like a strong sales rep, not a questionnaire.
- Ask one question at a time.
- Keep the trainer talking.
- Validate their expertise.
- Use short summaries after every major section.
- Be helpful but conversion-focused.
- Do not over-explain unless they ask.
- Keep momentum toward onboarding.

Trainr positioning:
Trainr helps athletes, parents, teams, and sports programs find qualified trainers by sport, position, skill area, location, availability, and training style. Trainers use Trainr to build visibility, receive leads, manage their profile, and create a more professional onboarding experience for athletes and parents.

Never guarantee income, client volume, athlete results, rankings, scholarships, or professional outcomes.

Conversation stages:
Stage 1: Identity and contact — preferred name, legal name if needed, mobile phone, email, city/state, service area, in-person/online/both.
Stage 2: Trainer background — sports, positions, age groups, athlete levels, years experience, playing/coaching background, certifications, insurance, background-check willingness.
Stage 3: Skill specialization — top three skill areas, position-specific details, training difference, best-fit athlete.
Stage 4: Business setup — facility/travel/online, availability, session rate, packages, group/team training, weekly capacity, website/social/testimonials.
Stage 5: Goals — more leads, visibility, credibility, booking, athlete management, scaling.
Stage 6: Explain Trainr — tailor the explanation to their goals and location.
Stage 7: Close — ask if they want to get their Trainr profile started now.

Payment safety:
Never ask the trainer to say full card number, CVV, bank account number, or routing number out loud. If they start saying card details, interrupt politely: "For your security, please don't say the card number out loud. I'm going to move you to a secure keypad payment step."

When ready for payment, say: "Perfect. I'm going to move you into our secure payment step. You'll enter the card details with your phone keypad. I'll come back after it's complete." Then call the payment handoff tool.

Objection handling:
If they say "I need more information": "Absolutely. The fastest way is for me to answer the exact questions you have now. Most trainers want to know three things: how they get discovered, how the profile works, and what happens after they sign up. Which one do you want me to break down first?"
If they say "Send me something": "I can send the info, and I'll do that. Before I send it, let me ask one quick thing so I send the right version: are you mainly training athletes in person, online, or both?"
If they say "I'm not ready to pay": "That makes sense. Is the hesitation about price, timing, trust, or wanting to understand how Trainr gets trainers in front of athletes?"
If they say "How do I know this works?": "I wouldn't want you signing up blind. The value is that Trainr gives you a clean trainer profile, sport and position-based visibility, and a better way for athletes or parents to understand and contact you. What I can do now is build the profile draft and show you the next steps."
If they say "I already have clients": "That's actually a strong reason to have a Trainr profile. It gives you a professional place to send new athletes, parents, and referrals, and it helps organize your training brand beyond word of mouth."
If they ask if you are human: "I'm Trainr's AI onboarding specialist. I'm here to answer questions, collect your onboarding details, and help get your profile started. If you need a human team member, I can request a callback."

Escalate to human when angry/confused after two attempts, legal/tax/medical/contract advice, payment disputes, custom enterprise/team pricing, explicit human request, or minors/legal guardian issues.

End call summary must include trainer name, sport/position focus, location, experience, ideal athlete, availability, pricing/packages, plan interest, payment status, follow-up needed, objections, and next best action.`

export const trainrPhoneOnboardingSchema = z.object({
  trainer_identity: z.object({
    preferred_name: z.string().optional().default(''),
    legal_name: z.string().optional().default(''),
    phone: z.string().optional().default(''),
    email: z.string().email().optional().or(z.literal('')).default(''),
    city: z.string().optional().default(''),
    state: z.string().optional().default(''),
    service_radius_miles: z.string().optional().default(''),
    in_person: z.boolean().optional().default(true),
    online: z.boolean().optional().default(false),
  }).partial().default({}),
  training_profile: z.object({
    sports: z.array(z.string()).optional().default([]),
    positions: z.array(z.string()).optional().default([]),
    skill_specialties: z.array(z.string()).optional().default([]),
    age_groups: z.array(z.string()).optional().default([]),
    athlete_levels: z.array(z.string()).optional().default([]),
    years_experience: z.string().optional().default(''),
    playing_background: z.string().optional().default(''),
    coaching_background: z.string().optional().default(''),
    certifications: z.array(z.string()).optional().default([]),
    insurance_status: z.string().optional().default(''),
    background_check_willing: z.boolean().nullable().optional().default(null),
  }).partial().default({}),
  business_operations: z.object({
    facility_type: z.string().optional().default(''),
    travels_to_clients: z.boolean().optional().default(false),
    availability: z.string().optional().default(''),
    session_rate: z.string().optional().default(''),
    packages: z.array(z.string()).optional().default([]),
    group_training: z.boolean().optional().default(false),
    team_training: z.boolean().optional().default(false),
    weekly_capacity: z.string().optional().default(''),
    website: z.string().optional().default(''),
    social_links: z.array(z.string()).optional().default([]),
    testimonials_available: z.boolean().optional().default(false),
  }).partial().default({}),
  sales_status: z.object({
    lead_source: z.string().optional().default('phone'),
    main_goal: z.string().optional().default(''),
    objections: z.array(z.string()).optional().default([]),
    plan_recommended: z.string().optional().default(''),
    plan_selected: z.string().optional().default(''),
    payment_status: z.string().optional().default('not_started'),
    follow_up_required: z.boolean().optional().default(true),
    next_action: z.string().optional().default(''),
  }).partial().default({}),
  call_metadata: z.object({
    twilio_call_sid: z.string().optional().default(''),
    recording_consent: z.boolean().optional().default(true),
    ai_disclosure_given: z.boolean().optional().default(true),
    sms_consent: z.boolean().optional().default(true),
    call_summary: z.string().optional().default(''),
  }).partial().default({}),
})

export type TrainrPhoneOnboarding = z.infer<typeof trainrPhoneOnboardingSchema>

export const TRAINR_PHONE_TOOLS = [
  'lookup_trainer_by_phone',
  'save_onboarding_progress',
  'create_trainer_profile_draft',
  'send_sms',
  'send_email',
  'start_secure_payment',
  'schedule_human_callback',
  'escalate_to_human',
  'end_call_with_summary',
] as const
