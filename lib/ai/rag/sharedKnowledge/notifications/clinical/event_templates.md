# Event Notification Templates (Clinical Tier)

## Purpose

Templates for notifications triggered by a **user action**
inside a workflow. When a workflow reaches a point that
should produce a notification, it looks up the relevant
template here and applies it.

Each template defines:
- The trigger (which workflow step fires it)
- The recipients (resolved via `recipients.md`)
- The text pattern
- Whether the AI asks before sending

This file is read by clinical-tier assistants: Doctor,
Team Leader, Board. Management-tier templates live in
`management/event_templates.md`.

---

## Template format

Each template uses this shape:

```
## <template_id>
- Trigger: <which workflow step>
- Confirm before sending: <yes/no — almost always yes>
- Recipients: <key from recipients.md>
- Text: <pattern with {placeholders}>
- Notes: <edge cases or constraints>
```

---

## schedule_published

- **Trigger:** `create_weekly` workflow, after the TL
  reviews the draft and just before `confirm_weekly_schedule`.
- **Confirm before sending:** yes — ask the TL
  "أبعت إشعار للأطباء؟" [نعم] [لا].
- **Recipients:** `all_clinic_doctors` (key in recipients.md).
- **Text:**
  ```
  تم نشر جدول الأسبوع بتاريخ {week_start_date}.
  للاطلاع، افتح صفحه الجدول.
  ```
- **Notes:** Only fires on the FIRST publish of a given
  week. Re-edits to an already-published schedule use the
  `schedule_changed` template below.

---

## schedule_changed

- **Trigger:** any workflow that edits a published
  schedule (`edit_slot`, `copy_day` to an existing week,
  `swap_on_behalf`).
- **Confirm before sending:** yes — but the question is
  per workflow (e.g., `swap_on_behalf` already has its
  own).
- **Recipients:** depends on the workflow:
  - `swap_on_behalf` → the two affected doctors only
  - `edit_slot` → the affected doctor (old + new)
  - `copy_day` overwriting → all clinic doctors
- **Text (for swap):**
  ```
  تم تبديل دوامك مع د.{other_doctor}.
  دوامك الجديد: {new_slot}.
  ```
- **Text (for single-slot edit):**
  ```
  تم تعديل دوامك. الجديد: {new_slot}.
  ```

---

## tl_absence_recorded

- **Trigger:** `mark_unavailable` for the TL themselves
  (Source A), after the absence is saved.
- **Confirm before sending:** yes — ask "أبعت إشعار
  لقروبك؟" [نعم] [لا].
- **Recipients:** `tl_group_with_trainees` (TL's primary
  group plus the linked trainee group, if any).
- **Text (PE/PS):**
  ```
  التيم ليدر د.{tl_name} مستأذن {period} يوم
  {day} {date}.
  ```
- **Text (SL):**
  ```
  التيم ليدر د.{tl_name} على إجازه مرضيه يوم
  {day} {date}.
  ```
- **Text (VC):**
  ```
  التيم ليدر د.{tl_name} على تفرّغ من {start_date}
  إلى {end_date}.
  ```
- **Notes:** No mention of medical detail or reason.

---

## announcement_sent

- **Trigger:** `send_announcement` workflow, after the
  TL confirms the audience and text.
- **Confirm before sending:** yes — the workflow's normal
  confirmation step.
- **Recipients:** chosen by the TL during the workflow
  (any of `all_clinic_doctors`, `specific_group`, or
  `specific_doctors`).
- **Text:** verbatim from the TL, or AI-rewritten per the
  TL's choice in the workflow. No additional wrapping.
- **Notes:** This is the template used for the
  TL-composed text itself, not a system message about
  it. There is no "an announcement was sent" meta-notice.

---

## coverage_assignment

- **Trigger:** `mark_unavailable` Source A or Source B,
  after the TL picks a coverage option (adjacent extend,
  reserve EX, neighbor relay) and the AI assigns it.
- **Confirm before sending:** no — coverage assignment
  notification is implicit in the coverage action. The
  TL already confirmed the assignment; the affected
  doctor needs to know about their new slot. Send
  automatically.
- **Recipients:** the doctor(s) whose schedule changed
  (one or two doctors depending on the option chosen).
- **Text:**
  ```
  أُسندت إليك تغطيه فتره {period} عياده {room} يوم
  {day} (تغطيه غياب د.{absent_doctor}).
  ```
- **Notes:** This is one of the few templates that fires
  without a [نعم/لا] question — the TL's option pick
  serves as the confirmation. Without notifying the
  doctor, they would not know they have a new slot.

---

## Notes for assistants

- Always reference templates by ID when handling a
  workflow step ("apply template `schedule_published`").
- If a workflow needs a notification not listed here,
  flag the gap and ask the user. Do not improvise a new
  template silently.
- Variables in `{braces}` are filled by the AI from the
  current context. Never send a notification with
  unresolved placeholders.

---

## Related references

- For recipient resolution → `recipients.md`
- For reactive (system-detected) templates → `reactive_templates.md`
- For tone → `../universal/tone.md`
- For principles → `../universal/principles.md`
