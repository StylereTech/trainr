import { config, urls } from '../config.js';
import { escapeXml, twiml } from '../lib/xml.js';
import { restoreCachedTwilioXml, sendAndCacheTwilioXml } from '../lib/requestStore.js';
import { persistSession, upsertSession } from '../agent/sessionStore.js';

function amountFromRequest(req) {
  const amount = req.query?.amount || req.body?.amount || config.defaultPlanAmount;
  return String(amount).replace(/[^0-9.]/g, '') || config.defaultPlanAmount;
}

export function registerPaymentRoutes(app) {
  app.post('/voice/trainr/payment-twiml', async (req, res) => {
    const callSid = req.body?.CallSid || req.query?.callSid || '';
    const cached = await restoreCachedTwilioXml(req, res, 'trainr_payment_twiml', callSid);
    if (cached.restored) return;

    const planId = req.query?.planId || req.body?.planId || config.defaultPlanId;
    const amount = amountFromRequest(req);
    const currency = req.query?.currency || req.body?.currency || config.currency;

    if (callSid) {
      upsertSession(callSid, {
        sales_status: { payment_status: 'collecting', plan_selected: planId, amount, currency },
        payment_context: { plan_id: planId, amount, currency },
      });
    }

    const xml = twiml(`
      <Say>Perfect. For your security, please do not say your card number out loud. Enter your card details using your phone keypad when prompted.</Say>
      <Pay
        paymentConnector="${escapeXml(config.paymentConnector)}"
        chargeAmount="${escapeXml(amount)}"
        currency="${escapeXml(currency)}"
        paymentMethod="credit-card"
        maxAttempts="2"
        securityCode="true"
        postalCode="true"
        action="${escapeXml(urls().paymentComplete)}"
        statusCallback="${escapeXml(urls().paymentComplete)}" />
      <Redirect method="POST">${escapeXml(urls().twiml)}?resume=payment_complete</Redirect>
    `);

    await sendAndCacheTwilioXml(req, res, 'trainr_payment_twiml', callSid, xml);
  });

  app.post('/voice/trainr/payment-complete', async (req, res) => {
    const callSid = req.body?.CallSid || req.query?.callSid || '';
    const paymentStatus = req.body?.PaymentStatus || req.body?.Result || req.body?.paymentStatus || 'unknown';
    const paymentError = req.body?.PaymentError || req.body?.ErrorCode || '';

    if (callSid) {
      upsertSession(callSid, {
        sales_status: { payment_status: paymentStatus, payment_error: paymentError },
        payment_result: {
          status: paymentStatus,
          error: paymentError,
          payment_sid: req.body?.PaymentSid,
          date: new Date().toISOString(),
        },
      });
      await persistSession(callSid, 'payment_complete');
    }

    const successful = ['success', 'successful', 'completed', 'paid'].includes(String(paymentStatus).toLowerCase());
    const say = successful
      ? 'Payment is complete. I am connecting you back to Jordan to finish your Trainr onboarding.'
      : 'The secure payment step is complete. I am connecting you back to Jordan to confirm the next step.';

    res.type('text/xml').send(twiml(`
      <Say>${escapeXml(say)}</Say>
      <Redirect method="POST">${escapeXml(urls().twiml)}?resume=payment_complete</Redirect>
    `));
  });
}
