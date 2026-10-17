import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import twilio from 'twilio';

process.env.PUBLIC_BASE_URL = 'https://voice.example.test';
process.env.TWILIO_AUTH_TOKEN = 'voice-test-token';
const { config } = await import('../src/config.js');
const { phonePaymentTerms } = await import('../src/lib/paymentTerms.js');
const { validateTwilioSignature } = await import('../src/lib/twilioSecurity.js');
const { registerPaymentRoutes } = await import('../src/routes/payment.js');

test('phone payment terms cannot be set by the model or a request query', () => {
  assert.deepEqual(phonePaymentTerms(), { planId: config.defaultPlanId, amount: config.defaultPlanAmount, currency: 'USD' });
  assert.throws(() => phonePaymentTerms({ amount: '0.01' }), /amount differs/);
  assert.throws(() => phonePaymentTerms({ planId: 'other' }), /Unsupported phone payment plan/);
  assert.throws(() => phonePaymentTerms({ currency: 'EUR' }), /Unsupported phone payment currency/);
});

test('payment TwiML requires a Twilio signature and never uses a supplied price', async () => {
  const app = express();
  app.use(express.urlencoded({ extended: false }));
  app.use('/voice/trainr', validateTwilioSignature);
  registerPaymentRoutes(app);
  const server = app.listen(0);
  try {
    await new Promise(resolve => server.once('listening', resolve));
    const base = `http://127.0.0.1:${server.address().port}`;
    const path = '/voice/trainr/payment-twiml';
    const request = (suffix, signed) => fetch(`${base}${path}${suffix}`, { method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded',
        ...(signed ? { 'x-twilio-signature': twilio.getExpectedTwilioSignature(config.twilioAuthToken,
          `${config.publicBaseUrl}${path}${suffix}`, {}) } : {}) }, body: '' });
    assert.equal((await request('', false)).status, 403);
    assert.equal((await request('?amount=0.01', true)).status, 400);
    const valid = await request('', true);
    assert.equal(valid.status, 200);
    assert.match(await valid.text(), new RegExp(`chargeAmount="${config.defaultPlanAmount.replace('.', '\\.')}"`));
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});
