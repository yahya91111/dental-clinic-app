# Request Swap (Doctor) — Named Target Only

## When to use

The Doctor wants to swap one of their slots with a
**specific named colleague** in the same clinic. The
request goes 1-to-1; that colleague accepts or rejects
within 24 hours.

**Scope of this workflow**

- Same-day swap only — both slots must be on the same
  day. Cross-day swaps do not exist in this system.
- Named target only — the Doctor names exactly one
  colleague.

**When NOT to use this workflow**

- If the Doctor wants to leave a period and the AI
  should find someone → use `submit_absence.md`
  (PE/PS auto-cascade).
- If the Doctor wants to broadcast without naming a
  target → that is the auto-cascade flow in
  `submit_absence.md`, not here.

This workflow exists for the direct case: "بدّلني مع
د.أحمد" — the Doctor knows who they want, the AI
coordinates the approval.

---

## Required tools

- `get_doctor_schedule(doctor_id, date_or_range)` —
  read the Doctor's slots.
- `get_clinic_doctors(clinic_id)` — verify the named
  target is in the same clinic.
- `find_swap_candidates(slot_id, target_period)` —
  confirm the named target holds a swappable slot on
  the same day.
- `send_swap_request(slot_id, to_doctor_id,
  timeout_minutes=1440)` — 1-to-1 request.
- The unified prompt: `sharedKnowledge/notifications/universal/notify_prompt.md`.

---

## Steps

### Phase 1 — Identify the source slot and target

1. Parse the Doctor's message for:
   - The slot they want to give up (day + period)
   - The named target colleague
   - The target's slot on the SAME DAY (the period
     they will receive in exchange)

2. If any of these is missing, ask. Default questions:
   - "أي فتره تبي تبدّلها؟ [P1] [P2] [P3] [P4]"
   - "أي يوم؟ [الأحد] [الإثنين] ..."
   - "مع مين؟" (Doctor types the name.)
   - "مع أي فتره من د.{name} نفس اليوم؟ [P1] [P2] [P3] [P4]"

3. Read the source slot with `get_doctor_schedule` and
   confirm the Doctor actually has it. If not: "ما
   عندك فتره {period} يوم {day}، تأكّد من الجدول."

### Phase 2 — Verify the target

1. Verify the target is in the same clinic via
   `get_clinic_doctors`. If not in clinic, decline:
   "د.{name} مو بنفس المركز، ما يصير تبديل."

2. Verify the target holds the named period on the
   SAME DAY via
   `find_swap_candidates(slot_id, target_period)`.
   If the target is not in the returned list, decline:
   "د.{name} ما عنده فتره {target_period} يوم {day}.
   اختر فتره ثانيه أو طبيب ثاني."

3. If the target is on leave that day, inform:
   "د.{name} على {leave_type} يوم {day}. اختر طبيب
   ثاني." Do not proceed.

### Phase 3 — Confirm and send

1. State the plan as a clear two-line diff:
   ```
   أنت: {your_period} يوم {day} → {target_period}
   د.{name}: {target_period} يوم {day} → {your_period}
   ```
   Then: "أبعت الطلب لـ د.{name}. عنده 24 ساعه يقبل
   أو يرفض. أكمل؟"
   [نعم] [لا]

2. On confirmation, call `send_swap_request(slot_id,
   target_id, 1440)`.

3. Confirm: "تم إرسال الطلب لـ د.{name}. راح أعلمك
   لما يرد أو لما تنتهي المهله."

### Phase 4 — Apply notify_prompt

After sending, apply the unified `notify_prompt`:

```
تم إرسال الطلب. أعلِم أحد ثاني؟
[المعنيّين فقط (د.{name})] [أفراد محددين]
[القروب (+ التريني)] [كل المركز] [لا داعي]
```

For an explicit 1-to-1 request, the target is the
sole `المعنيّين فقط`. The Doctor may also widen to
the group or clinic if context warrants.

---

## Edge cases

- **Doctor names a colleague who doesn't exist or is
  in another clinic.** Decline as in Phase 2.

- **Doctor names a colleague on leave that day.**
  Decline as in Phase 2.

- **Doctor names themselves.** Decline briefly: "ما
  يصير تبديل مع نفسك."

- **Doctor names a target but doesn't say which period
  to receive.** Ask explicitly: "مع أي فتره من
  د.{name}؟"

- **The target's slot is on a different day.** Decline:
  "التبديل يكون بنفس اليوم فقط. د.{name} عنده
  {target_period} يوم {other_day}، مو يوم {day}."

- **Doctor has multiple outstanding requests for the
  same slot.** Inform: "عندك طلب مفتوح على فتره
  {day} {period}. ألغي القديم قبل ما أبعت جديد؟"
  [نعم، ألغِ] [لا، احتفظ].

- **Source slot already past.** Decline: "تاريخ ماضي،
  ما يصير تبديل."

- **Doctor wants to cancel an outstanding request.**
  Not part of this workflow — direct them: "إلغاء
  الطلب من شاشه الطلبات المفتوحه."

- **Auto-swap on accept.** When the target accepts (in
  `handle_swap_request.md`), the slots swap atomically
  with no further confirmation from either side. The
  Doctor sees the result on next interaction.

- **Doctor wants to swap but doesn't know with whom.**
  This is not this workflow. Direct them: "لو ما تعرف
  مع مين، قدّم استئذان وأنا أتولّى البحث."

---

## Common mistakes to avoid

- Do NOT broadcast in this workflow. Broadcasting (and
  the cascade) lives in `submit_absence.md`. If the
  Doctor doesn't name a target, send them to
  `submit_absence.md`.
- Do NOT swap across days. Refuse if the source and
  target slots are on different days.
- Do NOT include the Doctor themselves in any candidate
  list.
- Do NOT include doctors from other clinics, even if
  the Doctor knows them.
- Do NOT promise the swap will succeed — only that the
  request was sent.
- Do NOT chain another swap request automatically if
  the target rejects. The Doctor decides what to try
  next (e.g., name a different colleague, or fall back
  to `submit_absence.md`).

---

## Example conversation — named-target swap

```
Doctor: بدّلني P3 الأحد مع د.أحمد على P4

AI: [internal: get_doctor_schedule(self, Sunday)
     → confirms P3 Sunday is the Doctor's slot]
    [internal: find_swap_candidates(slot_id, 'P4')
     → confirms د.أحمد holds P4 Sunday and is eligible]

AI: التبديل المقترح:
    أنت: P3 الأحد → P4
    د.أحمد: P4 الأحد → P3

    أبعت الطلب لـ د.أحمد. عنده 24 ساعه يقبل أو يرفض.
    أكمل؟
    [نعم] [لا]

Doctor: [نعم]

AI: [internal: send_swap_request(self_slot_id,
     ahmad_id, 1440)]

AI: تم إرسال الطلب لـ د.أحمد.

AI: أعلِم أحد ثاني؟
    [المعنيّين فقط (د.أحمد)] [أفراد محددين]
    [القروب (+ التريني)] [كل المركز] [لا داعي]

Doctor: [لا داعي]

AI: تم.
```

---

## Example conversation — Doctor doesn't know who

```
Doctor: بدّلني P4 الخميس مع أي أحد

AI: لو تبي بحث تلقائي على أطباء فترات ثانيه، الأفضل
    تقدّم استئذان وأنا أتولّى البحث بنمط التسلسل
    (P3 → P2 → P1). تبي أحوّل لتقديم استئذان؟
    [نعم، قدّم استئذان] [لا، خلّيها]

Doctor: [نعم، قدّم استئذان]

AI: [hands off to submit_absence.md flow with type=PE]
```

---

## Related references

- For the unified prompt → `sharedKnowledge/notifications/universal/notify_prompt.md`
- For incoming swap responses → `../../notifications/workflows/handle_swap_request.md`
- For the auto-cascade flow (broadcast without naming) → `submit_absence.md`
- For how the TL handles swap-on-behalf → `teamLeaderKnowledge/schedule/workflows/swap_on_behalf.md`
