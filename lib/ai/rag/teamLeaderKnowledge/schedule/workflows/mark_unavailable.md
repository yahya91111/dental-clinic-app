# Handle Absence Event

## When to use

This workflow runs whenever the Team Leader's assistant
becomes responsible for handling an absence (SL, VC, PS,
or PE). There are exactly two paths into this workflow,
depending on who submitted the absence:

### Source A — The Team Leader submitting for themselves

The TL says directly to their assistant:
- "أنا مستأذن بكره P3"
- "بدّي أسجّل تفرّغ من الثلاثاء إلى الخميس"
- "اليوم عندي تقرير مرضي"

The TL Assistant **executes the marking on the schedule**
(places the TL in EX, vacates the TL's affected slot),
then discusses coverage options with the TL.

### Source B — A doctor submitted via their own assistant

The Doctor Assistant (a separate AI for the doctor)
processed the doctor's request and placed them in EX +
vacated their slot. The TL Assistant **proactively
initiates** a coverage conversation with the TL when
it sees a slot has become empty because of an absence:
- "د.أحمد بـ EX اليوم (SL). فيه 4 فترات بدون طبيب. الخيارات: ..."

The TL does not need to ask. The assistant brings up the
absence and the coverage options on its own.

### Do NOT use this workflow for:
- Marking a doctor as **EX (reserve)** → see `manage_groups`
  (EX is a status, not an absence)
- Marking absences for other doctors **on behalf of them**
  (the TL only marks for themselves; other doctors mark
  through their own assistant)
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

## What the TL Assistant does in each source

The two sources require very different actions from the
TL Assistant. The key principle: **each user's own
assistant handles their own absence end-to-end**. The TL
Assistant manages absences for the TL; the Doctor
Assistant manages absences for doctors.

### In Source A (TL submits for themselves)

The TL Assistant performs the full workflow:
1. Call `mark_doctor_absent(tl_id, type, dates, period?)`
2. Place the TL in the EX section of the affected day(s)
   with the appropriate status (SL/VC/PE/PS).
3. If the TL had a clinic slot in the affected period,
   vacate it (the slot becomes empty).
4. Move into coverage handling:
   - **SL or VC** → suggest reserve EX coverage to the TL.
   - **PE or PS, TL was a clinic doctor in that period** →
     offer coverage options as a menu (see "PE/PS coverage
     options" below). The TL picks. The AI does NOT decide,
     does NOT refuse the permission, does NOT auto-run any
     cascade. The TL has full authority over their clinic
     and may even choose to accept the gap.
   - **PE or PS, TL was the shift delegator or on EX** →
     just update the status to PE/PS. No coverage hunt
     needed because the TL did not have a specific clinic
     slot to vacate. Inform the TL in one line.
   - **PE or PS in a non-working period** → just inform
     the TL; no further action needed.

### In Source B (Doctor submitted via Doctor Assistant)

The TL Assistant does **not** mark anything and does
**not** run any cascade — the Doctor Assistant has
already handled both.

The TL Assistant's role is purely **informational and
proactive**:
- **SL or VC** → the Doctor is in EX and slots are
  vacated. The TL Assistant proactively opens a coverage
  conversation with the TL ("X is on SL, Y slots empty,
  cover with reserve?").
- **PE or PS, swap succeeded** → the Doctor Assistant
  arranged a swap between the doctor and another doctor.
  The schedule is already updated. The TL Assistant
  proactively informs the TL: "د.X بدّل مع د.Y لاستئذان
  [period] يوم [day]."
- **PE or PS, swap failed** → the permission was not
  granted. The doctor will work normally. The TL
  Assistant does NOT need to inform the TL about a
  permission that never happened.
- **PE or PS in a non-working period** → the TL Assistant
  proactively informs the TL for awareness only.

The exact mechanism the TL Assistant uses to detect or
be notified of these events is defined in the
notifications RAG (to be built later). For now, assume
that when the TL Assistant has a turn with the TL, it
knows which events are pending and which actions have
been completed by the Doctor Assistant.

## Type-specific coverage handling

The detail below applies to **Source A** (TL acting for
themselves) and to **Source B SL/VC** (where the TL
Assistant proposes coverage). The PE/PS cascade is
**Source A only**.

### SL / VC — propose reserve EX coverage

1. Identify the affected days and the number of empty
   slots per day.
2. For each affected day, check whether a reserve EX
   doctor exists (`get_ex_doctor`).
3. Propose to fill the empty slots with the reserve EX:
   "د.[X] بـ EX (SL/VC). فيه [N] فترات بدون طبيب. أغطّيها
    بـ د.[reserve]؟"
4. If no reserve EX exists, present alternatives: leave
   empty, pick a specific doctor, or have a regular
   doctor cover both periods of that room.
5. On TL confirmation, call `assign_replacement` per slot.

### PE/PS coverage — offer mediation, don't impose [Source A only]

The AI's behavior depends on whether the permission leaves
anything uncovered. The principle: if nothing is uncovered,
just execute. If something is uncovered, offer to mediate.
Never decide for the TL.

**Case A — Permission leaves no gap**

When the TL had no clinic slot to vacate (was on EX, was
the delegator with the shift still covered by their rotation,
or the period is outside their working hours), the AI just
marks the absence in the EX section and reports in one line.
No question, no menu, no mediation offer.

Examples:
- TL was EX morning → status changes from "extra" to "PE",
  one-line confirmation.
- TL has PE for P4 but their shift is morning that day →
  not a working period, status update only.

**Case B — Permission leaves a clinic slot empty**

When the TL was a clinic doctor in the affected period,
the slot becomes empty. The AI offers its mediation
service with a single yes/no question:

```
"سجّلت استئذانك. فترتك بـ [period] عياده [N] صارت بدون
طبيب. ممكن أكلم أطباء فتره ثانيه ونلقى تبديل. تبيني؟"
[نعم] [لا، خلّيها]
```

- On **[نعم]** → ask which period to target, then call
  `find_swap_candidates` and `broadcast_swap_request` with
  24-hour timeout. Inform the TL the request is out and
  report back on acceptance/expiry.
- On **[لا، خلّيها]** → the slot stays empty. The TL has
  authority to accept the gap. No further action.

**Case C — Permission removes the TL from delegator duty**

When the TL was the shift delegator and the permission
removes them from part of the shift, the AI offers to find
a substitute delegator for the affected period:

```
"سجّلت استئذانك. كنت ديليقيتر للشفت. ممكن أسأل أحد
يستلم الديليقيتر بدلك بـ [period]. تبيني؟"
[نعم] [لا، خلّيها]
```

- On **[نعم]** → ask candidate doctors in the same shift
  (excluding those already in clinic slots in that period),
  get acceptance, assign them as delegator for that period.
- On **[لا، خلّيها]** → the delegator role is unfilled for
  that period. The TL accepts the gap.

### The AI never refuses, never decides, only mediates

For PE/PS coverage:
- The AI does NOT refuse the permission for any reason.
- The AI does NOT pick the coverage approach itself.
- The AI does NOT cascade through periods automatically.
- The AI offers its mediation service with a yes/no
  question. The TL decides.

If a mediation request (24-hour broadcast) gets no response
by expiry, the AI tells the TL and re-offers the mediation:
"ما حد قبل خلال 24 ساعه. أعيد المحاوله بفتره ثانيه؟ ولا
نخلّيها فاضيه؟" The TL picks again.

All swap requests originating from this workflow use the
24-hour timeout, matching `swap_broadcast.md`.

---

## Future-week absences (before schedule is built)

When a doctor submits an absence for a **week that has
not been built yet**, no cascading swap or empty-slot
problem exists — there are no slots yet. Instead, the
absence becomes a **distribution constraint** that the
AI must respect when the TL later builds that week.

The flow:

1. The doctor submits the request (SL, VC, PS, or PE)
   for a date in a future week.
2. The system places the doctor in the **EX section** of
   that future week's schedule, with the type label and
   the affected day or period.
3. When the TL later builds the schedule for that week
   (via `create_weekly`), the AI reads the EX entries
   and treats them as constraints:
   - **SL or VC**: the doctor is not available at all
     on the affected days. Distribute the rest of the
     group as if the doctor does not exist for those
     days.
   - **PS or PE**: the doctor is available, but only
     for periods they can actually work. For example,
     if PE = P4 on Tuesday, the doctor is placed in
     P3 on Tuesday (or in another usable period) and
     never in P4.

The AI does not need to ask the TL about these — the
constraints are already on file. The AI should briefly
mention them when surfacing the draft, so the TL
understands why a doctor's distribution looks unusual:

"ملاحظه: د.X مستأذن P4 الثلاثاء، حطّيته بـ P3 الثلاثاء.
د.Y عنده تفرّغ الأربعاء، مستثنى من ذاك اليوم."

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
- `find_swap_candidates(week_start, day, target_period, exclude_reduced_workload?)`
  — returns doctors scheduled in `target_period` who could
  be swap targets. Set `exclude_reduced_workload=true` when
  the swap would move the candidate into P2 or P4
  (reduced-workload doctors don't work end-of-shift
  periods). Same tool used by `swap_broadcast`.
- `broadcast_swap_request(from_slot_id, target_day, target_period, candidate_ids[], timeout_minutes)`
  — sends a swap request to multiple candidates. First to
  accept triggers the atomic swap. **Always use a 24-hour
  timeout (`timeout_minutes=1440`)** matching the
  `swap_broadcast` standard. The previous short-timeout
  cascade model has been retired in favor of the
  TL-driven options menu.
- `assign_replacement(slot_id, replacement_doctor_id)` —
  assigns a different doctor to a vacated slot (used for
  manual TL choice).
- `notify_team_leader(message, context)` — sends a push
  notification to the TL.

---

## Pre-flight checks

1. Identify the **doctor** and absence event. The TL
   may name them directly, or you may need to read the
   pending absence list to find what they are asking
   about.
2. Identify the **absence type** (SL, VC, PS, PE) from
   the event record or from the TL's words.
3. Identify the **date range and (for PS/PE) the affected
   period**.
4. Determine whether the event is in:
   - **The current week** (slots already exist, may
     already be vacated by the system)
   - **A future week** (slots may not exist yet — this
     becomes a distribution constraint, not a coverage
     problem)
5. For current-week SL/VC: call `get_ex_doctor(...)`
   for each affected day to know whether a reserve is
   available.
6. For current-week PE/PS: confirm the affected period
   was actually a working period for the doctor that
   day.

---

## Steps

The flow depends on the source first, then on the type.

### Source A — TL submits for themselves

#### Phase 1 — Mark

1. Identify type and scope from what the TL said. Ask
   for any missing detail (date, period for PS/PE,
   range for SL/VC).
2. Call `mark_doctor_absent(tl_id, type, dates, period?)`.
3. Confirm in one short line: "سجّلت [type] لك يوم
   [day]، وفترتك صارت بدون طبيب."

#### Phase 2 — Handle by type

- **SL or VC, current week** → Branch SL/VC below.
- **PE or PS, TL had a clinic slot in that period** →
  Branch PE/PS coverage below (options menu, no cascade).
- **PE or PS, TL was delegator or EX** → Just update the
  status in the EX section. No coverage hunt. Inform in
  one line: "سجّلت استئذانك. كنت ديليقيتر/احتياطي، فما
  فيه فتره عياده تتغطّى."
- **PE or PS in a non-working period, current week** →
  No action needed. Inform: "الفتره مو فترة عملك،
  ما فيه إجراء."
- **Any type, future week** → Branch Future below.

### Source B — Doctor submitted via their assistant

The TL Assistant opens the conversation proactively.

- **SL or VC, current week** → Branch SL/VC below
  (TL Assistant proposes coverage).
- **PE or PS, current week, swap succeeded** → Just
  inform: "د.[X] بدّل مع د.[Y] لاستئذان [period] يوم
  [day]." No further action.
- **PE or PS, current week, swap failed** → Permission
  was not granted; nothing to inform.
- **PE or PS in a non-working period, current week** →
  Inform: "د.[X] بـ EX [period] يوم [day] (PS/PE).
  الفتره مو فترة عمله، أردت أعلمك فقط."
- **Any type, future week** → Branch Future below.

### Branch SL/VC — current week coverage

1. For each affected day, look up the reserve EX with
   `get_ex_doctor(week, day, shift)`.
2. Propose coverage in one short message:
   "[N] فترات بدون طبيب يوم [day]. أغطّيها بـ د.[reserve]؟"
3. If no reserve EX exists for a day, present alternatives:
   pick a specific doctor, leave empty, or have a regular
   doctor cover both periods of that room.
4. On TL confirmation, call `assign_replacement` per slot.
5. Report briefly.

### Branch PE/PS — Source A only

1. Determine the impact of the permission:
   - TL had a clinic slot in the affected period → Case B
   - TL was the shift delegator → Case C
   - TL was on EX, off, or the period is non-working → Case A

2. **Case A — no gap, just mark:**
   - The absence is recorded in the EX section. No further
     action.
   - Report in one line: "سجّلت استئذانك."

3. **Case B — clinic slot empty, offer mediation:**
   - Ask via `ask_tl_choice`:
     "سجّلت استئذانك. فترتك بـ [period] عياده [N] صارت
     بدون طبيب. ممكن أكلم أطباء فتره ثانيه ونلقى تبديل.
     تبيني؟"
     [نعم] [لا، خلّيها]
   - On **[نعم]** → ask which period to target with a
     second button question, then call `find_swap_candidates`
     and `broadcast_swap_request(..., timeout_minutes=1440)`.
     Report request out. On acceptance, report. On expiry,
     re-offer mediation with a different period.
   - On **[لا، خلّيها]** → the slot stays empty. Confirm:
     "تمام. الفتره راح تظل بدون طبيب."

4. **Case C — delegator role gap, offer mediation:**
   - Ask via `ask_tl_choice`:
     "سجّلت استئذانك. كنت ديليقيتر للشفت. ممكن أسأل أحد
     يستلم الديليقيتر بدلك بـ [period]. تبيني؟"
     [نعم] [لا، خلّيها]
   - On **[نعم]** → find eligible candidates (doctors in
     the same shift who are not already in clinic slots in
     that period), broadcast the request, return with the
     acceptance.
   - On **[لا، خلّيها]** → the delegator role is unfilled
     for the period. Confirm: "تمام. الديليقيتر راح يكون
     بدون بديل."

5. The AI never refuses the permission. The AI never picks
   the coverage approach. It offers mediation with a single
   yes/no question. The TL decides.

### Branch Future — future-week absence (any type)

No slots exist yet, so no coverage action is needed now.

1. Acknowledge the TL briefly: "[الشخص] مسجّل بـ EX
   للأسبوع [next_week]. راح يأخذ بعين الاعتبار عند بناء
   الجدول."
2. When the TL later builds that week (via `create_weekly`),
   the constraint is applied automatically.

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
  فترات لـ د.[X] بهالأيام. تم تسجيل [type] فقط."

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
  فترات بدون طبيب."

- **PE/PS for a period the doctor is not scheduled**
  Inform: "د.[X] مو معيّن بـ [P] يوم [day]. سجّل [type]
  بدون أي تأثير على الجدول؟"

- **Cascade exhausted (no one accepts at any period)**
  Inform the TL: "ما حد قبل التبديل بأي فتره. الفتره راح
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
  Surface each empty slot to the TL when presenting the
  coverage options menu.

---

## Common mistakes to avoid

- Do not ask the TL "how to cover?" for SL/VC. Use the
  automatic reserve-EX flow; the TL can override after
  seeing the result.
- Do not auto-cascade through periods for PE/PS. Present
  the three options menu and let the TL choose. The
  cascade model has been retired.
- Do not refuse the TL's permission because no swap was
  found. The TL has authority to leave a slot empty
  (Option 3).
- Do not include reduced-workload doctors as candidates
  for swaps targeting P2 or P4.
- Do not use short timeouts (15-30 min) for swap requests.
  All `broadcast_swap_request` calls use 24 hours
  (`timeout_minutes=1440`).
- Do not record an absence for a past date.
- Do not invent doctor IDs.
- Do not silently leave slots empty without telling the TL.
- Do not confuse PS/PE periods. PS = start of shift,
  PE = end of shift.

---

## Example conversations

The examples below cover both submission sources and all
three timing scenarios (current day, future week, period
not actually worked).

### Source A — TL submits a permission for themselves (clinic doctor)

The TL Assistant marks the TL, vacates the slot, then
offers mediation with a single yes/no question.

```
TL: اليوم عندي استئذان نهاية الصباحي

AI: [internal: PE for the morning shift = P2 today]
    [internal: calls mark_doctor_absent(tl_id, PE, today,
     period=P2)]
    [internal: TL was a clinic doctor in P2, slot now empty]

AI: سجّلت استئذانك. فترتك بـ P2 عياده 1 صارت بدون طبيب.
    ممكن أكلم أطباء فتره ثانيه ونلقى تبديل. تبيني؟
    [نعم] [لا، خلّيها]

TL: [ينقر: نعم]

AI: أكلم أطباء أي فتره؟
    [نفس الشفت — P1] [الشفت الثاني — المسائي] [فتره معيّنه]

TL: [ينقر: نفس الشفت — P1]

AI: [internal: calls find_swap_candidates(today, P1,
     exclude_reduced_workload=true) → 5 candidates]
    [internal: calls broadcast_swap_request(slot,
     5 P1 candidates, timeout_minutes=1440)]

AI: أرسلت طلب لـ 5 أطباء بـ P1. مهله 24 ساعه. راح أرجعلك
    لما يقبل أحد أو لما تنتهي المهله.
```

### Source B SL — Doctor submitted, AI proactively asks about coverage

The Doctor Assistant has already marked د.أحمد and
vacated his evening slots. The TL Assistant opens the
conversation when the TL is active in the app.

```
AI (proactive): د.أحمد بـ EX اليوم (SL). 4 فترات بدون طبيب
    بالمسائي. أغطّيها بـ د.خالد (EX المسائي)؟

TL: نعم

AI: [internal: calls assign_replacement for each of
     the 4 slots with khaled_id]

AI: تم. الـ 4 فترات غطّاها د.خالد.
```

### Source B PE — swap already done by Doctor Assistant

When a doctor's PE is in a working period, the Doctor
Assistant runs the cascade. By the time the TL Assistant
gets involved, the swap is already complete. The TL
Assistant just informs the TL — no action is needed.

```
AI (proactive): د.محمد قدّم استئذان نهاية المسائي اليوم
    (PE = P4)، وبدّل مع د.خالد. د.خالد راح يداوم بـ P4
    بدله، ود.محمد ياخذ فترة د.خالد بـ P3. علم فقط.
```

If the swap failed, the permission was not granted and
the doctor will work normally — no message reaches the
TL at all.

### Source B — Doctor's PE in a period he doesn't work

```
AI (proactive): د.سامي بـ EX لـ P2 الثلاثاء (PE).
    الفتره مو فترة عمله ذاك اليوم (قروبه مسائي
    الثلاثاء)، فما فيه إجراء مطلوب. أردت أعلمك فقط.
```

### Source B — Future-week VC (constraint, no action now)

```
AI (proactive): د.علي مسجّل بـ EX للثلاثاء، الأربعاء،
    الخميس الأسبوع القادم (تفرّغ). راح يأخذ بعين
    الاعتبار لما تبني الجدول — الأطباء راح يتوزّعون
    بدون احتسابه ذيك الأيام.

[later, when the TL builds next week's schedule:]

AI: [internal: draft_weekly_schedule respecting
     ali's VC constraint]
    وزّعت الجدول. ملاحظه: د.علي مستثنى من الثلاثاء،
    الأربعاء، الخميس (VC مسبق).
```

### Source A — TL submits VC for a future week

```
TL: بدّي أسجّل تفرّغ من الأحد إلى الثلاثاء الأسبوع القادم

AI: [internal: calls mark_doctor_absent(tl_id, VC,
     next_sunday, next_tuesday)]
    [internal: TL is now in EX for those days; no
     slots exist yet to vacate]

AI: سجّلت تفرّغك من الأحد إلى الثلاثاء الأسبوع القادم.
    لما تبني الجدول، راح أوزّع الأطباء بدون احتسابك
    ذيك الأيام.
```
