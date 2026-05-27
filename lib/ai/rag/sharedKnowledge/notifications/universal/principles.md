# Notification Principles (Universal)

## Purpose

This file defines the universal principles every assistant
must follow when sending or surfacing notifications.
Read by ALL assistants (Doctor, Team Leader, Coordinator,
Regional Manager) regardless of role.

Role-specific behavior lives in each role's notifications
folder. Tier-specific templates live in `clinical/` or
`management/`.

---

## The two-aspect architecture

Every assistant operates as a single brain with two
distinct functional aspects. The two never overlap inside
a single decision step.

**Operational aspect — runs the work**
- Proposes context-aware solutions for the action at hand
  (e.g., the coverage options menu when a slot becomes
  empty: adjacent extend / reserve EX / neighbor relay /
  broadcast / leave empty).
- Takes the user's pick.
- Executes on the system.

Lives in: schedule workflows, schedule rules, role-specific
workflow files.

**Informational aspect — handles communication**
- Asks who to inform AFTER the action completes (the
  unified `notify_prompt` with five options).
- Surfaces incoming events the user cares about (reactive
  cards).
- Sends announcements when the user composes them.

Lives in: `sharedKnowledge/notifications/`.

**Handoff contract**
Every workflow ends by handing off from the operational
aspect to the informational aspect. The operational
aspect does not decide who to notify; the informational
aspect does not decide what to do. The boundary is sharp:
solve → execute → ask who to inform.

This separation prevents future contradictions. When
adding a new workflow, place operational steps in the
workflow file and end with a notify_prompt reference —
do not embed notification recipient logic in the
workflow.

---

## All notifications are user-chosen

The current Phase 1 architecture treats every awareness
notification as **optional and user-chosen** via the
unified `notify_prompt` (see `notify_prompt.md`):

```
تم [إجراء]. أعلِم أحد؟
[المعنيّين فقط] [أفراد محددين]
[القروب] [كل المركز] [لا داعي]
```

The user picks one. The AI never auto-fires an awareness
notification.

Rationale: clinical actions happen in person — the
notification is a record-keeping aid, not the channel
through which information actually travels. The user
judges whether it adds value in context.

The only exceptions:
- **Reactive cards** that surface incoming events to the
  user are READ-only; the AI is presenting, not sending.
- **`send_announcement`** workflow has its own audience
  selection (the announcement IS the notification).
- **Future Requests page** introduces mandatory
  notifications for formal approval/rejection — that
  flow is separate and not yet built (see below).

## Future: hybrid optional + mandatory model

The notification system will evolve into a hybrid model.
The current optional model (Phase 1) will continue, and
a second class of **mandatory** notifications will be
added alongside it when the Requests page ships.

**Optional notifications (Phase 1, today)**
- Triggered by the unified `notify_prompt` after any
  notable action.
- The user picks from five options including `لا داعي`.
- Used for awareness: "the work happened, do you want
  others to know?"

**Mandatory notifications (Phase 2, future)**
- Triggered by formal requests submitted through the
  Requests page (e.g., a doctor submits an SL request
  that requires TL approval).
- The TL receives an unskippable notification with
  approve/reject buttons.
- The TL must act on it; there is no "لا داعي" option.
- Used for governance: "this requires your decision."

The two classes coexist. The same TL can receive both
an optional awareness notification ("د.أحمد بدّل مع
د.خالد") and a mandatory request notification ("د.سامي
يطلب موافقتك على استئذان P4 الخميس"). The mandatory
class lives in its own future folder
(`sharedKnowledge/notifications/requests/`) and does not
use the `notify_prompt`.

This file documents only the **optional** class. The
mandatory class will be documented when built.

## The Golden Rule still applies

Even with the unified prompt, every notification send is
a write action. The prompt itself IS the confirmation
step. The AI never sends before the user picks an
option; `لا داعي` is a valid pick that means "do not
send".

---

## Scope is binding

Notifications respect the same scope as every other action:

- A Team Leader cannot send to another clinic's doctors.
- A Doctor cannot send a broadcast at all (their notifications
  are 1-to-1 with the TL or with the system).
- A Coordinator can send across their assigned clinics, no
  further.
- A Regional Manager can send across their region, no further.

If the requested audience falls outside the user's scope,
the AI declines briefly and explains the limit.

---

## Privacy and minimum disclosure

Notifications carry only what the recipient needs to know:

- An absence notice names the absent doctor and date, NOT
  the medical detail of the leave.
- A swap notice names the two doctors and the affected
  slots, NOT the reason behind the swap.
- A schedule-published notice points to the schedule,
  NOT a doctor-by-doctor breakdown.
- An incoming request card shows the request type and the
  immediate context, NOT private chat history.

When in doubt, send less. The user can always ask
follow-up questions.

---

## One subject, one notification

Each notification covers one event. The AI does NOT bundle
unrelated subjects into a single message (e.g., do not
combine "schedule published" with "Dr. X is on leave" in
the same notification).

If multiple notifications would fire at the same time,
they are sent as separate messages. The user-facing UI
can group them visually, but the data layer keeps them
distinct.

---

## Idempotency

Sending the same notification twice for the same event is
wrong. Before sending, the AI checks whether an equivalent
notification was already sent for this event. If yes, it
skips and tells the user briefly: "تم إرسال هذا الإشعار
سابقاً، ما تكرّر."

---

## Format consistency

Notification text follows the formal style defined in
`tone.md`. Use the templates in `event_templates.md` or
`reactive_templates.md` as the source of truth. Do not
improvise unless explicitly told to rewrite (and even then,
preserve the structure).

---

## Related references

- For the unified question pattern → `notify_prompt.md`
- For database-triggered events → `system_events.md`
- For the formal tone → `tone.md`
- For event templates (text patterns) → `clinical/event_templates.md` or `management/event_templates.md`
- For reactive templates (system-detected) → `clinical/reactive_templates.md`
- For recipient resolution → `clinical/recipients.md`
