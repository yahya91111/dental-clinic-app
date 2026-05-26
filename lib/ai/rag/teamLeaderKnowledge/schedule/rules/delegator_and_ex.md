# Delegator and EX (Reserve)

## Purpose

Defines the two non-clinic roles in a shift: the
**delegator** (who covers any clinic doctor that needs
to step out) and the **EX reserve** (a spare doctor who
is available if anyone is absent).

Both roles are special — they do not appear in a clinic
room slot, and they are subject to specific rotation
rules to keep workload fair.

---

## Delegator (الديليقيتر)

### What the delegator does

The delegator is the on-duty support for the clinic
doctors during a shift. They step in when a clinic
doctor needs to leave a patient temporarily, handle
overflow, and provide a second opinion when needed.

They are **always present during the shift**, but they
are not assigned to a specific clinic room.

### Scope

The delegator role is scoped to a **full shift by default**.
One delegator covers all the periods of one shift on one day,
and this is the normal case.

Two exceptions allow per-period assignment:

1. **Balanced shortage (D = S)** — see "Rotated delegator"
   below. Two doctors split the shift: one is delegator in
   P1 (or P3), the other in P2 (or P4). This is structural,
   not a TL choice.

2. **TL manual override** — the TL may explicitly assign
   different delegators to different periods of the same
   shift via the `assign_delegator` workflow. The workflow
   exposes both scopes (per-shift and per-period) so the TL
   can pick. Per-period assignment is uncommon outside the
   shortage case but is allowed.

When you draft a schedule with `create_weekly`, default to
per-shift delegators. Only switch to per-period if the
shortage scenario forces it or if the TL has previously set
per-period delegators on a similar schedule.

### Dedicated vs rotated delegator

The delegator may be **dedicated** or **rotated**,
depending on staffing:

- **Dedicated delegator** (when D ≥ S + 1):
  One doctor is the delegator for the whole shift on
  that day. They do not appear in any clinic slot.

- **Rotated delegator** (when D = S):
  No spare doctor exists. Two doctors split duties:
  one covers a clinic in the first period and acts as
  delegator in the second; the other does the opposite.

- **No delegator** (when D < S):
  Shortage forces all available doctors into clinic
  rooms. There is no delegator. This is acceptable in
  shortage scenarios but should be flagged to the TL.

### Eligibility

Anyone in the group covering the shift can be the
delegator, **except**:
- Reduced-workload doctors (locked to first period only,
  cannot cover full shift)
- Trainees deployed as **beginner** for this schedule
  (they must be paired with a trainer, see `special_groups.md`)
- Board doctors are eligible **only if the TL opted them
  in for this schedule** (see Board roles in
  `special_groups.md`). By default the TL is asked per
  schedule whether Board joins the delegator rotation.

### Daily rotation

When a dedicated delegator exists, a **different doctor
takes the delegator role each day** of the week. Across
a week, the delegator turns are distributed evenly among
eligible doctors of the group.

If the group has 7 doctors and 5 working days, then 5
out of 7 doctors get a delegator turn that week. The
remaining 2 carry the turn forward to the next week.

### A doctor's role in different periods

A doctor can play **different roles in different periods**
of the same day:
- Clinic doctor in P1 + delegator-like behavior in P2 (in
  the rotated case)
- Clinic doctor in P1 + EX in evening shift (not possible
  — they would already be done after P2)

A doctor **cannot** be both the regular clinic doctor and
the delegator in the **same period**. The two roles are
mutually exclusive in any single period.

---

## EX (Reserve / احتياطي)

### What EX means

EX is the **reserve** role for a shift. An EX doctor is
present and available but holds no fixed clinic
assignment. If anyone in the clinic is absent or pulled
away, the EX steps in.

The EX is the **first option** for covering an
unexpected absence on the same day (see
`mark_unavailable` workflow).

### Scope

EX is scoped to a **full shift**, like the delegator.
One doctor is EX for the whole morning shift or the
whole evening shift on a given day.

### Multiple EX doctors

A shift can have **more than one EX doctor** if staffing
allows.

Examples:
- 11 doctors covering 3 clinics (S = 6):
  6 clinic + 1 delegator + **4 EX**
- 12 doctors covering 4 clinics (S = 8):
  8 clinic + 1 delegator + **3 EX**

All EX doctors in the same shift share the rotation.

### Daily rotation

When EX doctors exist, a **different doctor is EX each
day**. Across the week:
- If only one EX exists per shift, 5 different doctors
  get EX turns that week (out of those eligible).
- If multiple EX exist per shift, more doctors share the
  load.

Over time the rotation balances so every eligible doctor
gets approximately the same number of EX days.

### Eligibility

Anyone in the group can be EX, **except**:
- Reduced-workload doctors
- Trainees deployed as beginner for this schedule (must
  be paired with a trainer)
- Board doctors are eligible **only if the TL opted them
  in for this schedule** (see Board roles in
  `special_groups.md`). The 2-per-clinic Board pair always
  has fixed positions and is never EX regardless of the
  TL's opt-in choice.
- Anyone who is already the dedicated delegator that day

### EX behavior during the shift

If no absence occurs, the EX doctor is essentially on
standby. They may be asked to handle administrative work,
patient overflow, or assist any clinic that gets busy.

If an absence occurs, the EX is activated to cover the
absent doctor's slot for that period (or shift, depending
on the absence type).

---

## Interaction between delegator and EX

- A doctor cannot be **both delegator and EX** on the
  same day. They are separate roles.
- A doctor cannot be **EX and a clinic doctor** in the
  same shift. EX is shift-wide.
- A doctor can be **clinic doctor in one shift** and
  **EX in the other** if the schedule allows (e.g., they
  belong to both shifts, which is unusual but possible
  in shortage rotation).

---

## Fairness summary

Across a week, the AI should target:
- **Delegator** — every eligible doctor gets a turn over
  the week (or close to it)
- **EX** — every eligible doctor gets a turn over the
  week (or close to it)
- **Same doctor as delegator AND EX in the same week** —
  acceptable when group is small, but avoid concentrating
  multiple "non-clinic" days on one doctor

When the AI distributes a week, it should track who
already played each role recently and prefer assigning
others first.

---

## Related rules

- For periods and shifts → `period_definitions.md`
- For group-to-shift assignment → `group_separation.md`
- For staffing scenarios → `coverage.md`
- For Board and Trainee groups → `special_groups.md`
