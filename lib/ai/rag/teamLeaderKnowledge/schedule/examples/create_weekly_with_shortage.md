# Example: Creating a weekly schedule with mixed staffing

## Why this example matters

This is the most common scheduling request and it touches
most of the distribution rules at once: shift rotation,
shortage handling, balanced rotation, fairness, and the
draft → review → confirm flow. The AI learns to combine
multiple rules into one coherent plan.

---

## Scenario setup

The Team Leader's clinic has:
- **3 clinic rooms** (S = 6 slots per shift)
- **Group 1** — 5 active doctors (D = 5 → shortage, D < S)
- **Group 2** — 6 active doctors (D = 6 → balanced, D = S)
- **No Board doctors this week**
- **No active trainees**
- **No leaves on file for next week**

The TL is planning **next week's schedule** (Sun–Thu).

---

## The conversation

```
TL: أنشئ جدول الأسبوع القادم

AI: [internal: calls get_existing_schedule(next_sunday)
     → null, no draft yet]
    [internal: calls get_clinic_info()
     → 3 rooms]
    [internal: calls get_clinic_doctors()
     → Group 1: 5 active, Group 2: 6 active]
    [internal: retrieves coverage.md, group_separation.md]
    [internal: notes that Group 1 has shortage (5 < 6),
     Group 2 is balanced (6 = 6)]

AI: قبل ما أوزّع، أحتاج أعرف توزيع القروبات على الشفتات.
    قول لي قروب 1 أي يوم صباحي والباقي أستنتجه.

TL: قروب 1 صباحي الأحد والاثنين

AI: [internal: infers the rotation:
     - Sun: G1 morning, G2 evening
     - Mon: G1 morning, G2 evening
     - Tue: G2 morning, G1 evening
     - Wed: G2 morning, G1 evening
     - Thu: G2 morning, G1 evening]
    [internal: ملاحظه - قروب 1 شفته فيه نقص دائماً (5 أطباء، 6 فترات)،
     وقروب 2 شفته متوازن (6 على 6 - بدون ديليقيتر مخصص)]

AI: تمام. التوزيع:
    - الأحد والاثنين: قروب 1 صباحي، قروب 2 مسائي
    - الثلاثاء-الخميس: قروب 2 صباحي، قروب 1 مسائي

    ملاحظتين قبل التوزيع:
    1. قروب 1 (5 أطباء) → نقص واحد. كل يوم راح يكون
       طبيب يأخذ عياده كامله (فترتين). راح أدوّر هذا الدور
       بحيث ما يكون نفس الطبيب كل يوم.
    2. قروب 2 (6 أطباء) → بدون ديليقيتر مخصص. اثنين يتناوبون
       يومياً بين العياده والديليقيتر. راح أدوّر الزوج كل يوم.

    أتابع التوزيع؟

TL: نعم

AI: [internal: builds the JSON with these decisions:
     Group 1 days (Sun morning, Mon morning, Tue evening,
                   Wed evening, Thu evening):
       - Sun: د.أحمد يأخذ عياده 1 (P1+P2)، الباقي فتره واحده
       - Mon: د.سامي يأخذ عياده 2 (P1+P2)، الباقي فتره واحده
       - Tue: د.علي يأخذ عياده 1 (P3+P4)، الباقي فتره واحده
       - Wed: د.خالد يأخذ عياده 2 (P3+P4)، الباقي فتره واحده
       - Thu: د.محمد يأخذ عياده 3 (P3+P4)، الباقي فتره واحده
       — كل طبيب يأخذ الدور المضاعف مره وحده فقط

     Group 2 days (Sun evening, Mon evening, Tue morning,
                   Wed morning, Thu morning):
       - Sun: زوج التناوب: د.X و د.Y (يتبادلون العياده والديليقيتر)
       - Mon: زوج جديد: د.Z و د.W
       - Tue: زوج جديد: د.A و د.B
       - Wed: زوج جديد: د.X و د.Z (نبدأ بالدوران)
       - Thu: زوج جديد: د.Y و د.W

     تنويع الفترات:
       - كل طبيب يحصل على P1 و P2 (أو P3 و P4) خلال الأسبوع
       - ما حد عالق دائماً ببدايه أو نهايه الشفت]

    [internal: calls draft_weekly_schedule(json)]

AI: وزّعت الأطباء بالجدول كمسوّده. عاينها وعدّل الي تبيه،
    وقولي لما تبي تحفظ.

    ملاحظات سريعه:
    - قروب 1: كل يوم طبيب مختلف يأخذ العياده الكامله
    - قروب 2: زوج مختلف يتناوب كل يوم
    - الفترات موزّعه بعداله بين كل الأطباء

TL: [reviews in the UI, notices something]
    د.أحمد صار 4 مرات بفترات البدايه و مره وحده بفتره نهايه.
    عدّل عليه.

AI: [internal: re-checks fairness — Dr. Ahmed got P1
     (or P3) 4 days, P2 (or P4) only 1 day. Not balanced.]
    [internal: adjusts to give Ahmed 2-3 end-shift periods
     and 2-3 start-shift periods over the week.
     Updates JSON.]
    [internal: calls draft_weekly_schedule(updated json)]

AI: عدّلت. د.أحمد الآن: 3 بدايات و 2 نهايات (متوازن).
    باقي الأطباء ما تأثرت توزيعاتهم. شي ثاني؟

TL: لا، احفظ

AI: [internal: calls confirm_weekly_schedule(next_sunday)]

AI: تم. جدول أسبوع [date] جاهز ومنشور.

AI: أعلِم أحد؟
    [أفراد محددين] [القروب (+ التريني)]
    [كل المركز] [لا داعي]

TL: [كل المركز]

AI: أُرسل لـ {count} طبيب.
```

---

## What this example teaches the AI

### Decision points the AI navigated

1. **Asking for rotation input** — TL only provided 2 days,
   AI inferred the rest using the rotation pattern from
   `group_separation.md`.

2. **Detecting two different staffing scenarios** —
   Group 1 was shortage, Group 2 was balanced. The AI
   applied different distribution logic per group, in the
   same schedule.

3. **Surfacing the situation before acting** — The AI
   explained the shortage and rotation choices to the TL
   in two short bullets before drafting. This is the
   "Suggest" step of the Golden Rule applied at the
   strategic level.

4. **Drafting via the UI** — The AI used
   `draft_weekly_schedule` rather than describing the full
   schedule in chat. The TL reviewed visually.

5. **Responding to a fairness correction** — The AI
   accepted the TL's correction, re-balanced specifically
   the affected doctor, and re-pushed the draft. No
   defensive language, no over-explanation.

6. **Confirming only on explicit "احفظ"** — The AI did
   not call `confirm_weekly_schedule` until the TL said
   so plainly.

### Rules applied

- `period_definitions.md` — Sun–Thu, two shifts, four periods
- `group_separation.md` — shift-based separation, rotation
  inference from partial TL input
- `coverage.md` — shortage scenario (one doctor full room)
  + balanced scenario (no dedicated delegator)
- `coverage.md` fairness rules — period variation across week,
  daily rotation of the role-swap pair

### Anti-patterns avoided

- Did NOT dump JSON to chat.
- Did NOT silently choose the rotation when TL gave partial
  input — instead inferred when possible and asked when not.
- Did NOT save the schedule until TL said so.
- Did NOT defend the original draft when the TL pointed out
  the unfairness — just fixed it.

---

## Related references

- Workflow: `workflows/create_weekly.md`
- Rules: `rules/coverage.md`, `rules/group_separation.md`,
  `rules/period_definitions.md`
