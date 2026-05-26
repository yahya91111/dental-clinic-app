# Handle Incoming Request (Team Leader)

## When to use

A doctor in the clinic has submitted a request that the
Team Leader needs to see and act on. Examples:
- Sick leave (SL)
- Vacation (VC)
- End-of-shift permission (PE)
- Start-of-shift permission (PS)

Each request arrives as a **card on the TL's screen** plus
a **chat entry** in the TL Assistant. The card shows
suggested actions as buttons. This workflow defines what
the AI does when the TL interacts with the card or asks
about it in chat.

Approval/rejection of requests is **out of scope for now**
— it will be added later via the Requests page. For now,
the TL sees the request and decides how to handle the
clinical-coverage consequences. The request itself goes
through whether or not the TL acts.

---

## Required tools

- `get_pending_requests(clinic_id)` — list all incoming
  requests not yet acted on. Returns an array of request
  objects: `{ id, doctor_id, type, dates, period?, status }`.
- `get_clinic_doctors(clinic_id)` — needed for coverage
  suggestions.
- `ask_tl_choice(question, options[])` — for option menus.
- Coverage tools from `mark_unavailable.md`:
  `get_ex_doctor`, `find_swap_candidates`,
  `broadcast_swap_request`, `assign_replacement`,
  slot-update tools.
- `dismiss_request_card(request_id)` — clears the card
  from the TL's screen after action (the underlying
  request data remains in the system).

---

## How the card appears

When a request arrives, the TL Assistant surfaces it as a
card on screen. The card content is built from
`reactive_templates.md → doctor_absence_submitted`:

```
┌─────────────────────────────────────────────┐
│ طلب غياب من د.{doctor_name}                │
│ {type_arabic} يوم {day} {date} {period?}   │
│                                             │
│ [coverage_option_1]                         │
│ [coverage_option_2]                         │
│ ...                                         │
│ [اتركها فاضيه] [افتح المحادثه]              │
└─────────────────────────────────────────────┘
```

A count badge above the card stack shows the number of
pending requests. If multiple requests are pending, **one
card per request** is displayed (stacked or scrollable —
UI decision). In chat, the requests appear as a list so
the TL can return to any of them later.

---

## Steps

### When the TL taps a button on the card

1. The button corresponds to a coverage option from
   `mark_unavailable.md` (adjacent extend, reserve EX,
   neighbor relay, broadcast, leave empty).

2. Execute the chosen coverage action using the matching
   tool:
   - Adjacent extend → slot-update to extend the doctor.
   - Reserve EX → `assign_replacement(slot, reserve_id)`.
   - Neighbor relay → chain slot-updates for both clinics.
   - Broadcast → `find_swap_candidates` +
     `broadcast_swap_request(..., timeout_minutes=1440)`.
   - Leave empty → mark gap, no assignment.

3. Call `dismiss_request_card(request_id)` to clear the
   card from the TL's screen.

4. Apply the unified `notify_prompt` (see
   `sharedKnowledge/notifications/universal/notify_prompt.md`)
   using the `coverage_assignment` template text for the
   `المعنيّ` option:
   ```
   تم. د.{covering_doctor} بفترة د.{absent_doctor}.
   أعلِم أحد؟
   [المعنيّ (د.{covering_doctor})] [أفراد محددين]
   [القروب] [كل المركز] [لا داعي]
   ```
   Hide `المعنيّ` for the "leave empty" option (no one
   was assigned).

### When the TL asks about a request in chat

1. The TL might say things like:
   - "شو طلب د.أحمد؟"
   - "خلاص د.أحمد؟"
   - "عرض الطلبات"

2. If the TL asks for details on one specific request,
   load it from `get_pending_requests` and show its
   coverage options again as a button menu (same as the
   card).

3. If the TL asks for a list, show a numbered list:
   ```
   عندك 3 طلبات:
   1. د.أحمد — إجازه مرضيه الثلاثاء
   2. د.محمد — استئذان P4 الأحد
   3. د.سامي — تفرّغ من 1 إلى 3 يونيو

   أي وحده تبي تعالج؟
   ```

4. On TL pick, drop into the per-request flow above.

### When the TL ignores the cards

The cards remain on screen and in chat history. They do
NOT auto-dismiss. The system might add a stale-warning
visual after some hours, but that is a UI detail. The
underlying absence is already recorded — the cards are
about TL coverage decisions, not about acknowledging the
request.

---

## Edge cases

- **Multiple requests stack up overnight.** When the TL
  opens the app, all pending cards appear. The badge
  shows the count. The TL handles them one by one. The
  AI does NOT auto-process any.

- **A request is for a date already past.** Still show
  the card (it represents an absence that happened), but
  the only realistic option is "اتركها فاضيه" or after-
  the-fact assignment. Surface this in the card body:
  "(مضى — للسجل فقط)".

- **A request is for a date weeks ahead, before the
  schedule is built for that week.** Show a simplified
  card: "د.{name} مسجّل غياب يوم {date}. لما تبني جدول
  الأسبوع، راح يأخذ بعين الاعتبار." Only button:
  [اطّلعت].

- **Two requests collide on the same period (two doctors
  asking for PE on the same period).** The cards remain
  separate. The TL handles each independently. Coverage
  options might shrink (if one doctor takes the
  adjacent slot, the second can no longer use that
  option). The AI surfaces this when presenting the
  second card.

- **Request for a doctor the TL doesn't recognize.** Show
  the card anyway and let the TL choose options. The
  underlying clinic membership is verified by the system.

- **TL asks "ما عندك طلبات؟" when none are pending.**
  Reply: "ما فيه طلبات معلّقه."

---

## Common mistakes to avoid

- Do not auto-pick a coverage option. The TL always
  decides via the card buttons or the chat menu.
- Do not delete or hide the request when the card is
  dismissed. The card is a UI element; the request data
  stays.
- Do not bundle multiple requests into one "summary"
  card. One card per request.
- Do not ask the TL for approval/rejection of the
  request itself — that feature does not exist yet.
- Do not assume the TL will act immediately. Cards may
  stay open for days.

---

## Example conversation

```
[Three requests are pending when the TL opens the app.]
[Card 1 shows for د.أحمد SL Thursday, Card 2 for
 د.محمد PE Sunday P4, Card 3 for د.سامي VC June 1-3.]

AI (chat entry):
  📨 ثلاث طلبات معلّقه:
     1. د.أحمد — إجازه مرضيه الخميس
     2. د.محمد — استئذان P4 الأحد
     3. د.سامي — تفرّغ من 1 إلى 3 يونيو

TL: [يضغط زر على كرت د.أحمد: د.خالد احتياطي يأخذها]

AI: [internal: assigns د.خالد to د.أحمد's slots]
    [internal: dismisses the card]

AI: تم. د.خالد بفترات د.أحمد الخميس.
    أعلِم أحد؟
    [المعنيّ (د.خالد)] [أفراد محددين]
    [القروب] [كل المركز] [لا داعي]

TL: [المعنيّ (د.خالد)]

AI: أُرسل لـ د.خالد.
```

---

## Related references

- For coverage options (the buttons on each card) → `../../schedule/workflows/mark_unavailable.md`
- For card templates → `sharedKnowledge/notifications/clinical/reactive_templates.md`
- For the future Requests page (approval/rejection) → project memory `project_requests_page_future`
- For Notifications system overview → `react_to_system_event.md`
