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
- `find_swap_candidates(slot_id, target_period)` — list
  doctors who hold the `target_period` on the SAME DAY
  as `slot_id` and are eligible to swap.
- `broadcast_swap_request(slot_id, candidate_ids,
  timeout_minutes=1440)` — send the swap request to
  one stage's candidate list. The 24-hour timeout is
  the per-stage maximum.
- `get_swap_request_status(request_id)` — returns the
  current state of an open request (how many accepted,
  rejected, pending).
- `cancel_swap_request(request_id)` — closes an open
  request without waiting for the timeout.
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

### Phase 3 — Auto-cascade broadcast (PE/PS only)

For PE or PS, immediately start a **staged cascade** to
find a doctor on the SAME DAY who will take the empty
period. Coverage is always same-day — no cross-day
swaps exist in this system.

The cascade asks one period at a time, following the
adjacency order from
`teamLeaderKnowledge/schedule/rules/period_definitions.md`.
The doctor MUST approve each escalation; the AI never
auto-advances.

**The cascade stages**

For an absent period P, the three escalation stages
are:

| Stage | Target | Example for P4 absent |
|-------|--------|----------------------|
| 1 | Same shift, adjacent period | P3 |
| 2 | Other shift, closest period | P2 |
| 3 | Other shift, farthest period | P1 |

The adjacency table in `period_definitions.md` gives
the 1st/2nd/3rd choice for every absent period. Use
that table.

**Per-stage flow**

For each stage:

1. **Inform the Doctor before sending:**
   "بسأل أطباء {target_period} الحين."

2. Call `find_swap_candidates(slot_id, target_period)`.

3. If `candidate_ids` is empty (e.g., that period has
   no doctors that day, or the only candidates are on
   leave), inform the Doctor and ask whether to skip
   to the next stage:
   "ما فيه أطباء بـ {target_period} يوم {day}. أنتقل
   لـ {next_period}؟" [نعم] [لا، ألغِ التبديل]

4. Otherwise, call `broadcast_swap_request(slot_id,
   candidate_ids, timeout_minutes=1440)` and store the
   `request_id`.

5. Wait for one of these outcomes:
   - **An acceptance arrives** → the system completes
     the swap atomically. Inform the Doctor:
     "د.{name} قبل التبديل. صار له {target_period}
     يوم {day} وأنت مستأذن."
     Stop the cascade.
   - **All candidates reject** (before timeout) → see
     "escalation prompt" below.
   - **Timeout elapses with no acceptance** → treat as
     all-rejected, see "escalation prompt" below.

**Escalation prompt (between stages)**

When a stage ends with no acceptance, the AI does NOT
auto-advance. It tells the Doctor and asks:

"رفض أطباء {target_period}. تبيني أنتقل لـ
{next_period}؟"
[نعم، انتقل] [لا، خلّيها كذا]

- On `نعم` → start the next stage.
- On `لا` → close the cascade. The permission stands,
  the period is empty; the TL will see it as a
  coverage card on their side.

**End of cascade (all three stages rejected)**

After Stage 3 ends with no acceptance, inform the
Doctor:
"خلصت كل المراحل. الجميع رفض. استئذانك مسجّل
والفتره فاضيه. التيم ليدر بيشوفها على شاشته."

Then proceed to Phase 4.

**Doctor checks status mid-cascade**

The Doctor can ask at any point: "شصار على الطلب؟"
or "وين وصل التبديل؟"

1. Call `get_swap_request_status(request_id)` for the
   current stage's open request.
2. Report briefly:
   "بمرحله {stage}/{total}: بسأل أطباء {target_period}.
   {responded_count} ردّوا ({rejected_count} رفضوا)،
   {pending_count} لسّه ما ردّوا. الوقت المتبقي
   {remaining} ساعه."
3. Offer the Doctor a choice:
   [انتظر للنهايه] [انتقل للمرحله التاليه الحين]
   [ألغِ التبديل]
   - `انتظر` → return without changes.
   - `انتقل الحين` → cancel the open request and start
     the next stage immediately (with confirmation
     about which period to target).
   - `ألغِ` → cancel the open request and close the
     cascade.

For SL or VC, skip this phase entirely — no broadcast.

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

- **PE/PS with no eligible candidates for any stage.**
  If Stage 1 returns zero candidates, ask the Doctor
  whether to skip to Stage 2 (and so on). If all three
  stages have zero candidates, inform: "ما فيه أطباء
  مؤهلين للتبديل بأي فتره يوم {day}. الاستئذان مسجّل
  والفتره راح تكون فاضيه."

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

- Do NOT ask the Doctor to confirm starting Stage 1 —
  Stage 1 fires automatically per the prompt.
- Do ALWAYS ask the Doctor before escalating to Stage
  2 or Stage 3. Escalation requires explicit approval.
- Do NOT broadcast across days. Coverage is always
  same-day.
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

## Example conversation — PE with cascade (Stage 1 succeeds)

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

AI: بسأل أطباء P3 الخميس (نفس الشفت) الحين.
    [internal: find_swap_candidates(slot_id, 'P3')
     → 3 candidates]
    [internal: broadcast_swap_request(slot_id,
     candidate_ids, 1440), stores request_id]

[20 minutes later, د.أحمد accepts]

AI: د.أحمد قبل التبديل. صار له P4 الخميس وأنت
    مستأذن. (الذي كان معه P3 الخميس صار لك.)

AI: أعلِم أحد؟
    [المعنيّين فقط (د.أحمد)] [أفراد محددين]
    [القروب (+ التريني)] [كل المركز] [لا داعي]

Doctor: [لا داعي]

AI: تم.
```

---

## Example conversation — PE with cascade (escalation to Stage 2)

```
Doctor: استئذان P4 الأحد

AI: [marks the absence as in the example above]

AI: سجّلت استئذانك P4 الأحد.

AI: بسأل أطباء P3 الأحد (نفس الشفت) الحين.
    [internal: broadcast to 3 P3 candidates]

[3 hours later, all 3 reject]

AI: رفض أطباء P3. تبيني أنتقل لـ P2 (الشفت الصباحي،
    أقرب فتره)؟
    [نعم، انتقل] [لا، خلّيها كذا]

Doctor: [نعم، انتقل]

AI: بسأل أطباء P2 الأحد الحين.
    [internal: broadcast to 5 P2 candidates]

[1 hour later, د.سامي accepts]

AI: د.سامي قبل التبديل. صار له P4 الأحد وأنت مستأذن.

AI: أعلِم أحد؟
    [المعنيّين فقط (د.سامي)] [أفراد محددين]
    [القروب (+ التريني)] [كل المركز] [لا داعي]

Doctor: [القروب (+ التريني)]

AI: أُرسل لـ 6 أطباء.
```

---

## Example conversation — Doctor checks status mid-cascade

```
[Earlier: Doctor submitted PE for P4 Thursday.
 Stage 1 broadcast went out to 3 P3 candidates.
 1 hour later, 2 rejected, 1 hasn't responded.]

Doctor: شصار على طلب التبديل؟

AI: [internal: get_swap_request_status(request_id)]

AI: بمرحله 1/3: بسأل أطباء P3.
    3 ردّوا حتى الحين (2 رفضوا، 1 لسّه ما رد).
    الوقت المتبقي: 23 ساعه.

    تبي:
    [انتظر للنهايه] [انتقل للمرحله التاليه الحين]
    [ألغِ التبديل]

Doctor: [انتقل للمرحله التاليه الحين]

AI: [internal: cancel_swap_request(request_id)]

AI: تبيني أنتقل لـ P2 (الشفت الصباحي)؟
    [نعم] [لا]

Doctor: [نعم]

AI: بسأل أطباء P2 الخميس الحين.
    [internal: broadcast to P2 candidates]
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
