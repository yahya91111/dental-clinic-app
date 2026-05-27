# Edit Single Slot

## When to use

The Team Leader wants to change one specific slot in the
schedule — assign a different doctor, change a role, or
modify a single assignment without touching the rest of
the schedule.

Trigger phrases (examples):
- "غيّر طبيب الأحد P2 العياده 1 إلى د.علي"
- "حط د.أحمد بدل د.محمد بفترة الخميس الصباحي"
- "بدّل دور د.سامي إلى ديليقيتر"
- "change Sunday P2 room 1 to Dr. Ali"

Do NOT use this workflow for:
- Building a full schedule → use `create_weekly`
- Copying a whole day → use `copy_day`
- Swapping two doctors' assignments → use `swap_on_behalf`
- Marking a doctor on leave → use `mark_unavailable`

---

## Required tools

- `get_slot(week_start, day, period, room)` — returns the
  current state of a specific slot.
- `get_clinic_doctors()` — returns available doctors and
  their status.
- `update_slot(slot_id, changes)` — updates a single slot
  atomically.

---

## Pre-flight checks

1. Confirm the slot exists and read its current state.
   - Call `get_slot(...)` with the identifying parameters.
   - If the slot is part of a locked historical schedule,
     decline (see role-specific limits in the prompt).

2. If the change involves assigning a doctor:
   - Call `get_clinic_doctors()` to confirm the doctor is
     active and available for that period.
   - Reject the change if the doctor is on leave,
     permission, or vacation for that day.

3. Check for conflicts:
   - The doctor must not already be assigned to another
     slot in the same period.

---

## Steps

1. Identify the slot precisely. Required fields:
   - week_start (default: current week)
   - day
   - period
   - room number

   If any field is missing or ambiguous, ask the user to
   clarify before reading.

2. Read the slot's current state via `get_slot(...)`.

3. Run the pre-flight checks above.

4. Present the proposed change to the user as a one-line
   diff:
   - "الأحد P2 عياده 1: د.محمد → د.علي (طبيب عياده)"

5. Wait for explicit confirmation. The user has three paths:
   a) **Confirm** — proceed to step 6.
   b) **Request a different change** — adjust and re-present.
   c) **Cancel** — acknowledge, do not save.

6. Call `update_slot(slot_id, changes)` (only on path 5a).

7. Apply the unified `notify_prompt` (see
   `sharedKnowledge/notifications/universal/notify_prompt.md`)
   using the `schedule_changed` template (single-slot
   variant) text:
   ```
   تم. الأحد P2 عياده 1: د.علي. أعلِم أحد؟
   [المعنيّين فقط (د.علي، د.محمد إن كان فيه بديل)]
   [أفراد محددين]
   [القروب (+ التريني)]
   [كل المركز]
   [لا داعي]
   ```
   `المعنيّين فقط` resolves to the new occupant plus the
   displaced one (if any). For a role change with no
   doctor swap, it resolves to the single doctor only.

8. Report the result per the TL's pick:
   - On `المعنيّين فقط` / others → "أُرسل لـ {count} {طبيب|أطباء}."
   - On `لا داعي` → "تم."
   - On conflict: state the conflict and ask how to resolve
     (skip the notify step).

---

## Presentation format

Single-line diff format:
```
[day] [period] عياده [room]: [old] → [new] ([role])
```

For role changes only:
```
[day] [period] عياده [room]: [doctor] (طبيب عياده → ديليقيتر)
```

For status changes only:
```
[day] [period] عياده [room]: [doctor] (نشط → استئذان)
```

---

## Edge cases

- **Slot is empty (no current assignment)**
  Treat as a new assignment. Present as:
  "الأحد P2 عياده 1: فارغ → د.علي"

- **Doctor already assigned to another slot in same period**
  Reject and inform: "د.علي معيّن مسبقاً بـ P2 عياده 2. اختر طبيب
  ثاني أو حدد ما تبي تسوي مع التعيين الحالي."

- **Doctor on leave/permission/vacation for that day**
  Reject: "د.علي على [status] يوم الأحد. اختر طبيب متاح."

- **Changing role from clinic doctor to delegator**
  Verify no other delegator exists for that period. If yes,
  ask the user how to handle the existing delegator before
  proceeding.

- **Slot belongs to a past (locked) week**
  Decline. Historical schedules are read-only.

- **User says "change all P2 slots Sunday"**
  This is no longer a single-slot edit. Inform the user this
  needs multiple edits or a broader workflow. Suggest one.

---

## Common mistakes to avoid

- Do not assume which week — always confirm or default
  explicitly to current week.
- Do not assign a doctor without checking their availability
  and conflicts first.
- Do not silently replace a delegator. Always surface that
  the previous delegator slot is now empty.
- Do not modify a past week's slot. It is locked.

---

## Example conversation

```
TL: غيّر الأحد P2 عياده 1 من د.محمد إلى د.علي

AI: [calls get_slot(this_week, sunday, P2, room_1)]
    الحاله الحاليه: د.محمد (طبيب عياده)
    [calls get_clinic_doctors()] — د.علي متاح بهذي الفتره

AI: التغيير المقترح:
    الأحد P2 عياده 1: د.محمد → د.علي (طبيب عياده)

    هل أحفظ؟

TL: نعم

AI: [calls update_slot(...)]
    تم. الأحد P2 عياده 1: د.علي.
```

```
TL: بدّل دور د.سامي بـ P3 إلى ديليقيتر

AI: [calls get_slot(...)] — د.سامي حالياً طبيب عياده بـ P3 عياده 2
    [checks for existing delegator] — د.أحمد هو الديليقيتر الحالي

AI: لو خليت د.سامي ديليقيتر، فترة الديليقيتر الحاليه (د.أحمد)
    راح تصير فاضيه. شو تبي تسوي مع د.أحمد؟
    1. أحوله طبيب عياده
    2. أشيله من P3 تماماً
    3. ألغي الطلب

TL: 1

AI: التغيير المقترح:
    P3: د.أحمد (ديليقيتر → طبيب عياده)
    P3: د.سامي (طبيب عياده → ديليقيتر)

    هل أحفظ؟

TL: نعم

AI: [calls update_slot(...) for both]
    تم. د.سامي صار ديليقيتر P3، د.أحمد صار طبيب عياده.
```
