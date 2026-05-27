# Example: Swapping two doctors on the TL's authority

## Why this example matters

The Team Leader has direct authority over the clinic's
schedule and can exchange two doctors' slots without
asking either doctor for approval. This is the
`swap_on_behalf` flow.

The AI must:
- Identify both slots precisely (asking when ambiguous)
- Present the swap as a clear two-line diff
- Ask whether to notify the affected doctors
- Execute atomically only on explicit confirmation

This example covers the happy path, an ambiguous case
that requires clarification, and the no-notification
variant.

---

## Scenario setup

The TL needs to rebalance Tuesday's assignments. Two
swaps come up during the conversation:

- A clean swap between د.أحمد and د.سامي in two known
  slots.
- A second swap where the TL names doctors without
  specifying slots — the AI has to ask which slots.

---

## The conversation

### Part 1 — Clean swap with notification

```
TL: بدّل د.أحمد P2 عياده 1 مع د.سامي P3 عياده 2 الثلاثاء

AI: [internal: confirms both period assignments exist
     and are in the current week]

AI: التبديل المقترح:
    د.أحمد: الثلاثاء P2 عياده 1 → الثلاثاء P3 عياده 2
    د.سامي: الثلاثاء P3 عياده 2 → الثلاثاء P2 عياده 1

    أكمل التبديل؟ [نعم] [لا]

TL: نعم

AI: [internal: calls swap_slots(slot_a, slot_b)]

AI: تم التبديل.

AI: أعلِم أحد؟
    [المعنيّين فقط (د.أحمد، د.سامي)] [أفراد محددين]
    [القروب (+ التريني)] [كل المركز] [لا داعي]

TL: [المعنيّين فقط (د.أحمد، د.سامي)]

AI: أُرسل لـ 2 أطباء.
```

### Part 2 — Ambiguous request, AI asks

The TL names doctors but no slots. The AI does not guess.

```
TL: بدّل د.محمد مع د.علي

AI: [internal: calls find_doctor_slot(mohammed, this_week)
     → 4 periods; calls find_doctor_slot(ali, this_week)
     → 5 periods]

AI: د.محمد يداوم 4 فترات و د.علي يداوم 5 فترات هالأسبوع.
    حدّد الفترتين اللي تبي تبدّلهم.

TL: د.محمد الأربعاء P1، د.علي الخميس P3

AI: التبديل المقترح:
    د.محمد: الأربعاء P1 عياده 2 → الخميس P3 عياده 1
    د.علي:  الخميس P3 عياده 1 → الأربعاء P1 عياده 2

    أكمل التبديل؟ [نعم] [لا]

TL: نعم

AI: [internal: calls swap_slots(slot_a, slot_b)]

AI: تم التبديل.

AI: أعلِم أحد؟
    [المعنيّين فقط (د.محمد، د.علي)] [أفراد محددين]
    [القروب (+ التريني)] [كل المركز] [لا داعي]

TL: [لا داعي]

AI: تم.
```

---

## What this example teaches the AI

### Decision points the AI navigated

1. **Slot identification before action** — In Part 1 the
   TL gave exact coordinates; the AI read both slots to
   confirm. In Part 2 the TL gave only names; the AI
   asked instead of guessing.

2. **Two-line diff, every time** — The presentation
   always shows both sides of the swap. No JSON, no
   long lists. One line per doctor.

3. **Always ask about notification** — The AI never
   assumes. It always asks whether to notify, and the
   default is the TL's explicit choice.

4. **No approval flow from the doctors** — The TL has
   authority; the swap is atomic on TL confirmation.
   The notification (if chosen) is informational only.

5. **One short success line** — Different output
   depending on the notification choice:
   - With notify: "تم التبديل. أُرسل إشعار للطبيبين."
   - Without: "تم التبديل."

### Rules and workflows applied

- `workflows/swap_on_behalf.md` — full atomic exchange
  procedure, notification question, two-line diff
- `workflows/edit_slot.md` (referenced for contrast — not
  used here, since this is an exchange not a single edit)
- `rules/period_definitions.md` — period naming and
  identification

### Anti-patterns avoided

- Did NOT guess which of multiple slots to swap when
  the TL named doctors without coordinates.
- Did NOT skip the notification question — even when
  the TL did not mention it, the AI asked.
- Did NOT frame the swap as needing doctor approval.
  The TL's confirmation is sufficient.
- Did NOT dump JSON or long descriptions — kept the
  diff to two lines per swap.

---

## Related references

- Workflow: `workflows/swap_on_behalf.md`
- Workflow: `workflows/edit_slot.md` (for single-slot
  changes that are not exchanges)
- Rule: `rules/period_definitions.md`
