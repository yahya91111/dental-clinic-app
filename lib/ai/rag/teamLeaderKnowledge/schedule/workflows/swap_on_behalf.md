# Swap Two Doctors (On Behalf)

## When to use

The Team Leader directly exchanges two doctors' slots using
their authority over the clinic. No approval is required from
either doctor — the TL has full operational authority for
their clinic's schedule.

Trigger phrases (examples):
- "بدّل بين د.أحمد و د.سامي"
- "خذ فترة د.محمد الأحد P2 وبدّلها مع د.علي الاثنين P3"
- "اعكس بين د.X و د.Y"
- "swap Dr. Ahmed and Dr. Sami"

Do NOT use this workflow for:
- TL swapping their own slot → use `swap_broadcast`
- Editing a single slot without exchange → use `edit_slot`
- Changing one doctor without affecting another → use `edit_slot`

---

## How the swap works

This is an **atomic, authority-based exchange**:

- Doctor A takes Doctor B's exact slot
- Doctor B takes Doctor A's exact slot
- All other assignments remain unchanged
- No consent flow is involved — the TL's confirmation is
  sufficient

The doctors do not need to approve. They may receive a
notification informing them of the change, but only if the
TL explicitly requests it.

---

## Required tools

- `get_slot(week_start, day, period, room)` — confirm a slot's
  current state.
- `find_doctor_slot(doctor_id, week_start)` — find a specific
  doctor's slot(s) when the user names doctors instead of
  precise slot coordinates.
- `swap_slots(slot_a_id, slot_b_id)` — atomic exchange
  of two slots. Notification handling is separate: the
  unified `notify_prompt` runs after the swap completes
  (see step 6).

---

## Pre-flight checks

1. Identify both slots involved in the swap.
   - The user may specify slots by coordinates (day, period,
     room) or by naming the doctors and letting you find
     their slots.
   - If the user names doctors but they have multiple slots,
     ask which specific slots to swap.

2. Confirm both slots are in the current or a future week.
   Past weeks are locked and cannot be swapped.

3. Confirm neither doctor is the same doctor in both slots.

4. Verify both doctors are still active members of the clinic.

---

## Steps

1. Identify the two slots (or two doctors + their target slots).
   Ask for any missing detail.

2. Run the pre-flight checks above.

3. Present the proposed swap as a clear two-line diff:
   ```
   د.أحمد: الأحد P2 عياده 1 → الاثنين P3 عياده 2
   د.سامي: الاثنين P3 عياده 2 → الأحد P2 عياده 1
   ```

4. Wait for explicit confirmation on the swap itself
   (e.g., "نعم" or "أكّد التبديل"). The notification
   decision is handled separately in step 6 via the
   unified notify prompt — do NOT fold it into this
   confirmation.

5. Call `swap_slots(slot_a_id, slot_b_id)`.

6. After the swap executes, apply the unified
   `notify_prompt` (see
   `sharedKnowledge/notifications/universal/notify_prompt.md`)
   using the `schedule_changed` template (swap variant)
   text:
   ```
   تم التبديل. أعلِم أحد؟
   [المعنيّين فقط (د.{a}، د.{b})] [أفراد محددين]
   [القروب (+ التريني)] [كل المركز] [لا داعي]
   ```
   Send the notification per the TL's pick. The two
   doctors are the natural `المعنيّين`; the TL may also
   widen to the group or clinic.

7. Report the result in one short line:
   - "تم التبديل. أُرسل لـ {count} {طبيب|أطباء}."
   - On `لا داعي`: "تم التبديل."

---

## Presentation format

Two-line diff format showing the exchange:
```
[Doctor A]: [old slot] → [new slot]
[Doctor B]: [old slot] → [new slot]
```

If multiple swaps are requested in one turn, list each pair
on its own two-line block.

---

## Edge cases

- **One or both slots in a past (locked) week**
  Decline: "ما يمكن التبديل بجداول ماضيه."

- **Doctor named but has multiple slots**
  Ask the user to specify which slot:
  "د.أحمد يداوم 4 فترات هالأسبوع، أي وحده تبي تبدّل؟"

- **Same doctor in both slots**
  Meaningless swap. Inform and ask for a different pair.

- **A doctor in the swap is on leave/permission for the new slot's day**
  Flag clearly: "د.أحمد على إجازه يوم الاثنين، إذا بدّلت
  دوامه بيكون فيه تعارض. متابع؟"

- **One of the slots is empty (no doctor assigned)**
  Inform the user. Suggest using `edit_slot` instead since
  there is nothing to exchange.

- **The two slots involve different rooms in the same period**
  This is allowed and a valid swap. Confirm explicitly to
  the user since it can be confused with a role change.

---

## Common mistakes to avoid

- Do not skip the notify prompt after the swap. Always
  apply it.
- Do not fold the notify decision into the swap
  confirmation question. They are two separate steps.
- Do not invent doctor IDs or slot IDs.
- Do not call `swap_slots` if either side is in a locked
  past week.
- Do not present the swap as needing the doctors' approval.
  It does not.

---

## Example conversation

```
TL: بدّل د.أحمد مع د.سامي يوم الأحد

AI: [calls find_doctor_slot(ahmed, this_week)] — multiple slots
    [calls find_doctor_slot(sami, this_week)] — multiple slots

AI: د.أحمد يداوم 4 فترات و د.سامي يداوم 5 فترات.
    أي فتره تبي تبدّل بينهم بالأحد بالضبط؟

TL: د.أحمد P2 عياده 1، د.سامي P3 عياده 2

AI: التبديل المقترح:
    د.أحمد: الأحد P2 عياده 1 → الأحد P3 عياده 2
    د.سامي: الأحد P3 عياده 2 → الأحد P2 عياده 1

    أكّد التبديل؟ [نعم] [لا]

TL: نعم

AI: [calls swap_slots(slot_a, slot_b)]

AI: تم التبديل. أعلِم أحد؟
    [المعنيّين فقط (د.أحمد، د.سامي)] [أفراد محددين]
    [القروب (+ التريني)] [كل المركز] [لا داعي]

TL: [المعنيّين فقط]

AI: [internal: send_notification(2 ids,
     schedule_changed swap-variant text)]

AI: أُرسل لـ 2 أطباء.
```

**Without notification:**
```
TL: بدّل د.محمد P2 الاثنين مع د.علي P4 الاثنين

AI: التبديل المقترح:
    د.محمد: الاثنين P2 → الاثنين P4
    د.علي:  الاثنين P4 → الاثنين P2

    أكّد التبديل؟ [نعم] [لا]

TL: نعم

AI: [calls swap_slots(slot_a, slot_b)]

AI: تم التبديل. أعلِم أحد؟
    [المعنيّين فقط (د.محمد، د.علي)] [أفراد محددين]
    [القروب (+ التريني)] [كل المركز] [لا داعي]

TL: [لا داعي]

AI: تم.
```
