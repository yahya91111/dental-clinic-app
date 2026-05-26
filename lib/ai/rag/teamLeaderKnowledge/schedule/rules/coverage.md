# Coverage and Distribution

## Purpose

Defines how doctors are distributed across the clinic
rooms and periods of one shift, given the number of
doctors available in the group covering that shift.

Also defines the fairness rules that prevent any one
doctor from being stuck with the same period type all week.

This rule is about **distribution WITHIN one shift for one
group**. Group-to-shift assignment is in `group_separation.md`.
Delegator and EX details are in `delegator_and_ex.md`.

---

## The base formula

For any shift covering **C clinic rooms**:

- **Clinic slots needed** = `C × 2` (one doctor per
  clinic per period)
- **Comfortable staffing** = `(C × 2) + 1` doctors
  (the +1 is a dedicated delegator)
- **Healthy staffing** = `(C × 2) + 2` doctors
  (one EX reserve in addition to the delegator)

Examples:

| Clinics | Slots | Comfortable | Healthy |
|---------|-------|-------------|---------|
| 1 | 2 | 3 | 4 |
| 2 | 4 | 5 | 6 |
| 3 | 6 | 7 | 8 |
| 4 | 8 | 9 | 10 |
| 5 | 10 | 11 | 12 |

---

## Distribution scenarios

Let **D = number of doctors available** in the group for
that shift, and **S = clinic slots needed** (C × 2).

### Surplus: D ≥ S + 2

- S doctors fill the clinic slots (one per period per room)
- 1 doctor is the **dedicated delegator** for the shift
- The remaining `D − S − 1` doctors are **EX (reserve)**
- All EX doctors rotate fairly across the week
  (see `delegator_and_ex.md`)

### Comfortable: D = S + 1

- S doctors fill the clinic slots
- 1 doctor is the dedicated delegator
- No EX that day

### Balanced: D = S

- S doctors fill the clinic slots — no spare for a
  dedicated delegator
- The delegator role is **rotated** among the doctors:
  on each day, two doctors swap halves of the shift —
  one covers a clinic in P1 (or P3) and the delegator
  role in P2 (or P4); the other does the opposite
- Different pair rotates each day for fairness

### Shortage: D < S

When doctors are fewer than slots, some doctors must
cover a full clinic room (both periods of the shift).

| D vs S | Distribution |
|--------|--------------|
| `D = S − 1` | 1 doctor covers a full room (both periods), the rest cover one period each |
| `D = S − 2` | 2 doctors each cover a full room, the rest cover one period each |
| `D = S − 3` | 3 doctors each cover a full room, the rest cover one period each |
| ... | Pattern continues — each missing doctor means one more room is fully covered by a single doctor |

Generally: `(S − D)` doctors take a full-room slot, and
the rest take a single-period slot.

In every shortage scenario, the **dedicated delegator is
the first thing dropped**. There is no spare to keep one.

---

## Fairness rules

These rules apply to all distribution scenarios. They
keep the schedule equitable across the week and month.

### Rule 1 — Vary the period within a doctor's week

No doctor should always be in the **start** period (P1 or
P3) or always in the **end** period (P2 or P4) of their
shift. Across the days they work, the doctor should be
exposed to both:
- Some days starting their shift in P1/P3
- Some days starting in P2/P4

### Rule 2 — Rotate the dedicated delegator daily

When the shift has a dedicated delegator (D ≥ S + 1):
- A **different doctor** plays delegator each day
- Across a week, the delegator turns are distributed
  evenly among eligible doctors

### Rule 3 — Rotate role-swapping pairs (Balanced case)

When D = S and two doctors split clinic/delegator roles
each day:
- A different pair is selected each day
- Over a week, every doctor in the group gets at least
  one role-swap day

### Rule 4 — Rotate EX reserves

When EX doctors exist (D ≥ S + 2):
- A different doctor is EX each day
- Multiple EX doctors in the same shift all share the
  rotation; one is EX one day, another is EX the next

### Rule 5 — Exception for reduced-workload doctors

Doctors with the **reduced workload** status are
permanently locked to the **first period of their shift**
(P1 or P3). Fairness rotation does not apply to them.

They are also excluded from:
- The delegator rotation
- The EX rotation
- Coverage of P2 or P4

**Multiple reduced-workload doctors in one group:**

When the same group contains 2+ doctors with reduced
workload, they all work the same period (P1 if their group
is on morning, P3 if on evening). They must each occupy
a **different clinic room** in that period — you cannot
place two doctors in the same room and same period.

Example with 3 clinic rooms and 2 reduced-workload doctors
on morning duty: د.A in Room 1 P1, د.B in Room 2 P1. The
third room's P1 is covered by another group member. P2 of
all three rooms is covered by other group members (the
two reduced-workload doctors are off).

**Overflow case — reduced-workload count > room count:**

If the number of reduced-workload doctors in a group
exceeds the number of clinic rooms, not all of them can
be placed. The AI does NOT decide who works and who does
not. Instead, it asks the TL:

"عندنا [N] أطباء تخفيف عمل بقروب [X] لكن [M] عيادات فقط
بالشفت. مين راح يداوم اليوم؟"

The TL specifies which reduced-workload doctors are
scheduled that day, room by room. The rest are off for
that day (treated like an absence for distribution purposes,
but not marked SL/VC since this is a structural shortage,
not a request).

The AI should also surface this to the TL as a recurring
issue: "هالحاله تتكرّر — تبي أسجّل نفس التوزيع لباقي
الأسبوع؟" so the TL can decide the pattern once.

---

## What "fair" looks like across the week

For a doctor in a group of size 7 with 3 clinics
(D = 7, S = 6):

| Day | Role |
|-----|------|
| Sun | Clinic P1 (start) |
| Mon | Clinic P2 (end) |
| Tue | Delegator |
| Wed | Clinic P1 (start) |
| Thu | Clinic P2 (end) |

Across the week the doctor:
- Spends 2 days starting their shift (P1)
- Spends 2 days ending their shift (P2)
- Spends 1 day as delegator
- No period is repeated 3 times in a row

This is the target shape. The AI may deviate when
shortages force it, but should always aim for this kind
of spread.

---

## When fairness cannot be perfect

In small groups or short weeks (e.g., a week with many
absences), perfect fairness may be impossible. Priorities,
in order:

1. **Coverage first** — every period must be staffed.
2. **No double-period assignment to the same doctor every
   day** in shortage scenarios. Rotate the double-up.
3. **Rotate roles even imperfectly** — better to be
   slightly off than to always assign the same doctor
   to delegator or EX.

---

## Related rules

- For periods and shifts → `period_definitions.md`
- For group-to-shift assignment → `group_separation.md`
- For delegator and EX details → `delegator_and_ex.md`
- For Board and Trainee groups → `special_groups.md`
