-- ============================================
-- Dental Clinic Management System
-- COMPLETE DATABASE SCHEMA - ALL TABLES
-- ============================================

-- ============================================
-- TABLE 1: clinics (المراكز الصحية)
-- ============================================
CREATE TABLE IF NOT EXISTS clinics (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Insert default clinics
INSERT INTO clinics (id, name) VALUES
  (1, 'مركز مشرف الصحي'),
  (2, 'مركز حطين الصحي'),
  (3, 'مركز بيان الصحي'),
  (4, 'مركز الزهرة الصحي'),
  (5, 'مركز النور الصحي')
ON CONFLICT (id) DO NOTHING;

-- ============================================
-- TABLE 2: doctors (الأطباء)
-- ============================================
CREATE TABLE IF NOT EXISTS doctors (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('super_admin', 'coordinator', 'team_leader', 'doctor')),
  clinic_id INTEGER REFERENCES clinics(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Insert default doctors
INSERT INTO doctors (name, email, password, role, clinic_id) VALUES
  ('المدير العام', 'admin@dental.com', '0000', 'super_admin', NULL),
  ('د. أحمد حسن', 'ahmed@dental.com', '0000', 'coordinator', 1),
  ('د. فاطمة علي', 'fatima@dental.com', '0000', 'team_leader', 3),
  ('د. محمد إبراهيم', 'mohamed@dental.com', '0000', 'doctor', 1),
  ('د. سارة خالد', 'sara@dental.com', '0000', 'doctor', 2),
  ('د. علي محمد', 'ali@dental.com', '0000', 'doctor', 1),
  ('د. عمر خليل', 'omar@dental.com', '0000', 'doctor', 3)
ON CONFLICT (email) DO NOTHING;

-- ============================================
-- TABLE 3: patients (المرضى)
-- ============================================
CREATE TABLE IF NOT EXISTS patients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  queue_number INTEGER NOT NULL UNIQUE,
  name VARCHAR(255) NOT NULL,
  clinic VARCHAR(100) NOT NULL DEFAULT 'Clinic',
  clinic_id INTEGER REFERENCES clinics(id),
  condition VARCHAR(100),
  treatment VARCHAR(100),
  status VARCHAR(20) NOT NULL DEFAULT 'normal' CHECK (status IN ('normal', 'elderly', 'na', 'complete')),
  is_elderly BOOLEAN DEFAULT FALSE,
  note TEXT,
  doctor_id INTEGER REFERENCES doctors(id),
  doctor_name VARCHAR(255),
  archive_date DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================
-- TABLE 4: timeline_events (سجل الأحداث)
-- ============================================
CREATE TABLE IF NOT EXISTS timeline_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  event_type VARCHAR(50) NOT NULL CHECK (event_type IN ('registered', 'clinic_assigned', 'not_available', 'completed')),
  event_details VARCHAR(255),
  doctor_name VARCHAR(255),
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================
-- INDEXES (فهارس لتحسين الأداء)
-- ============================================

-- Patients indexes
CREATE INDEX IF NOT EXISTS idx_patients_queue_number ON patients(queue_number);
CREATE INDEX IF NOT EXISTS idx_patients_status ON patients(status);
CREATE INDEX IF NOT EXISTS idx_patients_clinic_id ON patients(clinic_id);
CREATE INDEX IF NOT EXISTS idx_patients_doctor_id ON patients(doctor_id);
CREATE INDEX IF NOT EXISTS idx_patients_archive_date ON patients(archive_date);

-- Doctors indexes
CREATE INDEX IF NOT EXISTS idx_doctors_clinic_id ON doctors(clinic_id);
CREATE INDEX IF NOT EXISTS idx_doctors_role ON doctors(role);

-- Timeline events indexes
CREATE INDEX IF NOT EXISTS idx_timeline_events_patient_id ON timeline_events(patient_id);

-- ============================================
-- TRIGGERS (المشغلات التلقائية)
-- ============================================

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_patients_updated_at
  BEFORE UPDATE ON patients
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- AUTO-ARCHIVE FUNCTION (الأرشفة التلقائية)
-- ============================================

CREATE OR REPLACE FUNCTION archive_all_patients()
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  -- Update all patients: set archive_date to today
  UPDATE patients
  SET archive_date = CURRENT_DATE
  WHERE archive_date IS NULL;
  
  -- Log the archiving
  RAISE NOTICE 'Auto-archive completed at %', NOW();
END;
$$;

-- ============================================
-- CRON JOB (جدولة الأرشفة اليومية)
-- ============================================

-- Enable pg_cron extension (if not already enabled)
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Remove old cron job (if exists)
SELECT cron.unschedule('daily-patient-archive');

-- Schedule daily archiving at 23:59 (before end of day)
SELECT cron.schedule(
  'daily-patient-archive',
  '59 23 * * *',  -- Every day at 23:59
  $$SELECT archive_all_patients()$$
);

-- ============================================
-- ROW LEVEL SECURITY (RLS) - Optional
-- ============================================
-- Uncomment if you want to enable RLS for security

-- ALTER TABLE clinics ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE doctors ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE patients ENABLE ROW LEVEL SECURITY;

-- Create policies (example - adjust based on your needs)
-- CREATE POLICY "Doctors can view their clinic's patients" 
--   ON patients FOR SELECT 
--   USING (clinic_id IN (
--     SELECT clinic_id FROM doctors WHERE id = auth.uid()
--   ));

-- ============================================
-- VERIFICATION QUERIES (استعلامات التحقق)
-- ============================================

-- View all clinics
-- SELECT * FROM clinics;

-- View all doctors
-- SELECT * FROM doctors;

-- View all patients
-- SELECT * FROM patients ORDER BY created_at DESC LIMIT 10;

-- View timeline events
-- SELECT * FROM timeline_events ORDER BY timestamp DESC LIMIT 10;

-- Check table structure
-- SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'patients';

-- ============================================
-- SAMPLE TEST DATA (بيانات تجريبية)
-- ============================================

-- Uncomment to insert test patients
/*
INSERT INTO patients (queue_number, name, clinic, clinic_id, condition, treatment, status, doctor_name)
VALUES 
  (1, 'محمد الأحمد', 'Clinic 1', 1, 'Pain', 'Filling', 'complete', 'د. محمد إبراهيم'),
  (2, 'سارة الناصر', 'Clinic 2', 2, 'Checkup', 'Scaling', 'normal', NULL),
  (3, 'علي خالد', 'Clinic 3', 3, 'Broken Tooth', 'Extraction', 'complete', 'د. عمر خليل')
ON CONFLICT (queue_number) DO NOTHING;
*/

-- ============================================
-- END OF SCHEMA
-- ============================================
