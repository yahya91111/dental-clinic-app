# Special Groups: Board and Trainee

## Purpose

Defines the two groups that do not follow the regular
group rotation: **Board doctors (البورد)** and **Trainees
(التريني)**. Each has its own rules that override or
supplement the rules in `group_separation.md` and
`coverage.md`.

---

## Board doctors (البورد)

### Who they are

Board doctors are practitioners who work at the clinic
for a fixed period (typically months) under a different
arrangement than the regular staff. They are full
practitioners — not trainees — and they are counted in
the shift's doctor total.

### The Board group is a separate group

The Board is its own group, parallel to the regular
groups (Group 1, Group 2, etc.). Members of the Board
are NOT members of any regular group.

### Shift assignment is TL-defined per week

Unlike regular groups, the Board does NOT rotate between
morning and evening. Instead, the **Team Leader tells
the AI** which shifts the Board covers during the week
being planned.

- If the TL says "Board is morning this week" → the AI
  treats the Board as an addition to whichever regular
  group is on the morning shift each day.
- If the TL says nothing about the Board → the AI
  **asks** before distributing.

The Board is essentially a **shift add-on**: they join
the morning or evening regular group as extra hands.

### Counting Board doctors in distribution

Board doctors count in the doctor total for the shift
they are added to.

Example:
- Regular Group 1 has 6 doctors → covers morning Sunday
- Board has 2 doctors → also covers morning Sunday
- Total morning doctors that day = **8**

This affects the staffing scenario in `coverage.md`. With
8 doctors on 3 clinics (S=6), the situation is now
"surplus" (D = S + 2), so 1 dedicated delegator + 1 EX
becomes possible.

### Distribution rules by Board size

The 2-per-clinic placement rule applies only when there are
exactly two Board doctors. Other sizes follow different rules:

**Single Board doctor (1):**
- Treated as a regular extra doctor for the shift the TL
  assigns the Board to that week.
- Counted in D (effective doctor count).
- May fill any clinic slot.
- Subject to the same fairness rules — period variation
  (start vs end of shift) rotates across the week, like
  any regular doctor.
- The 2-per-clinic pair rule does NOT apply (no pair to
  keep together).

**Two Board doctors (2):**
- Must share the **same clinic room** for the entire shift.
- One Board doctor covers P1 of clinic X.
- The other Board doctor covers P2 of clinic X.
- They act as a pair across the whole shift, never split
  into different rooms.

**Three or more Board doctors (3+):**
- The 2-per-clinic pattern does not extend automatically.
- The AI asks the TL how to distribute them before drafting.

### Board roles (delegator and EX) — TL decision per schedule

Board doctors' participation in the **delegator** and **EX
(reserve)** rotations is **not a fixed rule**. It is a
per-schedule decision the TL makes when building the week.

The AI asks the TL two yes/no questions (presented as
buttons in the UI) before drafting:

1. **"البورد يدخل دوران الديليقيتر؟"** [نعم] [لا]
2. **"البورد يدخل دوران الـ EX؟"** [نعم] [لا]

The answers are stored in `clinic.ai_preferences` (see
`rules/clinic_preferences.md`) so the AI can offer
"same as last week?" on subsequent schedules.

Whichever way the TL chooses, the eligibility lists in
`delegator_and_ex.md` still apply on top of the TL's choice
(e.g., reduced-workload exclusions hold regardless).

A Board doctor excluded from both rotations behaves as a
clinic-only doctor for the shift, and still rotates through
period variation like any regular doctor.

---

## Trainees (التريني)

### Who they are

Trainees are doctors in training who spend a fixed
period (months) at the clinic before moving on. They
require supervision until they are deemed competent.

### Trainee groups are attached to regular groups

Each trainee group is linked to a regular doctor group:
- **Trainee Group 1 → Doctor Group 1**
- **Trainee Group 2 → Doctor Group 2**

The link defines who the trainers are: the trainers for
Trainee Group 1 are the doctors of Group 1.

### Trainees rotate with their parent group

When Doctor Group 1 covers morning Sunday, Trainee
Group 1 also covers morning Sunday (because the trainees
must be alongside their trainers).

Trainees do NOT rotate independently. They follow their
parent group's shift assignment exactly.

### Deployment is a per-schedule TL decision (via buttons)

The trainee's underlying competence (whether they are
generally a beginner or competent) is background context.
What matters for distribution is the **deployment mode**
the TL picks for the trainee in **this specific schedule**.

The AI asks one button question per trainee before drafting:

**"د.[X] (Group [N]) — هالأسبوع؟"** [مستقل] [مبتدئ مع مدرّب]

- **مستقل (Independent)** → the trainee counts as a regular
  doctor in the distribution and fills a clinic slot like
  any group member.
- **مبتدئ مع مدرّب (Beginner, paired with trainer)** → the
  trainee is paired and does NOT count as a regular doctor.
  Follow-up button asks for the trainer from the parent
  group: **"المدرّب؟"** [د.A] [د.B] [د.C] …

The TL's choices are stored in `clinic.ai_preferences`
under `trainee_defaults` (see `rules/clinic_preferences.md`).
Subsequent schedules offer "نفس الأسبوع الماضي؟" instead of
re-asking from scratch.

### Mixed deployments in one trainee group are normal

A trainee group can have one trainee deployed independent
and another paired in the same week. Each trainee is
asked about individually.

### Deployment determines the count

A trainee's contribution to the doctor total depends on
the deployment chosen for this schedule:

| Deployment | Counts in doctor total? | Notes |
|------------|-------------------------|-------|
| Beginner (paired with trainer) | No | Sits in the trainer's clinic and period |
| Independent | Yes | Treated as a regular doctor |

So an independent trainee increases the effective group
size by 1 in that shift. A paired trainee does not.

### Trainee constraints

- A trainee cannot be in a different shift than their
  parent group's assignment that day.
- A trainer for a paired trainee must come from the
  trainee's linked regular group, not the Board.
- A trainee deployed as beginner cannot be the delegator
  or EX that day.
- A trainee deployed as independent can be the delegator
  or EX, like any regular doctor.

---

## Interaction examples

### Example A — Sunday, Group 1 morning

- Doctor Group 1: 7 doctors
- Trainee Group 1: 2 trainees
  - Trainee 1 — TL chose "beginner" this week, picked د.M as trainer
  - Trainee 2 — TL chose "independent" this week
- Board: 2 doctors, TL said "Board morning this week"
- TL opted Board OUT of delegator and EX rotation for this week

Distribution math:
- Effective morning doctor count =
  Group 1 (7) + Board (2) + independent trainee (1)
  = **10**
- Beginner-deployed trainee paired with د.M, not counted

With 3 clinics (S=6) and D=10:
- 6 clinic slots filled
- 1 dedicated delegator (from Group 1, since Board opted out)
- 3 EX (rotation among eligible Group 1 doctors)
- 2 Board doctors share one clinic (P1 and P2)
- Beginner-deployed trainee paired with د.M in his clinic and period

### Example B — Tuesday, Group 1 evening, no Board

- Doctor Group 1: 7 doctors → covers evening Tuesday
- Trainee Group 1: same 2 trainees, follow Group 1
  - Trainee 1 — TL chose "beginner" with د.M
  - Trainee 2 — TL chose "beginner" with د.N this week
- Board: TL said morning this week → not in this shift

Distribution math:
- Effective evening doctor count =
  Group 1 (7) = **7**
- Both trainees paired with a trainer, neither counts

With 3 clinics (S=6) and D=7:
- 6 clinic slots + 1 dedicated delegator
- No EX
- Trainee 1 paired with د.M
- Trainee 2 paired with د.N this week (TL choice)

---

## Related rules

- For periods and shifts → `period_definitions.md`
- For regular group rotation → `group_separation.md`
- For staffing scenarios → `coverage.md`
- For delegator and EX → `delegator_and_ex.md`
- For ai_preferences storage → `clinic_preferences.md`
