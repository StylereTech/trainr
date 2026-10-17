import { config } from '../config.js';

export function phonePaymentTerms(input = {}) {
  const planId = config.defaultPlanId;
  const amount = config.defaultPlanAmount;
  const currency = config.currency;
  if ((input.plan_id || input.planId) && (input.plan_id || input.planId) !== planId) throw new Error('Unsupported phone payment plan');
  if (input.amount !== undefined && Number(input.amount) !== Number(amount)) throw new Error('Phone payment amount differs from the configured offer');
  if (input.currency && String(input.currency).toUpperCase() !== currency) throw new Error('Unsupported phone payment currency');
  return { planId, amount, currency };
}
