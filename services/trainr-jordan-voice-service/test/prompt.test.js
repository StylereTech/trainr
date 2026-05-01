import test from 'node:test';
import assert from 'node:assert/strict';
import { buildJordanPrompt } from '../src/agent/jordanPrompt.js';

test('Jordan prompt contains sales positioning and payment safety', () => {
  const prompt = buildJordanPrompt({ callSid: 'CA123', from: '+15551234567' });
  assert.match(prompt, /AI onboarding specialist/);
  assert.match(prompt, /ratings/i);
  assert.match(prompt, /portfolio/i);
  assert.match(prompt, /Never ask the caller to say card number/i);
  assert.match(prompt, /customers find the trainer/i);
});
