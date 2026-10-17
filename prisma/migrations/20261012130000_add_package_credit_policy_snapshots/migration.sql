-- Preserve legacy snapshots; require the approved policy on newly versioned terms.
ALTER TABLE "package_purchases" DROP CONSTRAINT "package_purchases_terms_version";
ALTER TABLE "package_purchases" ADD CONSTRAINT "package_purchases_terms_version" CHECK (
  jsonb_typeof("terms") = 'object' AND (
    "terms" @> '{"version":1}'::jsonb OR (
      "terms" @> '{"version":2,"creditPolicy":{"ownership":"PARENT_CHILDREN","validityStartsOn":"PAYMENT_SUCCEEDED","parentCancellationRestoreHours":24,"restoreOnTrainerCancellation":true,"consumeOnLateParentCancellation":true,"consumeOnNoShow":true,"cashRefunds":"SEPARATE_POLICY"}}'::jsonb
    )
  )
);
