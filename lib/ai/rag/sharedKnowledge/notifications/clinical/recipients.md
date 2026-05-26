# Recipient Resolution (Clinical Tier)

## Purpose

Defines the named audience groups every notification can
target, and how the assistant resolves each name to an
actual list of doctor IDs at send time.

Templates in `event_templates.md` and `reactive_templates.md`
reference these keys (e.g., `Recipients: all_clinic_doctors`).
This file is the lookup.

This file is read by clinical-tier assistants. Management-
tier recipient resolution (regions, multiple clinics)
lives in `management/recipients.md` when built.

---

## How resolution works

When a workflow needs to send a notification:

1. The workflow points to a template (e.g.,
   `schedule_published`).
2. The template names a recipient key (e.g.,
   `all_clinic_doctors`).
3. The assistant looks up the key in this file.
4. The assistant calls the matching tool to fetch the
   actual list of doctor IDs.
5. The assistant passes the IDs to `send_notification`.

Recipient keys never resolve outside the current user's
scope. If a key would produce IDs outside scope, the
resolution fails and the assistant surfaces the gap.

---

## Recipient keys

### `all_clinic_doctors`

- **Means:** every doctor currently assigned to the
  user's clinic, regardless of group.
- **Excludes:** doctors in `excluded_groups` from
  `group_classification` (administrative groups).
- **Tool:** `get_clinic_doctors(clinic_id)` filtered by
  active status.
- **Used by:** `schedule_published`, broadcast
  announcements when TL chooses "الكل".

### `specific_group`

- **Means:** every doctor in a named group within the
  user's clinic.
- **Resolution:** the workflow asks the TL to pick a
  group from a button list (the clinic's groups by name).
- **Excludes:** doctors on permanent leave the day the
  notification fires (they will see it later, no special
  handling needed).
- **Tool:** `get_doctors_by_group(group_id)`.
- **Used by:** TL announcements targeted at one group.

### `specific_doctors`

- **Means:** an explicit list of doctor IDs the TL
  picks.
- **Resolution:** the workflow asks the TL to select
  doctors from the clinic's doctor list (multi-select
  buttons).
- **Tool:** none — the IDs come directly from the TL's
  selection.
- **Used by:** TL announcements targeted at named
  individuals, `swap_completed_inform` (the two affected
  doctors).

### `tl_group_with_trainees`

- **Means:** the doctors of the TL's primary group plus
  the doctors of any trainee group whose
  `parent_group_id` matches that primary group.
- **Resolution:**
  1. Read the TL's group_id.
  2. Read `group_classification.trainee_groups` and
     collect every trainee group whose
     `parent_group_id` equals the TL's group.
  3. Union: doctors of the primary group + doctors of
     each linked trainee group.
- **Used by:** `tl_absence_recorded` — when the TL
  records their own absence and the group needs to know.

### `affected_doctor`

- **Means:** the single doctor whose schedule was
  changed (the new occupant of a slot or the doctor
  whose existing slot was modified).
- **Resolution:** the workflow already knows the
  doctor's ID from its action.
- **Used by:** `coverage_assignment`, single-slot
  `schedule_changed` notifications.

### `affected_doctors_pair`

- **Means:** the two doctors involved in a swap.
- **Resolution:** both IDs known from the swap action.
- **Used by:** `swap_completed_inform`.

### `absent_doctor_group_with_trainees`

- **Means:** for a non-TL doctor's absence, the doctors
  of the absent doctor's group plus any linked trainee
  groups.
- **Resolution:**
  1. Read the absent doctor's group_id.
  2. Union with linked trainee groups (same logic as
     `tl_group_with_trainees`).
- **Used by:** when the system surfaces a doctor's
  absence to the group — typically through the reactive
  card flow, not an outgoing notification from the TL
  Assistant.

---

## Resolution always respects scope

Every key resolves only to doctors within the user's
clinic. If a workflow somehow asks for recipients across
clinics, resolution returns empty and the assistant
declines:

"الإشعار خارج نطاق صلاحياتك."

This is a final safety net beyond the scope rules in
the Core Prompt.

---

## Empty recipient list

If a key resolves to zero doctors (e.g., empty trainee
group), the assistant skips the send and tells the user
briefly: "ما فيه مستلمين لهالإشعار، ما أرسلت شي."

The workflow continues normally; the notification step
becomes a no-op.

---

## Related references

- For the templates that reference these keys → `event_templates.md`, `reactive_templates.md`
- For group classification (primary, trainee, board, excluded) → `../../../teamLeaderKnowledge/schedule/rules/clinic_preferences.md`
- For scope rules → core prompt + TL Assistant prompt
