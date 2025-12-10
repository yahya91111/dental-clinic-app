-- ============================================
-- Reset Doctors Table - Step by Step Testing
-- ============================================

-- Step 1: Delete all existing doctors
DELETE FROM doctors;

-- Step 2: Reset the sequence (auto-increment)
ALTER SEQUENCE doctors_id_seq RESTART WITH 1;

-- Step 3: Insert test doctors one by one
-- We'll start with ONE doctor for testing

-- Super Admin (clinic_id = NULL for super admin)
INSERT INTO doctors (name, email, password, role, clinic_id) VALUES
  ('المدير العام', 'admin@dental.com', '0000', 'super_admin', NULL);

-- Coordinator for Clinic 1 (مركز مشرف)
INSERT INTO doctors (name, email, password, role, clinic_id) VALUES
  ('د. أحمد حسن', 'ahmed@dental.com', '0000', 'coordinator', 1);

-- Team Leader for Clinic 3 (مركز بيان)
INSERT INTO doctors (name, email, password, role, clinic_id) VALUES
  ('د. فاطمة علي', 'fatima@dental.com', '0000', 'team_leader', 3);

-- Doctor for Clinic 1 (مركز مشرف)
INSERT INTO doctors (name, email, password, role, clinic_id) VALUES
  ('د. محمد إبراهيم', 'mohamed@dental.com', '0000', 'doctor', 1);

-- Doctor for Clinic 2 (مركز حطين)
INSERT INTO doctors (name, email, password, role, clinic_id) VALUES
  ('د. سارة خالد', 'sara@dental.com', '0000', 'doctor', 2);

-- Doctor for Clinic 1 (مركز مشرف)
INSERT INTO doctors (name, email, password, role, clinic_id) VALUES
  ('د. علي محمد', 'ali@dental.com', '0000', 'doctor', 1);

-- Doctor for Clinic 3 (مركز بيان)
INSERT INTO doctors (name, email, password, role, clinic_id) VALUES
  ('د. عمر خليل', 'omar@dental.com', '0000', 'doctor', 3);

-- Step 4: Verify the data
SELECT id, name, email, role, clinic_id FROM doctors ORDER BY id;

-- ============================================
-- Expected Results:
-- ============================================
-- id | name              | email                | role         | clinic_id
-- ---|-------------------|----------------------|--------------|----------
-- 1  | المدير العام      | admin@dental.com     | super_admin  | NULL
-- 2  | د. أحمد حسن       | ahmed@dental.com     | coordinator  | 1
-- 3  | د. فاطمة علي      | fatima@dental.com    | team_leader  | 3
-- 4  | د. محمد إبراهيم   | mohamed@dental.com   | doctor       | 1
-- 5  | د. سارة خالد      | sara@dental.com      | doctor       | 2
-- 6  | د. علي محمد       | ali@dental.com       | doctor       | 1
-- 7  | د. عمر خليل       | omar@dental.com      | doctor       | 3

-- ============================================
-- Testing Plan:
-- ============================================
-- 1. Run this script in Supabase SQL Editor
-- 2. Login as 'fatima@dental.com' (Team Leader, Clinic 3)
-- 3. Open Doctors screen
-- 4. Expected: Should see د. فاطمة علي (herself) + د. عمر خليل (doctor in clinic 3)
-- 5. Should NOT see doctors from clinic 1 or 2
