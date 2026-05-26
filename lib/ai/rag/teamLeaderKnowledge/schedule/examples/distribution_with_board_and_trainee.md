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

This example shows two consecutive weeks. The first week is
the clinic's first time being asked the new button questions
(empty `ai_preferences`). The second week shows the
smart-reminder card kicking in.

### Week 1 — First time (empty ai_preferences)

```
TL: ابني جدول الأسبوع القادم

AI: [internal: reads clinic_info, doctors, groups]
    [internal: calls get_clinic_ai_preferences(clinic_id) → {}]
    [internal: no stored preferences — must ask the button
     questions individually]

AI: [calls ask_tl_choice("شفت البورد هالأسبوع؟",
     [صباحي, مسائي, مقسوم])]
TL: [نقر: صباحي]
    [internal: update_clinic_ai_preferences({ last_board_shift: "morning" })]

AI: [calls ask_tl_choice("البورد يدخل دوران الديليقيتر؟",
     [نعم, لا])]
TL: [نقر: لا]
    [internal: update_clinic_ai_preferences({ board_in_delegator_rotation: false })]

AI: [calls ask_tl_choice("البورد يدخل دوران الـ EX؟",
     [نعم, لا])]
TL: [نقر: لا]
    [internal: update_clinic_ai_preferences({ board_in_ex_rotation: false })]

AI: [calls ask_tl_choice("د.X (Group 1) — هالأسبوع؟",
     [مستقل, مبتدئ مع مدرّب])]
TL: [نقر: مبتدئ مع مدرّب]

AI: [calls ask_tl_choice("المدرّب؟", [د.M, د.N, د.O, …])]
TL: [نقر: د.M]
    [internal: update_clinic_ai_preferences({
       trainee_defaults: { X: { deployment: "beginner", trainer: "M_id" } }
     })]

AI: [calls ask_tl_choice("د.Y (Group 1) — هالأسبوع؟",
     [مستقل, مبتدئ مع مدرّب])]
TL: [نقر: مستقل]
    [internal: update_clinic_ai_preferences({
       trainee_defaults: { Y: { deployment: "independent", trainer: null } }
     })]

AI: [calls ask_tl_choice("د.Z (Group 2) — هالأسبوع؟",
     [مستقل, مبتدئ مع مدرّب])]
TL: [نقر: مبتدئ مع مدرّب]
AI: [calls ask_tl_choice("المدرّب؟", [د.K, د.L, د.N, …])]
TL: [نقر: د.N]

AI: تمام. قول لي قروب 1 يداوم صباحي أي يوم والباقي
    أستنتجه.

TL: قروب 1 صباحي الأحد والاثنين

AI: [internal: infers rotation —
     Sun/Mon: G1 morning, G2 evening
     Tue/Wed/Thu: G2 morning, G1 evening
     Board: morning all week (last_board_shift)
     Trainees follow their parent group]

    [internal: calculates effective doctor count per shift,
     respecting the stored deployments:
     - Sun/Mon morning: G1 (7) + Board (2) + Y independent (1) = 10
     - Sun/Mon evening: G2 (6) + Z paired (0) = 6
     - Tue/Wed/Thu morning: G2 (6) + Board (2) + Z paired (0) = 8
     - Tue/Wed/Thu evening: G1 (7) + Y independent (1) = 8
     - Board OPTED OUT of delegator and EX rotations →
       delegator and EX come from regular group members only
     - د.X paired with د.M in every G1 shift
     - د.Z paired with د.N in every G2 shift]

    [internal: builds distribution and calls draft_weekly_schedule(json)]

AI: وزّعت الأطباء بالجدول كمسوّده. عاينها وعدّل الي
    تبيه، وقولي لما تبي تحفظ.

    ملاحظات:
    - البورد بعياده 3 طول الصباحي (د.A بـ P1، د.B بـ P2)
    - الديليقيتر و الـ EX من القروبات العاديه (البورد مستثنى هالأسبوع)
    - د.X مع د.M بنفس الفتره طول أيام Group 1
    - د.Y موزّع كطبيب عادي
    - د.Z مع د.N بنفس الفتره طول أيام Group 2

TL: تمام، احفظ

AI: [internal: calls confirm_weekly_schedule(next_sunday)]
    تم. جدول الأسبوع جاهز.
```

### Week 2 — Smart reminder card

A week later, the TL builds the next schedule. The
preferences are already on file.

```
TL: ابني جدول الأسبوع القادم

AI: [internal: calls get_clinic_ai_preferences(clinic_id)
     → { board_shift: "morning", board_delegator: false,
         board_ex: false, trainee_defaults: {...} }]

AI: [calls ask_tl_choice with summary card body:
     "- البورد صباحي، مو ديليقيتر، مو EX
      - د.X مبتدئ مع د.M
      - د.Y مستقل
      - د.Z مبتدئ مع د.N
      نفس الأسبوع الماضي؟",
     [نعم، نفس الشي, غيّر])]

TL: [نقر: نعم، نفس الشي]

AI: تمام. قروب 1 صباحي نفس الأيام؟

TL: نفس الشي

AI: [builds the distribution with stored preferences,
     calls draft_weekly_schedule(json)]
    وزّعت الأطباء بالجدول كمسوّده. عاينها وعدّل الي
    تبيه، وقولي لما تبي تحفظ.

TL: احفظ

AI: [calls confirm_weekly_schedule(next_sunday)]
    تم.
```

The full pre-flight in Week 2 took the TL exactly one click
("نعم، نفس الشي") plus one text reply about rotation.

---

## What this example teaches the AI

### Decision points the AI navigated

1. **Buttons, not free text** — Every per-schedule policy
   question (Board shift, Board delegator/EX, each trainee's
   deployment, each trainer pick) was a button click. No
   typing, no parsing ambiguity, no missed answers.

2. **Per-question save, not batched** — After each TL click,
   the AI called `update_clinic_ai_preferences` with just that
   one key. Even if the conversation breaks mid-flow, the
   answers given so far persist.

3. **Smart-reminder card on Week 2** — The full pre-flight
   collapsed to one click ("نعم، نفس الشي") because the
   answers from Week 1 were on file. This is the payoff of
   the per-question save discipline above.

4. **Board roles are TL-decided, not rule-decided** — The
   AI did NOT assume "Board can be delegator" or "Board
   cannot be delegator". It asked. The TL opted Board out
   of both delegator and EX rotations for this week. The
   distribution respected that.

5. **Deployment, not background state, drives the count** —
   The AI used the TL's per-schedule deployment choice for
   each trainee (independent vs beginner). د.Y was deployed
   independent → +1 to D. د.X and د.Z were deployed
   beginner → +0 to D each.

6. **Board placement rule still applies** — With 2 Board
   doctors, they shared one clinic (one P1, one P2). This
   structural rule is independent of the delegator/EX
   opt-in question.

7. **Surfacing each special-group decision** — The AI
   listed what happened with the Board and each trainee
   in the draft summary so the TL sees the consequences
   of their button choices.

### Rules and workflows applied

- `workflows/create_weekly.md` — overall build flow including
  the smart-reminder card and per-question saving
- `rules/clinic_preferences.md` — the ai_preferences schema
  and the smart-reminder pattern
- `rules/group_separation.md` — shift-based separation
  and rotation inference
- `rules/coverage.md` — D vs S scenarios applied per shift
  after counting Board and independent trainees
- `rules/delegator_and_ex.md` — eligibility lists, including
  the Board opt-in clause
- `rules/special_groups.md` — Board distribution rules by
  size (1 vs 2 vs 3+) and trainee deployment

### Anti-patterns avoided

- Did NOT assume any Board eligibility for delegator or
  EX. Asked the TL via buttons.
- Did NOT type the questions as free text. Used
  `ask_tl_choice` with explicit options every time.
- Did NOT batch the saves. Each TL click persisted
  immediately, so a mid-conversation break would not
  lose answers.
- Did NOT re-ask every question on Week 2. Showed the
  summary card and let the TL accept with one click.
- Did NOT count any beginner-deployed trainee in D.
- Did NOT separate the two Board doctors into different
  clinics — the 2-per-clinic structural rule still applies.
- Did NOT dump the full distribution in chat — only the
  special-group notes that the TL might miss in the UI.

---

## Related references

- Workflow: `workflows/create_weekly.md`
- Rules: `rules/clinic_preferences.md`, `rules/special_groups.md`,
  `rules/coverage.md`, `rules/group_separation.md`,
  `rules/delegator_and_ex.md`
