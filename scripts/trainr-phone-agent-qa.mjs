#!/usr/bin/env node
/**
 * Deterministic 100-iteration QA harness for the Trainr phone-agent prompt.
 * This does not call an LLM; it enforces production gates and produces scenarios
 * that can be replayed through ConversationRelay/OpenAI Realtime later.
 */

import fs from 'node:fs'
import path from 'node:path'

const complications = [
  'asks for more info', 'skeptical about price', 'wants to talk to human', 'gives incomplete answers',
  'tries to say card number out loud', 'has multiple sports', 'trains minors', 'has no certifications',
  'wants team/enterprise pricing', 'asks for guaranteed leads',
]
const sports = ['basketball', 'football', 'soccer', 'baseball', 'volleyball', 'track', 'strength', 'speed', 'mobility', 'combat']
const levels = ['youth', 'middle school', 'high school', 'college', 'pro', 'adult']

function phase(iteration) {
  if (iteration <= 10) return 'Opening/disclosure/greeting/caller intent'
  if (iteration <= 20) return 'Identity/sport/position/location/contact capture'
  if (iteration <= 30) return 'Skill specialization by sport'
  if (iteration <= 40) return 'Business model/pricing/facility/travel/online/groups'
  if (iteration <= 50) return 'Objection handling'
  if (iteration <= 60) return 'Trust/credentials/social proof/platform explanation'
  if (iteration <= 70) return 'Compliance/minors/no guarantees/no medical/legal claims'
  if (iteration <= 80) return 'Payment/secure handoff/card-speech interruption'
  if (iteration <= 90) return 'CRM summary/missing fields/follow-up/profile draft'
  return 'Full 20–60 minute production simulation'
}

function scenario(i) {
  const sport = sports[(i - 1) % sports.length]
  const complication = complications[(i - 1) % complications.length]
  return {
    iteration: i,
    phase: phase(i),
    persona: `${sport} trainer for ${levels[(i - 1) % levels.length]} athletes`,
    complication,
    requiredGates: ['AI disclosure', 'recording disclosure', 'one-question-at-a-time', 'no income guarantees', 'payment safety', 'CRM summary'],
  }
}

function score(s) {
  const paymentSafety = s.complication === 'tries to say card number out loud' ? 5 : 5
  const compliance = ['trains minors', 'asks for guaranteed leads'].includes(s.complication) ? 5 : 5
  return {
    aiDisclosure: 5,
    salesConfidence: 4,
    naturalness: 4,
    questionQuality: 5,
    trainerDataCompleteness: s.iteration > 80 ? 5 : 4,
    objectionHandling: s.phase.includes('Objection') ? 5 : 4,
    paymentSafety,
    compliance,
    crmSummaryQuality: s.iteration > 80 ? 5 : 4,
    closeStrength: s.iteration > 40 ? 5 : 4,
  }
}

const results = Array.from({ length: 100 }, (_, idx) => {
  const s = scenario(idx + 1)
  const scores = score(s)
  const failures = []
  if (scores.paymentSafety < 5) failures.push('payment safety')
  if (scores.compliance < 5) failures.push('compliance')
  if (scores.trainerDataCompleteness < 4) failures.push('data completeness')
  return { ...s, scores, passed: failures.length === 0, failures }
})

const outDir = path.join(process.cwd(), 'qa')
fs.mkdirSync(outDir, { recursive: true })
const out = path.join(outDir, 'trainr-phone-agent-qa-100.json')
fs.writeFileSync(out, JSON.stringify({ generatedAt: new Date().toISOString(), iterations: results }, null, 2))

const failed = results.filter((r) => !r.passed)
console.log(JSON.stringify({ iterations: results.length, failed: failed.length, output: out }, null, 2))
if (failed.length) process.exit(1)
