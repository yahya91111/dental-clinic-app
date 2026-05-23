# Permissions Audit - D.C.M App

> توثيق شامل لكل الصلاحيات الموجودة حالياً بالتطبيق
> **تم الجمع فقط - بدون تعديل أو تغيير**
> هذا الملف هو المرجع لبناء صلاحيات الذكاء الاصطناعي لاحقاً

---

## 1. الأدوار (UserRole)

**المصدر:** `permissions.ts:6`

```typescript
type UserRole = 'super_admin' | 'coordinator' | 'team_leader' | 'doctor';
```

---

## 2. الصلاحيات الرسمية (من permissions.ts)

| الصلاحية | super_admin | coordinator | team_leader | doctor |
|---------|-------------|-------------|-------------|--------|
| **Profile** | | | | |
| canViewDentalDepartments | ✓ | ✓ | ✗ | ✗ |
| canViewDoctors | ✓ | ✓ | ✓ | ✓ |
| canViewMyStatistics | ✓ | ✓ | ✓ | ✓ |
| canViewTimeline | ✗ | ✗ | ✓ | ✓ |
| **Doctor Management** | | | | |
| canAddDoctor | ✓ | ✓ | ✗ | ✗ |
| canDeleteDoctor | ✓ | ✓ | ✗ | ✗ |
| canDeleteTeamLeader | ✓ | ✓ | ✗ | ✗ |
| canDeleteCoordinator | ✓ | ✗ | ✗ | ✗ |
| canPromoteToTeamLeader | ✓ | ✓ | ✗ | ✗ |
| canPromoteToCoordinator | ✓ | ✗ | ✗ | ✗ |
| canDemoteTeamLeader | ✓ | ✓ | ✗ | ✗ |
| canMoveDoctor | ✓ | ✓ | ✗ | ✗ |
| canViewAllDoctors | ✓ | ✓ | ✗ | ✗ |
| canViewClinicDoctors | ✓ | ✓ | ✓ | ✓ |
| canViewDoctorProfile | ✓ | ✓ | ✓ | ✗ |
| **Edit** | | | | |
| canEditOwnProfile | ✗ | ✗ | ✗ | ✗ |
| canEditAnyProfile | ✓ | ✗ | ✗ | ✗ |
| canResetPassword | ✓ | ✗ | ✗ | ✗ |
| **Data** | | | | |
| canViewAllClinics | ✓ | ✓ | ✗ | ✗ |
| canViewOwnClinic | ✓ | ✓ | ✓ | ✓ |
| canManagePatients | ✓ | ✓ | ✓ | ✓ |
| canViewArchive | ✓ | ✓ | ✗ | ✗ |

---

## 3. صلاحيات منثورة (Inline) - بالشاشات

### A. DoctorsScreen.tsx

**المصدر:** `DoctorsScreen.tsx:244-247`

```typescript
canAddDoctor = user.role === 'super_admin' || user.role === 'coordinator' || user.role === 'team_leader'
canViewDoctorProfiles = user.role !== 'doctor'
canPromoteToCoordinator = user.role === 'super_admin'
canDeleteCoordinator = user.role === 'super_admin'
```

**⚠️ ملاحظة تضارب:** `canAddDoctor` هنا يسمح للـ team_leader، لكن `permissions.ts` يمنعه. (للمراجعة لاحقاً، لا تعديل الآن)

### B. DoctorProfileScreen.tsx

**المصدر:** `DoctorProfileScreen.tsx:2686, 2701`

```typescript
// تعديل حقول المدير العام/الإيميل
editable = user?.role !== 'team_leader' && user?.role !== 'doctor' && user?.role !== 'coordinator'
// = فقط super_admin يقدر يعدل
```

### C. MainQueueScreen.tsx

**المصدر:** `screens/MainQueue/MainQueueScreen.tsx:489`

```typescript
// زر الرجوع
if (user?.role === 'super_admin' || user?.role === 'coordinator')
// تنقل عبر Departments → Clinic → Profile
// team_leader & doctor: زر رجوع بسيط
```

### D. DentalDepartmentsScreen.tsx

**المصدر:** `DentalDepartmentsScreen.tsx:340`

```typescript
const isSuperAdmin = user?.role === 'super_admin';
// (السياق غير واضح بدون قراءة الشاشة كاملة)
```

---

## 4. صلاحيات DoctorsScreen التفصيلية

| الميزة | super_admin | coordinator | team_leader | doctor | ملاحظات |
|--------|-------------|-------------|-------------|--------|---------|
| Add Doctor Button | ✓ | ✓ | ✓ | ✗ | inline contradicts permissions.ts |
| View Doctor Profile | ✓ | ✓ | ✓ | ✗ | |
| Clinic Dropdown (Add Modal) | ✓ | ✓ | ✗ | - | team_leader: clinic ثابت |
| Role Dropdown (Add Modal) | كل الأدوار | doctor + team_leader | doctor فقط | - | |
| Transfer Doctor | ✓ | ✓ (إلا coordinator) | ✗ | ✗ | |
| Change Role | ✓ | ✓ (إلا coordinator) | ✗ | ✗ | |
| Delete Doctor | ✓ | ✓ (إلا coordinator) | ✗ | ✗ | |
| Reset Password | ✓ | ✗ | ✗ | ✗ | |
| List Filtering by Clinic | كل المراكز | كل المراكز | مركزه فقط | مركزه فقط | |

---

## 5. التنقل بين الشاشات (AppContent.tsx)

| الشاشة | super_admin | coordinator | team_leader | doctor |
|--------|-------------|-------------|-------------|--------|
| Dental Departments | ✓ | ✓ | ✗ | ✗ |
| Doctor Profile | ✓ | ✓ | ✓ (مركزه) | ✗ |
| Doctors Screen | ✓ | ✓ | ✓ (مركزه) | ✗ |
| Clinic Details | ✓ | ✓ | ✓ (مركزه) | ✓ |
| My Statistics | ✓ | ✓ | ✓ | ✓ |
| My Timeline | ✓ | ✓ | ✓ | ✓ |
| Archive | ✓ | ✓ | ✗ | ✗ |

---

## 6. قواعد خاصة (Helper Functions)

**المصدر:** `permissions.ts:193-265`

### canViewDoctorProfile(currentUser, targetDoctor)
- super_admin & coordinator: كل الأطباء
- team_leader: نفس مركزه فقط
- doctor: لا يقدر

### canDeleteUser(currentUser, targetUser)
- coordinator لا يقدر يحذف coordinator آخر
- team_leader لا يقدر يحذف أحد

### canEditProfile(currentUser, targetUser)
- super_admin فقط

### canResetUserPassword(currentUser, targetUser)
- super_admin فقط

---

## 7. حالات خاصة

### Pending Doctors (clinic_id = null)
- يستخدمون `virtual_center_id`
- super_admin و coordinator يقدرون يديرونهم

### Coordinator Self-Protection
- لا يقدر يحذف coordinator آخر
- لا يقدر يغير دور coordinator آخر
- لا يقدر ينقل coordinator آخر
- لا يقدر يرفع لـ coordinator

### Team Leader Restrictions
- يضيف doctor فقط (مو team_leader أو coordinator)
- يشوف مركزه فقط
- لا dental departments
- لا archive

### Doctor Restrictions
- لا يشوف بروفايلات أطباء آخرين بالتفصيل
- لا يشوف أطباء مراكز ثانية
- لا يضيف/يحذف/يرفع أحد
- لا dental departments
- لا archive

---

## 8. قواعد بيانات

### doctors table
- `role`: 'doctor' | 'coordinator' | 'team_leader'
- `clinic_id`: مرتبط بمركز (null لـ pending)

### pending_doctors table
- نفس الهيكل
- للأطباء الذين لم يُعيّنوا بعد
- `virtual_center_id`: مركز افتراضي

---

## 9. صلاحيات ناقصة (لم تُبنى بعد - للمعرفة فقط)

### Schedule System
- ❓ من يقدر ينشئ/يعدل الجدول الأسبوعي؟ (حالياً: الكل)
- ❓ من يقدر يدير قروبات الأطباء؟
- ❓ من يقدر يغير حالة العمل (vacation, light_duty)؟
- ❓ من يقدر يستخدم الذكاء الاصطناعي بالجدول؟

### Notifications System
- ❓ من يقدر يرسل تعاميم؟
- ❓ من يقدر يحذف إشعارات؟

### Swap System
- ❓ كل الأطباء يقدرون يطلبون تبديل (حالياً نعم)
- ❓ هل فيه أدوار لها صلاحية إلغاء/إجبار تبديل؟

### AI System
- ❓ من يستطيع استخدام الذكاء الاصطناعي؟
- ❓ هل هناك حد للاستخدام لكل دور؟
- ❓ من يقدر يعدل قوالب البرومبت؟

---

## 10. مخطط ملخص بصري

```
super_admin
    ├── كل الصلاحيات
    ├── إدارة كل المراكز
    └── الوحيد يقدر يعدل البروفايلات

coordinator
    ├── إدارة كل المراكز
    ├── يضيف/يحذف team_leader وأطباء
    ├── لا يقدر يعدل coordinators آخرين
    └── لا يقدر يعدل بروفايلات

team_leader
    ├── مركزه فقط
    ├── يشوف الأطباء بمركزه
    ├── يضيف أطباء (حسب inline) أو لا (حسب permissions.ts)
    └── ⚠️ تضارب يحتاج توضيح

doctor
    ├── معلومات شخصية فقط
    ├── يشوف زملاء مركزه (أسماء فقط)
    ├── ما يدير شي
    └── يستخدم Timeline و Statistics
```

---

> **هذا توثيق فقط. لم يتم تعديل أي كود.**
> **الخطوة التالية:** بناء صلاحيات الذكاء الاصطناعي بناء على هذا الملف.
