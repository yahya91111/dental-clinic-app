-- إضافة حقل is_elderly لجدول patients
ALTER TABLE patients 
ADD COLUMN IF NOT EXISTS is_elderly BOOLEAN DEFAULT FALSE;

-- تحديث البيانات الموجودة: المرضى الذين status = 'elderly' يصبحون is_elderly = true
UPDATE patients 
SET is_elderly = TRUE 
WHERE status = 'elderly';

-- الآن يمكن تغيير status إلى 'complete' مع الحفاظ على is_elderly = true
-- مثال: مريض كبير سن وتم علاجه
-- status = 'complete' و is_elderly = true
-- سيظهر: [DONE] [ELDR] [NOTE]

-- التحقق
SELECT id, name, status, is_elderly, note FROM patients LIMIT 10;
