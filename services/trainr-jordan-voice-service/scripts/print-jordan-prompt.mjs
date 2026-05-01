import { buildJordanPrompt } from '../src/agent/jordanPrompt.js';
console.log(buildJordanPrompt({ callSid: 'CA_DEV', from: '+15551234567', resumeReason: 'dev' }));
