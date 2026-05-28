# Clinic Preferences (ai_preferences)

## Purpose

Per-clinic policy data the AI consults to interpret the schedule:
which groups are primary, which is the Board, which are trainees,
plus the small set of Board / trainee handling preferences the
team leader has set.

Weekly schedule building is being redesigned — the previous
`weekly_intents` and `rotation_tracker` keys have been removed
from the AI's tool surface. This file documents the keys that
remain in active use.

---

## Storage location

A single JSONB column on the existing `schedule_settings` table,
keyed by `clinic_id`:

```sql
schedule_settings(clinic_id PRIMARY KEY, clinic_count INT,
                  ai_preferences JSONB DEFAULT '{}'::jsonb,
                  updated_at TIMESTAMPTZ)
```

One row per clinic. The exact DDL lives in `sql/ai_preferences.sql`.

---

## JSON schema (active keys only)

```json
{
  "group_classification": {
    "primary_groups": ["<group_id>", "<group_id>"],
    "trainee_groups": [
      { "group_id": "<group_id>", "parent_group_id": "<group_id>" }
    ],
    "board_group_id": "<group_id>",
    "excluded_groups": ["<group_id>"]
  },

  "board_in_delegator_rotation": false,
  "board_in_ex_rotation": false,
  "last_board_shift": "morning",

  "trainee_defaults": {
    "<doctor_id>": {
      "deployment": "independent",
      "trainer":    null
    },
    "<doctor_id>": {
      "deployment": "beginner",
      "trainer":    "<trainer_doctor_id>"
    }
  },

  "updated_at": "2026-05-31"
}
```

Every top-level key is optional. A brand-new clinic starts with
`ai_preferences = {}` and grows organically as the TL sets things.

---

## Group classification

The foundation. The AI cannot interpret a schedule for a clinic
without knowing which groups rotate, which is the Board, which is
trainee, and which to ignore.

| Field | Type | Cardinality | Meaning |
|-------|------|-------------|---------|
| `primary_groups` | `string[]` | **0–2** | Clinical groups that rotate between morning and evening across the week. At most 2 because there are exactly 2 shifts. |
| `trainee_groups` | `array<{group_id, parent_group_id}>` | 0+ | Trainee groups. `parent_group_id` MUST be one of the `primary_groups`. |
| `board_group_id` | `string \| null` | 0–1 | The Board group, if any. |
| `excluded_groups` | `string[]` | 0+ | Groups that exist in the clinic but do not participate in scheduling. |

### Hard constraints

- A `group_id` appears in **exactly one** of the four lists.
- `primary_groups.length ≤ 2`.
- Every `trainee_groups[].parent_group_id` MUST be present in
  `primary_groups`.

---

## Board flags

| Key | Type | Meaning |
|-----|------|---------|
| `last_board_shift` | `"morning" \| "evening" \| "split"` | The board's most recent shift assignment. Informational only — the build flow is being redesigned and this is no longer used by the AI directly. |
| `board_in_delegator_rotation` | bool | Whether board doctors may be delegators. |
| `board_in_ex_rotation` | bool | Whether board doctors may be EX (reserve). |

---

## Trainee defaults

| Sub-field | Type | Meaning |
|-----------|------|---------|
| `deployment` | `"independent" \| "beginner"` | How this trainee is deployed by default. |
| `trainer` | `string \| null` | Required when `deployment = "beginner"`. The trainer's doctor id. |

---

## Tools that read or write this blob

- `get_clinic_ai_preferences` — returns the whole blob. `{}` if
  never written.
- `update_clinic_ai_preferences` — shallow merge at the top level.
  Use for small one-off edits.

`ask_tl_choice` is referenced in some older workflow files but
is not implemented as a separate tool. Present multi-option
questions as `[option1] [option2]` patterns in the chat text;
the UI layer renders them as buttons.
