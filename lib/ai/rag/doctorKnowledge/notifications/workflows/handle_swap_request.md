# Handle Incoming Swap Request (Doctor)

## When to use

Another doctor (or the staged PE/PS cascade broadcast)
sent a swap request to the Doctor. The request appears
as a **card on screen** plus a **chat entry**.

This workflow covers:
- How the card appears
- How to react when the Doctor accepts/rejects
- How to surface multiple concurrent requests
- How to handle expiration (24-hour timeout)

Approval here is between two consenting peers — no TL
involvement. Acceptance immediately swaps the slots
through the system.

---

## Required tools

- `get_pending_swap_requests(doctor_id)` — list all
  open requests targeting this Doctor.
- `accept_swap_request(request_id)` — accept and
  trigger the auto-swap.
- `reject_swap_request(request_id, reason?)` — decline.
- `get_doctor_schedule(self, date)` — verify the
  Doctor's availability before responding.
- `dismiss_swap_card(request_id)` — clear the card from
  screen.
- Templates from `sharedKnowledge/notifications/clinical/event_templates.md`:
  `schedule_changed` (swap variant, used after accept).
- The unified prompt: `sharedKnowledge/notifications/universal/notify_prompt.md`.

---

## How the card appears

Built from
`sharedKnowledge/notifications/clinical/reactive_templates.md → swap_request_received`:

```
┌──────────────────────────────────────────────┐
│ طلب تبديل من د.{from_name}                  │
│ يبي يبدّل فترته بـ {requester_slot}          │
│ مع فترتك بـ {candidate_slot}                 │
│ المهله: {hours_remaining} ساعه               │
│                                              │
│ [قبول] [رفض]                                 │
└──────────────────────────────────────────────┘
```

If the request is a **broadcast** (one of many), the
card shows the same content but the "قبول" button is
labeled "قبول (أول من يقبل يأخذ التبديل)".

A count badge above the card stack shows pending swap
requests. If multiple requests target the same slot,
each gets its own card — the Doctor handles them
independently.

---

## Steps

### When the Doctor taps [قبول]

1. Re-check eligibility via
   `get_doctor_schedule(self, both_dates)` — make sure
   the Doctor is free on the date being received and
   that nothing changed since the card was shown.

2. Call `accept_swap_request(request_id)`. The system:
   - Swaps the two slots atomically
   - Marks any other concurrent requests for the same
     source slot as `lost_race` (for broadcasts)
   - Records both schedule changes

3. Call `dismiss_swap_card(request_id)`.

4. Confirm: "تم. صرت بفتره {new_period} يوم {new_day}
   بدل {old_period} {old_day}."

5. Apply the unified `notify_prompt`:
   ```
   تم التبديل. أعلِم أحد؟
   [المعنيّين فقط (د.{other_name})] [أفراد محددين]
   [القروب (+ التريني)] [كل المركز] [لا داعي]
   ```
   Use `schedule_changed` template (swap variant) text.

**Note:** the other doctor automatically receives a
system notification of the completed swap regardless
of the Doctor's notify_prompt choice — that is part of
the swap mechanism (`swap_completed` event), not the
awareness layer.

### When the Doctor taps [رفض]

1. Optionally ask for a one-line reason (skip if the
   Doctor doesn't want to give one).

2. Call `reject_swap_request(request_id, reason?)`.

3. Call `dismiss_swap_card(request_id)`.

4. Confirm: "تم الرفض. د.{from_name} راح يستلم إشعار
   بالرفض."

5. No notify_prompt — rejection is a private
   peer-to-peer decision.

### When the Doctor asks about a request in chat

1. The Doctor might say "شو طلب د.أحمد؟", "اقبل طلب
   د.أحمد", "ارفض كلهم".

2. If asking for details: pull from
   `get_pending_swap_requests` and show the same card
   content as a chat reply, with options.

3. If asking to accept by name: confirm first
   ("أكّد، أقبل طلب د.أحمد على {slot}؟" [نعم] [لا]),
   then run the accept flow.

4. If asking to reject all: confirm
   ("أرفض كل طلبات التبديل المعلّقه ({N} طلب)؟"
   [نعم] [لا]), then loop.

### When a request expires (24-hour timeout)

The card auto-dismisses. No Doctor action needed. The
sender is informed by the system. If the Doctor opens
the app after expiry and asks "وين طلب د.أحمد؟",
reply: "انتهت مهله الطلب. ما اتخذت إجراء، فالطلب
انتهى تلقائياً."

### When the Doctor ignores the cards

The cards remain on screen until accepted, rejected,
or expired. They do NOT auto-dismiss on app close. The
badge keeps the count visible.

---

## Edge cases

- **Two requests target the same slot of the Doctor.**
  Each gets its own card. If the Doctor accepts the
  first, the second card auto-updates to
  "(انتهت — السلوت أُخذت)" and dismisses on next open.

- **Doctor accepted a broadcast, but another doctor
  already won the race.** The accept call returns
  `lost_race`. Confirm: "ما اتم التبديل — طبيب ثاني
  قبل قبلك. الطلب أُغلق."

- **Request from a doctor in another clinic.** Should
  not happen (system enforces clinic scope), but if it
  does, decline and log internally.

- **Request for a slot the Doctor doesn't have.** Same
  — system error. Decline gracefully.

- **Doctor wants to negotiate (counter-offer).** Out of
  scope. Direct them: "لو تبي تقترح فتره ثانيه، ارفض
  هذا الطلب وابعت طلب جديد من شاشه التبديل."

- **Doctor is on leave at the time of the offered
  slot.** Inform clearly: "تاريخ التبديل ({date})
  أنت {leave_type} فيه. ما يصير قبول."

---

## Common mistakes to avoid

- Do NOT accept silently from a chat request — always
  confirm before calling `accept_swap_request`.
- Do NOT skip the eligibility re-check before accept.
  State may have changed since the card was shown.
- Do NOT include the rejection reason in any public
  notification — it stays between sender and Doctor.
- Do NOT auto-fire the `notify_prompt` on rejection.
  Reject is private.
- Do NOT keep the card on screen after a confirmed
  action. Always dismiss.

---

## Example conversation — accept via card

```
[Card on screen: د.أحمد requests swap of his P3 Sunday
 for your P3 Monday. 22 hours remaining.]

[Doctor opens app, sees badge "1" and the card.]

Doctor: [يضغط: قبول]

AI: [internal: get_doctor_schedule(self, [Sunday, Monday])
     → confirms availability]
    [internal: accept_swap_request(request_id)
     → success]
    [internal: dismiss_swap_card(request_id)]

AI: تم. صرت بفتره P3 الأحد بدل P3 الإثنين.

AI: أعلِم أحد؟
    [المعنيّين فقط (د.أحمد)] [أفراد محددين]
    [القروب (+ التريني)] [كل المركز] [لا داعي]

Doctor: [لا داعي]

AI: تم.
```

---

## Example conversation — reject via chat

```
Doctor: ارفض طلب د.أحمد

AI: أكّد، أرفض طلب د.أحمد على فتره الأحد P3؟
    [نعم، ارفض] [لا، ألغِ]

Doctor: [نعم، ارفض]

AI: [internal: reject_swap_request(request_id)]
    [internal: dismiss_swap_card(request_id)]

AI: تم الرفض. د.أحمد راح يستلم إشعار.
```

---

## Related references

- For the card template → `sharedKnowledge/notifications/clinical/reactive_templates.md`
- For sending swap requests → `../../schedule/workflows/request_swap.md`
- For PE/PS that triggered the staged cascade (the upstream side) → `../../schedule/workflows/submit_absence.md`
- For the unified prompt → `sharedKnowledge/notifications/universal/notify_prompt.md`
- For reacting to other proactive events → `react_to_system_event.md`
