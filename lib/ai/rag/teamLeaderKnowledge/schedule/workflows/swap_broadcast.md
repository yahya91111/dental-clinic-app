# Broadcast Swap (Team Leader for Self)

## When to use

The Team Leader wants to swap one of their own schedule slots
with another slot held by any of multiple eligible doctors.
The first doctor to accept wins the swap; the others are
silently cancelled.

Use this when:
- The TL is open to several candidates, not a specific doctor
- The TL wants the fastest possible result

Trigger phrases (examples):
- "ابي أبدّل دوامي الأحد P2 إلى P1"
- "بدّل فترتي مع أي طبيب بـ P1 الأحد"
- "broadcast swap my Sunday P2 with anyone in P1"

Do NOT use this workflow for:
- Swap with one specific doctor → use `swap_on_behalf`
- Editing a single slot without exchange → use `edit_slot`

---

## How the swap works

When a candidate accepts, the system performs an **atomic
exchange** between exactly two doctors:

- Doctor A (the TL) takes Doctor B's exact slot
  (same day, same period, same room)
- Doctor B takes Doctor A's exact slot
  (same day, same period, same room)

Both doctors keep all their other assignments unchanged.
This is a pure 1-to-1 swap. Coverage and group balance are
preserved automatically.

---

## Required tools

- `get_slot(week_start, day, period, room)` — read the TL's
  current slot.
- `find_swap_candidates(week_start, day, target_period, exclude_reduced_workload?)`
  — returns eligible doctors scheduled in the target period
  (filters out doctors on leave, permission, vacation, or
  with an active competing broadcast). Set
  `exclude_reduced_workload=true` when the target period is
  P2 or P4 and the swap would move the candidate into an
  end-of-shift period they cannot work.
- `broadcast_swap_request(from_slot_id, target_day, target_period, candidate_ids[], timeout_minutes)`
  — sends the swap request to all candidates atomically.
  `timeout_minutes` controls how long the request stays
  open. **Always use 1440 (24 hours)** — this matches the
  standard across the whole schedule system, including
  the PE/PS coverage flow in `mark_unavailable.md`.
- `cancel_swap_request(request_id)` — cancels a pending
  broadcast before any doctor accepts.

---

## Pre-flight checks

1. Identify the TL's **source slot**. Confirm it exists and
   is in the current or a future week (not historical).

2. Identify the **target** (day + period). The TL wants any
   slot in this target.

3. Call `find_swap_candidates(week_start, target_day, target_period, exclude_reduced_workload)`.
   Set `exclude_reduced_workload=true` if the TL's source
   slot is in P2 or P4 (the candidate would inherit a
   period a reduced-workload doctor cannot work).
   - If empty: inform the TL there are no eligible candidates.
   - If only one candidate: still use this workflow, but note
     to the user that there is just one possible match.

4. Confirm there is no active broadcast already pending for
   the same source slot. If yes, ask whether to cancel the
   old one first.

---

## Steps

1. Identify source slot and target (day + period). Ask for
   any missing detail.

2. Run the pre-flight checks above.

3. Present the candidate list and the action to the TL:
   "وجدت N أطباء بـ [target]. راح أرسل طلب تبديل لكلهم.
    أول واحد يوافق ياخذ دوامك بـ [source]، وأنت تاخذ دوامه.
    الباقي يتلغى تلقائياً.
    الطلب ينتهي بعد **24 ساعه** إذا ما حد قبل.
    متابع؟"

4. Wait for explicit confirmation.

5. Call `broadcast_swap_request(..., timeout_minutes=1440)`
   with all candidate IDs. The 24-hour window is the
   correct timeout for a TL-initiated open broadcast.

6. Inform the TL: "تم الإرسال لـ N أطباء. راح يصلك إشعار لما
   أحدهم يقبل، أو لما ينتهي الوقت."

---

## Lifecycle (after sending)

The TL retains full control after the request is sent:

- **Cancel anytime** — TL can ask to cancel; call
  `cancel_swap_request(request_id)`.
- **First acceptance wins** — handled by the database
  trigger, not by you. The atomic swap happens server-side.
- **Other candidates** — pending notifications are silently
  removed when one accepts. No message is sent to the losers.
- **24-hour expiry** — if no one accepts within 24 hours,
  the request is auto-cancelled. The TL gets a push
  notification: "انتهى وقت طلب التبديل، ما حد قبل."

Your role ends after step 6 unless the TL returns to ask
about status or to cancel.

---

## Edge cases

- **No eligible candidates**
  Inform the TL: "ما فيه أطباء مؤهلين بـ [target]." Do not
  send the request.

- **TL's source slot is empty**
  Cannot swap nothing. Decline and ask for clarification.

- **TL has an active broadcast for the same source slot**
  Ask: "فيه طلب تبديل سابق لنفس الفتره. ألغيه وأرسل الجديد؟"

- **Target period is the same as source period**
  Pointless swap. Ask: "تقصد فتره ثانيه غير P2؟"

- **TL asks to cancel after the request was sent but before
  any acceptance**
  Call `cancel_swap_request(request_id)`. Report: "تم إلغاء
  الطلب. الإشعارات اختفت من كل المرشحين."

- **TL asks about status mid-flight**
  You may report only what is observable (request still
  pending, request expired, request accepted by X). Do not
  speculate about who is likely to accept.

---

## Common mistakes to avoid

- Do not call `broadcast_swap_request` without explicit
  user confirmation.
- Do not invent candidate IDs. Use only IDs returned by
  `find_swap_candidates`.
- Do not act as the approver. Acceptance happens between
  the candidate and the system, not through you.
- Do not promise a specific candidate will accept, or rank
  them by likelihood.
- Do not silently retry a failed broadcast send. Report
  the failure and let the user decide.

---

## Example conversation

```
TL: ابي أبدّل دوامي الأحد P2 إلى P1

AI: [calls get_slot(this_week, sunday, P2, ...)] — TL has Sunday P2 room 1
    [calls find_swap_candidates(this_week, sunday, P1, exclude_reduced_workload=false)] — returns 3 candidates
    (no exclude flag needed: target P1 is start-of-shift, fine for everyone)

AI: وجدت 3 أطباء بـ P1 الأحد: د.أحمد، د.سامي، د.علي.
    راح أرسل طلب تبديل لكلهم. أول واحد يوافق ياخذ دوامك
    بـ P2 عياده 1، وأنت تاخذ دوامه بـ P1.
    الباقي يتلغى تلقائياً.
    الطلب ينتهي بعد 24 ساعه إذا ما حد قبل.

    متابع؟

TL: نعم

AI: [calls broadcast_swap_request(..., timeout_minutes=1440)]
    تم الإرسال لـ 3 أطباء. راح يصلك إشعار لما أحدهم يقبل.
```

**Cancellation example:**
```
TL: ألغي طلب التبديل الي أرسلته

AI: [calls cancel_swap_request(...)]
    تم إلغاء الطلب. الإشعارات اختفت من كل المرشحين.
```

**No candidates example:**
```
TL: بدّل الخميس P4 مع أي طبيب بـ P3

AI: [calls find_swap_candidates(this_week, thursday, P3, exclude_reduced_workload=false)] — empty

AI: ما فيه أطباء مؤهلين بـ P3 الخميس (الكل بإجازه أو
    عندهم طلبات تبديل أخرى). ما قدرت أرسل الطلب.
```
