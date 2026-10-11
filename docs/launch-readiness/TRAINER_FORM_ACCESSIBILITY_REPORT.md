# Trainer Form Accessibility

## Scope And Baseline

- Date/time: 2026-10-11 UTC, started after 12:35 UTC.
- Baseline commit: `acd2a93c4219dbd2fdaab16991d775578c98e95a`, clean audit branch before this pass.
- Environment: local optimized Next application, Chrome at 1440px and 390px, loopback PostgreSQL `trainr_audit_timezone_20261011`, guarded disposable role `trainr_test`, synthetic `@example.test` trainer. Profile/catalog/save responses in this focused browser test are intercepted fixtures; this is not hosted trainer persistence or Stripe evidence.
- Routes: `/trainer/profile`, its Personal Info/Services/Availability views, initial `/trainer/onboarding`, GET/PUT `/api/trainer/onboarding` fixtures. No database schema, payment logic, production deployment, Story, credentials or email provider changes.
- Readiness: this is a specific accessibility repair, not a site-wide accessibility or production signoff. Overall **HOLD**.

## Reproduction And Repair

The visible Personal Info labels were adjacent to controls without `htmlFor`/`id` associations. Both corrected rendered baseline cases failed with all twelve labels missing: first/last name, headline, bio, phone, experience, location type, address, city, state, ZIP and travel radius. The running optimized build was compiled before the repair; edits on disk did not alter that baseline. Evidence: `.postgres-test/profile-label-baseline-corrected.log`, two failed cases at 1440px/390px.

Service fields had the same missing associations, remove-service icon buttons had no accessible name, and sports/specialty/profile-view buttons conveyed selection only visually. The repair connects all personal/location and service labels, uses unique per-row service IDs, names remove-service buttons with their row number and adds tooltips, and exposes selected state with `aria-pressed`. Existing native buttons retain keyboard activation; no incomplete ARIA tab widget or new keyboard model is introduced. The field values, save payload, validation, pricing and layout are unchanged.

Static inspection found equivalent omissions in initial trainer onboarding. The same associations were added for eleven personal/location fields and five service fields, plus indexed certification input names, named certification/service removal and specialty pressed state. Existing sport/day pressed states and schedule labels were preserved. The onboarding finding was identified from source, not a separate pre-fix rendered baseline.

Initial attempts `.postgres-test/profile-label-baseline.log` and `profile-label-baseline-rendered.log` failed before the form because the owned disposable database started on default port 5432, not fixture port 55439. It was stopped and restarted explicitly on loopback 55439. An unresponsive owned baseline server on 3107 was identified by PID/command/parent and terminated; subsequent tests use 3108. These infrastructure failures are not counted as application regressions. The corrected baseline above reached the page and reproduced the actual label defect.

## Verification

Expected steps at each width: resolve each visible personal/location field by its label; click Headline label and verify focus; type a headline; open/close the location selector by keyboard; verify sports/specialty/profile-view selected state; toggle a specialty with Space; resolve every service field by its label; add/remove the second service by named action; edit service, save, modify weekly windows, reload and verify fixture state and stale-revision rejection. Existing profile regression assertions remain in place.

Onboarding cases separately exercise keyboard sport/specialty selection, all field associations, first-name label focus, indexed certification add/remove, service selection/add/remove, keyboard session-type dropdown, backwards/forwards navigation retaining entered data, and page overflow at both widths. They stop before submission, do not accept terms, and do not claim account creation or persisted onboarding.

| Verification | Actual result | Status / evidence |
| --- | --- | --- |
| Corrected pre-fix rendered profile baseline | 2 failed, all twelve labels missing at both widths | Proven defect; `.postgres-test/profile-label-baseline-corrected.log` |
| Final settled-source lint/type/unit/build gate | 1,290 units / 60 files passed, 76-page build, exit 0; existing lint warnings | PASS; `.postgres-test/trainer-form-check-final.log` |
| Focused rebuilt profile and onboarding interaction cases | 4 passed, 42.6s, exit 0 | PASS; `.postgres-test/trainer-form-focused.log` |
| Broader affected browser suite | 34 passed / 6 files, 2.9m, exit 0 | PASS; `.postgres-test/trainer-form-browser-final.log` |
| Full PostgreSQL integration suite | 396 passed / 12 files, 76.72s, exit 0 | PASS; `.postgres-test/trainer-form-sql-final.log` |
| Hosted exact-source Preview and smoke | Pending | Not inferred from local tests |

An earlier full quality gate also passed (`.postgres-test/profile-label-check.log`, 1,290 units and build), but onboarding changes were finalized during that run. The later settled-source gate is the authoritative final check; no application edits followed it.

Six focused-run screenshots were opened and inspected, then copied unmodified: [mobile onboarding profile](evidence/trainer-form-accessibility-20261011/mobile-onboarding-profile.png), [mobile onboarding services](evidence/trainer-form-accessibility-20261011/mobile-onboarding-services.png), [desktop onboarding profile](evidence/trainer-form-accessibility-20261011/desktop-onboarding-profile.png), [desktop onboarding services](evidence/trainer-form-accessibility-20261011/desktop-onboarding-services.png), [mobile profile editing](evidence/trainer-form-accessibility-20261011/mobile-profile-labels.png), [desktop profile editing](evidence/trainer-form-accessibility-20261011/desktop-profile-labels.png). Focus rings are visible; no new overlapping controls were observed. Existing styles and input scrolling are unchanged. This does not replace a full screen-reader/WCAG audit.

The broader run covers profile editing, initial onboarding, selected profile navigation/draft retention, saved schedule time zones, real local package creation/editing/activation/readback and error recovery, and current Connect-status rendering at both widths. Real local database/HTTP persistence tests are distinguished from intercepted profile/capability fixtures. None uses an actual provider charge or claims bank payout completion.

Actual hosted trainer onboarding, actual sandbox booking/transfer/payout, package purchase/credits and other production gates remain unverified or incomplete.

## Cleanup

Independent psql readback after all suites verified database `trainr_audit_timezone_20261011`, role `trainr_test`, guard `disposable integration database`, and zero users/bookings/payments/packages/package-items/services/sports/Connect attempts. Both owned local app servers and the disposable PostgreSQL server are stopped. No hosted data was deleted. Git whitespace validation passed, and fetched audit remote remained at baseline before publication.
