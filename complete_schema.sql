-- ============================================
-- Dental Clinic Management System - Complete Schema
-- ============================================

-- 1. Create clinics table
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

-- 2. Create doctors table
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
  ('د. عمر خليل', 'omar@dental.com', '0000', 'doctor', 1)
ON CONFLICT (email) DO NOTHING;

-- 3. Update patients table
-- ============================================
-- Add clinic_id column if not exists
ALTER TABLE patients 
ADD COLUMN IF NOT EXISTS clinic_id INTEGER REFERENCES clinics(id);

-- Add doctor_id column for assigned doctor (optional)
ALTER TABLE patients 
ADD COLUMN IF NOT EXISTS doctor_id INTEGER REFERENCES doctors(id);

-- 4. Create indexes for performance
-- ============================================
CREATE INDEX IF NOT EXISTS idx_patients_clinic_id ON patients(clinic_id);
CREATE INDEX IF NOT EXISTS idx_patients_doctor_id ON patients(doctor_id);
CREATE INDEX IF NOT EXISTS idx_patients_status ON patients(status);
CREATE INDEX IF NOT EXISTS idx_patients_archive_date ON patients(archive_date);
CREATE INDEX IF NOT EXISTS idx_doctors_clinic_id ON doctors(clinic_id);
CREATE INDEX IF NOT EXISTS idx_doctors_role ON doctors(role);
CREATE INDEX IF NOT EXISTS idx_timeline_events_patient_id ON timeline_events(patient_id);

-- 5. Enable Row Level Security (RLS) - Optional
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

-- 6. Update existing patients (if needed)
-- ============================================
-- Uncomment to migrate existing data based on clinic name

-- UPDATE patients SET clinic_id = 1 WHERE clinic LIKE '%مشرف%' OR clinic = 'Clinic 1';
-- UPDATE patients SET clinic_id = 2 WHERE clinic LIKE '%حطين%' OR clinic = 'Clinic 2';
-- UPDATE patients SET clinic_id = 3 WHERE clinic LIKE '%بيان%' OR clinic = 'Clinic 3';
-- UPDATE patients SET clinic_id = 4 WHERE clinic LIKE '%الزهرة%' OR clinic = 'Clinic 4';
-- UPDATE patients SET clinic_id = 5 WHERE clinic LIKE '%النور%' OR clinic = 'Clinic 5';

-- 7. Verify schema
-- ============================================
-- Run these queries to verify the schema:

-- SELECT * FROM clinics;
-- SELECT * FROM doctors;
-- SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'patients';
