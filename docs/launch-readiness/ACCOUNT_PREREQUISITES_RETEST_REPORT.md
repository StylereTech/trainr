# Account Prerequisites And Quality Retest

Follow-up 2026-10-16 02:00 UTC: the runtime seed guard missing during this earlier pass is now implemented and locally tested. See [Destructive Seed Guard](DESTRUCTIVE_SEED_GUARD_REPORT.md). The account-existence and pending-provisioning findings below are unchanged.

- Recorded: 2026-10-16 01:43 UTC (2026-10-15 local date).
- Source: `04682831eaaed9589969ada11f01314ad6446b5c`, audit branch `codex/payment-readiness-20261006`.
- Environments: isolated audit Preview for account existence/login checks; Windows local checkout for quality tests. No Production or real-money transaction.
- Accounts: user-supplied legacy demo parent, trainer and admin identities. Passwords are intentionally omitted. None authenticated in Preview.
- Decision: production HOLD. Account provisioning approval is pending; no account was created, promoted, reset or imported.

## Account Evidence

The immediately preceding account-verification turn tested `jennifer.davis@email.com`, `marcus.johnson@email.com` and `admin@trainr.app` on `https://trainr-git-codex-payment-readiness-20261006-styleres-projects.vercel.app/auth/signin`. Expected: an authenticated role dashboard. Actual: each remained on sign-in with `Sign-in unavailable. Check your credentials or try again later.` Parent/trainer results were read from the rendered page; admin result was independently confirmed by screenshot after a browser observation timeout. The first parent attempt used an already-open page and was inconclusive; a refreshed page provided the recorded rejection. This is a failed login prerequisite, not a claim of an authentication-code defect or successful role testing.

The Vercel Neon query console identified resource `trainr-audit-staging-20261009` / project `steep-field-81581985`, with Read-only enabled. It executed:

```sql
SELECT role, count(*) AS matching_demo_accounts
FROM public.users
WHERE lower(email) IN (
  'admin@trainr.app',
  'marcus.johnson@email.com',
  'jennifer.davis@email.com'
)
GROUP BY role;
```

Expected if provisioned: rows for the demo roles. Actual: **0 results, 5862 ms**. The Run action observation timed out, but the subsequent console read showed the completed result and exact query. No password hashes, tokens or connection credentials were read. This proves absence from that isolated database, not absence from every deployment or database. No attempt was made against Production. Exact account-check timestamps were not captured; this report's timestamp is the evidence-recording time, not a fabricated execution time.

## Unsafe Runbook Correction

`docs/DB_READY_RUNBOOK.md` previously told operators to point at a real reachable PostgreSQL URL, run `db:push`, then run `db:seed`, and called database connectivity the only blocker. Inspection of `prisma/seed.ts` showed unfiltered `deleteMany()` calls before fixed-password demo-account creation. The old instructions were unsafe for existing records and inconsistent with current launch gates.

The runbook now starts with a destructive-seed warning, separates read-only reachability/schema/migration inspection from authorized writes, references the guarded Preview path and additive reference catalog, and removes unsupported readiness claims. All three relative documentation links resolve; `git diff --check` passed. **Documentation fix only:** the legacy seed itself has no new runtime guard and was not executed. Its current-schema compatibility and a guarded replacement remain unverified; do not use it to provision Preview accounts.

## Local Quality Retest

No application source, dependency versions, test assertions or test timeouts changed in this pass.

| Check | Expected | Actual | Status |
| --- | --- | --- | --- |
| Focused `esbuild-security` and `stripe-webhook-scopes`, single worker, optional timing diagnostics | All existing assertions pass | 22/22, 2 files, 12.44 s, exit 0, started 2026-10-16 01:33:37 UTC | PASS for this run; prior intermittent failures not erased |
| Full `npm run check`: lint | No errors | 0 errors / 42 existing warnings | PASS with warnings |
| Full check: route types and TypeScript | Successful generation and typecheck | Completed; advanced to units | PASS |
| Full check: unit suite | All cases pass | 1,725/1,725, 79 files, 96.26 s; started 01:37:42 UTC | PASS |
| Full check: production build | Complete successfully | 84/84 static pages generated; final route table emitted; full `npm run check` exit 0 verified at 01:43 UTC | PASS |
| Fresh `npm audit --json` | No unresolved high/critical findings | 8 high / 0 critical, exit 1; braces advisory chain remains | FAIL / OPEN |
| Authenticated hosted booking, Checkout, Connect, transfer and payout | Actual provider receipts and persisted role views | Accounts absent; not exercised | NOT VERIFIED |

The full gate uses a non-listening loopback database URL, synthetic auth/Stripe values and an empty `TRAINR_STAGING_INIT`; no hosted migration is enabled. Local raw log: `.postgres-test/quality-gate-20261015.log`. The fresh audit is `.postgres-test/dependency-audit-20261015.json`; reported fixes for some packages require an incompatible Next ESLint downgrade, while Tailwind/chokidar have no offered fix. No forced downgrade or advisory suppression was applied.

The full quality gate is green for this source/run. Existing middleware-convention deprecation and internal Next.js Edge Runtime warnings remain; they were not suppressed. No SQL integration or browser suite was rerun in this local quality pass. Earlier account UI checks and the prior sign-in regression results have their own scopes; a build does not replace them.

Focused timing: tsx bundle fixture/bundle/child phases at 3/1026/1108 ms; Vite at 2/27/98 ms. The first route-level Connect-readiness case took 3114 ms; subsequent cases completed in milliseconds. This is consistent with initialization overhead but does not establish the cause of the earlier timeouts. The historical reliability gate remains open.

## Remaining Gates

Account provisioning and required agreements, actual sandbox payment/Connect/payout evidence, cash-refund policy/execution, package policy details, dependency security, reliability and CI/operations remain unresolved. See [Current Launch Gates](CURRENT_LAUNCH_GATES.md). No background process or historical pass may substitute for these proofs. Publication and final deployment status must be verified separately; this report alone is not a release approval.
