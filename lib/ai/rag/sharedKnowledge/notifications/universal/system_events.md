# System Events — Database-Triggered Notifications

## Purpose

Defines how D.C.M captures **actions that happen outside
the AI** (manual UI changes, scheduled jobs, integrations)
and surfaces them to the right assistant at the next
opportunity.

Without this layer, manual actions would be invisible to
the AI — a TL who swaps two doctors from the schedule
page would leave the AI ignorant of the change, and no
notifications would fire.

This file is read by all assistants. The mechanism applies
universally; the per-event response lives in each role's
`react_to_system_event.md` workflow.

---

## The three sources of action

Every change in D.C.M comes from one of three sources:

- **Source A** — User talks to their assistant, the AI
  executes a write tool. The assistant is fully aware
  and can fire notifications inline.
- **Source B** — A different user's assistant performs
  the action (e.g., Doctor Assistant submits a swap
  request that affects the TL). The acting assistant
  fires its own notifications; the TL's assistant only
  needs to surface what arrived.
- **Source C** — User performs the action manually on
  the UI without involving any assistant (e.g., TL
  drags-and-drops a doctor into a slot from the schedule
  page). No assistant is in the loop at the moment of
  action.

This file is mainly about **Source C**, but the
mechanism it describes also handles **Source B** events
when they arrive at the recipient.

---

## The `system_events` table

Every write that should notify someone — regardless of
source — leaves a trace in a central table:

```
system_events
├── id
├── event_type        ('manual_swap', 'manual_absence',
│                      'schedule_edit', 'coverage_assigned',
│                      ...)
├── clinic_id         (scope)
├── actor_id          (who performed the action)
├── actor_role        ('team_leader', 'doctor', 'system')
├── source            ('assistant', 'manual_ui', 'system_job')
├── payload           (JSONB — affected doctors, slot,
│                     period, day, etc.)
├── created_at
├── surfaced_to       (array of user_ids who have already
│                     been shown this event)
└── status            ('pending', 'surfaced', 'dismissed')
```

### Who writes to it

- **Source A:** the AI tool writes the event as part of
  its execution.
- **Source B:** the acting assistant's tool writes it.
- **Source C:** a **Supabase database trigger** on the
  underlying table (e.g., `schedule_slots`, `absences`)
  writes it automatically.

The database trigger is the key piece that closes the gap
for manual UI actions.

---

## Database trigger pattern

For each table that supports manual edits, a trigger
catches `INSERT`/`UPDATE`/`DELETE` and writes a row to
`system_events`. Example shape (illustrative — actual
SQL lives in the migrations):

```sql
CREATE TRIGGER schedule_slots_to_events
AFTER INSERT OR UPDATE OR DELETE ON schedule_slots
FOR EACH ROW
EXECUTE FUNCTION log_to_system_events();
```

The trigger function:
1. Identifies the actor (`auth.uid()`).
2. Inspects the change (NEW vs OLD).
3. Classifies the event type (`manual_swap`,
   `manual_absence`, `manual_ex_assignment`, etc.).
4. Builds the payload (which doctor, which slot, which
   day).
5. Inserts into `system_events` with
   `source = 'manual_ui'`.

If the change came from an assistant tool, the tool sets
a session flag the trigger reads to set
`source = 'assistant'` instead — preventing duplicate
events.

---

## How assistants consume events

At the start of each user session (or on each first turn
after a gap), the assistant calls:

```
get_pending_system_events(clinic_id, since_timestamp)
```

The tool returns events the user has not yet been shown
(based on `surfaced_to`).

The assistant then runs its role-specific
`react_to_system_event.md` workflow:
- **Classify** each event by type and relevance.
- **Decide** whether to render a card, a chat line, or
  filter it.
- **Fire** any outgoing notifications (e.g., a
  `manual_swap` event triggers `schedule_changed` to the
  two affected doctors, if not already sent).
- **Mark** events as surfaced (`mark_event_surfaced`) so
  they do not re-appear next session.

---

## Idempotency

Two safeguards prevent double-notification:

1. **Per-event flag.** When an assistant fires a
   notification for an event, the event row records
   which notifications have been emitted. A second
   assistant session that sees the same event does not
   re-fire.
2. **Source flag.** Events written by an assistant tool
   carry `source = 'assistant'`. If that same assistant
   already sent the notification inline, the event row
   is marked `notifications_emitted = true` immediately,
   so other assistants will not re-emit.

The rule: **an action produces one notification per
recipient, regardless of how many assistants encounter
the event row.**

---

## Event types (clinical tier)

These are the event types currently defined for clinical
assistants. Management-tier events live in
`management/system_events.md` when built.

Each event type pairs with a **suggested template** —
the text the AI uses if the user picks any non-`لا داعي`
option in the unified `notify_prompt`. Templates are
**suggestions**, not auto-fires. The user always
decides via the prompt.

| event_type | Trigger | Suggested template |
|---|---|---|
| `manual_swap` | TL or doctor swaps two slots via UI | `schedule_changed` (swap variant) |
| `manual_absence` | Doctor marks own absence via UI | `doctor_absence_recorded` |
| `manual_tl_absence` | TL marks own absence via UI | `tl_absence_recorded` |
| `manual_ex_assignment` | TL assigns a doctor to EX via UI | `coverage_assignment` |
| `manual_schedule_edit` | TL edits a single slot via UI | `schedule_changed` (single-slot variant) |
| `schedule_published_manual` | TL publishes schedule via UI button | `schedule_published` |
| `swap_request_received` | Doctor sends swap request to another doctor | (reactive card flow, not awareness prompt) |
| `swap_completed` | Both doctors accepted a swap | `schedule_changed` (swap variant) |

New event types are added to this table as new UI
actions or system jobs are introduced.

For the unified prompt itself → `notify_prompt.md`.

---

## Why this design

- **Single source of truth.** Every change passes
  through the database. The trigger guarantees nothing
  is missed regardless of who acted.
- **AI doesn't need to be online.** The system records
  events even when no assistant session is active. The
  assistant catches up on next open.
- **Manual and AI-driven actions are equal citizens.**
  A doctor swapped via UI is indistinguishable from a
  doctor swapped via assistant in terms of notification
  behavior — both reach the recipient.
- **Extensible.** Adding a new manual action only
  requires (1) the database trigger and (2) entries in
  the table above. No assistant code changes.

---

## Related references

- For the unified prompt that decides recipients →
  `notify_prompt.md`
- For per-event response logic → each role's
  `react_to_system_event.md`
- For notification templates (text only) →
  `../clinical/event_templates.md`,
  `../clinical/reactive_templates.md`
- For recipient resolution → `../clinical/recipients.md`
