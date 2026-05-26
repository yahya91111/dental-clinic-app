# React to System Event (Team Leader)

## When to use

The system detected an event that the Team Leader Assistant
should surface to the TL. Examples:

- A doctor submitted an absence through the manual UI
  (without going through their Doctor Assistant).
- A doctor's Doctor Assistant marked an absence and the
  TL needs to know.
- A scheduled swap completed and the TL was one of the
  involved doctors.
- A doctor's PE swap failed in the Doctor Assistant flow
  (no action required from TL; this is informational
  only).

This is the umbrella workflow for **proactive openings**:
the TL did not ask, but the AI sees something worth
surfacing.

The closely-related workflow `handle_incoming_request`
covers the specific case where the event is a doctor's
absence request that needs a coverage decision. This
workflow is the broader pattern.

---

## Required tools

- `get_pending_system_events(clinic_id, since_timestamp)`
  — fetches events that have not been surfaced to the TL
  yet (new since last interaction).
- `mark_event_surfaced(event_id)` — marks an event as
  surfaced so it does not repeat next session.
- Templates from `reactive_templates.md`.

---

## When to fetch events

Fetch on the **first turn** of any conversation with the
TL. The conversation engine calls
`get_pending_system_events` with the timestamp of the
TL's previous interaction. The returned list might be
empty (no news) or full (many events).

Do NOT re-fetch within the same conversation unless the
TL takes an action that might trigger a new event.

---

## Event types and how to react

### Doctor absence (any source)

Whether the doctor used the manual UI, their Doctor
Assistant, or a future Requests page, the event arrives
the same way: an absence record was created for a
doctor in the clinic.

**Reaction:**
1. Build the card per `doctor_absence_submitted` template
   in `reactive_templates.md`.
2. Surface the card on screen + chat entry.
3. Hand off to `handle_incoming_request.md` for the
   coverage flow when the TL acts.

### Swap completed (doctor-to-doctor)

A swap finished between two doctors. The TL is not the
direct actor, but might want awareness — especially if
the swap involved a Source A flow the TL initiated, or
if the schedule is impacted in a way the TL should know.

**Reaction:**
1. Build a brief chat entry per `swap_completed_inform`
   template, but **only if the TL was originally involved**
   (initiated the broadcast, or is one of the two
   doctors). Do not surface routine doctor-to-doctor swaps
   the TL never touched.
2. No card (low-priority info), chat only.
3. Mark the event surfaced.

### Schedule-published push (echo)

When the TL publishes a schedule and the
`schedule_published` notification fires, doctors receive
it via their assistants. The TL Assistant does not need
to react further — the TL initiated the publish, so
they already know.

**Reaction:** none. This event type is filtered out for
the TL Assistant.

### Doctor's PE swap failed

When a doctor's Doctor Assistant tries to arrange a swap
for the doctor's PE and no one accepts, the permission is
not granted. The doctor works normally.

**Reaction:** none. The TL does not need to be informed
about a permission that never happened. This event type
is filtered out for the TL Assistant.

### Doctor's PE swap succeeded

The Doctor Assistant arranged a successful swap for the
doctor's PE.

**Reaction:**
1. Build a brief chat entry per `swap_completed_inform`.
2. Card only if the TL is one of the two doctors or
   if the swap altered the TL's clinic in a notable way.
3. Mark surfaced.

---

## Steps

1. On the first turn of any TL conversation, call
   `get_pending_system_events(clinic_id, last_timestamp)`.

2. For each returned event, apply the matching reaction
   rule above. Skip filtered events.

3. For events that produce a card, build the card from
   the matching template in `reactive_templates.md` and
   surface it on screen. Add the chat entry.

4. Call `mark_event_surfaced(event_id)` for each surfaced
   or intentionally-filtered event so it does not repeat.

5. If multiple events qualify for cards, surface all of
   them. The badge count reflects the total. The TL
   handles each independently.

6. After surfacing, continue with whatever the TL came
   in to do. Do NOT block the TL's main intent on
   handling cards first.

---

## Edge cases

- **The TL ignores all cards and asks for something
  else.** Honor the TL's request. The cards stay open
  for later. Do not nag.

- **An event arrives mid-conversation** (e.g., the TL is
  building a schedule and a new absence request lands).
  Surface the new card with a brief one-line interrupt:
  "📨 وصلك طلب جديد من د.{name}. أكمل معاك أو نوقف؟"
  Then let the TL decide.

- **The same event appears twice in
  `get_pending_system_events`** (race condition). Use
  the event ID for idempotency. Surface once.

- **An event references a doctor not in the clinic
  anymore** (e.g., moved). Skip the event silently and
  log internally.

- **`get_pending_system_events` fails or returns an
  error.** Continue with the TL's main intent, no
  cards. The events will be retrieved next turn.

---

## Common mistakes to avoid

- Do not re-surface an event the TL already saw. Use
  `mark_event_surfaced` reliably.
- Do not bundle different event types into one card.
- Do not auto-act on any event. Cards are decisions for
  the TL.
- Do not surface routine doctor-to-doctor swaps the TL
  never touched. Filter them out.
- Do not open cards during cosmetic interactions (e.g.,
  the TL just opening the app and immediately closing).
  Only surface on real conversational turns.

---

## Example conversation

```
[TL opens the app. Three events are pending:
 - د.أحمد submitted SL (manual UI)
 - د.محمد's Doctor Assistant completed a PE swap
 - Routine doctor-to-doctor swap (not involving TL)]

AI: [internal: calls get_pending_system_events()]
    → 3 events
    [internal: filters routine swap → skipped]
    [internal: builds card for د.أحمد SL]
    [internal: builds chat entry for د.محمد PE
     (no card — TL not involved)]
    [internal: marks all 3 as surfaced]

AI (proactive):
  📨 د.أحمد قدّم إجازه مرضيه يوم الخميس.
     [د.خالد احتياطي يأخذها]
     [د.سامي (P3 نفس العياده) يستمر]
     [أكلم أطباء فتره ثانيه]
     [اتركها فاضيه]

  ℹ️ د.محمد أتمّ تبديل استئذان P4 الأحد مع د.علي.
     علم فقط.

TL: [يضغط: د.خالد احتياطي يأخذها]

[Hands off to handle_incoming_request flow...]
```

---

## Related references

- For the card templates → `sharedKnowledge/notifications/clinical/reactive_templates.md`
- For handling absence requests specifically → `handle_incoming_request.md`
- For the underlying coverage actions → `../../schedule/workflows/mark_unavailable.md`
- For sending notifications back out (event-driven) → `sharedKnowledge/notifications/clinical/event_templates.md`
