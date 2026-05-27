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
affects scheduling and swap-candidate selection: a
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

Detection runs via
`teamLeaderKnowledge/notifications/workflows/react_to_system_event.md`.
On the TL's first turn, `get_pending_system_events`
returns any new absence event. This workflow's Source B
branch executes when the TL acts on a surfaced card.

## Type-specific coverage handling

The detail below applies to **Source A** (TL acting for
themselves) and to **Source B SL/VC** (where the TL
Assistant proposes coverage). The PE/PS coverage options
menu is **Source A only**.

### SL / VC — present full coverage options

1. Identify the affected days and the absent doctor's
   slots on each day.
2. For each affected day, build the list of suggestions
   based on what's possible:

   **(a) Adjacent-period doctor extends** — if the absent
   doctor was the sole occupant of a clinic room in only
   one period of the shift and a different doctor occupies
   the other period of that same room, the second doctor
   can take both periods. Applies the same way as in PE
   coverage (any direction: P1↔P2 or P3↔P4).

   **(b) Reserve EX** — if `get_ex(week_start, day, shift)`
   returns a doctor, they can cover the empty slot(s).

   **(c) Neighbor-clinic relay** — only relevant when the
   absent doctor was alone in BOTH periods of their clinic
   (the whole clinic room is empty for the shift) AND a
   neighboring clinic has two different doctors splitting
   the shift. Suggest: one of the two doctors moves to
   cover the empty clinic for the full shift; the other
   stays and covers their original clinic alone for the
   full shift.

   Example: Clinic 1 = absent doctor alone (P3 + P4).
   Clinic 2 = د.A in P3 + د.B in P4. Suggestion:
   "د.A يأخذ عياده 1 طول المسائي، د.B يكمّل عياده 2 لوحده."

   **(d) Broadcast** — ask doctors in another period via
   `broadcast_swap_request` (24-hour timeout).

   **(e) Leave empty** — always available.

3. Present the applicable suggestions via `ask_tl_choice`.
   Skip suggestions whose conditions don't hold (e.g., no
   reserve EX, no adjacent doctor, etc.).

4. On the TL's pick:
   - **Direct assignment (a, b, or c)** → execute via
     `assign_replacement` (or chain calls for the relay
     case). The TL's pick is the authority — the
     covering doctor is assigned without a separate
     approval step from them. After execution, the
     unified `notify_prompt` (Phase 3) handles informing.
   - **Broadcast (d)** → ask which period to target, send
     the request, return with the result.
   - **Leave empty (e)** → mark gap, done.

5. If multiple days are affected and the suggestions are
   the same across days, ask once: "نفس الترتيب لكل
   الأيام؟" to save repeated picks.

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
the slot becomes empty. The AI builds a context-aware list
of suggestions and lets the TL pick one.

Suggestions to surface (only include the ones that apply):

1. **Adjacent-period doctor extends** — if there is a
   different doctor in the same clinic room in the other
   period of the shift, they can take both periods. Works
   for any empty period:
   - Empty P2 + doctor exists in P1 of same clinic → P1 doctor extends to P2.
   - Empty P1 + doctor exists in P2 of same clinic → P2 doctor starts early in P1.
   - Empty P4 + doctor exists in P3 of same clinic → P3 doctor extends to P4.
   - Empty P3 + doctor exists in P4 of same clinic → P4 doctor starts early in P3.

2. **Reserve EX** — if a reserve EX is assigned for that
   shift, they can cover the empty period.

3. **Broadcast** — ask doctors in a different period via
   `broadcast_swap_request` (24-hour timeout).

4. **Leave empty** — always available.

Present whichever suggestions apply via `ask_tl_choice`:

```
"سجّلت استئذانك. فترتك بـ [period] عياده [N] صارت بدون
طبيب. الاقتراحات:"
[د.[X] (بـ [adjacent period] نفس العياده) يستلم الفترتين]
[د.[reserve] (احتياطي الشفت) يأخذها]
[أكلم أطباء فتره ثانيه]
[اتركها فاضيه]
```

- On any of the first two → execute directly. **Do NOT
  ask the affected doctor for approval** — the TL has
  authority over the schedule. The unified `notify_prompt`
  (Phase 3) handles informing the covering doctor.
- On "أكلم أطباء" → ask which period to target, then
  call `find_swap_candidates` + `broadcast_swap_request`
  with 24-hour timeout.
- On "اتركها فاضيه" → slot stays empty.

**Case C — Permission removes the TL from delegator duty**

When the TL was the shift delegator and the permission
removes them from part of the shift, the AI offers to find
a substitute delegator. List eligible doctors (same shift,
not already in clinic slots in that period) as buttons:

```
"سجّلت استئذانك. كنت ديليقيتر للشفت. مين يستلم الديليقيتر
بدلك بـ [period]؟"
[د.A] [د.B] [د.C] [اتركها بدون ديليقيتر]
```

- On a doctor pick → assign them as delegator directly.
  TL authority — no separate approval from the new
  delegator. Notification handled in Phase 3.
- On "اتركها بدون ديليقيتر" → the delegator role is
  unfilled for that period.

### The AI never refuses, never decides, only mediates

For PE/PS coverage:
- The AI does NOT refuse the permission for any reason.
- The AI does NOT pick the coverage approach itself.
- The AI does NOT cascade through periods automatically.
- The AI surfaces the full options menu and executes
  the TL's pick. The TL decides.

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
- `get_ex(week_start, day, shift)` — returns the
  reserve EX doctor for that day and shift (morning or
  evening), or null if none.
- `find_swap_candidates(slot_id, target_period)`
  — returns doctors scheduled in `target_period` on the
  SAME DAY as `slot_id` who could be swap targets.
  Reduced-workload exclusion is handled internally based
  on the source slot's period (P2/P4 → reduced-workload
  doctors excluded automatically). Same tool used by
  `swap_broadcast`.
- `broadcast_swap_request(from_slot_id, target_day, target_period, candidate_ids[], timeout_minutes)`
  — sends a swap request to multiple candidates. First to
  accept triggers the atomic swap. **Always use a 24-hour
  timeout (`timeout_minutes=1440`)** matching the
  `swap_broadcast` standard.
- `assign_replacement(slot_id, replacement_doctor_id)` —
  assigns a different doctor to a vacated slot. Used for
  every coverage option the TL picks (reserve EX,
  adjacent extend, neighbor relay).
- `ask_tl_choice(question, options[])` — presents the
  coverage options menu to the TL and returns the pick.

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
5. For current-week SL/VC: call `get_ex(...)`
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

1. For each affected day, identify the absent doctor's
   slots and the per-day context (what other doctors are
   in the same clinic and the neighboring clinics).

2. Build the suggestions list per the SL/VC coverage rules
   above. Skip suggestions whose conditions don't hold.

3. Present the options via `ask_tl_choice`. Example shape:

   ```
   "[N] فترات بدون طبيب يوم [day]. الاقتراحات:"
   [د.X (بـ [adjacent period] نفس العياده) يستلم الفترتين]
   [د.[reserve] احتياطي الشفت يأخذها]
   [د.A من عياده 2 يأخذ عياده 1 طول الشفت، د.B يكمّل عياده 2]
   [أكلم أطباء فتره ثانيه]
   [اتركها فاضيه]
   ```

4. On the TL's pick:
   - Direct-assignment options → call `assign_replacement`
     (or chain calls for the relay case). The TL's pick
     is the authority; no separate approval from the
     covering doctor. Notification handled in Phase 3.
   - Broadcast → ask which period, call
     `broadcast_swap_request(..., 1440)`.
   - Leave empty → mark gap.

5. If multiple days are affected with identical context,
   ask once: "نفس الترتيب لكل الأيام؟" to apply across.

6. Report briefly per executed action.

### Branch PE/PS — Source A only

1. Determine the impact of the permission:
   - TL had a clinic slot in the affected period → Case B
   - TL was the shift delegator → Case C
   - TL was on EX, off, or the period is non-working → Case A

2. **Case A — no gap, just mark:**
   - The absence is recorded in the EX section. No further
     action.
   - Report in one line: "سجّلت استئذانك."

3. **Case B — clinic slot empty, present options menu:**
   - Build the context-aware list (see "PE/PS coverage"
     section above for the full rules):
     - Adjacent-period doctor in same clinic (if exists)
     - Reserve EX (if exists)
     - Broadcast to another period
     - Leave empty
   - Present via `ask_tl_choice` with one button per
     suggestion + "اتركها فاضيه".
   - On a direct-assignment pick (adjacent doctor / reserve)
     → execute immediately via the slot-update tool. The
     covering doctor is assigned by TL authority; no
     separate approval. Notification handled in Phase 3.
   - On "أكلم أطباء" → ask which period, then call
     `find_swap_candidates` + `broadcast_swap_request(..., 1440)`.
   - On "اتركها فاضيه" → slot stays empty.

4. **Case C — delegator role gap, present candidate list:**
   - List eligible doctors (same shift, not in a clinic
     slot that period) as buttons via `ask_tl_choice`.
     Include "اتركها بدون ديليقيتر" as the last option.
   - On a doctor pick → assign them as delegator directly.
     Notification handled in Phase 3.
   - On "اتركها بدون ديليقيتر" → the period stays without
     a delegator.

5. The AI never refuses the permission and never picks the
   approach itself. It surfaces context-aware options and
   executes the TL's pick. No doctor approval is required —
   the TL has authority over the schedule.

### Branch Future — future-week absence (any type)

No slots exist yet, so no coverage action is needed now.

1. Acknowledge the TL briefly: "[الشخص] مسجّل بـ EX
   للأسبوع [next_week]. راح يأخذ بعين الاعتبار عند بناء
   الجدول."
2. When the TL later builds that week (via `create_weekly`),
   the constraint is applied automatically.

### Phase 3 — Notify prompt (runs after Phase 2 for every branch)

After Phase 2 finishes (whichever branch handled the
coverage), apply the unified `notify_prompt` (see
`sharedKnowledge/notifications/universal/notify_prompt.md`)
using the matching template text:

- **Source A (TL's own absence):** use the
  `tl_absence_recorded` template for the
  group/clinic/specific-doctors options. If coverage was
  assigned, also enable `المعنيّين فقط` referring to the
  covering doctor (using `coverage_assignment` text).
- **Source B (other doctor's absence surfaced):** use
  `coverage_assignment` text for `المعنيّين فقط` (the
  covering doctor) and `doctor_absence_recorded` text
  for the group/clinic options.

```
تم. أعلِم أحد؟
[المعنيّين فقط (د.{covering_doctor})]   ← if coverage was assigned
[أفراد محددين]
[القروب (+ التريني)]
[كل المركز]
[لا داعي]
```

Hide `المعنيّين فقط` if no coverage was assigned (TL
picked `اتركها فاضيه` or the absence was a non-working
period with nothing to cover).

For Branch Future, apply `notify_prompt` but hide
`المعنيّين فقط` (no coverage has been assigned yet —
recipients are heads-up only). The TL may still want to
inform the group/clinic that they will be unavailable
next week.

```
تم. أعلِم أحد؟
[أفراد محددين]
[القروب (+ التريني)]
[كل المركز]
[لا داعي]
```

---

## Presentation format

Absence summary (one line):
```
د.[name] - [type Arabic] ([code])
[date or day + period]
```

Plan summary (one line):
- SL/VC: "نقل إلى EX + قائمه خيارات للتغطيه"
- PE/PS: "نقل إلى EX + قائمه خيارات للتغطيه"

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
  The `Reserve EX` option is omitted from the menu for
  that day. The remaining options (adjacent extend,
  neighbor relay if applicable, broadcast, leave empty)
  are still presented to the TL.

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

- Do present the full options menu to the TL for SL/VC
  AND PE/PS. The two absence families share the same
  five-option coverage menu (adjacent extend, reserve
  EX, neighbor relay, broadcast, leave empty). Never
  auto-assign reserve EX without the TL picking it.
- Do not auto-cascade through periods. The cascade model
  has been retired in favor of the TL-driven options
  menu.
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
presents the full coverage options menu. After the TL
picks, the unified notify prompt asks who to inform.

```
TL: اليوم عندي استئذان نهاية الصباحي

AI: [internal: PE for the morning shift = P2 today]
    [internal: calls mark_doctor_absent(tl_id, PE, today,
     period=P2)]
    [internal: TL was a clinic doctor in P2, slot now empty]
    [internal: builds context-aware options:
     - د.سامي بـ P1 نفس العياده يقدر يمدّد
     - د.خالد احتياطي الصباحي
     - broadcast
     - فاضي]

AI: سجّلت استئذانك P2. فترتك بـ P2 عياده 1 صارت بدون طبيب.
    كيف تبي تغطّيها؟
    [د.سامي (P1 نفس العياده) يمدّد لـ P2]
    [د.خالد (احتياطي الصباحي) يأخذها]
    [أكلم أطباء فتره ثانيه]
    [اتركها فاضيه]

TL: [ينقر: د.سامي يمدّد لـ P2]

AI: [internal: calls assign_replacement(P2_slot, sami_id)]

AI: تم. د.سامي بـ P2 عياده 1.
    أعلِم أحد؟
    [المعنيّين فقط (د.سامي)] [أفراد محددين]
    [القروب (+ التريني)] [كل المركز] [لا داعي]

TL: [ينقر: المعنيّين فقط]

AI: أُرسل لـ د.سامي.
```

### Source B SL — Doctor submitted, TL Assistant offers full options menu

The Doctor Assistant has already marked د.أحمد and
vacated his evening slots. The TL Assistant opens the
conversation when the TL is active in the app, presents
the full coverage menu, executes the TL's pick, then
runs the notify prompt.

```
AI (proactive): د.أحمد بـ EX اليوم (SL). 4 فترات بدون
    طبيب بالمسائي. كيف تبي تغطّيها؟
    [د.خالد (احتياطي المسائي) يأخذ الـ 4 فترات]
    [د.سامي (بعياده 2 المسائي) يمدّد لعياده د.أحمد طول الشفت]
    [أكلم أطباء فتره ثانيه]
    [اتركها فاضيه]

TL: [ينقر: د.خالد احتياطي يأخذها]

AI: [internal: calls assign_replacement for each of
     the 4 slots with khaled_id]

AI: تم. الـ 4 فترات غطّاها د.خالد.
    أعلِم أحد؟
    [المعنيّين فقط (د.خالد)] [أفراد محددين]
    [القروب (+ التريني)] [كل المركز] [لا داعي]

TL: [ينقر: القروب]

AI: أُرسل لـ 6 أطباء.
```

### Source B PE — swap already done by Doctor Assistant

When a doctor's PE is in a working period, the Doctor
Assistant handles coverage on its side. By the time the
TL Assistant gets involved, the swap is already complete.
The TL Assistant just informs the TL — no action is needed.

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
