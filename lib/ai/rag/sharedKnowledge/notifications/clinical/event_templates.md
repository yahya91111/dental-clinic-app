# Event Notification Templates (Clinical Tier)

## Purpose

Templates that supply the **text** of notifications fired
by clinical actions. Each template defines:
- The trigger action it pairs with
- The text pattern (with placeholders)
- Suggested recipient defaults (informational only —
  the actual recipients come from the user's pick in
  the `notify_prompt`)

**Key architectural rule:** all clinical notifications
are **optional and user-chosen** via the unified
`notify_prompt` (see `../universal/notify_prompt.md`).
This file does NOT define when a notification fires; it
defines what the text looks like when one does.

This file is read by clinical-tier assistants: Doctor,
Team Leader, Board. Management-tier templates live in
`management/event_templates.md`.

---

## Template format

```
## <template_id>
- Trigger action: <which workflow action pairs with this>
- Suggested via: notify_prompt (default for all)
- Text: <pattern with {placeholders}>
- Notes: <constraints, privacy rules, edge cases>
```

---

## schedule_published

- **Trigger action:** `create_weekly` workflow, after the
  TL confirms and saves the schedule.
- **Suggested via:** `notify_prompt`. Typical pick:
  `كل المركز`.
- **Text:**
  ```
  تم نشر جدول الأسبوع بتاريخ {week_start_date}.
  للاطلاع، افتح صفحه الجدول.
  ```
- **Notes:** Use this template only on a **first
  publish** of a given week. Subsequent edits use
  `schedule_changed`.

---

## schedule_changed

- **Trigger action:** any edit to a published schedule
  (`edit_slot`, `copy_day` overwriting, manual UI edit
  captured as `manual_schedule_edit`, swap captured as
  `manual_swap` or `swap_on_behalf`).
- **Suggested via:** `notify_prompt`. Typical pick for a
  small change: `المعنيّين فقط`. For a large rewrite:
  `كل المركز`.
- **Text (single-slot edit):**
  ```
  تم تعديل دوامك. الجديد: {new_slot}.
  ```
- **Text (swap variant — sent per doctor):**
  ```
  تم تبديل دوامك مع د.{other_doctor}.
  دوامك الجديد: {new_slot}.
  ```
- **Notes:** The "swap variant" is used by both
  AI-driven and manual swaps. When sending to the
  pair, build two messages (one per doctor) with
  the right `{other_doctor}` and `{new_slot}` in
  each.

---

## tl_absence_recorded

- **Trigger action:** `mark_unavailable` for the TL
  themselves (Source A), or `manual_tl_absence` event
  (Source C).
- **Suggested via:** `notify_prompt`. Typical pick:
  `القروب (+ التريني)`.
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
- **Notes:** Never mention medical detail or reason.

---

## doctor_absence_recorded

- **Trigger action:** any non-TL doctor's absence is
  saved. Sources:
  - **Source A** — TL submits on behalf of a doctor.
  - **Source B** — Doctor Assistant saves the absence
    for its own user.
  - **Source C** — Manual UI absence (captured by DB
    trigger).
- **Suggested via:** `notify_prompt`. Typical pick:
  `القروب (+ التريني)`.
- **Text (PE/PS):**
  ```
  د.{doctor_name} مستأذن {period} يوم {day} {date}.
  ```
- **Text (SL):**
  ```
  د.{doctor_name} على إجازه مرضيه يوم {day} {date}.
  ```
- **Text (VC):**
  ```
  د.{doctor_name} على تفرّغ من {start_date} إلى
  {end_date}.
  ```
- **Notes:**
  - Never include medical detail or reason.
  - Coverage is a separate concern (`mark_unavailable`).
    This template is purely informational ("غايب"), not
    a coverage request.
  - The absent doctor is excluded from the recipient
    list (they already know).

---

## coverage_assignment

- **Trigger action:** any coverage decision in
  `mark_unavailable` (adjacent extend, reserve EX,
  neighbor relay), or `manual_ex_assignment` event
  (Source C).
- **Suggested via:** `notify_prompt`. Typical pick:
  `المعنيّ فقط` (the doctor being assigned).
- **Text:**
  ```
  أُسندت إليك تغطيه فتره {period} عياده {room} يوم
  {day} (تغطيه غياب د.{absent_doctor}).
  ```
- **Notes:** The covering doctor needs to know they
  have a new slot, but the decision is still the TL's
  via the prompt. If the TL picks `لا داعي`, the doctor
  will not be informed — the TL accepts that risk
  (usually because the team already knows in person).

---

## announcement_sent

- **Trigger action:** `send_announcement` workflow.
- **Suggested via:** **NOT** via `notify_prompt`. The
  announcement workflow has its own audience selection
  built in (audience is the whole point of an
  announcement). Use this template inside that workflow
  only.
- **Text:** verbatim from the TL, or AI-rewritten per
  the TL's choice in the workflow. No additional
  wrapping.
- **Notes:** This is the template for the TL-composed
  text itself, not a meta-notice about it. There is no
  "an announcement was sent" follow-up notification.

---

## Notes for assistants

- Always reference templates by ID when handling an
  action ("apply template `schedule_changed`").
- The template defines **only the text**. Recipients
  are resolved at send time from the user's
  `notify_prompt` pick.
- Variables in `{braces}` are filled from the action
  context. Never send with unresolved placeholders.
- If an action has no matching template, flag the gap
  and ask the user. Do not improvise a template.

---

## Related references

- For the unified prompt that drives all sends → `../universal/notify_prompt.md`
- For recipient resolution keys → `recipients.md`
- For card-based templates (system-detected events) → `reactive_templates.md`
- For tone → `../universal/tone.md`
- For principles → `../universal/principles.md`
