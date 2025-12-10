# دليل إعداد قاعدة البيانات - خطوة بخطوة

## 📋 الخطوات بالترتيب:

---

## الخطوة 1: افتح Supabase Dashboard

1. اذهب إلى: https://supabase.com
2. سجل دخول إلى حسابك
3. افتح مشروعك (Dental Clinic)
4. من القائمة الجانبية، اضغط على **SQL Editor**

---

## الخطوة 2: نفذ SQL Schema الكامل

**انسخ والصق هذا الكود في SQL Editor:**

```sql
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
```

**ثم اضغط على زر "Run" أو "Execute"**

---

## الخطوة 3: تحقق من نجاح الإنشاء

**نفذ هذه الاستعلامات للتحقق:**

```sql
-- تحقق من جدول المراكز
SELECT * FROM clinics;

-- تحقق من جدول الأطباء
SELECT * FROM doctors;

-- تحقق من أعمدة جدول المرضى
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'patients';
```

**يجب أن ترى:**
- ✅ 5 مراكز في جدول `clinics`
- ✅ 7 أطباء في جدول `doctors`
- ✅ عمود `clinic_id` في جدول `patients`

---

## الخطوة 4: (اختياري) تحديث البيانات الموجودة

**إذا كان لديك مرضى موجودين، نفذ هذا لتعيين clinic_id لهم:**

```sql
UPDATE patients SET clinic_id = 1 WHERE clinic LIKE '%مشرف%' OR clinic = 'Clinic 1';
UPDATE patients SET clinic_id = 2 WHERE clinic LIKE '%حطين%' OR clinic = 'Clinic 2';
UPDATE patients SET clinic_id = 3 WHERE clinic LIKE '%بيان%' OR clinic = 'Clinic 3';
UPDATE patients SET clinic_id = 4 WHERE clinic LIKE '%الزهرة%' OR clinic = 'Clinic 4';
UPDATE patients SET clinic_id = 5 WHERE clinic LIKE '%النور%' OR clinic = 'Clinic 5';
```

---

## الخطوة 5: تحديث AuthContext في التطبيق

**افتح ملف `AuthContext.tsx` وتأكد من أنه يحتوي على:**

```typescript
export type User = {
  id: string;
  name: string;
  email: string;
  role: 'super_admin' | 'coordinator' | 'team_leader' | 'doctor';
  clinicId?: number;
};
```

**وفي دالة `login`:**

```typescript
const login = async (email: string, password: string) => {
  try {
    // Query doctors table
    const { data, error } = await supabase
      .from('doctors')
      .select('*')
      .eq('email', email)
      .eq('password', password)
      .single();

    if (error || !data) {
      throw new Error('Invalid credentials');
    }

    const userData: User = {
      id: data.id.toString(),
      name: data.name,
      email: data.email,
      role: data.role,
      clinicId: data.clinic_id,
    };

    setUser(userData);
    return true;
  } catch (error) {
    console.error('Login error:', error);
    return false;
  }
};
```

---

## الخطوة 6: اختبر التطبيق

1. **سجل دخول بحساب:**
   - Email: `admin@dental.com`
   - Password: `0000`

2. **افتح Timeline لمركز "مشرف الصحي"**

3. **أضف مريض جديد**
   - يجب أن يظهر في Timeline المركز المحدد فقط

4. **سجل خروج وسجل دخول بحساب آخر:**
   - Email: `mohamed@dental.com`
   - Password: `0000`
   - يجب أن ترى فقط مرضى مركز "مشرف الصحي"

---

## ✅ تم الانتهاء!

**الآن التطبيق جاهز مع:**
- ✅ جداول المراكز والأطباء
- ✅ Data Isolation (كل مركز له بياناته)
- ✅ نظام الصلاحيات
- ✅ Timeline و Statistics و Archive منفصلة لكل مركز

---

## 🆘 في حالة وجود مشاكل:

### مشكلة: "column clinic_id does not exist"
**الحل:** نفذ الخطوة 2 مرة أخرى

### مشكلة: "relation clinics does not exist"
**الحل:** تأكد من تنفيذ الخطوة 2 بالكامل

### مشكلة: "duplicate key value violates unique constraint"
**الحل:** البيانات موجودة بالفعل، هذا طبيعي

---

## 📞 الدعم:

إذا واجهت أي مشكلة، أرسل لي:
1. رسالة الخطأ الكاملة
2. الخطوة التي فشلت فيها
3. screenshot من Supabase Dashboard
