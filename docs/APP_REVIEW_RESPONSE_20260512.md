# Trainr App Review Response — May 12, 2026

Submission ID: `390b9c42-5363-4e6c-b74a-19410c365290`
Version reviewed: `1.0 (1)`
Issue: Guideline 2.1(b) Information Needed + Guideline 5.1.1(v) Account Deletion

## Patch deployed

Commit: `ae882a6 fix: add in-app account deletion`
Production: `https://trainr.cc`

### Account deletion flow

Trainr now supports direct in-app account deletion:

1. Sign in.
2. Open **Account** from the signed-in navigation.
3. Tap **Delete Account**.
4. Review the deletion explanation.
5. Type `DELETE` to confirm.
6. Tap **Delete Account**.
7. The account is deleted/anonymized and the user is signed out.

Production routes verified:

- `GET https://trainr.cc/account/delete` returns `200`.
- `DELETE https://trainr.cc/api/account` returns `401` when signed out, confirming the route is protected.
- Privacy Policy now states direct in-app deletion and May 12, 2026 update.

Validation run:

- `npm test` → 7 files / 65 tests passed.
- `npm run typecheck` → passed.
- `npm run build` → passed.
- Vercel production deploy completed and aliased to `https://trainr.cc`.

## Reply to App Review

Hello App Review team,

Thank you for the detailed review. We have addressed the account deletion issue and are providing the requested business model details below.

Business model answers:

1. The users of paid services are parents/guardians who book youth sports training sessions for their athletes, and trainers/coaches who provide those in-person or virtual coaching services.

2. Users can purchase/book training services inside the Trainr app and on the Trainr website. These purchases are for real-world coaching services between parents/guardians and trainers, not digital content subscriptions or digital features.

3. Users can access their account, trainer listings, booking details, messages, athlete profiles, and session history in the app. A user may see bookings they previously made on the website or in the app because the account is shared across Trainr surfaces.

4. Trainr does not unlock paid digital content, paid subscriptions, premium app features, or consumable digital goods outside of In-App Purchase. Payments are for real-world youth sports coaching services. The app does not sell digital content or digital services that require Apple In-App Purchase.

5. Users obtain an account by signing up directly in the app or on the website with email/password. There is no fee to create an account.

Account deletion update:

We added a direct in-app account deletion flow. A signed-in user can now open Account from the navigation, choose Delete Account, review what will be removed/anonymized, type DELETE to confirm, and complete deletion without emailing support or leaving the app. After confirmation, the account is deleted/anonymized and the user is signed out.

We also updated the Privacy Policy to describe direct in-app deletion.

Please see the App Review Notes for the requested screen recording demonstrating sign-in, navigation to the deletion option, and the complete deletion flow.

Thank you.

## App Review Notes field

Account deletion has been added.

Path: Sign in → Account → Delete Account → type DELETE → Delete Account → confirmation/sign-out.

Business model: Trainr is a marketplace for real-world youth sports coaching services. Users do not purchase or unlock paid digital content, subscriptions, premium app features, or consumable digital goods outside of In-App Purchase. Account creation is free.

Production URL: https://trainr.cc

Demo account: [insert current demo credentials]

Screen recording: [attach physical-device recording here]
