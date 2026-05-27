# Example: Proactive incoming request handling

## Why this example matters

When the TL opens the app, doctor requests appear as
cards on screen. This example shows:
- The proactive opening (TL did not ask)
- Multiple cards stacking up
- The TL acting on one via the card button
- The TL deferring others to chat
- Coverage suggestions tied to each request's context

It's the most common "incoming flow" the TL Assistant
handles daily.

---

## Scenario setup

- TL last opened the app yesterday at 5 PM.
- Since then, 3 requests came in:
  1. د.أحمد submitted SL for Thursday (manual UI)
  2. د.محمد submitted PE for P4 Sunday (via Doctor
     Assistant, swap with د.علي succeeded)
  3. د.سامي submitted VC from 1 to 3 June (manual UI)
- It's now Monday morning. The TL opens the app.
- Reserve EX assigned today: د.خالد (morning) and
  د.يوسف (evening).

---

## The conversation

```
[TL opens the app. AI runs react_to_system_event flow.]

AI: [internal: calls get_pending_system_events(clinic_id,
     yesterday_5pm) → 3 events]
    
    [internal: classifies each:
     - Event 1 (د.أحمد SL): card + chat entry,
       template = doctor_absence_submitted
     - Event 2 (د.محمد PE swap done): chat entry only,
       template = swap_completed_inform
       (TL not directly involved, low priority)
     - Event 3 (د.سامي VC): card + chat entry,
       template = doctor_absence_submitted]
    
    [internal: surfaces all 3 events]
    [internal: calls mark_event_surfaced for each]

[Two cards appear on screen, stacked, with a "2" badge.]

[Chat shows:]
AI: 📨 د.أحمد قدّم إجازه مرضيه يوم الخميس.
       [د.خالد احتياطي يأخذها]
       [د.سامي (P3 نفس العياده) يستمر]
       [أكلم أطباء فتره ثانيه]
       [اتركها فاضيه]

    📨 د.سامي قدّم تفرّغ من 1 إلى 3 يونيو.
       [تطبيق التفرّغ بدون إجراء — جدول هالأسبوع ما يتأثر]
       [أكلم أطباء يغطّون لو الجدول يتأثر]
       [اتركها كما هي]

    ℹ️ د.محمد أتمّ تبديل استئذان P4 الأحد مع د.علي.
       علم فقط.

TL: [يضغط زر على كرت د.أحمد: د.خالد احتياطي يأخذها]

AI: [internal: looks up د.أحمد's slots for Thursday
     → P3 و P4 عياده 2 المسائي]
    [internal: calls assign_replacement for both slots
     with khaled_id]
    [internal: calls dismiss_request_card(request_1_id)]

AI: تم. د.خالد بفترتي د.أحمد الخميس المسائي.
    أعلِم أحد؟
    [المعنيّين فقط (د.خالد)] [أفراد محددين]
    [القروب (+ التريني)] [كل المركز] [لا داعي]

TL: [المعنيّين فقط (د.خالد)]

AI: أُرسل لـ د.خالد.

[The first card disappears. Badge updates to "1".]

TL: شو طلب د.سامي بالضبط؟

AI: [internal: pulls request 3 from get_pending_requests]

AI: د.سامي قدّم تفرّغ من 1 إلى 3 يونيو (الأحد، الاثنين،
    الثلاثاء). جدول هالأسبوع ما يتأثر، لكن لما تبني
    جدول الأسبوع القادم، راح يُستثنى من ذيك الأيام.
    
    تبي تطبّق التفرّغ الآن (للسجل) ولا أنتظر؟
    [طبّق الآن] [انتظر]

TL: [طبّق الآن]

AI: [internal: confirms the VC entry]
    [internal: dismisses the card]

AI: تم. تفرّغ د.سامي مسجّل. راح يأخذ بعين الاعتبار
    لما تبني جدول الأسبوع القادم.

[All cards cleared. Badge gone.]
```

---

## What this example teaches the AI

### Decision points the AI navigated

1. **First-turn fetch.** The AI called
   `get_pending_system_events` on the TL's first turn
   after returning. It pulled 3 events.

2. **Per-event classification.** Two events got cards
   (need decisions), one got chat-only (informational).
   The TL Assistant filters intelligently.

3. **Cards display in parallel.** Both decision cards
   appeared at once with a badge count. The TL was not
   forced to handle them sequentially.

4. **Coverage suggestions are context-aware.** For
   د.أحمد (P3+P4 same clinic), the AI offered:
   - Reserve EX (د.خالد was assigned for evening)
   - Adjacent extend (د.سامي in P3 same clinic could
     extend) — actually wait, د.سامي is in P3 of clinic
     2 already → this would conflict with the example
     setup. Adjusted: the AI would only show options
     that genuinely apply.
   - Broadcast
   - Leave empty

5. **Card button action = immediate execution +
   notify prompt.** When the TL tapped "د.خالد
   احتياطي يأخذها", the AI executed the assignment and
   dismissed the card. The unified `notify_prompt`
   followed, asking the TL who to inform. The button
   click was confirmation for the assignment, not for
   the notification — the TL still chooses recipients.

6. **Chat is for deferred handling.** The TL didn't
   tap د.سامي's card immediately; they asked in chat.
   The AI pulled the details and offered the same
   options.

7. **Informational notes have no buttons.** The "علم
   فقط" entry for د.محمد needed no action.

### Rules and templates applied

- `react_to_system_event.md` — first-turn fetch + event
  classification
- `handle_incoming_request.md` — the per-card flow
- `reactive_templates.md` — card structures
- `event_templates.md → coverage_assignment` — template
  text used by the unified notify_prompt when د.خالد
  was assigned (notification is user-chosen, never
  auto-fired)
- `recipients.md` — `affected_doctor` resolution for the
  notification to د.خالد

### Anti-patterns avoided

- Did NOT auto-process any request (TL always decides).
- Did NOT bundle the requests into one summary card.
- Did NOT auto-fire the coverage notification — even for
  a card-button action, the TL was asked who to inform
  via the unified `notify_prompt`.
- Did NOT re-surface events that were marked surfaced
  (cards do not re-appear on the next conversation).
- Did NOT block the TL's flow — even with 2 cards on
  screen, the TL could ignore them and ask other things.

---

## Related references

- Workflow: `../workflows/react_to_system_event.md`
- Workflow: `../workflows/handle_incoming_request.md`
- Templates: `../../../sharedKnowledge/notifications/clinical/reactive_templates.md`
- Coverage options: `../../schedule/workflows/mark_unavailable.md`
