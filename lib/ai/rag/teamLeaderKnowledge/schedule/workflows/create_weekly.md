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

- `get_clinic_doctors()` — returns the clinic's doctors with their
  group_id, availability, and current status.
- `get_existing_schedule(week_start)` — returns the existing
  schedule for that week, or null if none exists.
- `create_weekly_schedule(json)` — saves the full weekly schedule
  in a single atomic call.

---

## Pre-flight checks

Before drafting any schedule, run these checks in order:

1. Call `get_existing_schedule(week_start)`.
   - If a schedule already exists for that week, **ask the user
     explicitly** whether to replace it.
   - Never silently overwrite an existing schedule.

2. Call `get_clinic_doctors()`.
   - Confirm at least four active doctors are available
     (minimum for basic coverage).
   - Note any doctor on long-term leave, vacation, or
     permission so they are excluded from the draft.

---

## Steps

1. Confirm the `week_start` date. Default is the next Sunday
   unless the user specifies otherwise.

2. Ask the Team Leader for any constraints before drafting:
   - Number of rooms operating this week (1-5).
   - Doctors unavailable this week or on specific days.
   - Any preferred distribution pattern (e.g., "same as last week").

3. Retrieve the relevant rules from the knowledge base:
   - `rules/group_separation.md` — groups must not mix in a period
   - `rules/coverage.md` — every period requires coverage
   - `rules/delegator_rules.md` — one delegator per period

4. Draft the schedule JSON respecting all rules above and:
   - Balance load fairly across doctors
   - Distribute groups across periods, not concentrated in one
   - Assign one delegator per period from eligible doctors

5. Present a SUMMARY to the user. Do not dump the full JSON.
   Use a concise table format (see Presentation format below).

6. Wait for the user's response. The user has three paths:
   a) **Confirm as-is** — proceed to step 7.
   b) **Request verbal changes** ("غيّر ديليقيتر الأحد إلى د.علي") —
      adjust the draft, re-present, return to this step.
   c) **Choose manual editing** ("أعدّله بنفسي بالتطبيق") —
      acknowledge briefly, do NOT save. The user will edit
      directly in the Schedule UI from here.

7. Call `create_weekly_schedule(json)` to save (only on path 6a).

8. Report the result in one short line:
   - On success: "تم. جدول أسبوع [date] جاهز."
   - On failure: state what blocked it and what remains.
   - On manual editing: "تمام، عدّله بالتطبيق وأنا موجود لو احتجت."

---

## Presentation format

When showing the draft, summarize by day and period count.
Show the SHAPE of the schedule, not the data behind it.

Example:
```
الأحد:    P1(3)  P2(3)  P3(2)  P4(2)  —  DLG: د.أحمد
الاثنين:  P1(3)  P2(3)  P3(2)  P4(2)  —  DLG: د.سامي
الثلاثاء: P1(3)  P2(3)  P3(2)  P4(2)  —  DLG: د.علي
الأربعاء: P1(3)  P2(3)  P3(2)  P4(2)  —  DLG: د.محمد
الخميس:   P1(2)  P2(2)  P3(2)  P4(2)  —  DLG: د.أحمد

مجموع: 56 خانه، كل طبيب 4-5 فترات بالأسبوع
```

If any period has no coverage, flag it explicitly:
```
⚠ الخميس P4: لا توجد تغطيه (لا أطباء متاحين)
```

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

AI: [calls get_existing_schedule(2026-05-24)]
    لا يوجد جدول للأسبوع القادم بعد.
    [calls get_clinic_doctors()]
    عيادتك فيها 12 طبيب موزعين على 3 قروبات.

AI: قبل ما أبني الجدول، أحتاج أعرف:
    - كم عياده راح تشتغل هالأسبوع؟
    - فيه أحد بإجازه أو استئذان؟

TL: 3 عيادات، د.أحمد بإجازه يوم الأحد فقط

AI: [drafts schedule respecting rules]
    إليك التوزيع المقترح:

    الأحد:    P1(3) P2(3) P3(2) P4(2)  —  DLG: د.سامي
    الاثنين:  P1(3) P2(3) P3(2) P4(2)  —  DLG: د.أحمد
    الثلاثاء: P1(3) P2(3) P3(2) P4(2)  —  DLG: د.علي
    الأربعاء: P1(3) P2(3) P3(2) P4(2)  —  DLG: د.محمد
    الخميس:   P1(2) P2(2) P3(2) P4(2)  —  DLG: د.سامي

    مجموع: 56 خانه. د.أحمد مستبعد من الأحد كما طلبت.
    هل أحفظ الجدول؟

TL: نعم

AI: [calls create_weekly_schedule(json)]
    تم. جدول أسبوع 24 مايو جاهز.
```
