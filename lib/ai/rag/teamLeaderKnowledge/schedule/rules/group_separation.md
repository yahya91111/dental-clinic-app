# Group Separation

## Purpose

Defines how regular doctor groups are assigned to shifts
across the week, and the rotation pattern that keeps
workload balanced between them.

This rule does NOT cover special groups (Board, Trainee).
Those have their own rules in `special_groups.md`.

---

## The core principle

**Primary groups are separated by shift, not by period.**

"Primary groups" are the clinical groups listed under
`ai_preferences.group_classification.primary_groups`. The
clinic has **at most two primary groups** because there are
exactly two shifts (morning and evening). Other groups
(Board, trainee groups, excluded groups) follow their own
rules from `special_groups.md` and `clinic_preferences.md`.

On any given day:
- One primary group covers the **morning shift** (P1 + P2)
- The other primary group covers the **evening shift** (P3 + P4)

The two primary groups never share a shift on the same day.
A doctor from primary group A and a doctor from primary
group B are not in the clinic together during the same
period.

---

## Why shift-based separation

- Each group has a predictable, contiguous block of work
  (a full shift, not scattered periods).
- Doctors in the same group know who they are working with.
- Distribution within a shift is a clean problem: fill
  P1 and P2 (or P3 and P4) with one group's doctors.

---

## Rotation pattern

Groups rotate between morning and evening across the week.
The Team Leader specifies the assignment for one shift on
each day; the AI infers the complementary assignment.

### Example (2 groups, 5 days)

The TL says: "Group 1 morning Sunday and Monday."

The AI infers:
- **Sun**: Group 1 morning, Group 2 evening
- **Mon**: Group 1 morning, Group 2 evening
- **Tue**: Group 2 morning, Group 1 evening (rotation)
- **Wed**: Group 2 morning, Group 1 evening
- **Thu**: Group 2 morning, Group 1 evening

The pattern: whatever the TL specifies for one side
fixes both sides on that day. For days the TL does not
specify, the AI assumes the rotation flips to balance the
week.

---

## When to ask the TL

The AI should ask explicitly when:
- The TL has not specified any assignment for a day.
- The number of groups is more than two (rotation becomes
  ambiguous without explicit input).
- A group's size is too small to cover a full shift alone
  (see `coverage.md` for staffing scenarios).

The AI should NOT ask when:
- The TL has specified enough to infer the rest of the
  week with two groups.

---

## Within-shift distribution

Once a group is assigned to a shift, the AI distributes
that group's doctors across the shift's two periods. For
the rules of that distribution, see `coverage.md`.

Group membership is preserved during distribution. A
Group 1 doctor never appears in a slot meant for Group 2,
even if that would balance numbers.

---

## Constraints

- A doctor belongs to **exactly one regular group** at a
  time (see `manage_groups` workflow).
- Groups should be roughly equal in size for the rotation
  to balance workload. Significantly uneven groups
  produce uneven schedules.
- The minimum healthy group size is **6 doctors**. Less
  than that indicates a staffing shortage in the group.

---

## Edge cases

- **Single primary group only**
  No separation possible. The single primary group covers
  both shifts of every day. Surface this to the TL as a
  staffing concern: rotation cannot balance workload with
  only one primary group.

- **Three or more primary groups in classification**
  Not allowed. The classification step in
  `clinic_preferences.md` enforces a maximum of 2 primary
  groups. If the TL tries to mark a 3rd as primary, the AI
  refuses and asks them to reclassify one of the existing
  two first. Extra clinical groups should either be merged
  into one of the two primaries, or marked `excluded` from
  scheduling.

- **Uneven primary group sizes**
  The smaller primary group will be more loaded on its
  shift days. Inform the TL of the imbalance during
  distribution.

- **A primary group has no doctors available (all on leave)**
  That group cannot cover its assigned shift. Inform the TL;
  coverage may need to fall back to the other primary group
  taking both shifts that day, or to the Board carrying
  more load.

- **A group exists in the clinic but is not classified**
  The schedule build pauses and the AI asks the TL to
  classify it (see `clinic_preferences.md` incremental flow).
  Never schedule against an unclassified group.

---

## Related rules

- For period definitions and shift structure → `period_definitions.md`
- For per-shift distribution scenarios → `coverage.md`
- For delegator and EX role rotation → `delegator_and_ex.md`
- For Board and Trainee groups → `special_groups.md`
- For group classification (which groups are primary) → `clinic_preferences.md`
