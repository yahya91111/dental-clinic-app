# Reactive Notification Templates (Clinical Tier)

## Purpose

Templates for notifications produced by the assistant in
response to a **system-detected event**, not a user
action inside an active workflow.

Examples of system-detected events:
- A doctor submits an absence through the manual UI
  (no Doctor Assistant involved).
- A doctor's Doctor Assistant submits an absence and the
  TL Assistant must inform the TL.
- A schedule slot becomes empty for any reason and the
  affected group needs to know.
- An incoming swap request arrives for a doctor.

The assistant detects these events and **opens a card**
in the recipient's UI plus a chat entry. The TL or doctor
sees the card on screen and can act on it from the chat
later.

This file is read by clinical-tier assistants: Doctor,
Team Leader, Board.

---

## Template format

Each template defines:
- Trigger event (what the system detects)
- Card display (what shows on the recipient's screen)
- Chat entry (what gets logged in the chat for later)
- Suggested actions (buttons inside the card)

```
## <template_id>
- Trigger: <system event>
- Card title: <short headline>
- Card body: <one or two short lines>
- Buttons: <list of suggested actions>
- Chat entry: <how it appears in the assistant's chat>
- Recipient assistant: <whose assistant surfaces it>
```

---

## doctor_absence_submitted

- **Trigger:** Any doctor (other than the TL themselves)
  submits an SL, VC, PS, or PE through any channel:
  manual UI, Doctor Assistant, or future Requests page.
- **Card title:** "طلب غياب من د.{doctor_name}"
- **Card body:**
  ```
  {type_arabic} يوم {day} {date}{period_if_pe_or_ps}.
  ```
  Examples:
  - "إجازه مرضيه يوم الثلاثاء 28 مايو."
  - "استئذان نهايه دوام يوم الأحد 26 مايو (P4)."
- **Buttons:** Context-aware coverage suggestions, plus
  "افتح المحادثه للتفاصيل":
  - For SL/VC: [د.{reserve} يأخذها] [د.{adjacent} يستمر] [أكلم أطباء فتره ثانيه] [اتركها فاضيه]
  - For PE/PS: usually [Got it] only (the Doctor Assistant
    handled coverage on its side)
- **Chat entry:**
  ```
  📨 د.{doctor_name} قدّم {type_arabic} يوم {day}.
     [نفس أزرار الكرت بالمحادثه]
  ```
- **Recipient assistant:** Team Leader Assistant only.
  Doctor Assistant does NOT surface other doctors'
  absences.

---

## swap_request_received

- **Trigger:** A `broadcast_swap_request` arrives for a
  candidate doctor.
- **Card title:** "طلب تبديل من د.{requester_name}"
- **Card body:**
  ```
  يبي يبدّل فترته بـ {requester_slot} مع فترتك بـ
  {candidate_slot}.
  المهله: {hours_remaining} ساعه.
  ```
- **Buttons:** [قبول] [رفض]
- **Chat entry:**
  ```
  📨 طلب تبديل من د.{requester_name}.
     {brief_summary}
     [قبول] [رفض]
  ```
- **Recipient assistant:** Doctor Assistant of each
  candidate (the Doctor Assistant has not been built
  yet; this template is the contract for when it is).

---

## swap_completed_inform

- **Trigger:** A swap completes (any source — Doctor
  Assistant cascade, TL on-behalf swap, or open
  broadcast).
- **Card title:** "تم تبديل دوامك"
- **Card body:**
  ```
  دوامك الجديد: {new_slot}.
  بدّلت مع د.{other_doctor}.
  ```
- **Buttons:** [Got it]
- **Chat entry:**
  ```
  ✅ تم تبديل دوامك مع د.{other_doctor}.
     الجديد: {new_slot}.
  ```
- **Recipient assistant:** Doctor Assistant of each
  affected doctor. The TL Assistant also surfaces this
  to the TL if the TL was one of the two doctors or if
  the swap was on-behalf.

---

## coverage_assigned_inform

- **Trigger:** The TL picks a coverage option that
  assigns another doctor to a vacated slot (via the
  options menu in `mark_unavailable`).
- **Card title:** "أُسندت إليك فتره إضافيه"
- **Card body:**
  ```
  {period} عياده {room} يوم {day}.
  تغطيه غياب د.{absent_doctor}.
  ```
- **Buttons:** [Got it]
- **Chat entry:**
  ```
  ➕ أضيفت إليك فتره {period} عياده {room} يوم {day}
     (تغطيه د.{absent_doctor}).
  ```
- **Recipient assistant:** Doctor Assistant of the
  assigned doctor.

---

## schedule_changed_inform

- **Trigger:** A doctor's schedule slot is modified after
  publication — by a TL manual UI edit, an `edit_slot`
  workflow, a `copy_day` overwrite, or any other
  non-swap schedule change that affects the doctor.
  (Swaps use `swap_completed_inform` instead.)
- **Card title:** "تم تعديل دوامك"
- **Card body:**
  ```
  الفتره القديمه: {old_slot}.
  الفتره الجديده: {new_slot}.
  ```
  If the slot was removed entirely without a replacement,
  show:
  ```
  أُلغيت فترتك بـ {old_slot}.
  ```
- **Buttons:** [Got it]
- **Chat entry:**
  ```
  📅 جدولك اتغيّر. {old_slot} → {new_slot}.
  ```
- **Recipient assistant:** Doctor Assistant of the
  affected doctor.

---

## announcement_received

- **Trigger:** A TL (or higher role in the future) sends
  an announcement to a group or clinic that includes the
  doctor.
- **Card title:** "تعميم جديد"
- **Card body:**
  ```
  {announcement_text}
  ```
  (The full text of the announcement, verbatim.)
- **Buttons:** [Got it]
- **Chat entry:**
  ```
  📢 تعميم من د.{sender_name}:
     {announcement_text}
  ```
- **Recipient assistant:** Doctor Assistant of each
  recipient in the resolved audience.

---

## schedule_published_inform

- **Trigger:** A new weekly schedule becomes available
  in the system, AND the TL chose to send the
  notification (from the `schedule_published` event
  template).
- **Card title:** "جدول الأسبوع جاهز"
- **Card body:**
  ```
  جدول أسبوع {week_start_date} منشور.
  للاطلاع، افتح صفحه الجدول.
  ```
- **Buttons:** [افتح الجدول] [Got it]
- **Chat entry:**
  ```
  📅 جدول أسبوع {week_start_date} جاهز.
  ```
- **Recipient assistant:** Doctor Assistant of each
  clinic doctor.

---

## Detection mechanism

The exact way each assistant becomes aware of these
events is defined at the integration layer (database
triggers, push notifications, polling, etc.). From the
RAG's perspective:

- When the assistant gains a turn with the user, it
  checks for pending reactive events.
- For each pending event, it instantiates the matching
  template from this file.
- It surfaces the card on screen AND logs the chat
  entry.
- If multiple events are pending, each gets its own
  card (one per card) and its own chat entry.

The count badge above the cards shows the number of
pending reactive notifications the user has not yet
acted on.

---

## Related references

- For event-driven (action-triggered) templates → `event_templates.md`
- For recipient resolution → `recipients.md`
- For tone → `../universal/tone.md`
- For the workflow that handles incoming requests → `teamLeaderKnowledge/notifications/workflows/handle_incoming_request.md`
- For the workflow that reacts to detected events → `teamLeaderKnowledge/notifications/workflows/react_to_system_event.md`
