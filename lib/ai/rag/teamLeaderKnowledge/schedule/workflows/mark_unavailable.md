# Mark Doctor Unavailable

## When to use

The Team Leader wants to mark a doctor as absent or
unavailable for one or more periods. This covers sick
leave, vacation, and short permission.

Trigger phrases (examples):
- "د.أحمد على إجازه مرضيه يوم الأحد"
- "د.سامي مستأذن نهاية دوام الصباحي يوم الاثنين"
- "د.محمد بتفرّغ من الثلاثاء إلى الخميس"
- "Dr. Ahmed sick leave Sunday"

Do NOT use this workflow for:
- Marking a doctor as **EX (reserve)** → see `manage_groups`
  (EX is a status, not an absence)
- Removing an absence after it has happened → use `edit_slot`
  for the specific day, or contact admin for historical records
- Editing a single slot for any other reason → use `edit_slot`

---

## Absence types

| Code | Arabic | Scope | Duration |
|------|--------|-------|----------|
| **SL** | إجازه مرضيه (تقرير طبي) | Full day | 1+ days |
| **VC** | تفرّغ | Full day | 1+ days |
| **PS** | استئذان بداية الدوام | One period (P1 or P3) | Within one shift |
| **PE** | استئذان نهاية الدوام | One period (P2 or P4) | Within one shift |

**Permission semantics:**
- Morning shift permission:
  - PS (start of day, leaves late or arrives late) → covers P1
  - PE (end of morning, leaves early) → covers P2
- Evening shift permission:
  - PS (start of evening) → covers P3
  - PE (end of evening) → covers P4

---

## Coverage logic (reference)

For full rules, see `rules/coverage.md`. Key points:

- **Normal staffing** (7+ doctors in a shift):
  6 regular doctors per period + 1 dedicated delegator
  for the whole shift. The 7th doctor may be **EX (reserve)**.

- **Shortage** (6 doctors in a shift):
  Some doctors fill double roles — regular in one period
  and delegator in another. Coverage is still possible.

- **EX (reserve) activation**: If a reserve doctor exists
  for that day, they are the first option to cover an
  absence. The TL may choose to activate them or pick a
  different strategy.

- **Role rotation under shortage**: It is acceptable to ask
  an active doctor to work two regular periods in the same
  shift when coverage demands it.

---

## Required tools

- `get_clinic_doctors()` — list doctors with current status.
- `get_doctor_slots(doctor_id, start_date, end_date)` —
  returns all slots assigned to the doctor in the date range.
- `mark_doctor_absent(doctor_id, type, start_date, end_date, period?)`
  — atomic absence marker. `period` is required for PS/PE,
  ignored for SL/VC.
- `get_ex_doctor(week_start, day)` — returns the EX/reserve
  doctor for that day, or null if none.
- `find_eligible_replacements(week_start, day, period, exclude_busy)`
  — returns doctors who could cover the slot.
- `assign_replacement(slot_id, replacement_doctor_id)` —
  assigns a different doctor to a vacated slot.

---

## Pre-flight checks

1. Identify the **doctor**. If named ambiguously, ask.
2. Identify the **absence type** (SL, VC, PS, PE). If
   unclear from the request, ask.
3. Identify the **date range**:
   - For SL or VC: ask for start and end dates.
   - For PS or PE: ask for the single day and confirm
     the implied period (P1/P2/P3/P4).
4. Confirm the date range is not entirely in the past.
5. Call `get_doctor_slots(...)` to see what slots are
   affected by the absence.

---

## Steps

1. Identify doctor, type, and scope. Ask for any missing
   detail.

2. Run the pre-flight checks above.

3. Present the absence and the affected slots:
   ```
   د.أحمد - إجازه مرضيه (SL)
   من الأحد إلى الاثنين (يومين)

   الخانات المتأثره: 8 خانات
   - الأحد: P1 عياده 1، P2 عياده 1، P3 عياده 2، P4 عياده 2
   - الاثنين: نفس التوزيع
   ```

4. Present coverage options for the TL to choose:
   - **Use EX doctor** (if one exists for those days)
   - **Suggest specific replacements** (from
     find_eligible_replacements)
   - **Leave slots empty** for later manual edit
   - **Ask the affected doctors** (you can suggest reaching
     out to one or more)

5. Wait for the TL's choice on both the absence and the
   coverage strategy.

6. Execute in order:
   a) `mark_doctor_absent(...)` to record the absence
   b) For each affected slot, `assign_replacement(...)` if
      a replacement was chosen
   c) Skip slots the TL chose to leave empty

7. Report the result clearly:
   - "تم تسجيل إجازة د.أحمد من الأحد إلى الاثنين."
   - "تم تغطية 6 خانات بـ د.سامي (EX)، خانتين تركتها فاضيه."

---

## Presentation format

Absence:
```
د.[name] - [type Arabic] ([code])
[date range, in days]

الخانات المتأثره: [N] خانات
- [day]: [list of affected slots]
```

Coverage plan:
```
خطة التغطيه:
- [slot] → [replacement name] (EX / بديل / فاضي)
```

---

## Edge cases

- **Doctor has no slots in the affected range**
  Still record the absence, but inform the TL: "لا توجد خانات
  لـ د.أحمد بهالأيام. تم تسجيل الإجازه فقط بدون تأثير على الجدول."

- **Doctor already has another absence overlapping**
  Reject the new absence: "د.أحمد عنده [existing absence].
  استبدلها أو اختر فتره ثانيه."

- **Date range is entirely in the past**
  Reject. Past schedules are locked.

- **Date range partially in the past**
  Apply only to current and future days. Inform the TL
  which days were skipped.

- **No EX doctor available for shortage day**
  Inform: "ما فيه EX يوم الأحد. الخيارات: بديل من أطباء
  متاحين، أو خانات فاضيه، أو أسأل أطباء عن استعدادهم."

- **Permission (PS/PE) for a period the doctor is not scheduled**
  Inform: "د.سامي مو معيّن بـ P3 الاثنين. تأكدت قبل تسجيل
  الاستئذان؟" Confirm before recording.

- **TL says "اسأل الأطباء"** (ask the doctors directly)
  Coverage gaps will need a separate flow (a notification or
  swap request). Acknowledge and refer the TL to the relevant
  workflow when ready.

---

## Common mistakes to avoid

- Do not pick a coverage strategy without asking the TL.
- Do not auto-activate EX without confirmation.
- Do not record an absence for a past date.
- Do not invent doctor IDs.
- Do not mark a doctor absent and silently leave their
  slots empty without telling the TL.
- Do not confuse PS/PE periods. PS = start of shift,
  PE = end of shift.

---

## Example conversation

```
TL: د.أحمد عنده تقرير طبي الأحد والاثنين

AI: [calls get_doctor_slots(ahmed, sunday, monday)] — 8 slots
    [calls get_ex_doctor(this_week, sunday)] — Dr. Sami (EX)
    [calls get_ex_doctor(this_week, monday)] — Dr. Sami (EX)

AI: د.أحمد - إجازه مرضيه (SL)
    من الأحد إلى الاثنين (يومين)

    الخانات المتأثره: 8 خانات (4 لكل يوم)

    خيارات التغطيه:
    1. تفعيل د.سامي (EX) ليغطي الـ 8 خانات
    2. اختيار بدلاء مختلفين لكل خانه
    3. ترك الخانات فاضيه للمراجعه لاحقاً
    4. سؤال أطباء آخرين عن استعدادهم

    أي وحده تختار؟

TL: 1

AI: تأكيد:
    - تسجيل إجازة د.أحمد (SL) من الأحد إلى الاثنين
    - تغطية الـ 8 خانات بـ د.سامي (EX)

    أحفظ؟

TL: نعم

AI: [calls mark_doctor_absent(ahmed, SL, sunday, monday)]
    [calls assign_replacement for each of 8 slots with sami_id]
    تم. الإجازه مسجّله و د.سامي يغطي الـ 8 خانات.
```

**Permission example:**
```
TL: د.محمد مستأذن نهاية دوام الصباحي يوم الثلاثاء

AI: تأكيد:
    - النوع: استئذان نهاية الدوام (PE)
    - الفتره: P2 (10:30 - 14:00) يوم الثلاثاء

    د.محمد عنده خانه واحده بـ P2 الثلاثاء (عياده 1).

    شو خيار التغطيه؟
    1. د.سامي (EX) موجود
    2. بدائل ثانيه
    3. خانه فاضيه

TL: 1

AI: [calls mark_doctor_absent(mohammed, PE, tuesday, period=P2)]
    [calls assign_replacement(slot, sami_id)]
    تم. د.محمد مستأذن P2 الثلاثاء، د.سامي يغطي.
```

**Vacation example (multi-day):**
```
TL: د.علي بتفرّغ من الثلاثاء إلى الخميس

AI: د.علي - تفرّغ (VC)
    من الثلاثاء إلى الخميس (3 أيام)

    الخانات المتأثره: 12 خانه

    خيارات التغطيه:
    1. تفعيل EX لكل يوم (يختلف اليوم)
    2. توزيع البدلاء يدوياً
    3. ترك الخانات فاضيه (راح أعدّلها بنفسي بالتطبيق)

TL: 3

AI: تأكيد:
    - تسجيل تفرّغ د.علي من الثلاثاء إلى الخميس
    - 12 خانه راح تصير فاضيه، تعدّلها بالتطبيق

    أحفظ؟

TL: نعم

AI: [calls mark_doctor_absent(ali, VC, tuesday, thursday)]
    تم. التفرّغ مسجّل. 12 خانه فاضيه بانتظار تعديلك.
```
