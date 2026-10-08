-- For an empty, explicitly disposable CI database only.
BEGIN;
DO $$ BEGIN
  IF current_database() !~ '^trainr_audit_[a-z0-9_]+$' OR current_user <> 'trainr_test'
    OR EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public') THEN
    RAISE EXCEPTION 'Refusing to label a nonempty or non-test database disposable';
  END IF;
END $$;
CREATE TABLE trainr_test_guard (purpose TEXT NOT NULL);
INSERT INTO trainr_test_guard VALUES ('disposable integration database');
COMMIT;
