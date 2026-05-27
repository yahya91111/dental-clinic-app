# Example: Mixed absence sources in one week

## Why this example matters

Absences come from two distinct sources, and each
source dictates a very different role for the TL
Assistant:

- **Source A** — The Team Leader submits their own
  absence directly. The TL Assistant performs the full
  workflow: marking, slot vacating, and (for PE/PS)
  running the cascading swap.
- **Source B** — A doctor submits via their own
  assistant. The Doctor Assistant handles everything
  on its side. The TL Assistant's role is
  **purely informational** — it proactively opens a
  conversation with the TL when:
  - **SL/VC** → empty slots need coverage (TL decides)
  - **PE/PS** → a swap has succeeded (TL is informed)

Critical principle: for a doctor's PE/PS, **the swap
must succeed or the permission is not granted**. The
TL is never asked to find a replacement for someone
else's permission — that is handled by the doctor's
own assistant.

This example walks through both sources in the same
week, plus a future-week absence that becomes a
scheduling constraint.

---

## Scenario setup

The clinic, mid-week (Tuesday):

- **Group 1** is evening today (7 doctors)
- **Group 2** is morning today (7 doctors)
- Reserve EX assigned today:
  د.سامي for morning, د.خالد for evening

Four absence events touch this week:

- **(Source B, today)** د.أحمد submitted SL this morning
  via his own assistant. The Doctor Assistant placed
  him in EX and vacated his 4 evening slots.
- **(Source B, today)** د.محمد submitted PE for P4
  evening via his own assistant. The Doctor Assistant
  found د.علي in P3 willing to swap; the swap is done.
- **(Source A, today)** The TL is about to submit their
  own PE for P2 morning.
- **(Source B, next week)** د.خالد submitted PE for next
  Tuesday's P4. The Doctor Assistant added him to next
  week's EX section.

---

## The conversation

### Part 1 — Source B SL (proactive coverage with full options)

The TL opens the app. The TL Assistant sees that
د.أحمد's slots are empty and starts the conversation
with the context-aware suggestions menu:

```
AI (proactive): د.أحمد بـ EX اليوم (SL). 4 فترات
    بالمسائي بدون طبيب. الاقتراحات:
    [د.خالد احتياطي المسائي يأخذها كاملاً]
    [د.سامي (بـ P3 نفس العياده) يستمر إلى P4 — يحلّ فتره وحده]
    [أكلم أطباء فتره ثانيه]
    [اتركها فاضيه]

TL: [د.خالد احتياطي]

AI: [internal: calls assign_replacement for each of the
     4 evening slots with khaled_id]

AI: تم. الـ 4 فترات غطّاها د.خالد.

AI: أعلِم أحد؟
    [المعنيّين فقط (د.خالد)] [أفراد محددين]
    [القروب (+ التريني)] [كل المركز] [لا داعي]

TL: [المعنيّين فقط (د.خالد)]

AI: أُرسل لـ د.خالد.
```

**Variation A — no reserve, AI suggests adjacent extend:**

```
AI (proactive): د.أحمد بـ EX اليوم (SL). فترته بـ P4
    عياده 2 بدون طبيب. الاقتراحات:
    [د.سامي (بـ P3 نفس العياده) يستلم الفترتين]
    [أكلم أطباء فتره ثانيه]
    [اتركها فاضيه]

TL: [د.سامي يستلم الفترتين]

AI: [internal: extends د.سامي's slot to cover P4 too]

AI: تم. د.سامي بعياده 2 من P3 إلى P4.

AI: أعلِم أحد؟
    [المعنيّين فقط (د.سامي)] [أفراد محددين]
    [القروب (+ التريني)] [كل المركز] [لا داعي]

TL: [المعنيّين فقط (د.سامي)]

AI: أُرسل لـ د.سامي.
```

**Variation B — absent doctor was alone in their clinic, AI suggests neighbor-clinic relay:**

```
AI (proactive): د.أحمد بـ EX اليوم (SL). عياده 1
    المسائي فاضيه كاملاً (P3 + P4 كان لوحده).
    الاقتراحات:
    [د.A من عياده 2 يأخذ عياده 1 طول الشفت، د.B يكمّل عياده 2]
    [د.خالد احتياطي يأخذ عياده 1 كاملاً]
    [أكلم أطباء فتره ثانيه]
    [اتركها فاضيه]

TL: [د.A يأخذ عياده 1، د.B يكمّل عياده 2]

AI: [internal: moves د.A to clinic 1 P3+P4]
    [internal: extends د.B in clinic 2 to cover both P3+P4]

AI: تم. د.A بعياده 1 طول المسائي، د.B بعياده 2 طول المسائي.

AI: أعلِم أحد؟
    [المعنيّين فقط (د.A، د.B)] [أفراد محددين]
    [القروب (+ التريني)] [كل المركز] [لا داعي]

TL: [المعنيّين فقط (د.A، د.B)]

AI: أُرسل لـ 2 أطباء.
```

### Part 2 — Source B PE (proactive info, swap already done)

The Doctor Assistant has already arranged a swap. The
TL Assistant just informs the TL. No decision is needed.

```
AI (proactive): د.محمد قدّم استئذان نهاية المسائي اليوم
    (PE = P4)، وبدّل مع د.علي. د.علي راح يداوم بـ P4
    بدله، ود.محمد ياخذ فترة د.علي بـ P3. علم فقط.
```

(The TL acknowledges or moves on. No tool call is needed
on the TL Assistant's side.)

### Part 3 — Source A PE (TL submits PE for themselves)

The TL talks about their own permission. The AI marks the
absence immediately, then presents the context-aware
suggestions. It never refuses the permission.

```
TL: اليوم عندي استئذان نهاية الصباحي

AI: [internal: PE for morning = P2 today]
    [internal: calls mark_doctor_absent(tl_id, PE,
     today, period=P2)]
    [internal: TL was a clinic doctor in P2, slot now empty]
    [internal: checks who is in P1 same clinic → د.أحمد]
    [internal: checks reserve EX → none today]

AI: سجّلت استئذانك. فترتك بـ P2 عياده 1 صارت بدون طبيب.
    الاقتراحات:
    [د.أحمد (بـ P1 نفس العياده) يستلم الفترتين]
    [أكلم أطباء فتره ثانيه]
    [اتركها فاضيه]

TL: [د.أحمد يستلم الفترتين]

AI: [internal: extends د.أحمد's slot to cover P2 of clinic 1]

AI: تم. د.أحمد بعياده 1 من P1 إلى P2.

AI: أعلِم أحد؟
    [المعنيّين فقط (د.أحمد)] [أفراد محددين]
    [القروب (+ التريني)] [كل المركز] [لا داعي]

TL: [المعنيّين فقط (د.أحمد)]

AI: أُرسل لـ د.أحمد.
```

**Variation — TL picks broadcast instead:**

```
TL: [أكلم أطباء فتره ثانيه]

AI: أكلم أطباء أي فتره؟
    [نفس الشفت — P1] [الشفت الثاني — المسائي] [فتره معيّنه]

TL: [نفس الشفت — P1]

AI: [internal: calls find_swap_candidates(source_slot_id, 'P1')
     → 5 candidates (source is P2/P4, reduced-workload
     doctors excluded automatically)]
    [internal: calls broadcast_swap_request(slot,
     5 P1 candidates, timeout_minutes=1440)]

AI: أرسلت طلب لـ 5 أطباء بـ P1. مهله 24 ساعه.

[later, after a doctor accepts:]

AI: د.يوسف بـ P1 قبل التبديل. تم.
    د.يوسف ياخذ فترتك بـ P2، وأنت تاخذ فترة د.يوسف بـ P1.
```

If no doctor accepted within 24 hours, the AI re-offers
mediation — it never refuses the permission. The TL could
also have picked [اتركها فاضيه] from the start.

**Variation A — TL was the delegator that day:**

```
TL: اليوم عندي استئذان نهاية الصباحي

AI: [internal: PE for morning = P2 today]
    [internal: TL was delegator for the morning shift]
    [internal: calls mark_doctor_absent(tl_id, PE,
     today, period=P2)]

AI: سجّلت استئذانك. كنت ديليقيتر للشفت. ممكن أسأل أحد
    يستلم الديليقيتر بدلك بـ P2. تبيني؟
    [نعم] [لا، خلّيها]

TL: [ينقر: لا، خلّيها]

AI: تمام. الديليقيتر راح يكون بدون بديل بـ P2.
```

**Variation B — Permission leaves no gap (TL was on EX):**

```
TL: اليوم عندي استئذان نهاية الصباحي

AI: [internal: PE for morning = P2 today]
    [internal: TL was on EX (reserve) — no clinic slot]
    [internal: calls mark_doctor_absent(tl_id, PE,
     today, period=P2)]

AI: سجّلت استئذانك. حالتك بـ EX تغيّرت من احتياطي إلى PE.
```

### Part 4 — Source B future-week PE (proactive constraint notice)

```
AI (proactive): د.خالد مسجّل بـ EX لـ P4 الثلاثاء القادم
    (PE). لما تبني جدول الأسبوع، راح أحطّه بـ P3 الثلاثاء
    بدل P4. ما فيه إجراء مطلوب الآن.
```

### Part 5 — Applying the future-week constraint

A day or two later, the TL builds next week's schedule.
The constraint from Part 4 is applied automatically.

```
TL: ابني جدول الأسبوع القادم

AI: [internal: enters create_weekly flow]
    [internal: reads next week's EX section, finds
     د.خالد with PE for P4 Tuesday]
    [internal: builds distribution where د.خالد never
     appears in P4 Tuesday — only P3]
    [internal: calls draft_weekly_schedule(json)]

AI: وزّعت الأطباء بالجدول كمسوّده. عاينها وعدّل الي
    تبيه، وقولي لما تبي تحفظ.

    ملاحظه: د.خالد بـ P3 الثلاثاء فقط (مستأذن P4).
```

---

## What this example teaches the AI

### Decision points the AI navigated

1. **Source A vs Source B is the first branching** —
   In Parts 1, 2, 4 the AI did not call
   `mark_doctor_absent` because the Doctor Assistant
   already had. In Part 3 the AI did call it because
   the TL was submitting their own absence.

2. **PE/PS swap is handled by the originating assistant
   only** — In Part 2, the AI did NOT run a cascade or
   ask the TL to find a replacement. The Doctor
   Assistant already did that work. The AI simply
   informed the TL of the completed swap.

3. **Proactive openings have specific triggers** —
   Source B always opens proactively (Parts 1, 2, 4).
   Source A starts with the TL speaking (Part 3).

4. **TL chooses coverage, AI doesn't decide** — In Part 3
   the AI marked the PE immediately and then offered three
   options. It did NOT auto-cascade through periods. It
   does NOT refuse the permission when no swap is found.
   The TL has authority to leave the slot empty if they
   want. The AI suggests, the TL picks.

5. **Delegator/EX permissions are just status changes** —
   The variation at the end of Part 3 shows that if the
   TL was the delegator (or on EX), the absence is just
   a status update in the EX section. No coverage hunt,
   no options menu, no empty clinic slot to worry about.

6. **24-hour timeout is the standard** — All swap
   requests originating from this workflow use 24 hours,
   matching `swap_broadcast.md`. The previous short-timeout
   cascade model has been retired.

7. **Future-week constraints flow into create_weekly** —
   Part 4 was just a heads-up. The actual application
   happened in Part 5 when the TL built the schedule.

### Rules and workflows applied

- `workflows/mark_unavailable.md` — Source A vs Source B
  branching, options menu for Source A PE/PS, inform-only
  for Source B PE/PS
- `workflows/create_weekly.md` — applies future-week
  EX entries as placement constraints
- `rules/coverage.md` — SL coverage by reserve EX
- `rules/delegator_and_ex.md` — reserve EX activation
- `rules/period_definitions.md` — period semantics
  (PE = end of shift = P2/P4)

### Anti-patterns avoided

- Did NOT ask the TL to choose a swap partner for
  د.محمد's PE — that was handled by the Doctor Assistant.
- Did NOT call `mark_doctor_absent` for any doctor in
  Source B — they were already marked.
- Did NOT auto-cascade for the TL's PE in Part 3 —
  offered the three options menu instead.
- Did NOT refuse the TL's permission when no swap was
  immediately available — the TL has authority to leave
  the slot empty (Option 3).
- Did NOT use the old 15-minute timeout. All swap
  requests use 24 hours.
- Did NOT mention "the system" as a separate actor —
  the work is done by a specific AI assistant (Doctor
  or TL), never by an abstract system.
- Did NOT offer the TL coverage options for د.محمد's
  PE — the swap is binary: it succeeded (now you know)
  or it failed (the permission never happened, no
  notice needed).

---

## A note about timing

- The AI cannot wait inside one turn for a broadcast
  to receive an acceptance.
- The acceptance fires as a separate event, and the AI
  reports it in a later turn (Part 3 demonstrates this).
- The proactive openings in Parts 1, 2, and 4 are
  triggered by the notifications RAG — see
  `../../notifications/workflows/react_to_system_event.md`
  for the fetch + classify + surface mechanism.

---

## Related references

- Workflow: `workflows/mark_unavailable.md`
- Workflow: `workflows/create_weekly.md` (constraint
  application)
- Rules: `rules/coverage.md`, `rules/delegator_and_ex.md`,
  `rules/period_definitions.md`
