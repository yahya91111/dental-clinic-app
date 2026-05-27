# Clinic Preferences (ai_preferences)

## Purpose

Some scheduling decisions are not universal rules — they
vary clinic by clinic and week by week. Examples:
- Does the Board join the delegator rotation in this clinic?
- Does the Board join the EX rotation?
- For each trainee, is the TL deploying them as Independent
  or as Beginner this week?

Rather than hard-coding these as fixed rules in the RAG (which
caused conflicts in earlier versions of the system), the AI
asks the Team Leader directly via button questions and
**remembers the answers per clinic** in a small JSON blob.

The next schedule starts by offering "same as last week?"
instead of re-asking from scratch. The TL clicks once and
the AI proceeds.

---

## Storage location

A single JSONB column on the existing `clinics` table:

```sql
ALTER TABLE clinics
ADD COLUMN ai_preferences JSONB DEFAULT '{}'::jsonb;
```

No new table. No joins. One read per schedule build, one
write when a preference changes.

---

## JSON schema

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
      "trainer": null
    },
    "<doctor_id>": {
      "deployment": "beginner",
      "trainer": "<trainer_doctor_id>"
    }
  },
  "updated_at": "2026-05-26"
}
```

### Group classification (set ONCE per clinic, updated on group changes)

This is the foundation. The AI cannot build a schedule for a
clinic without it, because the AI must know which groups are
clinical (rotate across shifts), which are trainee groups
(follow a parent group), which is the Board, and which to
ignore entirely.

| Field | Type | Cardinality | Meaning |
|-------|------|-------------|---------|
| `primary_groups` | `string[]` | **0–2** | Clinical groups that rotate between morning and evening across the week. At most 2 because there are exactly 2 shifts. |
| `trainee_groups` | `array<{group_id, parent_group_id}>` | 0+ | Trainee groups. `parent_group_id` MUST be one of the `primary_groups`. |
| `board_group_id` | `string \| null` | 0–1 | The Board group, if any. |
| `excluded_groups` | `string[]` | 0+ | Groups that exist in the clinic but do not participate in scheduling (administrative, sandbox, ungrouped doctors, etc.). |

### Hard constraints

- A group_id appears in **exactly one** of `primary_groups`,
  `trainee_groups[].group_id`, `board_group_id`, or
  `excluded_groups`. Never in two at once.
- `primary_groups.length ≤ 2`. If the TL tries to mark a 3rd
  as primary, the AI refuses and asks them to reclassify one
  of the existing two first.
- Every `trainee_groups[].parent_group_id` MUST be present in
  `primary_groups`.
- A clinic with **zero** `primary_groups` cannot run a schedule.
  The AI tells the TL and stops.

### Field meanings

| Field | Type | Values | Used by |
|-------|------|--------|---------|
| `board_in_delegator_rotation` | bool | true / false | `create_weekly` when distributing delegator role |
| `board_in_ex_rotation` | bool | true / false | `create_weekly` when distributing EX role |
| `last_board_shift` | string | `"morning"`, `"evening"`, `"split"` | `create_weekly` for the rotation pattern |
| `board_shift_pattern` | `object \| null` | per-day map: `{sunday: "morning"\|"evening", monday: ...}` | Optional override of `last_board_shift` when the Board's shift varies by day. Set when the TL says things like "البورد مسائي عدا الأحد". If `null` or absent, the AI uses `last_board_shift` for every working day. |
| `trainee_defaults` | object | keyed by `doctor_id` | `create_weekly` and `special_groups` rules |
| `trainee_defaults[id].deployment` | string | `"independent"`, `"beginner"` | Per-trainee handling |
| `trainee_defaults[id].trainer` | string \| null | trainer's `doctor_id` or `null` if independent | Required only when deployment is `"beginner"` |
| `updated_at` | ISO date | last write timestamp | Smart-reminder freshness check |

### Fields are optional

A new clinic starts with `ai_preferences = {}`. The AI does
NOT assume any defaults — if a key is missing, it asks the
TL the first time the situation arises and stores the answer.

A clinic with no Board has no Board keys. A clinic with no
trainees has no `trainee_defaults`. The schema grows organically.

---

## Required tools

- `get_clinic_ai_preferences(clinic_id)` — returns the JSON
  object. Returns `{}` if never written.
- `update_clinic_ai_preferences(clinic_id, patch)` — merges
  `patch` into the existing object (does NOT replace the
  whole document). The merge is a shallow Object.assign-style
  for top-level keys, deep for `trainee_defaults`.
- `ask_tl_choice(question_text, options[])` — presents a
  button question in the UI. Returns the selected `value`.
  Each option is `{ label: string, value: string }`. Used
  for the Board and trainee questions.

---

## First-time group classification flow

When the AI is asked to build a schedule and
`group_classification` is missing or incomplete, it MUST
run this setup before anything else. The setup is sequential
and uses `ask_tl_choice` (buttons), one question at a time.

```
AI: قبل أول جدول، خلّيني أفهم بنية القروبات.
    شفت في عيادتك [N] قروب، خلّينا نصنّفها وحده وحده.

[for each group in the clinic, in order:]

AI: قروب "[name]" ([N] أطباء) — ما نوعه؟
    [أساسي للعمل] [تريني] [بورد] [مستثنى من التوزيع]

[after the click:]
  - If "أساسي للعمل":
      • If primary_groups already has 2 → refuse, explain
        only 2 are allowed (one per shift), ask to demote
        an existing one first.
      • Else: add to primary_groups, save, continue.
  - If "تريني":
      • Ask follow-up: "مع أي قروب أساسي مرتبط؟"
        [قروب 1] [قروب 2] (use the names of the primary
        groups already classified)
      • If no primary group exists yet, defer this trainee
        until a primary is set, then come back to it.
      • Save and continue.
  - If "بورد":
      • If board_group_id already set → ask: "فيه بورد
        مصنّف مسبقاً. تبدّله؟" [نعم] [لا]
      • Save and continue.
  - If "مستثنى":
      • Add to excluded_groups, save, continue.
```

After every group is classified, run a sanity check:
- At least one primary group exists. If zero, prompt the TL
  to designate at least one before proceeding.
- Each trainee_group has a valid parent_group_id.
- No group_id appears in two classifications.

Only after the sanity check passes does the schedule build
continue.

### Incremental classification (after the first setup)

The full setup runs ONCE. After that, if a new group is
created (via `manage_groups`), the AI asks ONLY about that
one new group, not the whole clinic again. The
`manage_groups` workflow triggers this incremental ask
immediately after `create_group` succeeds.

If a classified group is deleted, the AI removes its entry
from `group_classification` automatically (no question
asked) and informs the TL.

---

## Smart reminder pattern

Before drafting a schedule, the AI loads `ai_preferences`
and decides whether to use them as-is or re-ask:

```
1. Read clinic.ai_preferences
2. If empty or missing the relevant keys → ask the TL
   the relevant button questions, save the answers, proceed.
3. If keys exist:
   3a. Present a single summary card and one button question:
       "نفس الأسبوع الماضي؟" [نعم، نفس الشي] [غيّر]
   3b. On [نعم] → proceed with stored preferences.
   3c. On [غيّر] → re-ask each question via buttons and save.
```

The summary card lists ONLY the keys relevant to the current
clinic's setup (skip Board lines if there is no Board, skip
trainee lines if there are no trainees).

Example summary card body:
```
- البورد صباحي، مو ديليقيتر، مو EX
- د.X مبتدئ مع د.M
- د.Y مستقل
- د.Z مبتدئ مع د.N
```

---

## When to write to ai_preferences

Write happens in three situations only:

1. **The TL answers a button question** — store immediately
   after each answer, not in a batch at the end.

2. **The TL clicks [غيّر] and re-answers** — overwrite the
   relevant keys with the new values.

3. **The TL edits the published schedule in a way that
   contradicts the stored preference** — example: stored
   says "Board not in delegator rotation" but the TL
   manually made a Board doctor the delegator in the UI.
   Ask once: "تبي أحفظ هذا كالسياسه الجديده؟" [نعم] [مره وحده فقط]
   - [نعم] → update `ai_preferences`
   - [مره وحده فقط] → leave preferences alone

Do NOT write on every schedule build. Only when something
actually changed.

---

## Cross-clinic isolation

`ai_preferences` is **per clinic**. The TL of clinic A
cannot see or affect clinic B's preferences. The AI also
does not surface or hint at another clinic's choices.

This is enforced by the scope of the TL Assistant (see
the Core Prompt and TL Assistant Prompt).

---

## Stale preferences

If `updated_at` is older than ~60 days, treat the stored
preferences as a hint, not a confirmed default. The
summary card should still appear with [نعم، نفس الشي] /
[غيّر], but include a small note:

"آخر تحديث للسياسات كان قبل [N] أسابيع. أكّد قبل ما نكمل."

This avoids silently applying outdated decisions after a
long pause.

---

## Related references

- For Board roles and trainee deployment → `special_groups.md`
- For the questions asked during scheduling → `workflows/create_weekly.md`
- For delegator and EX eligibility → `delegator_and_ex.md`
