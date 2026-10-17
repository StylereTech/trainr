import { urls } from '../config.js';
import { escapeXml, twiml } from '../lib/xml.js';
import { persistSession, upsertSession } from '../agent/sessionStore.js';

export function registerPaymentRoutes(app) {
  app.post('/voice/trainr/payment-twiml', async (req, res) => {
    res.type('text/xml').send(twiml('<Say>Phone payments are temporarily unavailable. Trainr support will follow up with an approved online option. Please do not say card details out loud.</Say>'));
  });

  app.post('/voice/trainr/payment-complete', async (req, res) => {
    const callSid = req.body?.CallSid || req.query?.callSid || '';
    const paymentStatus = req.body?.PaymentStatus || req.body?.Result || req.body?.paymentStatus || 'unknown';
    const paymentError = req.body?.PaymentError || req.body?.ErrorCode || '';

    if (callSid) {
      upsertSession(callSid, {
        sales_status: { payment_status: 'provider_review_required', reported_payment_status: paymentStatus, payment_error: paymentError },
        payment_result: {
          status: paymentStatus,
          error: paymentError,
          payment_sid: req.body?.PaymentSid,
          date: new Date().toISOString(),
        },
      });
      await persistSession(callSid, 'payment_complete');
    }

    const say = 'The secure payment step is complete. Trainr will verify the payment result before confirming your onboarding. I am connecting you back to Jordan.';

    res.type('text/xml').send(twiml(`
      <Say>${escapeXml(say)}</Say>
      <Redirect method="POST">${escapeXml(urls().twiml)}?resume=payment_complete</Redirect>
    `));
  });
}
