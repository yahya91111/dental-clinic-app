# Period Definitions

## Purpose

This rule defines the time structure that every schedule
operation rests on: the working days, the two shifts, and
the four periods inside them. Every other rule and workflow
references these definitions.

---

## Working days

D.C.M operates **Sunday through Thursday** — five working
days per week.

Friday and Saturday are off-days. The schedule does not
cover them and no clinic operations are scheduled on them.

---

## Daily working hours

A full working day runs from **7:00 AM to 9:00 PM** (14 hours).
The day is split into two shifts: morning and evening.

---

## The two shifts

| Shift | Arabic | Time |
|-------|--------|------|
| **Morning** | الصباحي | 7:00 — 14:00 |
| **Evening** | المسائي | 14:00 — 21:00 |

A shift is **7 hours long** and is divided into two equal
periods of 3.5 hours each.

---

## The four periods

Each shift contains two periods. The four periods of the
day are:

| Period | Shift | Time | Role in shift |
|--------|-------|------|---------------|
| **P1** | Morning | 7:00 — 10:30 | Start of morning |
| **P2** | Morning | 10:30 — 14:00 | End of morning |
| **P3** | Evening | 14:00 — 17:30 | Start of evening |
| **P4** | Evening | 17:30 — 21:00 | End of evening |

---

## Start / End semantics

The "start" and "end" labels matter for permissions and
fairness rules.

- **Start of shift** = first period of the shift
  - Morning start = P1
  - Evening start = P3
- **End of shift** = second period of the shift
  - Morning end = P2
  - Evening end = P4

This is why:
- **PS (استئذان بداية الدوام)** maps to P1 or P3
- **PE (استئذان نهاية الدوام)** maps to P2 or P4

---

## Adjacency

When the AI offers broadcast coverage in `mark_unavailable`
or `swap_broadcast`, it asks the TL which period to target.
This adjacency table defines which period is "closest" to
an absent or source period, useful for offering the most
natural option first:

| Absent period | 1st choice | 2nd choice | 3rd choice |
|---------------|------------|------------|------------|
| **P1** | P2 (same shift) | P3 | P4 |
| **P2** | P1 (same shift) | P3 | P4 |
| **P3** | P4 (same shift) | P2 | P1 |
| **P4** | P3 (same shift) | P2 | P1 |

The pattern: **same shift first** (the other period of the
same shift), then the closest period of the other shift,
then the furthest.

---

## What this rule does NOT cover

- How doctors are distributed across these periods → see
  `coverage.md`.
- How groups are assigned to shifts → see `group_separation.md`.
- Delegator role timing → see `delegator_and_ex.md`.
- Special-group constraints → see `special_groups.md`.
