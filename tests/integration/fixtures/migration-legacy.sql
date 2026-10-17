-- Synthetic legacy records for migration rehearsal only. No actual payment/provider credentials.
INSERT INTO users (id, email, "passwordHash", role, "updatedAt", "verificationToken", "verificationExpiry", "resetPasswordToken", "resetPasswordExpiry")
VALUES ('legacy-parent', 'legacy-parent@example.test', 'synthetic-not-a-login', 'PARENT', '2026-01-01', 'synthetic-old-verifier', '2030-01-01', 'synthetic-old-reset', '2030-01-01'),
       ('legacy-trainer', 'legacy-trainer@example.test', 'synthetic-not-a-login', 'TRAINER', '2026-01-01', NULL, NULL, NULL, NULL);
INSERT INTO parent_profiles (id, "userId", "updatedAt") VALUES ('legacy-parent-profile', 'legacy-parent', '2026-01-01');
INSERT INTO trainer_profiles (id, "userId", "firstName", "lastName", slug, "stripeAccountId", "updatedAt")
VALUES ('legacy-trainer-profile', 'legacy-trainer', 'Synthetic', 'Trainer', 'legacy-trainer', 'acct_synthetic_legacy', '2026-01-01');
INSERT INTO athlete_profiles (id, "parentProfileId", "firstName", "lastName", "dateOfBirth", goals, "updatedAt")
VALUES ('legacy-athlete', 'legacy-parent-profile', 'Synthetic', 'Athlete', '2015-01-01', ARRAY['Synthetic goal'], '2026-01-01');
INSERT INTO sports (id, name, slug) VALUES ('legacy-sport', 'Synthetic Sport', 'legacy-sport');
INSERT INTO service_offerings (id, "trainerProfileId", "sportId", title, "priceInCents", "updatedAt")
VALUES ('legacy-service', 'legacy-trainer-profile', 'legacy-sport', 'Synthetic session', 6000, '2026-01-01');
INSERT INTO bookings (id, "parentProfileId", "trainerProfileId", "athleteProfileId", "serviceOfferingId", date, "startTime", "endTime", status,
  "totalAmountInCents", "platformFeeInCents", "trainerPayoutInCents", "updatedAt")
VALUES ('legacy-booking', 'legacy-parent-profile', 'legacy-trainer-profile', 'legacy-athlete', 'legacy-service', '2030-11-01', '09:00', '10:00', 'CONFIRMED', 6000, 900, 5100, '2026-01-01');
INSERT INTO payments (id, "bookingId", "stripeCheckoutSessionId", "stripePaymentIntentId", "stripeChargeId", "stripeTransferId", "amountInCents", "platformFeeInCents", "trainerPayoutInCents", status, "refundAmountInCents", "updatedAt")
VALUES ('legacy-payment', 'legacy-booking', 'cs_synthetic_legacy', 'pi_synthetic_legacy', 'ch_synthetic_legacy', 'tr_synthetic_legacy', 6000, 900, 5100, 'PARTIALLY_REFUNDED', 1200, '2026-01-01');
INSERT INTO notifications (id, "userId", type, title, message, data, "readAt")
VALUES ('legacy-notice', 'legacy-parent', 'REFUND_STATUS_UPDATED', 'Synthetic refund', 'Synthetic historical record', '{"bookingId":"legacy-booking"}', '2026-01-01');
INSERT INTO trainer_wallets (id, "trainerProfileId", "availableBalance", "pendingBalance", "withdrawnTotal", "updatedAt")
VALUES ('legacy-wallet', 'legacy-trainer-profile', 1200, 300, 3600, '2026-01-01');
INSERT INTO wallet_entries (id, "walletId", "bookingId", type, "amountInCents", description)
VALUES ('legacy-entry', 'legacy-wallet', 'legacy-booking', 'BOOKING_CREDIT', 5100, 'Synthetic historical credit; not a new withdrawable balance');
INSERT INTO withdrawal_requests (id, "walletId", "amountInCents", status, "stripePayoutId", "updatedAt")
VALUES ('legacy-withdrawal', 'legacy-wallet', 3600, 'PAID', 'po_synthetic_legacy', '2026-01-01');
