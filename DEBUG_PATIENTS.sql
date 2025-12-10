-- ============================================
-- البحث عن المرضى المسجلين حديثاً
-- ============================================

-- 1. عرض آخر 10 مرضى تم تسجيلهم
SELECT 
  id,
  queue_number,
  name,
  clinic,
  clinic_id,
  status,
  created_at
FROM patients
ORDER BY created_at DESC
LIMIT 10;

-- ============================================

-- 2. عرض المرضى بدون clinic_id (المشكلة!)
SELECT 
  id,
  queue_number,
  name,
  clinic,
  clinic_id,
  status,
  created_at
FROM patients
WHERE clinic_id IS NULL
ORDER BY created_at DESC;

-- ============================================

-- 3. عرض المرضى حسب المركز
SELECT 
  clinic_id,
  COUNT(*) as patient_count,
  STRING_AGG(name, ', ') as patient_names
FROM patients
GROUP BY clinic_id
ORDER BY clinic_id;

-- ============================================

-- 4. عرض جميع الأعمدة في جدول patients
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'patients'
ORDER BY ordinal_position;

-- ============================================

-- 5. حذف المرضى الاختباريين (إذا أردت البدء من جديد)
-- DELETE FROM patients WHERE name LIKE '%test%' OR name LIKE '%اختبار%';
