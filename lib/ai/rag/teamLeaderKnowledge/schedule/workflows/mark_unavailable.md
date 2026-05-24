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

**Reduced workload (تخفيف عمل) — a doctor status, not an absence**

Some doctors carry a permanent **reduced workload** status.
They always work only the **first period of their shift**:
- Morning reduced workload → works P1 only (not P2)
- Evening reduced workload → works P3 only (not P4)

This is a property on the doctor, not an absence event. It
affects scheduling and cascade candidate selection: a
reduced-workload doctor cannot be a candidate for covering
P2 or P4, because they are not present during those periods.

**Permission semantics:**
- Morning shift permission:
  - PS (start of day, leaves late or arrives late) → covers P1
  - PE (end of morning, leaves early) → covers P2
- Evening shift permission:
  - PS (start of evening) → covers P3
  - PE (end of evening) → covers P4

---

## Type-specific auto-handling

The AI does not ask the TL "how do you want to cover this?"
for every absence. Each type has a default automatic flow.
The TL is shown the result and can override if needed.

### SL (Sick Leave) — automatic

1. Move the doctor's name to the **EX section** of the
   schedule with the SL label for each affected day.
2. Remove the doctor's name from every clinic slot on
   those days.
3. Auto-fill the vacated clinic slots with the day's
   **reserve EX doctor** if one exists. If no reserve EX
   exists, leave the slots empty and flag them.
4. Send a notification to the Team Leader (handled by the
   notifications system; the TL will receive a push).
5. Confirm to the TL in chat:
   "تم تسجيل تقرير د.[X] يوم [Y]. د.[reserve] غطّى الـ
   [N] خانات. أُرسل إشعار."

### VC (Vacation) — automatic

Same as SL: move to EX section, remove from clinic slots,
auto-fill with reserve EX. Difference: VC usually spans
multiple days and is planned, so the TL may have already
arranged coverage. Check first; if coverage is already
configured for those days, do not overwrite.

### PE (Permission End-of-shift) — cascading swap

When the doctor's PE removes them from the **end of shift
period** (P2 for morning, P4 for evening) and they are
scheduled in that period, follow this cascade. **Every step
is a swap** — the absent doctor exchanges their slot with
a candidate's slot. The cascade only changes which period
the candidate is taken from.

**Step 1 — Swap with the closest period inside the same
shift.**

- For PE = P4 → search candidates in **P3**
- For PE = P2 → search candidates in **P1**

The candidate swaps their slot with the absent doctor's
end-of-shift slot. The absent doctor takes the candidate's
earlier slot (which they can work, since their permission
only excludes the end-of-shift period). The candidate
moves into the end-of-shift slot.

**Step 2 — If no one in step 1 accepts, broaden to one
period further.**

- For PE = P4 → try **P2**
- For PE = P2 → try **P3**

Same swap mechanic. Exclude reduced-workload doctors from
candidates for P2 or P4 — they do not work those periods.

**Step 3 — If step 2 fails, cascade one period further.**

- For PE = P4 → try **P1**
- For PE = P2 → try **P4**

Again exclude reduced-workload doctors as needed.

**Step 4 — If all cascades fail**, present the situation
to the TL: "ما حد قبل التبديل بأي فتره. الخانه راح تظل
فاضيه ما لم تختار شي ثاني."

### PS (Permission Start-of-shift) — cascading swap

When the doctor's PS removes them from the **start of shift
period** (P1 for morning, P3 for evening), follow the mirror
cascade. Same swap mechanic in every step:

- For PS = P1 → try **P2**, then **P3**, then **P4**
- For PS = P3 → try **P4**, then **P2**, then **P1**

Closest period first, then expand outward. Exclude
reduced-workload doctors from candidates for P2 or P4.

---

## Coverage logic (reference)

For full rules, see `rules/coverage.md`. Key points:

- **Normal staffing** (7+ doctors in a shift):
  6 regular doctors per period + 1 dedicated delegator
  for the whole shift. The 7th doctor may be **EX (reserve)**.

- **Shortage** (6 doctors in a shift):
  Some doctors fill double roles — regular in one period
  and delegator in another. Coverage is still possible.

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
- `get_ex_doctor(week_start, day)` — returns the reserve EX
  doctor for that day, or null if none.
- `auto_replace_with_ex(slot_id)` — replaces the slot with
  the day's reserve EX doctor. Returns the new assignment.
- `find_period_candidates(week_start, day, source_period, search_period, exclude_reduced_workload?)`
  — returns doctors scheduled in `search_period` who could
  be swap targets for `source_period`. Set
  `exclude_reduced_workload=true` when searching for
  candidates to take P2 or P4 (reduced-workload doctors
  don't work those periods).
- `broadcast_swap_request(from_slot_id, target_day, target_period, candidate_ids[])`
  — sends a swap request to multiple candidates. First to
  accept triggers the atomic swap. Used at every cascade
  step.
- `assign_replacement(slot_id, replacement_doctor_id)` —
  assigns a different doctor to a vacated slot (used for
  manual TL choice).
- `notify_team_leader(message, context)` — sends a push
  notification to the TL.

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
   affected.
6. For SL/VC: call `get_ex_doctor(...)` for each affected
   day to confirm reserve availability.

---

## Steps

The exact flow depends on the absence type. The branching
is described in **Type-specific auto-handling** above.

### Common opening (all types)

1. Identify doctor, type, and scope. Ask for any missing
   detail.
2. Run the pre-flight checks.
3. Show the TL a one-line summary of what will happen:
   - SL: "تقرير د.[X] يوم [Y]. راح أنقله إلى قسم EX
     وأغطّي خاناته بـ د.[reserve]."
   - VC: same shape
   - PE/PS: "استئذان د.[X] [type] فتره [P]. راح أبحث عن
     بديل بـ [adjacent period] أولاً."
4. Wait for confirmation that the plan is OK before
   acting.

### Branch A — SL or VC (full-day absence)

5a. Call `mark_doctor_absent(doctor, type, dates)`.
6a. For each affected slot, call `auto_replace_with_ex(slot)`
    if a reserve EX exists for that day.
7a. Call `notify_team_leader(...)` with the absence summary.
8a. Report:
    "تم. د.[X] بـ EX section. [N] خانات غطّاها د.[reserve].
    [M] خانات بقيت فاضيه (لا يوجد EX يوم [day])."

### Branch B — PE or PS (single-period permission)

5b. Call `mark_doctor_absent(doctor, type, day, period)`.
6b. Run the cascade. Every step is a swap:
    - **Step 1** — `find_period_candidates(day, source, closest_period)`
      then `broadcast_swap_request(slot, candidates)`.
    - Wait for any acceptance (the database trigger handles
      the atomic swap).
7b. If step 1 returns no candidates or all decline within
    the timeout, present **Step 2** to the TL:
    "ما حد بـ [closest] قبل التبديل. أنتقل لـ [next period]؟"
8b. On TL confirmation, call `broadcast_swap_request(...)`
    for the next cascade period. Pass
    `exclude_reduced_workload=true` when the target period
    is P2 or P4. Repeat for the third cascade period if
    needed.
9b. Report the final state:
    "تم. د.[X] استئذان [type] [period] يوم [day].
    [outcome: swap accepted with Y at [period] / slot empty]."

---

## Presentation format

Absence summary (one line):
```
د.[name] - [type Arabic] ([code])
[date or day + period]
```

Plan summary (one line):
- SL/VC: "نقل إلى EX + تغطيه تلقائيه بـ د.[reserve]"
- PE/PS: "تبديل مع أطباء [closest period] أولاً"

Result:
- "تم. [what happened in one or two short lines]"

---

## Edge cases

- **Doctor has no slots in the affected range**
  Still record the absence, but inform the TL: "لا توجد
  خانات لـ د.[X] بهالأيام. تم تسجيل [type] فقط."

- **Doctor already has another absence overlapping**
  Reject: "د.[X] عنده [existing absence]. استبدلها أو
  اختر فتره ثانيه."

- **Date range is entirely in the past**
  Reject. Past schedules are locked.

- **Date range partially in the past**
  Apply only to current and future days. Inform the TL
  which days were skipped.

- **SL/VC and no reserve EX exists for a day**
  Auto-fill cannot run for that day. Mark the slots empty
  and surface the gap to the TL: "ما فيه EX يوم [Y]. [N]
  خانات فاضيه."

- **PE/PS for a period the doctor is not scheduled**
  Inform: "د.[X] مو معيّن بـ [P] يوم [day]. سجّل [type]
  بدون أي تأثير على الجدول؟"

- **Cascade exhausted (no one accepts at any period)**
  Inform the TL: "ما حد قبل التبديل بأي فتره. الخانه راح
  تظل فاضيه. تبي تختار طبيب يدوياً؟"

- **Candidate is a reduced-workload doctor and target is
  P2 or P4**
  Skip them from candidates automatically. Do not invite
  them to swaps for periods they cannot work.

- **TL wants to override the auto flow**
  Honor the override. Skip auto-replace and ask the TL
  which strategy to use instead (manual replacement,
  leave empty, etc.).

- **Doctor on PE/PS has multiple slots in the same period**
  Cover each slot independently using the cascade.

---

## Common mistakes to avoid

- Do not ask the TL "how to cover?" for SL/VC. Use the
  automatic flow; the TL can override after seeing the
  result.
- Do not skip the cascade order for PE/PS. Closest
  period first, then further periods.
- Do not include reduced-workload doctors as candidates
  for swaps targeting P2 or P4.
- Do not call `broadcast_swap_request` for two cascade
  steps at the same time. The steps are sequential,
  not parallel.
- Do not record an absence for a past date.
- Do not invent doctor IDs.
- Do not silently leave slots empty without telling the TL.
- Do not confuse PS/PE periods. PS = start of shift,
  PE = end of shift.

---

## Example conversations

### SL — auto-flow

```
TL: د.أحمد عنده تقرير طبي اليوم

AI: [calls get_doctor_slots(ahmed, today)] — 4 slots
    [calls get_ex_doctor(this_week, today)] — Dr. Sami (reserve)

AI: تقرير د.أحمد اليوم. راح أنقله إلى قسم EX وأغطّي
    خاناته الأربع بـ د.سامي (EX). أتابع؟

TL: نعم

AI: [calls mark_doctor_absent(ahmed, SL, today)]
    [calls auto_replace_with_ex for each of 4 slots]
    [calls notify_team_leader(...)]

    تم. د.أحمد بـ EX section. 4 خانات غطّاها د.سامي.
    أُرسل إشعار.
```

### PE — cascade flow

```
TL: د.محمد مستأذن نهاية دوام المسائي اليوم

AI: [calls get_doctor_slots(mohammed, today)] — Mohammed has P3 + P4
    [identifies PE period = P4]

AI: استئذان د.محمد PE (P4) اليوم. راح أبحث عن أطباء بـ
    P3 للتبديل أولاً. أتابع؟

TL: نعم

AI: [calls mark_doctor_absent(mohammed, PE, today, period=P4)]
    [calls find_period_candidates(today, source=P4, search=P3)]
    وجدت 3 أطباء بـ P3 ممكن يبدّلون.

    [calls broadcast_swap_request(slot, 3 P3 candidates)]
    أرسلت طلب تبديل لـ 3 أطباء بـ P3. أول واحد يقبل،
    يبدّل خانة P3 مع خانة د.محمد P4.

    ⏳ [بعد فتره: لو حد قبل، الـ trigger يعدّل الجدول تلقائياً.
       لو ما حد قبل خلال المهله، الذكاء يرجع للتيم ليدر]

AI (لاحقاً): ما حد بـ P3 قبل التبديل. أنتقل لـ P2؟
    (راح أستثني أطباء تخفيف العمل لأنهم ما يداومون P2)

TL: نعم

AI: [calls find_period_candidates(today, source=P4, search=P2, exclude_reduced_workload=true)]
    [calls broadcast_swap_request(slot, P2_candidates)]
    أرسلت طلب تبديل لـ 3 أطباء بـ P2. راح يصلك إشعار.

AI (لاحقاً): د.خالد بـ P2 وافق على التبديل. تم.
    د.خالد ياخذ خانة د.محمد بـ P4، ود.محمد ياخذ خانة
    د.خالد بـ P2.
```

### VC — multi-day auto-flow

```
TL: د.علي بتفرّغ من الثلاثاء إلى الخميس

AI: [pre-flight: gets slots, gets EX for each day]

AI: تفرّغ د.علي من الثلاثاء إلى الخميس (3 أيام، 12 خانه).
    راح أنقله لـ EX section وأغطّي الخانات بـ EX اليوم:
    - الثلاثاء: د.سامي (EX) → 4 خانات
    - الأربعاء: د.خالد (EX) → 4 خانات
    - الخميس: ما فيه EX → 4 خانات فاضيه

    أتابع؟

TL: نعم

AI: [calls mark_doctor_absent(ali, VC, tuesday, thursday)]
    [auto-replaces 8 slots, leaves 4 empty]
    [calls notify_team_leader(...)]

    تم. د.علي بـ EX section. 8 خانات مغطّاه، 4 خانات
    الخميس فاضيه. أُرسل إشعار.
```
