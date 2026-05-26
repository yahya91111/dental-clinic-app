# Create Weekly Schedule

## When to use

The Team Leader wants to build a fresh weekly schedule for
their clinic (Sunday through Thursday, all four periods).

Trigger phrases (examples):
- "أنشئ جدول هذا الأسبوع"
- "ابني جدول الأسبوع القادم"
- "وزّع الأطباء للأسبوع"
- "create this week's schedule"

Do NOT use this workflow for:
- Modifying a single slot → use `edit_slot` workflow
- Copying one day to another → use `copy_day` workflow
- Editing an already-existing schedule → use `edit_slot` or `copy_day`

---

## Required tools

- `get_clinic_info()` — returns the clinic's structure including
  the number of rooms (clinics) configured for this clinic.
- `get_clinic_doctors()` — returns the clinic's doctors with their
  group_id, current status (active, SL, PS, PE, VC, EX), and
  scheduled leaves.
- `get_existing_schedule(week_start)` — returns the existing
  schedule for that week, or null if none exists.
- `get_clinic_ai_preferences(clinic_id)` — returns the stored
  per-clinic policy JSON (Board delegator/EX participation,
  trainee deployments, last Board shift). See
  `rules/clinic_preferences.md`.
- `update_clinic_ai_preferences(clinic_id, patch)` — saves
  TL answers back to the JSON. Called per answer, not in batch.
- `ask_tl_choice(question_text, options[])` — presents a
  button question in the UI. Returns the selected value.
  Used for Board and trainee questions, plus the
  "same as last week?" smart-reminder card.
- `draft_weekly_schedule(json)` — pushes the FULL week's schedule
  into the Schedule UI as an editable draft (all 5 days at once).
  Best for normal-sized clinics. Cheaper and faster.
- `draft_day_schedule(day, json)` — pushes ONE day's schedule into
  the draft. Use when the weekly tool would be too large, or when
  building/editing day-by-day. Can be called multiple times to
  build the full week incrementally.
- `confirm_weekly_schedule(week_start)` — publishes the current
  draft as the final schedule.
- `discard_draft(week_start)` — cancels the draft without saving.

### Choosing between `draft_weekly_schedule` and `draft_day_schedule`

**Default: use `draft_weekly_schedule`** — it is cheaper, faster,
and a single atomic operation.

**Switch to `draft_day_schedule` (5 calls, one per day) when:**

1. **Large clinic** — 4+ rooms AND special groups present
   (Board + 2 or more trainees). The combined JSON may approach
   the output token ceiling.

2. **Editing a single day only** — the TL asked to rebuild just
   one day, not the whole week. No reason to touch the others.

3. **Fallback after failure** — `draft_weekly_schedule` returned
   a `max_tokens` error or truncated JSON. Automatically retry
   using 5 per-day calls instead. Inform the TL briefly:
   "الجدول كبير، أبنيه يوم يوم."

For normal cases (3 rooms or fewer, standard groups, no special
overflow), always prefer the weekly tool.

---

## Pre-flight checks

Before drafting any schedule, run these checks in order:

1. Call `get_existing_schedule(week_start)`.
   - If a schedule already exists for that week, **ask the user
     explicitly** whether to replace it.
   - Never silently overwrite an existing schedule.

2. Call `get_clinic_info()` to read the clinic's configured
   number of rooms. Do not ask the user — it is already set.

3. Call `get_clinic_doctors()`.
   - Confirm at least four active doctors are available
     (minimum for basic coverage).
   - Read each doctor's status (SL, PS, PE, VC, EX) and any
     scheduled leaves directly from the result. Do not ask the
     user about leaves — they are stored in the system and
     visible to the TL on the Groups/Leaves pages.

4. Call `get_clinic_ai_preferences(clinic_id)` to read the
   stored per-clinic policies (see `rules/clinic_preferences.md`).
   - **Check `group_classification` first.** If it is missing,
     empty, or incomplete (no `primary_groups`, or trainee
     groups without a parent, or a group exists in the clinic
     that has no classification entry), run the first-time
     group classification flow defined in
     `clinic_preferences.md` BEFORE anything else. The schedule
     cannot be built without a valid classification.
   - After classification is valid, use `group_classification`
     to know:
     - Which groups rotate (the up-to-2 in `primary_groups`)
     - Which group is the Board (`board_group_id`)
     - Which groups are trainee groups and their parent
       (`trainee_groups`)
     - Which groups to ignore entirely (`excluded_groups`)
   - If the clinic has no Board and no trainees and no
     excluded groups, the read is largely a no-op for the
     smart-reminder card — but the classification itself is
     still required so the AI knows the primary group IDs.

5. Read the **target week's EX section** (the absences
   already submitted for this week before it was built):
   - **SL or VC** entries → the doctor is unavailable that
     day. Exclude them from distribution on those days.
   - **PE entries** → the doctor cannot work the end-of-shift
     period. Place them ONLY in periods they can work
     (e.g., PE for P4 → place in P3 only that day; never P4).
   - **PS entries** → mirror of PE. Place them ONLY in
     periods they can work (e.g., PS for P1 → place in P2
     only that day; never P1).
   - Surface a one-line note in the draft summary so the TL
     sees why a doctor's placement looks unusual:
     "د.X بـ P3 الثلاثاء فقط (مستأذن P4)".

---

## Steps

1. Confirm the `week_start` date. Default is the next Sunday
   unless the user specifies otherwise.

2. Resolve per-clinic policies via the smart-reminder card.
   This step only runs if the clinic has Board doctors,
   trainees, or both. Skip it otherwise.

   **Before asking any question, parse the TL's initial
   message for information that already answers it.** The
   TL often packs multiple decisions into one sentence:

   - "البورد صباحي" → `last_board_shift: "morning"`
   - "البورد مسائي عدا الأحد" → split shift; record the
     pattern in the schedule rotation, not just one value
   - "د.X مع د.M" → trainee X deployed beginner, trainer M
   - "د.Y لوحده" / "د.Y مستقل" → trainee Y deployed independent
   - "نفس الأسبوع الماضي" / "زي العاده" → confirm stored
     preferences with one click

   For every piece of information the TL already provided,
   save it to `ai_preferences` directly and **skip the
   corresponding button question**. Only ask about what is
   still unspecified or ambiguous.

   Examples:
   - TL message covers Board shift + all trainees but says
     nothing about Board delegator/EX → ask only the two
     Board rotation questions, nothing else.
   - TL message covers everything → no button questions at
     all; proceed straight to rotation pattern.
   - TL message is just "ابني الجدول" → fall back to the
     full flow below.

   **Smart-reminder card (for what is still unspecified):**

   Build a summary from `ai_preferences` of the missing
   values only, then call `ask_tl_choice` with one question:

   "نفس الأسبوع الماضي؟"
   [نعم، نفس الشي] [غيّر]

   - On **[نعم]** → proceed with stored values for the
     missing pieces.
   - On **[غيّر]** → ask each missing question individually
     via `ask_tl_choice`, save each answer immediately via
     `update_clinic_ai_preferences`, then proceed.

   For a brand-new clinic (empty `ai_preferences`), there is
   nothing to remind from. Ask each unspecified question
   directly.

   The exact questions to ask (when [غيّر] is clicked, when
   no preferences exist yet, or when an answer is genuinely
   missing from the TL's message):

   For Board:
   - "شفت البورد هالأسبوع؟" [صباحي] [مسائي] [مقسوم]
   - "البورد يدخل دوران الديليقيتر؟" [نعم] [لا]
   - "البورد يدخل دوران الـ EX؟" [نعم] [لا]

   For each trainee in the clinic:
   - "د.[name] (Group [N]) — هالأسبوع؟" [مستقل] [مبتدئ مع مدرّب]
   - If beginner chosen: "المدرّب؟" [list of parent-group doctors]

   **Never re-ask a question the TL already answered in
   their initial message, even with buttons.** Doing so
   wastes the TL's time and signals the AI did not read
   the request carefully.

3. Use the data already in the system. Do not ask about:
   - Number of rooms — it is part of the clinic configuration.
   - Doctor absences and leaves — they are stored on each
     doctor and visible to the TL on Groups/Leaves pages.

   You may ask the TL only about choices not stored in the
   system, such as a preferred distribution pattern
   ("same as last week", "rotate groups").

4. Retrieve the relevant rules from the knowledge base:
   - `rules/group_separation.md` — groups must not mix in a period
   - `rules/coverage.md` — every period requires coverage,
     plus fairness rules (period variation, role rotation)
   - `rules/delegator_and_ex.md` — delegator scope (per-shift
     by default) and EX rotation
   - `rules/special_groups.md` — Board and Trainee placement

5. Draft the schedule JSON respecting all rules above and:
   - Balance load fairly across doctors
   - Distribute groups across shifts (not concentrated in one
     shift across consecutive days)
   - Assign one delegator per shift from eligible doctors,
     including or excluding Board doctors based on the
     `board_in_delegator_rotation` preference
   - Assign EX from eligible doctors, including or excluding
     Board based on `board_in_ex_rotation`
   - Place each trainee per `trainee_defaults[id].deployment`:
     paired with their `trainer` (not counted in D) or
     independent (counted in D)
   - **Place reduced-workload doctors ONLY in the first period
     of their shift** (P1 if morning, P3 if evening). Never
     assign them to P2 or P4. They are also excluded from
     delegator and EX rotations.

6. Push the distribution into the Schedule UI as a draft.
   Apply the tool-choice rule above:

   - **Default:** call `draft_weekly_schedule(json)` once with
     all 5 days.
   - **Large clinic / special groups:** call `draft_day_schedule`
     5 times (one per day), in order: Sun → Mon → Tue → Wed → Thu.
   - **Failure recovery:** if `draft_weekly_schedule` returns a
     `max_tokens` error, fall back to 5 `draft_day_schedule`
     calls and tell the TL: "الجدول كبير، أبنيه يوم يوم."

   In all paths, the TL sees the schedule visually in the UI
   and can edit slots directly.

7. Inform the TL briefly:
   "وزّعت الأطباء بالجدول كمسوّده. عاينها وعدّل الي تبيه،
   وقولي لما تبي تحفظ."

8. Wait for the TL's response:
   a) **Save** ("احفظ" / "ثبّت") — proceed to step 9.
   b) **Quick verbal change** ("غيّر ديليقيتر الأحد إلى د.علي")
      — adjust the draft, push again, return to step 8.
   c) **Cancel** ("ألغي" / "ابدأ من جديد") — call
      `discard_draft(week_start)` and stop.

   Note: the TL may edit slots directly in the UI between
   turns. You do not see those edits, but they persist in
   the draft. If a manual edit contradicts a stored
   preference (e.g., made a Board doctor the delegator
   while `board_in_delegator_rotation` is false), ask once
   on confirmation: "تبي أحفظ هذا كالسياسه الجديده؟"
   [نعم] [مره وحده فقط] and update `ai_preferences` only
   on [نعم].

9. Call `confirm_weekly_schedule(week_start)` to publish
   the draft (only on path 8a).

10. Report the result in one short line:
   - On success: "تم. جدول أسبوع [date] جاهز."
   - On failure: state what blocked it and what remains.
   - On cancel: "تم إلغاء المسوّده."

---

## Presentation format

The schedule itself is the presentation — once pushed via
`draft_weekly_schedule`, the TL sees and interacts with it
visually in the Schedule UI. Do not duplicate it in chat.

In chat, keep the message short and only surface:
- A one-line confirmation that the draft is in the UI
- Any uncovered periods that need attention, e.g.:
  ```
  ⚠ الخميس P4: لا توجد تغطيه (لا أطباء متاحين)
  ```
- Any doctor excluded due to leave, in one line if relevant

---

## Edge cases

- **Schedule already exists for the week**
  Ask explicitly: "يوجد جدول لهذا الأسبوع. هل أستبدله؟"
  Never silently overwrite.

- **Fewer doctors than required for full coverage**
  Flag the gaps and suggest reducing the number of rooms or
  consolidating periods. Do not invent doctors to fill slots.

- **All available doctors belong to one group**
  Group separation cannot be enforced. Inform the user and
  ask whether to proceed without group separation this week.

- **User asks to mirror last week's pattern**
  Call `get_existing_schedule(last_week_start)` and use it as
  a template, substituting any doctors who are now unavailable.

- **Tool returns an error after confirmation**
  Report exactly what failed. Do not retry silently. Do not
  attempt a partial save unless the user requests it.

- **`draft_weekly_schedule` returns `max_tokens` or truncated JSON**
  Detection: the tool response includes a `stop_reason` of
  `max_tokens`, or the returned JSON is syntactically invalid
  (truncated). Either signal triggers the fallback.
  Do NOT retry the same tool. Fall back to `draft_day_schedule`
  called 5 times (Sun → Thu). Inform the TL once before starting:
  "الجدول كبير، أبنيه يوم يوم." Then proceed silently per day.

- **One `draft_day_schedule` call fails mid-week**
  The previous days remain in the draft. Report which day failed
  and ask whether to retry that day or rebuild from scratch.
  Never auto-discard the partial work.

- **TL leaves the app without confirming the draft**
  The draft persists until the TL returns. The next time the
  TL opens the Schedule UI, the draft is still there and can
  be reviewed, edited, or discarded. No auto-publish ever
  happens — only an explicit `confirm_weekly_schedule` call
  publishes the schedule. Drafts older than 7 days may be
  auto-discarded by the system; if asked about an old draft
  that no longer exists, treat it as not present and offer
  to start fresh.

---

## Common mistakes to avoid

- Do not generate JSON with invented doctor IDs. Every ID must
  come from the `get_clinic_doctors()` result.
- Do not include doctors marked as on vacation, sick leave, or
  permission for the period in question.
- Do not assign the same doctor to overlapping slots.
- Do not omit the delegator role for any period.
- Do not skip the pre-flight checks to "save time."

---

## Example conversation

```
TL: أنشئ جدول الأسبوع

AI: [calls get_existing_schedule(2026-05-24)] — لا يوجد جدول بعد
    [calls get_clinic_info()] — 3 عيادات معيّنه
    [calls get_clinic_doctors()] — 12 طبيب، د.أحمد بإجازه الأحد
    [builds distribution respecting rules]
    [calls draft_weekly_schedule(json)]

    وزّعت الأطباء بالجدول كمسوّده. عاينها وعدّل الي تبيه،
    وقولي لما تبي تحفظ.

TL: [reviews in the UI, manually adjusts a couple of slots]
    غيّر ديليقيتر الاثنين إلى د.علي بدل د.أحمد

AI: [calls draft_weekly_schedule(updated json)]
    تم التعديل. شي ثاني؟

TL: احفظ

AI: [calls confirm_weekly_schedule(2026-05-24)]
    تم. جدول أسبوع 24 مايو جاهز.
```
