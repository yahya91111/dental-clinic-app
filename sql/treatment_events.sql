-- ═══════════════════════════════════════════════════════════════
-- DCM — Treatment events: the act IS the record
-- ═══════════════════════════════════════════════════════════════
-- The old design DERIVED statistics: pressing Done re-read the whole
-- patient file and wrote one `patients` row per treatment it found,
-- marked with queue_number = -1. Because the sources carry no date
-- filter, a file's entire history was counted as today's work — and
-- counted again on the next visit, and the next.
--
-- This replaces that with a log. One row here = one thing that was
-- actually done, stamped at the moment it happened. Nothing is
-- derived, nothing is recounted, and Done writes nothing at all.
--
-- Who writes it: triggers on the source tables — never the app. The
-- same act is recorded whether it came from the dental chart, the
-- expanded card, the patient file, or a screen we have not built yet.
-- No JS path can forget, and no new call site needs wiring.
--
-- Undo is symmetric: delete the chart entry and its event goes with
-- it; take a referral back and its event goes with it. The count
-- stays honest without ever being recalculated.
-- ═══════════════════════════════════════════════════════════════

-- ─── 1. Attribution on the source tables ────────────────────────
-- They record the doctor's NAME only, and names repeat in this
-- province. Statistics filter by id, so the id has to travel with
-- the act. The app fills these at write time.
ALTER TABLE editing_records ADD COLUMN IF NOT EXISTS doctor_id UUID;
ALTER TABLE editing_records ADD COLUMN IF NOT EXISTS clinic_id TEXT;

ALTER TABLE scaling_records ADD COLUMN IF NOT EXISTS doctor_id UUID;
ALTER TABLE scaling_records ADD COLUMN IF NOT EXISTS clinic_id TEXT;

ALTER TABLE referrals ADD COLUMN IF NOT EXISTS doctor_id UUID;
ALTER TABLE referrals ADD COLUMN IF NOT EXISTS clinic_id TEXT;
-- a referral is counted when it is HANDED OVER, which may be a
-- different doctor on a different day than the one who wrote it
ALTER TABLE referrals ADD COLUMN IF NOT EXISTS given_at TIMESTAMPTZ;
ALTER TABLE referrals ADD COLUMN IF NOT EXISTS given_by_id UUID;
ALTER TABLE referrals ADD COLUMN IF NOT EXISTS given_by_name TEXT;


-- ─── 2. The log ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS treatment_events (
  id                   UUID DEFAULT gen_random_uuid() PRIMARY KEY,

  treatment            TEXT NOT NULL,
  tooth_number         TEXT,

  permanent_patient_id UUID,          -- null for a walk-in
  visit_id             UUID,          -- the patients row, when there is one
  patient_name         TEXT,

  doctor_id            UUID,
  doctor_name          TEXT,
  clinic_id            TEXT,

  -- when the work happened. Never derived, never moved by a later edit.
  performed_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- where it came from, so it can be undone and never double-counted
  source               TEXT NOT NULL,
  source_id            UUID NOT NULL,

  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT treatment_events_source_check
    CHECK (source IN ('chart', 'referral', 'scaling', 'visit'))
);

-- one act, one event — forever. This is what makes re-running a
-- screen, re-pressing a button, or re-running the backfill harmless.
CREATE UNIQUE INDEX IF NOT EXISTS uq_treatment_events_source
  ON treatment_events(source, source_id);

CREATE INDEX IF NOT EXISTS idx_treatment_events_doctor
  ON treatment_events(doctor_id, performed_at);
CREATE INDEX IF NOT EXISTS idx_treatment_events_clinic
  ON treatment_events(clinic_id, performed_at);
CREATE INDEX IF NOT EXISTS idx_treatment_events_patient
  ON treatment_events(permanent_patient_id, performed_at);

ALTER TABLE treatment_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all for treatment_events" ON treatment_events;
CREATE POLICY "Allow all for treatment_events" ON treatment_events
  FOR ALL USING (true) WITH CHECK (true);


-- ─── 3. The dental chart ────────────────────────────────────────
-- Writing a treatment onto a tooth is the doing of it.
CREATE OR REPLACE FUNCTION te_chart_insert() RETURNS TRIGGER AS $$
BEGIN
  IF NEW.treatment IS NULL OR btrim(NEW.treatment) = '' THEN
    RETURN NEW;
  END IF;

  INSERT INTO treatment_events (
    treatment, tooth_number, permanent_patient_id,
    doctor_id, doctor_name, clinic_id, performed_at, source, source_id
  ) VALUES (
    NEW.treatment,
    NEW.tooth_number::TEXT,
    NEW.permanent_patient_id,
    NEW.doctor_id,
    NEW.doctor_name,
    NEW.clinic_id,
    COALESCE(NEW."timestamp"::TIMESTAMPTZ, NOW()),
    'chart',
    NEW.id
  )
  ON CONFLICT (source, source_id) DO NOTHING;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION te_chart_delete() RETURNS TRIGGER AS $$
BEGIN
  DELETE FROM treatment_events WHERE source = 'chart' AND source_id = OLD.id;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_te_chart_insert ON editing_records;
CREATE TRIGGER trg_te_chart_insert
  AFTER INSERT ON editing_records
  FOR EACH ROW EXECUTE FUNCTION te_chart_insert();

DROP TRIGGER IF EXISTS trg_te_chart_delete ON editing_records;
CREATE TRIGGER trg_te_chart_delete
  AFTER DELETE ON editing_records
  FOR EACH ROW EXECUTE FUNCTION te_chart_delete();


-- ─── 4. Referrals ───────────────────────────────────────────────
-- Counted on handover, not on writing. Taking one back removes it.
CREATE OR REPLACE FUNCTION te_referral_sync() RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'given'
     AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'given') THEN

    INSERT INTO treatment_events (
      treatment, tooth_number, permanent_patient_id,
      doctor_id, doctor_name, clinic_id, performed_at, source, source_id
    ) VALUES (
      'Referral',
      NEW.tooth_number::TEXT,
      NEW.permanent_patient_id,
      COALESCE(NEW.given_by_id, NEW.doctor_id),
      COALESCE(NEW.given_by_name, NEW.doctor_name),
      NEW.clinic_id,
      COALESCE(NEW.given_at, NOW()),
      'referral',
      NEW.id
    )
    ON CONFLICT (source, source_id) DO NOTHING;

  ELSIF TG_OP = 'UPDATE'
        AND OLD.status = 'given'
        AND NEW.status IS DISTINCT FROM 'given' THEN

    DELETE FROM treatment_events WHERE source = 'referral' AND source_id = NEW.id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION te_referral_delete() RETURNS TRIGGER AS $$
BEGIN
  DELETE FROM treatment_events WHERE source = 'referral' AND source_id = OLD.id;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_te_referral_sync ON referrals;
CREATE TRIGGER trg_te_referral_sync
  AFTER INSERT OR UPDATE ON referrals
  FOR EACH ROW EXECUTE FUNCTION te_referral_sync();

DROP TRIGGER IF EXISTS trg_te_referral_delete ON referrals;
CREATE TRIGGER trg_te_referral_delete
  AFTER DELETE ON referrals
  FOR EACH ROW EXECUTE FUNCTION te_referral_delete();


-- ─── 5. Scaling ─────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION te_scaling_insert() RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO treatment_events (
    treatment, permanent_patient_id,
    doctor_id, doctor_name, clinic_id, performed_at, source, source_id
  ) VALUES (
    'Scaling',
    NEW.permanent_patient_id,
    NEW.doctor_id,
    NEW.doctor_name,
    NEW.clinic_id,
    COALESCE(NEW."timestamp"::TIMESTAMPTZ, NOW()),
    'scaling',
    NEW.id
  )
  ON CONFLICT (source, source_id) DO NOTHING;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION te_scaling_delete() RETURNS TRIGGER AS $$
BEGIN
  DELETE FROM treatment_events WHERE source = 'scaling' AND source_id = OLD.id;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_te_scaling_insert ON scaling_records;
CREATE TRIGGER trg_te_scaling_insert
  AFTER INSERT ON scaling_records
  FOR EACH ROW EXECUTE FUNCTION te_scaling_insert();

DROP TRIGGER IF EXISTS trg_te_scaling_delete ON scaling_records;
CREATE TRIGGER trg_te_scaling_delete
  AFTER DELETE ON scaling_records
  FOR EACH ROW EXECUTE FUNCTION te_scaling_delete();


-- ─── 6. The walk-in visit ───────────────────────────────────────
-- A walk-in has no file and no chart, so the visit itself is the act
-- and its treatment field is the only thing there is to record.
--
-- The trigger fires on completed_at going from empty to set — NOT on
-- status. That distinction matters: handleArchive flips every patient
-- in a centre to 'complete' without a completed_at, and under the old
-- design those untreated patients landed in the day's numbers.
CREATE OR REPLACE FUNCTION te_visit_sync() RETURNS TRIGGER AS $$
BEGIN
  -- a permanent patient's work is recorded by what was done to their
  -- file, and the card's treatment field is for duration only
  IF NEW.permanent_patient_id IS NOT NULL THEN RETURN NEW; END IF;
  -- leftovers from the old design must never re-enter
  IF NEW.queue_number = -1 THEN RETURN NEW; END IF;

  IF NEW.completed_at IS NOT NULL AND OLD.completed_at IS NULL THEN

    IF NEW.treatment IS NOT NULL
       AND btrim(NEW.treatment) <> ''
       AND NEW.treatment <> 'Treatment' THEN

      INSERT INTO treatment_events (
        treatment, visit_id, patient_name,
        doctor_id, doctor_name, clinic_id, performed_at, source, source_id
      ) VALUES (
        NEW.treatment, NEW.id, NEW.name,
        NEW.doctor_id, NEW.doctor_name, NEW.clinic_id, NEW.completed_at,
        'visit', NEW.id
      )
      ON CONFLICT (source, source_id) DO NOTHING;
    END IF;

  ELSIF NEW.completed_at IS NULL AND OLD.completed_at IS NOT NULL THEN
    -- the visit was re-opened
    DELETE FROM treatment_events WHERE source = 'visit' AND source_id = NEW.id;

  ELSIF NEW.completed_at IS NOT NULL
        AND NEW.treatment IS DISTINCT FROM OLD.treatment THEN
    -- corrected after the fact
    UPDATE treatment_events SET treatment = NEW.treatment
      WHERE source = 'visit' AND source_id = NEW.id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_te_visit_sync ON patients;
CREATE TRIGGER trg_te_visit_sync
  AFTER UPDATE ON patients
  FOR EACH ROW EXECUTE FUNCTION te_visit_sync();


-- ═══════════════════════════════════════════════════════════════
-- 7. Rebuilding the past  (safe to re-run: the unique index absorbs it)
-- ═══════════════════════════════════════════════════════════════
-- Every source record carries its own real timestamp, so history can
-- be rebuilt correctly rather than thrown away: each filling returns
-- to the day it was actually done.

INSERT INTO treatment_events (
  treatment, tooth_number, permanent_patient_id,
  doctor_id, doctor_name, clinic_id, performed_at, source, source_id
)
SELECT treatment, tooth_number::TEXT, permanent_patient_id,
       doctor_id, doctor_name, clinic_id,
       COALESCE("timestamp"::TIMESTAMPTZ, created_at), 'chart', id
FROM editing_records
WHERE treatment IS NOT NULL AND btrim(treatment) <> ''
ON CONFLICT (source, source_id) DO NOTHING;

INSERT INTO treatment_events (
  treatment, permanent_patient_id,
  doctor_id, doctor_name, clinic_id, performed_at, source, source_id
)
SELECT 'Scaling', permanent_patient_id,
       doctor_id, doctor_name, clinic_id,
       COALESCE("timestamp"::TIMESTAMPTZ, created_at), 'scaling', id
FROM scaling_records
ON CONFLICT (source, source_id) DO NOTHING;

INSERT INTO treatment_events (
  treatment, tooth_number, permanent_patient_id,
  doctor_id, doctor_name, clinic_id, performed_at, source, source_id
)
SELECT 'Referral', tooth_number::TEXT, permanent_patient_id,
       COALESCE(given_by_id, doctor_id), COALESCE(given_by_name, doctor_name),
       clinic_id,
       COALESCE(given_at, "timestamp"::TIMESTAMPTZ, created_at), 'referral', id
FROM referrals
WHERE status = 'given'
ON CONFLICT (source, source_id) DO NOTHING;

-- Walk-in visits: only ones actually finished, and never the old
-- statistics rows.
INSERT INTO treatment_events (
  treatment, visit_id, patient_name,
  doctor_id, doctor_name, clinic_id, performed_at, source, source_id
)
SELECT treatment, id, name, doctor_id, doctor_name, clinic_id, completed_at, 'visit', id
FROM patients
WHERE permanent_patient_id IS NULL
  AND completed_at IS NOT NULL
  AND COALESCE(queue_number, 0) <> -1
  AND treatment IS NOT NULL
  AND btrim(treatment) <> ''
  AND treatment <> 'Treatment'
ON CONFLICT (source, source_id) DO NOTHING;

-- Old records carry a name but no id. Resolve it only where the name
-- is unambiguous — a duplicate name is left unattributed rather than
-- credited to the wrong doctor.
UPDATE treatment_events te
SET doctor_id = d.id
FROM doctors d
WHERE te.doctor_id IS NULL
  AND te.doctor_name IS NOT NULL
  AND d.name = te.doctor_name
  AND (SELECT COUNT(*) FROM doctors x WHERE x.name = te.doctor_name) = 1;

UPDATE treatment_events te
SET clinic_id = d.clinic_id::TEXT
FROM doctors d
WHERE te.clinic_id IS NULL AND te.doctor_id = d.id;

-- What could not be attributed, for the record:
--   SELECT doctor_name, COUNT(*) FROM treatment_events
--   WHERE doctor_id IS NULL GROUP BY doctor_name ORDER BY 2 DESC;


-- ═══════════════════════════════════════════════════════════════
-- 8. The old statistics rows  —  NOT run automatically
-- ═══════════════════════════════════════════════════════════════
-- The queue_number = -1 rows in `patients` are the derived numbers
-- this design replaces. Nothing writes them any more and nothing
-- reads them, but they are left in place until you say otherwise.
-- Check the count first, then delete when you are satisfied the new
-- numbers are right:
--
--   SELECT COUNT(*) FROM patients WHERE queue_number = -1;
--   DELETE FROM patients WHERE queue_number = -1;
