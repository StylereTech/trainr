# Destructive Demo Seed Guard

- Recorded: 2026-10-16 02:00 UTC (final local validation).
- Baseline: `daf63e79ae1037dbda790ceb34c5a0c4a0d84ca8`, `codex/payment-readiness-20261006`.
- Environment: Windows local checkout; fake database clients and denied local CLI invocations only. No hosted account or database operation.
- Surface: `npm run db:seed` / `prisma/seed.ts`; not an application API endpoint.
- User/account: synthetic URL identities only; no login, new password, account promotion, provider call or real funds.
- Status: guard implemented; focused validation and full local quality gate pass. Production signoff remains HOLD.

## Baseline Finding

Inspection showed a top-level `new PrismaClient()` followed by unconditional `main()`. The seed body began with unfiltered `deleteMany()` calls for application tables. There was no environment, explicit-deletion opt-in, actual database identity or ownership-marker check. Its `.catch(console.error)` also did not set a failing process exit status and could print raw database errors. The preceding pass corrected the unsafe operational documentation but left this runtime gap open.

This is a destructive operator-tool risk, not a demonstrated remote HTTP exploit. The unsafe baseline was inspected, never executed against a database. No claim of restored or repaired data is made.

Severity: P1 operational data-loss risk when the legacy seed is pointed at a retained database. Fix scope: enforce target and ownership checks in the executable path, not merely in documentation.

## Implementation

`scripts/seed-safety.ts` wraps the actual seed entry point. It rejects Production, Vercel and staging-initializer contexts before client creation. It accepts only PostgreSQL on explicit loopback hostnames with role `trainr_seed`, a `trainr_seed_<suffix>` database, the public schema and a small duplicate-free query-parameter allowlist. `TRAINR_ALLOW_DESTRUCTIVE_SEED` must exactly match the database name; a generic enable flag is insufficient. The validated URL is passed directly as Prisma's datasource override.

Before invoking the seed callback, two read-only checks require the actual database name, current role and schema to match the target, and exactly one ownership-marker row in `public.trainr_seed_guard` with purpose `disposable local demo seed`. The guard does not create this marker or provision any role/database. Failed checks never invoke the seed callback, and the client is disconnected in `finally`. Seed errors now set exit code 1 and print only a known guard code or `SEED_FAILED`, not the raw provider error.

The approved disposable-local seed callback remains destructive. This change does not make it an additive provisioning workflow, validate its current-schema fixture compatibility, or make fixed demo passwords appropriate for hosted use. Do not install the marker in an existing environment to bypass the guard. Preview account creation still requires the pending authorization and a separate additive path.

## Verification

| Steps | Expected | Actual | Status |
| --- | --- | --- | --- |
| Run `tests/seed-safety.test.ts` with fake clients | Reject missing/wrong opt-in, hosted context, unsafe URLs, actual identity mismatch, missing/ambiguous marker and preflight errors before seed writes; disconnect on success/failure | 41/41, 1 file, 2.68 seconds, exit 0, started 2026-10-16 01:49:03 UTC | PASS within unit scope |
| Inspect actual seed AST in the same suite | Exactly one guard call with `process.env`, validated-URL client factory and `main`; no direct main call or top-level client | Assertions passed | PASS wiring contract |
| Standalone `tsc --noEmit` | Types compile | Exit 0 | PASS |
| ESLint on new guard and test | No findings | Exit 0 | PASS |
| Invoke actual entry point with `NODE_ENV=production` and synthetic invalid remote URL | Reject before client creation/seed execution, nonzero exit, no raw URL/error output | Only `SEED_LOCAL_ONLY`, exit 1 | PASS expected refusal |
| Invoke entry point with `NODE_ENV=test`, hosted flags empty, synthetic remote URL and matching deletion opt-in | Reject remote target before connection | Only `SEED_TARGET_INVALID`, exit 1 | PASS expected refusal |
| `git diff --check` | No whitespace errors | Exit 0 | PASS before report append |
| Full check: lint, types and units | No errors and all cases pass | Lint 0 errors/42 existing warnings; types pass; 1,766/1,766 units, 80 files, 218.62 seconds | PASS |
| Full check: production build | Build completes successfully | Compiled in 83s; 84/84 static pages; final route table; full `npm run check` exit 0 verified at 02:00 UTC | PASS; raw local log `.postgres-test/seed-safety-check.log` |

The CLI refusal invocations use `node node_modules/tsx/dist/cli.mjs prisma/seed.ts`. Both target `must-not-connect.invalid` with a synthetic password; neither invokes the seed callback. No successful seed, real marker lookup, schema migration or SQL fixture run was performed in this pass. Tests do not prove the full demo fixture contents are valid for the current schema. Assertions and timeouts were not weakened.

The full check used a non-listening loopback database URL, synthetic auth/Stripe values and disabled staging initialization. Its process was followed to terminal completion, not restarted when quiet. One aggregate host sample showed 555,964 KB free physical memory; that does not establish the root cause of historical intermittent timeouts. This run passed unchanged timeout limits. Existing lint warnings and middleware-convention deprecation remain. All four relative documentation links resolve; no owned test process remains running after completion.

## Remaining Scope

Actual parent/trainer/admin Preview access, hosted Stripe Checkout, Connect, destination transfers and payouts remain unverified. Refund policy/execution, dependency findings, intermittent toolchain reliability, CI billing and Production release gates remain open. This guard closes an accidental destructive-tool path; it is not a money-flow signoff. See [Current Launch Gates](CURRENT_LAUNCH_GATES.md).

## Publication And Preview Retest

Source **`559c2fd5dfadd2ee189311e968a6074f1da40872`** was committed and pushed to the audit branch. Independent remote reads matched that SHA and showed main unchanged at `2067e743c54ffee669cd484f26dc472b157f1881`; the worktree was clean. Normal Vercel UI independently showed matching source/branch, Ready and Preview at approximately 2026-10-16 02:03 UTC, duration 51 seconds: [deployment](https://vercel.com/styleres-projects/trainr/82UvXCStGNNU9Pw4mRy9epkHU3yW), immutable host `trainr-g2sc83o2l-styleres-projects.vercel.app`.

The existing anonymous smoke suite then returned **21/21 PASS**, exit 0, local probe timestamps 02:03:43.146-02:03:47.293 UTC. Health reported connected DB; catalog count remained zero; protected booking/payment/package/trainer/admin APIs returned 401; unsigned webhook returned 400. [Raw method/path/expected/actual results](DESTRUCTIVE_SEED_GUARD_HOSTED_SMOKE.json). The script's SHA is a requested-source label, not its own deployment proof; the separate Vercel observation supplies that mapping. No signed-in flow or seed invocation took place on Preview.

[CI run 38838385097](https://github.com/StylereTech/trainr/actions/runs/38838385097) was independently inspected in the normal GitHub UI: both check and migrations were not started because the account is locked due to a billing issue. No billing or provider settings changed. This is not a CI pass.

This publication evidence is a documentation-only follow-up commit. Final follow-up deployment/smoke proof is retained in the task and local artifacts rather than creating an endless sequence of publication-report commits. Main, Production and Story remain excluded.
