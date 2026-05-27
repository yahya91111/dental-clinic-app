# Request Swap (Doctor)

## When to use

The Doctor wants to swap one of their own slots with
another doctor in the same clinic. Two modes:

- **Specific** — the Doctor names the target colleague.
  The request goes 1-to-1, that colleague accepts or
  rejects within 24 hours.
- **Broadcast** — the Doctor doesn't name anyone. The
  request fires to all eligible colleagues; the first
  to accept wins.

The Doctor can swap across periods or across shifts
(morning/evening), not only within the same period.
The AI helps identify candidates accordingly.

This workflow is for **explicit swap requests**. The
implicit PE/PS broadcast from `submit_absence.md` is a
separate flow that runs automatically without entering
here.

---

## Required tools

- `get_doctor_schedule(doctor_id, date_or_range)` —
  read the Doctor's slots.
- `get_clinic_doctors(clinic_id)` — list candidates.
- `find_swap_candidates(slot_id, scope)` — filter
  eligible doctors. `scope` can be `'same_period'`,
  `'all_periods'`, or `'all_shifts'`.
- `send_swap_request(from_slot, to_doctor_id,
  timeout_minutes=1440)` — 1-to-1 request.
- `broadcast_swap_request(from_slot, candidate_ids,
  timeout_minutes=1440)` — 1-to-many request.
- The unified prompt: `sharedKnowledge/notifications/universal/notify_prompt.md`.

---

## Steps

### Phase 1 — Identify the slot to swap

1. Parse the Doctor's message for:
   - The slot they want to give up (day + period)
   - The target doctor (named, or "broadcast")
   - Optional: a specific slot they want in return

2. If any of these is missing, ask. Default questions:
   - "أي فتره تبي تبدّلها؟ [P1] [P2] [P3] [P4]"
   - "أي يوم؟ [الأحد] [الإثنين] ..."
   - "مع مين؟ [طبيب معيّن] [broadcast لكل المؤهلين]"

3. Read the slot with `get_doctor_schedule` and confirm
   the Doctor actually has it. If not: "ما عندك فتره
   {period} يوم {day}، تأكّد من الجدول."

### Phase 2 — Resolve the target

**If specific doctor:**
1. Verify the target is in the same clinic via
   `get_clinic_doctors`. If not in clinic, decline:
   "د.{name} مو بنفس المركز، ما يصير تبديل."
2. Verify the target has a swappable slot or is free
   to take the slot. Use `find_swap_candidates` filtered
   by name to confirm eligibility.

**If broadcast:**
1. Ask the Doctor the scope:
   "broadcast لمين؟
    [نفس الفتره فقط] [كل الفترات] [كل الشفتات]"
2. Call `find_swap_candidates(slot_id, scope)` to get
   the candidate list.
3. Show the count: "لقيت {N} طبيب مؤهل."

### Phase 3 — Confirm and send

1. State the plan clearly:
   - Specific: "أبعت طلب تبديل لـ د.{name} على فتره
     {day} {period}. عنده 24 ساعه يقبل أو يرفض. أكمل؟"
   - Broadcast: "أبعت طلب لـ {N} أطباء على فتره
     {day} {period}. أول واحد يقبل، يصير التبديل.
     المهله 24 ساعه. أكمل؟"

2. On confirmation:
   - Specific → `send_swap_request(...)`
   - Broadcast → `broadcast_swap_request(...)`

3. Confirm in one short line:
   - "تم إرسال الطلب لـ د.{name}."
   - "تم إرسال الطلب لـ {N} أطباء."

### Phase 4 — Apply notify_prompt

After sending, apply the unified `notify_prompt`:

```
تم. أعلِم أحد ثاني؟
[المعنيّين فقط]      ← redundant for broadcast (already sent to them); useful for specific (other interested parties)
[أفراد محددين]
[القروب (+ التريني)]
[كل المركز]
[لا داعي]
```

**Note:** for a broadcast that already reached the
whole group, `لا داعي` is the most common pick.

---

## Edge cases

- **Doctor names a colleague who doesn't exist or is in
  another clinic.** Decline with the same message as in
  Phase 2.

- **Doctor names a colleague on leave that day.** Inform:
  "د.{name} على {leave_type} يوم {day}. اختر طبيب
  ثاني أو broadcast." Do NOT proceed.

- **Doctor names themselves.** Decline with humor-free
  brevity: "ما يصير تبديل مع نفسك."

- **Broadcast returns zero candidates.** Inform: "ما
  فيه أطباء مؤهلين للتبديل بهالفتره. جرّب فتره ثانيه
  أو كلّم التيم ليدر."

- **Doctor has multiple outstanding requests for the
  same slot.** Inform: "عندك طلب مفتوح على فتره
  {day} {period}. ألغي القديم قبل ما أبعت جديد؟"
  [نعم، ألغِ] [لا، احتفظ].

- **Slot already past.** Decline: "تاريخ ماضي، ما يصير
  تبديل."

- **Doctor wants to cancel an outstanding request.**
  Not part of this workflow — direct them: "إلغاء
  الطلب من شاشه الطلبات المفتوحه."

- **Auto-swap on accept.** When the target accepts (in
  `handle_swap_request.md`), the slots swap automatically
  without further confirmation from either side. The
  Doctor sees this as a completed event next time they
  open the app.

---

## Common mistakes to avoid

- Do NOT swap silently. Always confirm before sending.
- Do NOT broadcast without asking the scope (same
  period / all periods / all shifts).
- Do NOT include the Doctor themselves in the
  candidate list.
- Do NOT include doctors from other clinics, even if
  the Doctor knows them.
- Do NOT promise the swap will succeed — only that the
  request was sent.
- Do NOT chain swap requests automatically if the first
  is rejected. The Doctor decides what to try next.

---

## Example conversation — specific swap

```
Doctor: بدّلني P3 الأحد مع د.أحمد

AI: [internal: get_doctor_schedule(self, Sunday)
     → confirms P3 Sunday is the Doctor's slot]
    [internal: find_swap_candidates(slot_id, by name
     'أحمد') → confirms د.أحمد is eligible]

AI: أبعت طلب تبديل لـ د.أحمد على فتره الأحد P3.
    عنده 24 ساعه يقبل أو يرفض. أكمل؟
    [نعم] [لا]

Doctor: [نعم]

AI: [internal: send_swap_request(self_slot_id,
     ahmad_id, 1440)]

AI: تم إرسال الطلب لـ د.أحمد.

AI: أعلِم أحد ثاني؟
    [المعنيّين فقط (د.أحمد)] [أفراد محددين]
    [القروب] [كل المركز] [لا داعي]

Doctor: [لا داعي]

AI: تم.
```

---

## Example conversation — broadcast

```
Doctor: بدّلوني P4 الخميس مع أي أحد

AI: [internal: get_doctor_schedule(self, Thursday)
     → confirms P4 Thursday]

AI: broadcast لمين؟
    [نفس الفتره فقط] [كل الفترات] [كل الشفتات]

Doctor: [كل الشفتات]

AI: [internal: find_swap_candidates(slot_id,
     'all_shifts') → 9 candidates]

AI: لقيت 9 أطباء مؤهلين. أبعت طلب لهم على فتره
    الخميس P4. أول واحد يقبل، يصير التبديل. المهله
    24 ساعه. أكمل؟
    [نعم] [لا]

Doctor: [نعم]

AI: [internal: broadcast_swap_request(slot_id,
     candidate_ids, 1440)]

AI: تم إرسال الطلب لـ 9 أطباء.

AI: أعلِم أحد ثاني؟
    [أفراد محددين] [القروب] [كل المركز] [لا داعي]

Doctor: [لا داعي]

AI: تم.
```

---

## Related references

- For the unified prompt → `sharedKnowledge/notifications/universal/notify_prompt.md`
- For incoming swap responses → `../../notifications/workflows/handle_swap_request.md`
- For PE/PS auto-broadcast (different flow) → `submit_absence.md`
- For how the TL sees swaps on behalf → `teamLeaderKnowledge/schedule/workflows/swap_on_behalf.md`
