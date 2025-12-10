-- =====================================================
-- PENDING DOCTORS SYSTEM - DATABASE CHANGES
-- تعديلات قاعدة البيانات لنظام الجدولين المنفصلين
-- التاريخ: 4 ديسمبر 2024
-- =====================================================

-- =====================================================
-- الخطوة 1: حذف VIEW القديم (إذا كان موجوداً)
-- =====================================================

DROP VIEW IF EXISTS pending_doctors;

-- =====================================================
-- الخطوة 2: إنشاء جدول pending_doctors الحقيقي
-- =====================================================

CREATE TABLE IF NOT EXISTS pending_doctors (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL,
  role TEXT DEFAULT 'doctor',
  clinic_id INTEGER,
  virtual_center_id INTEGER,
  virtual_center_name TEXT,
  is_approved BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- الخطوة 3: إضافة Indexes لتحسين الأداء
-- =====================================================

-- Index على email للبحث السريع
CREATE INDEX IF NOT EXISTS idx_pending_doctors_email 
ON pending_doctors(email);

-- Index على role للفلترة
CREATE INDEX IF NOT EXISTS idx_pending_doctors_role 
ON pending_doctors(role);

-- Index على virtual_center_id
CREATE INDEX IF NOT EXISTS idx_pending_doctors_virtual_center_id 
ON pending_doctors(virtual_center_id);

-- =====================================================
-- الخطوة 4: البحث عن Triggers الموجودة
-- =====================================================

-- استعلام للبحث عن جميع Triggers المتعلقة بـ doctors و pending_doctors
-- قم بتشغيل هذا الاستعلام أولاً لمعرفة أسماء Triggers
SELECT 
    trigger_name, 
    event_object_table, 
    action_statement,
    action_timing,
    event_manipulation
FROM information_schema.triggers
WHERE event_object_table IN ('doctors', 'pending_doctors')
ORDER BY event_object_table, trigger_name;

-- =====================================================
-- الخطوة 5: حذف Triggers (إذا كانت موجودة)
-- =====================================================

-- ملاحظة: استبدل 'trigger_name_here' باسم Trigger الفعلي من نتيجة الاستعلام أعلاه
-- مثال:
-- DROP TRIGGER IF EXISTS copy_to_pending_doctors ON doctors;
-- DROP TRIGGER IF EXISTS sync_doctors_to_pending ON doctors;

-- قم بحذف أي Trigger يقوم بنسخ البيانات بين doctors و pending_doctors

-- =====================================================
-- الخطوة 6: التحقق من البيانات الموجودة
-- =====================================================

-- عرض جميع الأطباء في pending_doctors
SELECT 
    id,
    name,
    email,
    role,
    clinic_id,
    virtual_center_id,
    is_approved,
    created_at
FROM pending_doctors
ORDER BY created_at DESC;

-- عرض جميع الأطباء في doctors
SELECT 
    id,
    name,
    email,
    role,
    clinic_id,
    virtual_center_id,
    is_approved
FROM doctors
WHERE role IN ('doctor', 'coordinator', 'team_leader')
ORDER BY name;

-- =====================================================
-- الخطوة 7: إضافة Constraints (اختياري)
-- =====================================================

-- التأكد من أن role له قيم محددة فقط
ALTER TABLE pending_doctors 
ADD CONSTRAINT check_pending_doctors_role 
CHECK (role IN ('doctor', 'coordinator', 'team_leader'));

-- التأكد من أن email صحيح
ALTER TABLE pending_doctors 
ADD CONSTRAINT check_pending_doctors_email 
CHECK (email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$');

-- =====================================================
-- الخطوة 8: إضافة Comments للتوثيق
-- =====================================================

COMMENT ON TABLE pending_doctors IS 'جدول الأطباء المعلقين (غير المعينين لمراكز)';
COMMENT ON COLUMN pending_doctors.id IS 'المعرف الفريد للطبيب';
COMMENT ON COLUMN pending_doctors.name IS 'اسم الطبيب الكامل';
COMMENT ON COLUMN pending_doctors.email IS 'البريد الإلكتروني (فريد)';
COMMENT ON COLUMN pending_doctors.password IS 'كلمة المرور (يجب تشفيرها في الإنتاج)';
COMMENT ON COLUMN pending_doctors.role IS 'دور الطبيب: doctor, coordinator, team_leader';
COMMENT ON COLUMN pending_doctors.clinic_id IS 'معرف المركز (null للأطباء المعلقين)';
COMMENT ON COLUMN pending_doctors.virtual_center_id IS 'معرف العيادة الافتراضية';
COMMENT ON COLUMN pending_doctors.virtual_center_name IS 'اسم العيادة الافتراضية';
COMMENT ON COLUMN pending_doctors.is_approved IS 'هل تمت الموافقة على الطبيب';
COMMENT ON COLUMN pending_doctors.created_at IS 'تاريخ إنشاء السجل';

-- =====================================================
-- الخطوة 9: إنشاء Function لنقل الطبيب من pending إلى doctors
-- (اختياري - يمكن استخدامه في المستقبل)
-- =====================================================

CREATE OR REPLACE FUNCTION transfer_doctor_to_clinic(
    p_doctor_id INTEGER,
    p_clinic_id INTEGER
) RETURNS VOID AS $$
DECLARE
    v_doctor_record RECORD;
BEGIN
    -- الحصول على بيانات الطبيب من pending_doctors
    SELECT * INTO v_doctor_record
    FROM pending_doctors
    WHERE id = p_doctor_id;
    
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Doctor not found in pending_doctors with id: %', p_doctor_id;
    END IF;
    
    -- إدراج في doctors
    INSERT INTO doctors (
        name,
        email,
        password,
        role,
        clinic_id,
        is_approved,
        virtual_center_id,
        virtual_center_name
    ) VALUES (
        v_doctor_record.name,
        v_doctor_record.email,
        v_doctor_record.password,
        v_doctor_record.role,
        p_clinic_id,
        true,
        NULL,
        NULL
    );
    
    -- حذف من pending_doctors
    DELETE FROM pending_doctors WHERE id = p_doctor_id;
    
    RAISE NOTICE 'Doctor % transferred successfully to clinic %', v_doctor_record.name, p_clinic_id;
END;
$$ LANGUAGE plpgsql;

-- مثال على الاستخدام:
-- SELECT transfer_doctor_to_clinic(1, 1); -- نقل طبيب رقم 1 إلى مركز رقم 1

-- =====================================================
-- الخطوة 10: إنشاء View للإحصائيات (اختياري)
-- =====================================================

CREATE OR REPLACE VIEW doctors_statistics AS
SELECT 
    'pending' AS status,
    COUNT(*) AS total_count,
    COUNT(CASE WHEN role = 'doctor' THEN 1 END) AS doctors_count,
    COUNT(CASE WHEN role = 'coordinator' THEN 1 END) AS coordinators_count,
    COUNT(CASE WHEN role = 'team_leader' THEN 1 END) AS team_leaders_count
FROM pending_doctors
UNION ALL
SELECT 
    'assigned' AS status,
    COUNT(*) AS total_count,
    COUNT(CASE WHEN role = 'doctor' THEN 1 END) AS doctors_count,
    COUNT(CASE WHEN role = 'coordinator' THEN 1 END) AS coordinators_count,
    COUNT(CASE WHEN role = 'team_leader' THEN 1 END) AS team_leaders_count
FROM doctors
WHERE role IN ('doctor', 'coordinator', 'team_leader');

-- عرض الإحصائيات
SELECT * FROM doctors_statistics;

-- =====================================================
-- انتهى ملف التعديلات
-- =====================================================

-- ملاحظات:
-- 1. تأكد من تشغيل هذه الأوامر بالترتيب
-- 2. قم بعمل نسخة احتياطية من قاعدة البيانات قبل التنفيذ
-- 3. راجع نتائج استعلام Triggers وقم بحذف أي Trigger غير مرغوب فيه
-- 4. اختبر النظام بعد التنفيذ للتأكد من عمل كل شيء بشكل صحيح
