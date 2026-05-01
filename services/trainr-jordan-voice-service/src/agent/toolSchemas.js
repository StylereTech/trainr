export const trainrToolSchemas = [
  {
    type: 'function',
    name: 'lookup_trainer_by_phone',
    description: 'Look up an existing Trainr lead/trainer by phone number before collecting duplicate information.',
    parameters: {
      type: 'object',
      properties: {
        phone: { type: 'string', description: 'Caller phone number in E.164 if available.' }
      },
      required: ['phone']
    }
  },
  {
    type: 'function',
    name: 'save_onboarding_progress',
    description: 'Save partial trainer onboarding fields during the call. Use this often as information is collected.',
    parameters: {
      type: 'object',
      properties: {
        call_sid: { type: 'string' },
        trainer_identity: { type: 'object', additionalProperties: true },
        training_profile: { type: 'object', additionalProperties: true },
        business_operations: { type: 'object', additionalProperties: true },
        sales_status: { type: 'object', additionalProperties: true },
        notes: { type: 'string' }
      },
      required: []
    }
  },
  {
    type: 'function',
    name: 'create_trainer_profile_draft',
    description: 'Create or update a draft Trainr trainer profile from collected onboarding information.',
    parameters: {
      type: 'object',
      properties: {
        call_sid: { type: 'string' },
        profile: { type: 'object', additionalProperties: true },
        recommended_headline: { type: 'string' },
        recommended_bio: { type: 'string' },
        portfolio_gaps: { type: 'array', items: { type: 'string' } }
      },
      required: ['profile']
    }
  },
  {
    type: 'function',
    name: 'send_sms',
    description: 'Send Trainr onboarding info, follow-up links, payment links, or callback confirmation by SMS.',
    parameters: {
      type: 'object',
      properties: {
        to: { type: 'string' },
        message: { type: 'string' },
        purpose: { type: 'string', enum: ['more_info', 'follow_up', 'payment_link', 'profile_link', 'callback', 'other'] }
      },
      required: ['to', 'message']
    }
  },
  {
    type: 'function',
    name: 'send_email',
    description: 'Send Trainr onboarding summary or next steps by email.',
    parameters: {
      type: 'object',
      properties: {
        to: { type: 'string' },
        subject: { type: 'string' },
        body: { type: 'string' },
        purpose: { type: 'string', enum: ['summary', 'more_info', 'profile_link', 'other'] }
      },
      required: ['to', 'subject', 'body']
    }
  },
  {
    type: 'function',
    name: 'start_secure_payment',
    description: 'Redirect the active Twilio call to a secure Twilio Pay step. Use only after the caller agrees to pay. Never collect card details in conversation.',
    parameters: {
      type: 'object',
      properties: {
        call_sid: { type: 'string' },
        plan_id: { type: 'string' },
        amount: { type: 'string', description: 'Decimal amount, e.g. 149.00' },
        currency: { type: 'string', description: 'Currency code, defaults to USD' },
        trainer_name: { type: 'string' },
        trainer_email: { type: 'string' }
      },
      required: []
    }
  },
  {
    type: 'function',
    name: 'schedule_human_callback',
    description: 'Schedule a human Trainr team callback or mark callback requested.',
    parameters: {
      type: 'object',
      properties: {
        call_sid: { type: 'string' },
        phone: { type: 'string' },
        name: { type: 'string' },
        reason: { type: 'string' },
        preferred_time: { type: 'string' }
      },
      required: ['reason']
    }
  },
  {
    type: 'function',
    name: 'end_call_with_summary',
    description: 'Save final call summary, disposition, profile fields, objections, and next best action before ending the call.',
    parameters: {
      type: 'object',
      properties: {
        call_sid: { type: 'string' },
        disposition: {
          type: 'string',
          enum: ['profile_started', 'payment_started', 'paid', 'needs_follow_up', 'callback_requested', 'not_qualified', 'not_interested', 'dropped']
        },
        summary: { type: 'string' },
        next_action: { type: 'string' },
        missing_fields: { type: 'array', items: { type: 'string' } },
        objections: { type: 'array', items: { type: 'string' } }
      },
      required: ['summary', 'next_action']
    }
  }
];
