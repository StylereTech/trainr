import twilio from 'twilio';
import { config } from '../config.js';
import { log } from './logger.js';

function publicUrlForRequest(originalUrl = '/') {
  return `${config.publicBaseUrl}${originalUrl}`;
}

export function validateTwilioSignature(req, res, next) {
  if (!config.twilioValidateSignatures) return next();
  if (!config.twilioAuthToken) {
    log.warn('TWILIO_VALIDATE_SIGNATURES=true but TWILIO_AUTH_TOKEN is missing');
    return res.status(500).send('Twilio validation misconfigured');
  }

  const signature = req.header('X-Twilio-Signature');
  const url = publicUrlForRequest(req.originalUrl);
  const params = req.body || {};
  const isValid = twilio.validateRequest(config.twilioAuthToken, signature, url, params);
  if (!isValid) return res.status(403).send('Invalid Twilio signature');
  return next();
}

export function validateTwilioUpgrade(req) {
  if (!config.twilioValidateSignatures) return true;
  if (!config.twilioAuthToken) {
    log.warn('TWILIO_VALIDATE_SIGNATURES=true but TWILIO_AUTH_TOKEN is missing for WebSocket upgrade');
    return false;
  }

  const signature = req.headers['x-twilio-signature'];
  if (!signature) return false;

  const parsed = new URL(req.url || '/', 'http://localhost');
  const publicUrl = publicUrlForRequest(`${parsed.pathname}${parsed.search || ''}`);
  const params = Object.fromEntries(parsed.searchParams.entries());
  return twilio.validateRequest(config.twilioAuthToken, signature, publicUrl, params);
}
