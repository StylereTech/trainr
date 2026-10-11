-- One-time, replay-safe catalog setup for the owner-approved isolated audit DB.
-- Never run prisma/seed.ts here: it deletes records and creates demo credentials.
DO $audit_catalog$
BEGIN
  IF current_database() <> 'neondb' OR current_user <> 'neondb_owner' THEN
    RAISE EXCEPTION 'STAGING_DATABASE_IDENTITY_REQUIRED';
  END IF;
  IF NOT pg_try_advisory_xact_lock(20261009, 81581985) THEN
    RAISE EXCEPTION 'STAGING_INITIALIZER_BUSY';
  END IF;
  IF (SELECT count(*) FROM trainr_audit_guard.ownership) <> 1
     OR NOT EXISTS (SELECT 1 FROM trainr_audit_guard.ownership
       WHERE resource_name = 'trainr-audit-staging-20261009'
         AND project_id = 'steep-field-81581985') THEN
    RAISE EXCEPTION 'STAGING_OWNERSHIP_REQUIRED';
  END IF;
  IF (SELECT count(*) FROM public._prisma_migrations) <> 11
     OR EXISTS (SELECT 1 FROM public._prisma_migrations
       WHERE finished_at IS NULL OR rolled_back_at IS NOT NULL) THEN
    RAISE EXCEPTION 'STAGING_MIGRATION_HISTORY_REQUIRED';
  END IF;

  INSERT INTO public.sports (id, name, slug, icon, description, "order", "isActive")
  VALUES
    ('audit-ref-football', 'Football', 'football', chr(127944), 'American football training for all positions', 1, true),
    ('audit-ref-baseball', 'Baseball', 'baseball', chr(9918), 'Baseball skills: hitting, pitching, fielding', 2, true),
    ('audit-ref-basketball', 'Basketball', 'basketball', chr(127936), 'Basketball fundamentals and advanced skills', 3, true),
    ('audit-ref-soccer', 'Soccer', 'soccer', chr(9917), 'Soccer training for all positions and skill levels', 4, true),
    ('audit-ref-track-field', 'Track & Field', 'track-field', chr(127939), 'Track events, field events, speed and agility', 5, true)
  ON CONFLICT (slug) DO NOTHING;

  INSERT INTO public.specialties (id, "sportId", name, slug)
  SELECT 'audit-ref-' || catalog.sport_slug || '-' || catalog.specialty_slug,
         sport.id, catalog.name, catalog.specialty_slug
  FROM (VALUES
    ('football', 'QB Training', 'qb-training'),
    ('football', 'WR Training', 'wr-training'),
    ('football', 'RB Training', 'rb-training'),
    ('football', 'DB Training', 'db-training'),
    ('football', 'OL Training', 'ol-training'),
    ('football', 'DL Training', 'dl-training'),
    ('football', 'Kicking', 'kicking'),
    ('football', 'Speed & Agility', 'speed-and-agility'),
    ('baseball', 'Hitting', 'hitting'),
    ('baseball', 'Pitching', 'pitching'),
    ('baseball', 'Catching', 'catching'),
    ('baseball', 'Fielding', 'fielding'),
    ('baseball', 'Strength & Conditioning', 'strength-and-conditioning'),
    ('baseball', 'Throwing', 'throwing'),
    ('basketball', 'Shooting', 'shooting'),
    ('basketball', 'Ball Handling', 'ball-handling'),
    ('basketball', 'Footwork', 'footwork'),
    ('basketball', 'Defense', 'defense'),
    ('basketball', 'Post Play', 'post-play'),
    ('basketball', 'Guard Play', 'guard-play'),
    ('soccer', 'Striker', 'striker'),
    ('soccer', 'Midfield', 'midfield'),
    ('soccer', 'Defense', 'defense'),
    ('soccer', 'Goalie', 'goalie'),
    ('soccer', 'Ball Control', 'ball-control'),
    ('soccer', 'Conditioning', 'conditioning'),
    ('track-field', 'Sprinting', 'sprinting'),
    ('track-field', 'Hurdles', 'hurdles'),
    ('track-field', 'Distance Running', 'distance-running'),
    ('track-field', 'Long Jump', 'long-jump'),
    ('track-field', 'Shot Put', 'shot-put'),
    ('track-field', 'Starts & Form', 'starts-and-form')
  ) AS catalog(sport_slug, name, specialty_slug)
  JOIN public.sports sport ON sport.slug = catalog.sport_slug
  ON CONFLICT ("sportId", slug) DO NOTHING;
END
$audit_catalog$;
