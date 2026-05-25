# Example: Weekly schedule with Board and Trainee groups

## Why this example matters

The clinic has more than just regular groups. **Board
doctors** are an addition to whichever shift the TL
assigns them to. **Trainees** are linked to their
parent regular group and follow that group's rotation.
Each special group has its own placement rules.

This example shows the AI:
- Gathering missing inputs before drafting (Board's
  shift, plus placement for **every** trainee — including
  competent ones, who can be alone OR paired by TL choice)
- Calculating the effective doctor count per shift based
  on each trainee's actual placement (not just state)
- Applying the 2-Board-doctors-in-one-clinic rule
- Pairing a trainee with a named trainer when required
- Surfacing the special-group placements briefly in the
  draft summary

---

## Scenario setup

The clinic has:
- **3 clinic rooms**
- **Group 1** — 7 doctors
- **Group 2** — 6 doctors
- **Board** — 2 doctors (د.A and د.B), no shift
  assignment yet for this week
- **Trainee Group 1** (linked to Group 1) — 2 trainees:
  - د.X — beginner (state on file)
  - د.Y — competent (state on file)
- **Trainee Group 2** (linked to Group 2) — 1 trainee:
  - د.Z — competent (state on file)

No absences are pending. The TL wants to build next
week's schedule.

---

## The conversation

```
TL: ابني جدول الأسبوع القادم

AI: [internal: reads clinic_info, groups, board, trainees]
    [internal: notes there are 3 trainees — must ask
     about each one's placement before drafting]

AI: قبل ما أوزّع، محتاج أعرف:
    1. قروب البورد (د.A و د.B) — أي شفت يعمل هالأسبوع؟
    2. د.X (مبتدئ، Group 1) — مع أي مدرّب؟
    3. د.Y (متمكّن، Group 1) — يستلم فتره لوحده ولا مع طبيب؟
    4. د.Z (متمكّن، Group 2) — يستلم فتره لوحده ولا مع طبيب؟

TL: البورد صباحي.
    د.X مع د.M.
    د.Y لوحده.
    د.Z مع د.N هالأسبوع (يتعلم إجراء جديد).

AI: تمام. قول لي قروب 1 يداوم صباحي أي يوم والباقي
    أستنتجه.

TL: قروب 1 صباحي الأحد والاثنين

AI: [internal: infers rotation —
     Sun/Mon: G1 morning, G2 evening
     Tue/Wed/Thu: G2 morning, G1 evening
     Board: morning all week
     Trainees follow their parent group]

    [internal: calculates effective doctor count per shift:
     - Sun/Mon morning: G1 (7) + Board (2) + Y alone (1) = 10
       → surplus (3 EX)
     - Sun/Mon evening: G2 (6) + Z paired with N (0) = 6
       → balanced (rotated delegator, no EX)
     - Tue/Wed/Thu morning: G2 (6) + Board (2) + Z paired (0) = 8
       → comfortable (1 delegator, no EX)
     - Tue/Wed/Thu evening: G1 (7) + Y alone (1) = 8
       → comfortable (1 delegator, no EX)
     - د.X (beginner) sits with د.M in every G1 shift
     - د.Z (competent, paired this week) sits with د.N in
       every G2 shift]

    [internal: builds distribution applying:
     - Board pair to same clinic, P1 and P2 of morning
     - د.X paired with د.M in G1's shifts
     - د.Y placed as regular doctor in G1's shifts
     - د.Z paired with د.N in G2's shifts
     - Daily delegator + EX rotation, period variation]

    [internal: calls draft_weekly_schedule(json)]

AI: وزّعت الأطباء بالجدول كمسوّده. عاينها وعدّل الي
    تبيه، وقولي لما تبي تحفظ.

    ملاحظات:
    - البورد بعياده 3 طول الصباحي (د.A بـ P1، د.B بـ P2)
    - د.X مع د.M بنفس الفتره طول أيام Group 1
    - د.Y موزّع كطبيب عادي
    - د.Z مع د.N بنفس الفتره طول أيام Group 2 (التيم
      ليدر طلبها هالأسبوع)

TL: تمام، احفظ

AI: [internal: calls confirm_weekly_schedule(next_sunday)]
    تم. جدول الأسبوع جاهز.
```

---

## What this example teaches the AI

### Decision points the AI navigated

1. **Asking about EVERY trainee, not just beginners** —
   The AI asked about all three trainees, including the
   competent ones. The state on file tells the AI which
   question to ask (مع أي مدرّب vs لوحده ولا مع طبيب),
   but the placement decision is per schedule.

2. **Asking everything upfront in one message** — Board
   shift + three trainee questions, in one go, instead
   of stopping mid-distribution.

3. **Placement, not state, drives the count** — د.Y
   (competent, alone) added 1 to the doctor total. د.Z
   (competent, paired this week) added 0. The TL's
   per-schedule choice — not the trainee's state alone —
   determined the math.

4. **Board placement rule** — The AI placed both Board
   doctors in the same clinic (one P1, one P2) per
   `special_groups.md`.

5. **Trainee pairing applies to anyone paired** — د.X
   (beginner) and د.Z (competent, paired by choice) both
   sit alongside their named trainer. The trainee's
   state did not matter once "paired" was chosen.

6. **Surfacing each trainee's placement** — The AI listed
   what happened with each trainee in the summary,
   including the TL's reason for د.Z, so the TL sees
   the consequences of their choice.

### Rules and workflows applied

- `workflows/create_weekly.md` — overall build flow
- `rules/group_separation.md` — shift-based separation
  and rotation inference
- `rules/coverage.md` — D vs S scenarios applied per
  shift after adding Board and competent trainees
- `rules/delegator_and_ex.md` — eligibility excludes
  beginner trainees and reduced-workload doctors
- `rules/special_groups.md` — Board 2-per-clinic rule
  and trainee state handling

### Anti-patterns avoided

- Did NOT start drafting before knowing the Board's
  shift assignment.
- Did NOT skip asking about د.Y and د.Z just because
  they are competent. The state opens the option of
  going solo, but the TL still chooses.
- Did NOT count د.X (beginner) in the doctor total.
- Did NOT count د.Z in the total either, since the TL
  chose to pair her.
- Did NOT separate the two Board doctors into different
  clinics.
- Did NOT dump the full distribution in chat — only the
  special-group notes that the TL might miss in the UI.

---

## Related references

- Workflow: `workflows/create_weekly.md`
- Rules: `rules/special_groups.md`, `rules/coverage.md`,
  `rules/group_separation.md`, `rules/delegator_and_ex.md`
