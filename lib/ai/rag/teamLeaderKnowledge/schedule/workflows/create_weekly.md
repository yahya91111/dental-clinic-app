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
- `draft_weekly_schedule(json)` — pushes the full schedule into
  the Schedule UI as an editable draft. Not yet published. The
  TL can edit slots directly in the UI after this call.
- `confirm_weekly_schedule(week_start)` — publishes the current
  draft as the final schedule.
- `discard_draft(week_start)` — cancels the draft without saving.

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

---

## Steps

1. Confirm the `week_start` date. Default is the next Sunday
   unless the user specifies otherwise.

2. Use the data already in the system. Do not ask about:
   - Number of rooms — it is part of the clinic configuration.
   - Doctor absences and leaves — they are stored on each
     doctor and visible to the TL on Groups/Leaves pages.

   You may ask the TL only about choices not stored in the
   system, such as a preferred distribution pattern
   ("same as last week", "rotate groups").

3. Retrieve the relevant rules from the knowledge base:
   - `rules/group_separation.md` — groups must not mix in a period
   - `rules/coverage.md` — every period requires coverage
   - `rules/delegator_rules.md` — one delegator per period

4. Draft the schedule JSON respecting all rules above and:
   - Balance load fairly across doctors
   - Distribute groups across periods, not concentrated in one
   - Assign one delegator per period from eligible doctors

5. Call `draft_weekly_schedule(json)` to push the distribution
   into the Schedule UI as a draft. The TL can now see the
   schedule visually and edit any slot directly in the app.

6. Inform the TL briefly:
   "وزّعت الأطباء بالجدول كمسوّده. عاينها وعدّل الي تبيه،
   وقولي لما تبي تحفظ."

7. Wait for the TL's response:
   a) **Save** ("احفظ" / "ثبّت") — proceed to step 8.
   b) **Quick verbal change** ("غيّر ديليقيتر الأحد إلى د.علي")
      — adjust the draft, push again, return to step 7.
   c) **Cancel** ("ألغي" / "ابدأ من جديد") — call
      `discard_draft(week_start)` and stop.

   Note: the TL may edit slots directly in the UI between
   turns. You do not see those edits, but they persist in
   the draft.

8. Call `confirm_weekly_schedule(week_start)` to publish
   the draft (only on path 7a).

9. Report the result in one short line:
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
