# React to System Event (Doctor)

## When to use

The system detected an event the Doctor Assistant
should surface to the Doctor. Examples:

- Their schedule changed (manual edit by TL, swap on
  behalf, copy_day that overwrote their slots).
- A swap request arrived from another doctor.
- A swap they sent was accepted (or rejected, or
  expired).
- An announcement was sent to a group/clinic that
  includes them.
- A coverage was assigned to them by the TL.

This is the umbrella workflow for **proactive openings**:
the Doctor did not ask, but the AI sees something worth
surfacing.

Events come from the central `system_events` table (see
`sharedKnowledge/notifications/universal/system_events.md`).
All sources are treated uniformly here.

---

## Required tools

- `get_pending_system_events(doctor_id, since_timestamp)`
  — fetches events not yet surfaced to the Doctor.
- `mark_event_surfaced(event_id)` — marks an event as
  surfaced so it does not repeat next session.
- Templates from
  `sharedKnowledge/notifications/clinical/reactive_templates.md`.

---

## When to fetch events

Fetch on the **first turn** of any conversation with the
Doctor. The conversation engine calls
`get_pending_system_events` with the timestamp of the
Doctor's previous interaction. The returned list might be
empty (no news) or full (many events).

Do NOT re-fetch within the same conversation unless the
Doctor takes an action that might trigger a new event
(e.g., accepting a swap that completes immediately).

---

## Event types and how to react

### `schedule_changed` — affecting the Doctor

The Doctor's slot was edited (by the TL, via swap, via
manual UI edit). The Doctor needs to know.

**Reaction:**
1. Surface as a card per
   `reactive_templates.md → schedule_changed_inform`.
2. No action buttons — purely informational.
3. Chat entry: "📅 جدولك اتغيّر. فتره {old} صارت
   {new}."
4. Mark surfaced.

### `swap_request_received` — incoming swap

Another doctor wants to swap with the Doctor.

**Reaction:**
1. Build the card per
   `reactive_templates.md → swap_request_received`.
2. Surface on screen with [اقبل] [ارفض] buttons.
3. Hand off to `handle_swap_request.md` when the Doctor
   acts.
4. Mark surfaced when acted on (or on next session if
   ignored — but the card itself stays open).

### `swap_completed` — Doctor was a party

A swap the Doctor sent or received completed
(auto-swapped).

**Reaction:**
1. Chat entry: "✅ تبديلك مع د.{other} تم. فترتك
   الجديده: {new_slot}."
2. No card — already done, no decision needed.
3. Mark surfaced.

### `swap_rejected` — Doctor was the sender

A specific swap request the Doctor sent was rejected.

**Reaction:**
1. Chat entry: "❌ د.{name} رفض طلب التبديل على
   {slot}."
2. No card.
3. Mark surfaced.

### `swap_expired` — Doctor was the sender

A swap request the Doctor sent timed out without
acceptance.

**Reaction:**
1. Chat entry: "⏱️ انتهت مهله طلب التبديل على
   {slot}. ما قبل أحد."
2. No card.
3. Mark surfaced.

### `coverage_assigned` — Doctor is the assignee

The TL assigned the Doctor to a coverage slot (EX,
adjacent extend, neighbor relay) to cover for an
absent colleague.

**Reaction:**
1. Surface as a card per
   `reactive_templates.md → coverage_assigned_inform`.
2. Buttons: [اطّلعت] only — no rejection (TL authority).
3. Chat entry: "🆘 أُسندت إليك تغطيه {period} يوم
   {day} (غياب د.{absent})."
4. Mark surfaced.

### `announcement_received` — TL or higher sent an
announcement to a group/clinic the Doctor belongs to.

**Reaction:**
1. Surface as a card per
   `reactive_templates.md → announcement_received`.
2. Body: the announcement text verbatim.
3. Button: [اطّلعت].
4. Mark surfaced.

### `schedule_published_inform` — new weekly schedule

A new weekly schedule was published that includes the
Doctor.

**Reaction:**
1. Chat entry: "📅 جدول أسبوع {week_start} اتنشر.
   افتح صفحه الجدول للتفاصيل."
2. No card.
3. Mark surfaced.

### Events NOT relevant to the Doctor

Filter out events the Doctor has no stake in:
- Schedule edits not affecting the Doctor's slots
- Absences of other doctors in different groups
- Coverage assignments to other doctors
- TL-internal events

Mark them surfaced silently so they don't re-appear.

---

## Steps

1. On the first turn of any Doctor conversation, call
   `get_pending_system_events(doctor_id, last_timestamp)`.

2. For each returned event, apply the matching reaction
   rule above. Skip filtered events.

3. For events that produce a card, build the card from
   the matching template and surface it on screen. Add
   the chat entry.

4. Call `mark_event_surfaced(event_id)` for each
   surfaced or intentionally-filtered event.

5. If multiple events qualify for cards, surface all of
   them. The badge count reflects the total.

6. After surfacing, continue with whatever the Doctor
   came in to do. Do NOT block the Doctor's main intent
   on handling cards first.

---

## Edge cases

- **Doctor ignores all cards and asks for something
  else.** Honor the Doctor's request. The cards stay
  open for later.

- **An event arrives mid-conversation** (e.g., another
  doctor accepts the Doctor's broadcast while the
  Doctor is chatting). Surface a brief one-line
  interrupt: "✅ تم تبديلك مع د.{name}. أكمل معاك؟"
  Then let the Doctor decide.

- **The same event appears twice in
  `get_pending_system_events`** (race condition). Use
  the event ID for idempotency. Surface once.

- **An event references a doctor who left the clinic.**
  Show the historical name from the event payload, no
  link. Mark surfaced.

- **`get_pending_system_events` fails.** Continue with
  the Doctor's main intent, no cards. Events will be
  retrieved next turn.

---

## Common mistakes to avoid

- Do NOT re-surface an event the Doctor already saw.
- Do NOT bundle different event types into one card.
- Do NOT auto-act on any event. Coverage is the only
  exception, and even that is decided by the TL — the
  Doctor just gets informed.
- Do NOT surface events about other doctors that don't
  affect the Doctor (privacy + noise).
- Do NOT open cards during cosmetic interactions (e.g.,
  the Doctor just opening the app and immediately
  closing). Only surface on real conversational turns.

---

## Example conversation

```
[Doctor opens the app. Three events pending:
 - Swap from د.أحمد (incoming request)
 - Swap completed with د.خالد (sent yesterday, accepted)
 - Schedule published for next week]

AI: [internal: calls get_pending_system_events()
     → 3 events]
    [internal: builds card for د.أحمد's swap request]
    [internal: builds chat entries for the other two]
    [internal: marks all 3 surfaced]

AI (proactive):
  ✅ تبديلك مع د.خالد على فتره الإثنين P3 تم.

  📅 جدول أسبوع 31 مايو اتنشر. افتح صفحه الجدول.

  [Card on screen:]
  📨 طلب تبديل من د.أحمد
      P3 الأحد مقابل فترتك P3 الإثنين
      [اقبل] [ارفض] [افتح المحادثه]
      المهله: 23 ساعه

Doctor: [يضغط: اقبل]

[Hands off to handle_swap_request.md flow...]
```

---

## Related references

- For the card templates → `sharedKnowledge/notifications/clinical/reactive_templates.md`
- For handling swap requests specifically → `handle_swap_request.md`
- For the database-trigger mechanism → `sharedKnowledge/notifications/universal/system_events.md`
- For the unified prompt applied to Doctor's own actions → `sharedKnowledge/notifications/universal/notify_prompt.md`
