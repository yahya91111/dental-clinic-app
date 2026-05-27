# Submit Absence (Doctor)

## When to use

The Doctor wants to record an absence on their own
schedule. Four types:

- **PE** — End-of-shift permission (يستأذن نهاية الدوام)
- **PS** — Start-of-shift permission (يستأذن بدايه الدوام)
- **SL** — Sick leave (إجازه مرضيه)
- **VC** — Vacation (تفرّغ)

The Doctor can submit any type at any time — no
calendar restrictions enforced by the AI. Validity
checks (advance notice, leave balance) happen at the
database/policy layer.

---

## Required tools

- `get_doctor_schedule(doctor_id, date_or_range)` — read
  the Doctor's slots for the affected day(s).
- `mark_doctor_absent(doctor_id, type, dates, period?)` —
  record the absence.
- `broadcast_swap_request(slot_id, candidate_ids,
  timeout_minutes=1440)` — fire the implicit swap
  broadcast for PE/PS (see auto-broadcast section).
- `find_swap_candidates(slot_id, scope)` — list
  eligible doctors for the broadcast.
- Templates from `sharedKnowledge/notifications/clinical/event_templates.md`:
  `doctor_absence_recorded`.
- The unified prompt: `sharedKnowledge/notifications/universal/notify_prompt.md`.

---

## Steps

### Phase 1 — Gather the absence details

1. Parse the Doctor's message for type, date(s), and
   period (if PE/PS).
   - If type is unclear, ask: "أي نوع؟ [PE] [PS] [SL] [VC]"
   - If date is unclear or relative ("بكره", "الأحد"),
     resolve to an absolute date and confirm.
   - If period is missing for PE/PS, ask: "أي فتره؟
     [P1] [P2] [P3] [P4]"
   - For VC, ask for a date range.

2. Read the relevant slot(s) with `get_doctor_schedule`
   to confirm the Doctor actually has work to mark
   absent. If the period has no slot, inform:
   "الفتره مو فترة عملك يوم {date}، ما فيه إجراء."
   and stop.

3. State the plan clearly and ask for confirmation:
   "أبي أسجّل {type_arabic} يوم {day} {date}
   {period?}. أكمل؟"
   [نعم] [لا]

### Phase 2 — Execute the marking

1. On confirmation, call `mark_doctor_absent(...)`.
2. Confirm in one short line: "سجّلت {type_arabic}
   يوم {day}."

### Phase 3 — Auto-broadcast (PE/PS only)

For PE or PS, immediately fire a swap broadcast WITHOUT
asking. This is the documented exception in the Doctor
Assistant prompt.

1. Call `find_swap_candidates(slot_id, scope='clinic')`
   to gather eligible doctors. Eligible = same clinic,
   not absent that period, not already in another slot
   at the same time.

2. **If `candidate_ids` is empty**, skip the broadcast
   call entirely and follow the "no eligible candidates"
   edge case at the bottom of this file:
   inform the Doctor and proceed to Phase 4.

3. Otherwise, call `broadcast_swap_request(slot_id,
   candidate_ids, timeout_minutes=1440)`.

4. Inform the Doctor in one line:
   "أبدأت طلب عام للتبديل. إذا قبل أحد خلال 24 ساعه،
   يصير تبديل تلقائي. إذا ما قبل أحد، الاستئذان يبقى
   والفتره فاضيه (التيم ليدر بيشوفها)."

For SL or VC, skip this phase — no broadcast.

### Phase 4 — Apply notify_prompt

Apply the unified `notify_prompt`:

```
تم. أعلِم أحد؟
[المعنيّين فقط]      ← hidden for SL/VC with no coverage; for PE/PS, refers to the broadcast recipients (which is the whole eligible group anyway → also typically hidden)
[أفراد محددين]
[القروب (+ التريني)]
[كل المركز]
[لا داعي]
```

Use the `doctor_absence_recorded` template text for the
notification body when the Doctor picks any non-`لا داعي`
option.

**Note on overlap with the auto-broadcast:** for PE/PS,
the broadcast already implicitly informs the eligible
group. The notify_prompt here is for a separate
*awareness* notification ("د.{name} مستأذن"). The
Doctor can pick `لا داعي` if they feel the broadcast
already covered awareness.

---

## Edge cases

- **Same-period double submission.** If the Doctor
  tries to mark PE for a period they already marked,
  reply: "الفتره {period} يوم {day} عندك {existing_type}
  مسجّل. تبي تعدّل النوع؟" [نعم، عدّل] [لا، ألغِ].

- **Submission for a past date.** Allowed but flag it:
  "هذا تاريخ ماضي ({date}). أسجّل للسجل فقط؟" [نعم] [لا].

- **VC spanning a weekend.** No special handling — the
  weekend is non-working, so the VC effectively covers
  only the working days within the range.

- **PE/PS with no eligible candidates for broadcast.**
  Skip the broadcast and inform: "ما فيه أطباء مؤهلين
  للتبديل بهالفتره. الاستئذان مسجّل والفتره راح تكون
  فاضيه."

- **PE/PS during a period the doctor is delegator or
  EX, not clinic doctor.** Skip the broadcast — no
  clinical slot to cover. Just mark and inform:
  "سجّلت استئذانك. كنت ديليقيتر/احتياطي، فما فيه
  فتره عياده تتغطّى."

- **SL retroactive (after the day passed).** Common
  scenario (got sick yesterday, recording today). Allow
  it. The reactive event will inform the TL as a
  surfaced card.

- **Doctor wants to cancel an absence.** Not part of
  this workflow. Direct them: "إلغاء الاستئذان يحتاج
  تواصل مع التيم ليدر."

---

## Common mistakes to avoid

- Do NOT ask the Doctor to confirm the broadcast for
  PE/PS — it is automatic per the prompt.
- Do NOT broadcast for SL/VC — those are not
  swappable.
- Do NOT include a medical reason in the
  `doctor_absence_recorded` text. Type + date only.
- Do NOT mark absence for a date in another clinic.
  Refuse if asked.
- Do NOT skip the notify_prompt because the broadcast
  already happened — they serve different purposes
  (broadcast = swap, notify_prompt = awareness).

---

## Example conversation — PE with auto-broadcast

```
Doctor: استئذان P4 الخميس

AI: [internal: get_doctor_schedule(self, Thursday)]
    [internal: confirms the doctor has a clinic slot
     in P4 Thursday]

AI: أبي أسجّل استئذان (PE) يوم الخميس 28 مايو فترة P4.
    أكمل؟
    [نعم] [لا]

Doctor: [نعم]

AI: [internal: mark_doctor_absent(self, 'PE',
     '2026-05-28', 'P4')]

AI: سجّلت استئذانك P4 الخميس.

AI: [internal: find_swap_candidates(slot_id, 'clinic')
     → 6 candidates]
    [internal: broadcast_swap_request(slot_id,
     candidate_ids, 1440)]

AI: أبدأت طلب عام للتبديل. إذا قبل أحد خلال 24 ساعه،
    يصير تبديل تلقائي.

AI: أعلِم أحد؟
    [أفراد محددين] [القروب (+ التريني)]
    [كل المركز] [لا داعي]

Doctor: [لا داعي]

AI: تم.
```

---

## Example conversation — SL without broadcast

```
Doctor: عندي طبيه اليوم

AI: أبي أسجّل إجازه مرضيه (SL) يوم اليوم {date}.
    أكمل؟
    [نعم] [لا]

Doctor: [نعم]

AI: [internal: mark_doctor_absent(self, 'SL', today)]

AI: سجّلت طبيتك اليوم.

AI: أعلِم أحد؟
    [أفراد محددين] [القروب (+ التريني)]
    [كل المركز] [لا داعي]

Doctor: [القروب (+ التريني)]

AI: [internal: send_notification(group_ids,
     "د.{name} على إجازه مرضيه يوم {day} {date}.")]

AI: أُرسل لـ 6 أطباء.
```

---

## Related references

- For the unified prompt → `sharedKnowledge/notifications/universal/notify_prompt.md`
- For the text templates → `sharedKnowledge/notifications/clinical/event_templates.md`
- For recipient resolution → `sharedKnowledge/notifications/clinical/recipients.md`
- For how the TL sees this absence (Source B card) → `teamLeaderKnowledge/notifications/workflows/react_to_system_event.md`
- For requesting a swap manually (not auto-broadcast) → `request_swap.md`
