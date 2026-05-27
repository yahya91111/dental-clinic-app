# Copy Day Schedule

## When to use

The Team Leader wants to duplicate one day's schedule onto
another day (within the same week or across weeks). This is
faster than building a day from scratch when the staffing
pattern is similar.

Trigger phrases (examples):
- "انسخ جدول الأحد للاثنين"
- "خذ جدول هذا الأسبوع وحطه للأسبوع القادم"
- "كرّر الأحد طول الأسبوع"
- "copy Sunday to Monday"

Do NOT use this workflow for:
- Building a brand-new week from scratch → use `create_weekly`
- Editing a single slot → use `edit_slot`

---

## Required tools

- `get_existing_schedule(week_start, day?)` — returns the
  schedule for a specific day or the whole week.
- `get_clinic_doctors()` — returns the clinic's doctors with
  their current availability and status.
- `copy_day_schedule(source, target)` — performs an atomic
  copy of all slots from source day to target day.

---

## Pre-flight checks

1. Confirm the **source day** has a schedule.
   - Call `get_existing_schedule(source_week, source_day)`.
   - If empty, inform the user there is nothing to copy.

2. Check whether the **target day** already has a schedule.
   - Call `get_existing_schedule(target_week, target_day)`.
   - If yes, ask the user whether to replace it. Never
     silently overwrite.

3. Check doctor availability for the **target day**.
   - Call `get_clinic_doctors()`.
   - Note any doctor scheduled in the source who is now on
     leave, permission, or vacation for the target.

---

## Steps

1. Identify both the source (day + week) and target (day + week).
   If ambiguous, ask the user to clarify.

2. Run the pre-flight checks above.

3. Build the proposed copy:
   - Start from the source day's slots.
   - For each unavailable doctor on the target day, mark the
     slot as needing replacement (do not auto-assign someone).

4. Present a SUMMARY of the copy to the user:
   - Source and target identified
   - Total slots being copied
   - Any slots flagged because of doctor unavailability
   - Any conflict with existing target schedule

5. Wait for the user's response. The user has three paths:
   a) **Confirm as-is** — proceed to step 6.
   b) **Request verbal adjustments** ("استبدل د.أحمد بـ د.سامي
      بالفترات اللي بدون طبيب") — adjust and re-present.
   c) **Choose manual editing** — acknowledge, do not save.

6. Call `copy_day_schedule(source, target)` (only on path 5a).

7. Apply the unified `notify_prompt` (see
   `sharedKnowledge/notifications/universal/notify_prompt.md`)
   using the `schedule_changed` template text:
   ```
   تم نسخ [source] إلى [target]. أعلِم أحد؟
   [المعنيّين فقط]
   [أفراد محددين]
   [القروب (+ التريني)]
   [كل المركز]
   [لا داعي]
   ```
   `المعنيّين فقط` resolves to all doctors whose schedule
   on the target day actually changed (added, removed,
   or moved). When a full day is overwritten and most of
   the clinic is affected, `كل المركز` is often the more
   practical pick.

8. Report the result per the TL's pick:
   - On `المعنيّين فقط` / others → "أُرسل لـ {count} {طبيب|أطباء}."
   - On `لا داعي` → "تم."
   - On partial copy: state which slots were skipped and
     why before the notify_prompt step.

---

## Presentation format

Keep it brief — just the diff and any warnings.

Example:
```
نسخ الأحد إلى الاثنين:
- 12 فتره (3 عيادات × 4 فترات)
- نفس التوزيع، نفس الديليقيتر

⚠ ملاحظات:
- د.أحمد على إجازه يوم الاثنين، فترتين راح يصيرون بدون طبيب
- جدول الاثنين الحالي راح يُستبدل بالكامل
```

---

## Edge cases

- **Source day is empty**
  Inform the user: "لا يوجد جدول لـ [source]، ما فيه شي للنسخ."
  Do not proceed.

- **Target day has an existing schedule**
  Always ask before overwriting: "يوجد جدول لـ [target]. هل أستبدله؟"

- **One or more doctors unavailable on target**
  Flag the slots but do NOT auto-assign replacements. Let the
  user decide who fills the gaps (verbally or via manual edit).

- **Copy across weeks (e.g., last Sunday → this Sunday)**
  Use the `week_start` parameter explicitly. Confirm the user
  meant cross-week and not same-week.

- **Copy one day to multiple days** ("كرّر الأحد طول الأسبوع")
  Treat as multiple copy operations. Present the full plan
  (5 copies) and confirm once before executing each.

---

## Common mistakes to avoid

- Do not copy a day that has no schedule.
- Do not auto-replace unavailable doctors. Let the user choose.
- Do not silently overwrite an existing target schedule.
- Do not assume same-week when the user might mean cross-week.

---

## Example conversation

```
TL: انسخ جدول الأحد للاثنين

AI: [calls get_existing_schedule(this_week, sunday)] — 12 slots found
    [calls get_existing_schedule(this_week, monday)] — empty
    [calls get_clinic_doctors()] — checking availability

AI: نسخ الأحد إلى الاثنين:
    - 12 فتره (نفس التوزيع، نفس الديليقيتر)

    ⚠ د.أحمد على إجازه يوم الاثنين، فترتين راح يصيرون بدون طبيب.

    هل أتابع؟

TL: نعم، حط مكانه د.سامي

AI: تم. د.سامي راح يأخذ فترات د.أحمد بالاثنين.
    التوزيع النهائي: 12 فتره، الديليقيتر د.علي.
    هل أحفظ؟

TL: نعم

AI: [calls copy_day_schedule(...)]
    تم نسخ الأحد إلى الاثنين.
```
