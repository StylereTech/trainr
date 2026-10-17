# Unit Timing Diagnostic Report

Date: **2026-10-14 05:10-05:15 UTC**. Environment: owned local Windows checkout, Node/Vitest; no database, browser, provider, or hosted account used. Baseline/source under test: **`c5ad7c5c754a9a24959528d69a470205b7ad7c2d`**, plus the two test-only timing changes described below. Branch: `codex/payment-readiness-20261006`. No application source, schema, dependency, timeout or assertion changed.

## Correction And Scope

`vitest.config.ts` already specifies `fileParallelism: false` and `maxWorkers: 1`. The preceding Connect report's explicit `--maxWorkers=1` retry therefore did **not** reduce worker parallelism relative to the default run. It was another full run with the same worker limit, not evidence of a successful resource mitigation.

The preceding final full-unit failures remain open. This pass investigates timing only; it does not change business behavior or establish Stripe readiness. Route modules exercised by the payment test are `/api/payments/webhook` and `/api/trainer/stripe-connect`; requests/provider responses are mocked in-process, not live endpoint calls. No user credentials or financial records are involved.

## Exact Steps And Results

1. Add optional phase logging to `tests/esbuild-security.test.ts` and the webhook helper in `tests/payment-readiness.test.ts`. Enable only with `TRAINR_TEST_TIMINGS=1`; log phase, consumer/event type and elapsed milliseconds. Preserve actual esbuild compilation, native Node execution, inline source-map assertion, all payment assertions, dynamic imports, mock isolation and existing timeouts.
2. In PowerShell set `TZ=UTC` and `TRAINR_TEST_TIMINGS=1`; run `npm test`, retaining output in `.postgres-test/test-phase-timing-baseline.log`. Expected: all 1,616 tests pass within existing budgets. Actual: **FAIL**, start **05:10:34 UTC**, duration **195.81s**, exit **1**; **1,614 passed / 2 failed**, 76 files passed / 1 failed. Both failures were `bundles TypeScript with imports and source maps`, for the `tsx` and `vite` resolved esbuild implementations, with the existing **5,000ms** test timeout. Fixture preparation logged **8ms / 2ms** respectively; no `bundle-ready` or native-child-completion phase was captured for these failed cases. The captured trace localizes the observed wait to the awaited compilation step, but does not establish why it waited. This run did not reproduce the earlier payment-test timeout.
3. Read only aggregate CPU/memory via Windows CIM at **05:13:58.816 UTC**, near the end of the run. Actual: **100% CPU load**, **993 MB free physical memory / 15,300 MB total**. This single sample makes host resource pressure plausible, not proven causal; no process attribution, other-task inspection, process termination or machine setting change was performed.
4. Run `npm test -- tests/esbuild-security.test.ts tests/payment-readiness.test.ts --reporter=verbose`, with the same two environment variables and unchanged test budgets. Expected: existing assertions pass and phase timings are visible. Actual: **PASS 17/17**, 2 files, start **05:14:30 UTC**, duration **10.06s**, exit **0**. Output retained in `.postgres-test/test-phase-timing-focused.log`.

5. Final follow-up at **05:19 UTC**: format the opt-in logging blocks, unset `TRAINR_TEST_TIMINGS`, and run `npm test -- tests/esbuild-security.test.ts tests/payment-readiness.test.ts` to validate the normal logging-disabled path. Actual: **FAIL 15/17**, start **05:17:34 UTC**, duration **48.15s**, exit **1**. The tsx-resolved compilation and sibling-file traversal tests both timed out at the unchanged 5s budget. All payment tests passed. Output: `.postgres-test/test-phase-timing-final.log`. The earlier focused success is therefore not stable. A focused ESLint process overlapped part of this final run; this was not a controlled resource-isolation experiment.

Focused timing evidence from step 4 (cumulative milliseconds within each helper/test):

| Case | Fixture/import start | Bundle/import complete | Native child/handler complete |
| --- | ---: | ---: | ---: |
| tsx-resolved esbuild | 10 | 333 | 505 |
| vite-resolved esbuild | 2 | 390 | 796 |
| First unpaid checkout webhook | 0 | 1,680 | 1,683 |
| Subsequent mismatch webhook cases | 0 | 1 | 3 |

The first webhook import dominates that focused invocation; its mocked handler took approximately 3ms. That does not prove the previous full-run timeout occurred in the same phase. No timeout was raised, import moved out of its test, assertion removed, native compiler replaced or retry added.

## Decision

- Fix status: **diagnostic instrumentation only; root cause NOT proven or fixed**.
- Full unit gate: **FAIL / OPEN**, latest full attempt 1,614/1,616. Focused success does not replace it.
- Retest proof: first focused run 17/17 passed; final logging-disabled run 15/17 failed. Both retain native toolchain execution and all payment guards. No full build, SQL, browser or hosted money-flow pass is claimed for this diagnostic step.
- Production readiness: **HOLD**. Existing hosted account/Connect prerequisites, refund-policy execution, CI billing and other [launch gates](CURRENT_LAUNCH_GATES.md) remain open. No changes to main, Production/trainr.cc, Story, Replit, Stripe settings, agreements, credentials or real funds.
- Next useful reliability evidence: reproduce with the same assertions on a host with measured resource headroom or a functioning independent CI runner; compare phase timings. Do not repeat focused passes indefinitely or label host contention a confirmed application fix.

Publication and final validation are recorded separately after the diagnostic change is committed; this report does not assert an unobserved deployment or green CI run.
