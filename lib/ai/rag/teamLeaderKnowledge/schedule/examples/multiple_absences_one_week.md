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

### Part 1 — Source B SL (proactive coverage decision)

The TL opens the app. The TL Assistant sees that
د.أحمد's slots are empty and starts the conversation:

```
AI (proactive): د.أحمد بـ EX اليوم (SL). 4 فترات
    بالمسائي بدون طبيب. أغطّيها بـ د.خالد (EX المسائي)؟

TL: نعم

AI: [internal: calls assign_replacement for each of the
     4 evening slots with khaled_id]

AI: تم. الـ 4 فترات غطّاها د.خالد.
```

**Variation — no reserve EX available:**

```
AI (proactive): د.أحمد بـ EX اليوم (SL). 4 فترات
    بالمسائي بدون طبيب، وما فيه EX احتياطي اليوم.
    الخيارات:
    1. د.سامي يأخذ عياده 1 كاملاً (P3+P4)
    2. أحدّد طبيب لكل فتره
    3. أتركها بدون تغطيه

TL: 1

AI: تم. د.سامي بعياده 1 المسائي.
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

The TL now talks about their own permission. The AI does
the marking AND runs the cascade.

```
TL: اليوم عندي استئذان نهاية الصباحي

AI: [internal: PE for morning = P2 today]
    [internal: calls mark_doctor_absent(tl_id, PE,
     today, period=P2)]

AI: سجّلت استئذانك (PE) لـ P2 اليوم. P2 عياده 1 صارت
    بدون طبيب. راح أبحث عن أطباء بـ P1 للتبديل أولاً.
    أتابع؟

TL: نعم

AI: [internal: calls find_period_candidates(today,
     source=P2, search=P1) → 5 morning candidates]
    [internal: calls broadcast_swap_request(slot,
     5 P1 candidates)]

AI: أرسلت طلب تبديل لـ 5 أطباء بـ P1. راح يصلك إشعار
    لما أحدهم يقبل.

[later turn, after the trigger fires:]

AI: د.يوسف بـ P1 قبل التبديل. تم.
    د.يوسف ياخذ فترتك بـ P2، وأنت تاخذ فترة د.يوسف بـ P1.
```

(If no one had accepted at any cascade step, the AI
would say: "ما حد قبل التبديل بأي فتره. ما تقدر تستأذن
اليوم — لازم تشتغل عادي.")

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

4. **"Permission must succeed or it doesn't happen"** —
   In Part 3, the AI mentioned the failure case
   explicitly: if no one accepts, the TL cannot
   take the permission. This is the system's rule;
   the AI does not invent alternative coverage.

5. **Future-week constraints flow into create_weekly** —
   Part 4 was just a heads-up. The actual application
   happened in Part 5 when the TL built the schedule.

### Rules and workflows applied

- `workflows/mark_unavailable.md` — Source A vs
  Source B branching, cascade for Source A only,
  inform-only for Source B PE/PS
- `workflows/create_weekly.md` — applies future-week
  EX entries as placement constraints
- `rules/coverage.md` — SL coverage by reserve EX
- `rules/delegator_and_ex.md` — reserve EX activation
- `rules/period_definitions.md` — adjacency for cascade
  (P1 closest to P2)

### Anti-patterns avoided

- Did NOT ask the TL to choose a swap partner for
  د.محمد's PE — that was handled by the Doctor Assistant.
- Did NOT call `mark_doctor_absent` for any doctor in
  Source B — they were already marked.
- Did NOT run a cascade for د.محمد — only the TL's own
  permission triggers a cascade in the TL Assistant.
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
- The notifications RAG (to be built later) will define
  how the proactive openings in Parts 1, 2, and 4 are
  triggered.

---

## Related references

- Workflow: `workflows/mark_unavailable.md`
- Workflow: `workflows/create_weekly.md` (constraint
  application)
- Rules: `rules/coverage.md`, `rules/delegator_and_ex.md`,
  `rules/period_definitions.md`
