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

### Special distribution rule: 2 Board doctors → 1 clinic

When the Board has exactly **two doctors** on a given
shift, they must be assigned to the **same clinic room**:
- One Board doctor covers P1 of clinic X
- The other Board doctor covers P2 of clinic X

They act as a pair covering one clinic across the whole
shift. They are NOT split into two different rooms.

If the Board has 3 or more doctors, the AI should ask
the TL how to distribute them (the 2-per-clinic pattern
may extend, or the TL may prefer a different layout).

### Board and other roles

- Board doctors **CAN** be the delegator (they are
  eligible like any regular doctor).
- Board doctors **CAN** be EX.
- Board doctors are subject to the same fairness rules
  (period variation, role rotation).

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

### Trainee states

Every trainee has one of two states. The state defines
what placements are **allowed**, but the actual placement
for a given schedule is a TL decision (see next section).

| State | Arabic | Allowed placements |
|-------|--------|--------------------|
| **Beginner** | غير متمكّن | ONLY paired with a trainer in the same clinic and period. Cannot be alone. |
| **Competent** | متمكّن | Either alone in a clinic slot OR paired with a trainer. The TL decides per schedule. |

### State is set per trainee, not per group

A trainee group can have a mix of beginners and
competents at the same time. Each trainee is handled
individually.

### The AI must ask about EVERY trainee before each schedule

Before distributing a week, the AI asks the TL about
**every trainee** in the affected groups — including
competent trainees. The state on file tells the AI which
question to ask, but the placement decision is per
schedule:

- **Beginner trainee** — "د.[X] (مبتدئ، Group [N]) — مع
  أي مدرّب؟" The TL names a trainer from the parent group.
- **Competent trainee** — "د.[Y] (متمكّن، Group [N]) —
  يستلم فتره لوحده ولا مع طبيب؟" The TL chooses:
  - **Alone** → the trainee counts as a regular doctor
    in the distribution
  - **With a trainer** → the trainee is paired (like a
    beginner) and does NOT count as a regular doctor;
    the TL also names the trainer

If the TL has already answered for a trainee in the same
session, the AI does not ask again.

### Placement determines the count

A trainee's contribution to the doctor total depends on
the placement chosen, not on the state alone:

| Placement | Counts in doctor total? | Notes |
|-----------|------------------------|-------|
| Paired with a trainer (any state) | No | Sits in the trainer's clinic and period |
| Alone (competent only) | Yes | Treated as a regular doctor |

This means a competent trainee placed alone increases
the effective group size by 1 in that shift. A competent
trainee placed with a trainer does not.

### Why ask about competent trainees too

A trainee may be technically competent but the TL still
prefers to keep them paired with a senior doctor on a
given week — for continuity of care, mentorship, or a
new procedure they are learning. The state defines what
is possible; the TL decides what happens.

### Trainee constraints (regardless of placement)

- A trainee cannot be in a different shift than their
  parent group's assignment that day.
- A trainer for a paired trainee must come from the
  trainee's linked regular group, not the Board.
- A trainee paired with a trainer cannot be a delegator
  or EX on that day.
- A competent trainee placed alone can be a delegator
  or EX, like any regular doctor.

### Trainee constraints

- A trainee cannot be in a different shift than their
  parent group's assignment that day.
- A beginner trainee cannot be paired with a Board
  doctor as their "trainer" — trainers must come from
  the trainee's linked regular group.
- A beginner trainee cannot be a delegator or EX.

---

## Interaction examples

### Example A — Sunday, Group 1 morning

- Doctor Group 1: 7 doctors
- Trainee Group 1: 2 trainees
  - Beginner — TL named د.M as trainer
  - Competent — TL chose "alone" this week
- Board: 2 doctors, TL said "Board morning this week"

Distribution math:
- Effective morning doctor count =
  Group 1 (7) + Board (2) + competent trainee placed alone (1)
  = **10**
- Beginner trainee paired with د.M, not counted

With 3 clinics (S=6) and D=10:
- 6 clinic slots filled
- 1 dedicated delegator
- 3 EX (rotation among eligible)
- 2 Board doctors share one clinic (P1 and P2)
- Beginner trainee paired with د.M in his clinic and period

### Example B — Tuesday, Group 1 evening, no Board

- Doctor Group 1: 7 doctors → covers evening Tuesday
- Trainee Group 1: same 2 trainees, follow Group 1
  - Beginner — TL named د.M as trainer
  - Competent — TL chose "with د.N" this week
- Board: TL said morning this week → not in this shift

Distribution math:
- Effective evening doctor count =
  Group 1 (7) = **7**
- Both trainees paired with a trainer, neither counts

With 3 clinics (S=6) and D=7:
- 6 clinic slots + 1 dedicated delegator
- No EX
- Beginner trainee paired with د.M
- Competent trainee paired with د.N this week (TL choice)

---

## Related rules

- For periods and shifts → `period_definitions.md`
- For regular group rotation → `group_separation.md`
- For staffing scenarios → `coverage.md`
- For delegator and EX → `delegator_and_ex.md`
