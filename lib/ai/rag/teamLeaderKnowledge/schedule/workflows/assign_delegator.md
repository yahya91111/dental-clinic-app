# Assign Delegator

## When to use

The Team Leader wants to assign, change, or remove the
delegator role for a specific scope in the clinic's schedule.

Trigger phrases (examples):
- "خلّي د.أحمد ديليقيتر الأحد P2"
- "عيّن د.سامي ديليقيتر الشفت الصباحي يوم الاثنين"
- "غيّر ديليقيتر P3 إلى د.علي"
- "شيل د.محمد من الديليقيتر"
- "assign Dr. Ahmed as delegator for Sunday P2"

Do NOT use this workflow for:
- Building a full schedule → use `create_weekly`
- Changing a regular doctor assignment → use `edit_slot`
- Swapping two doctors' assignments → use `swap_on_behalf`

---

## Delegator rules (reference)

For full rules, see `rules/delegator_and_ex.md`. Key points:

- The delegator is a **separate role** from the regular
  clinic doctor. It is not a doctor working in the clinic
  during that period — it is an additional support role.

- The Team Leader chooses the scope when assigning:
  - **Per period** — a different delegator for each of
    P1, P2, P3, P4.
  - **Per shift** — one delegator for the morning shift
    (P1 + P2) and one for the evening shift (P3 + P4).

- A doctor **cannot** serve as both regular doctor and
  delegator in the **same** period. But they **can** be a
  regular doctor in one period and the delegator in another
  (e.g., regular in P1 and delegator in P2). This is useful
  when staffing is short.

- Under normal staffing, the delegator is **additional** to
  the regular doctor count: a period with 3 regular doctors
  + 1 delegator = 4 people present.

- Under staff shortage, the same doctor may rotate roles
  across periods to provide coverage.

---

## Required tools

- `get_clinic_doctors()` — returns all doctors with their
  current status and availability.
- `get_slot(week_start, day, period, room?)` — reads the
  current state of a slot.
- `get_delegator(week_start, day, scope)` — returns the
  current delegator for that scope (period or shift), or
  null if none.
- `assign_delegator(week_start, day, scope, doctor_id)` —
  atomic assignment.
- `remove_delegator(week_start, day, scope)` — clears the
  delegator for that scope.

---

## Pre-flight checks

1. Clarify the **scope**:
   - Per period (P1 / P2 / P3 / P4)
   - Per shift (morning = P1+P2, evening = P3+P4)
   If unclear, ask the user explicitly.

2. Confirm the target day and week are not in the past.

3. Confirm the doctor exists and is active in the clinic.

4. Confirm the doctor is **not** already a regular clinic
   doctor in the same period being assigned. If the scope
   is a shift, check both periods of that shift.

5. Confirm the doctor is not on leave, permission, or
   vacation that day.

6. Call `get_delegator(...)` to check whether a delegator
   already exists for that scope. If yes, plan to replace
   and inform the user.

---

## Steps

1. Identify the target day, scope (period or shift), and
   doctor. Ask for any missing detail.

2. Run the pre-flight checks above.

3. Present the proposed assignment:
   - "تعيين د.أحمد ديليقيتر للأحد، P2 (شفت صباحي / فتره)"
   - If replacing an existing delegator, include that:
     - "د.سامي → د.أحمد (ديليقيتر الأحد P2)"

4. Wait for explicit confirmation.

5. Call `assign_delegator(...)` (or `remove_delegator(...)`
   for removal).

6. Apply the unified `notify_prompt` (see
   `sharedKnowledge/notifications/universal/notify_prompt.md`)
   using the `coverage_assignment` template text:
   ```
   تم. د.أحمد ديليقيتر الأحد P2. أعلِم أحد؟
   [المعنيّين فقط (د.أحمد، د.سامي إن كان فيه بديل)]
   [أفراد محددين]
   [القروب (+ التريني)]
   [كل المركز]
   [لا داعي]
   ```
   On removal, the `المعنيّين فقط` option resolves to the
   removed delegator only (د.سامي).

7. Report the result in one short line per the TL's pick:
   - On `المعنيّين فقط` / others → "أُرسل لـ {count} {طبيب|أطباء}."
   - On `لا داعي` → "تم." (the action itself was already
     confirmed in step 6's preamble).

---

## Presentation format

For assignment:
```
ديليقيتر [day] [scope]: [doctor name]
```

For replacement:
```
ديليقيتر [day] [scope]: [old] → [new]
```

For removal:
```
ديليقيتر [day] [scope]: [old] → (لا يوجد)
```

---

## Edge cases

- **Doctor is already a regular doctor in the same period**
  Reject: "د.أحمد معيّن طبيب عياده بـ P2. ما يقدر يكون
  ديليقيتر بنفس الفتره. اختر طبيب ثاني أو غيّر فترة الديليقيتر."

- **Doctor is a regular doctor in a different period of the
  same shift (when scope is shift)**
  Allow but flag: "د.أحمد طبيب عياده بـ P1 وراح يصير ديليقيتر
  للشفت الصباحي (P1+P2). هذا يعني دوره مزدوج بـ P1. متابع؟"

- **Doctor is on leave/permission/vacation that day**
  Reject: "د.أحمد على [status] يوم الأحد. اختر طبيب متاح."

- **A delegator already exists for that scope**
  Always ask before replacing: "د.سامي ديليقيتر حالي للأحد P2.
  أبدله بـ د.أحمد؟"

- **User requests a delegator but provides no scope**
  Ask: "ديليقيتر لأي فتره؟ P1، P2، P3، P4، أو شفت كامل
  (صباحي / مسائي)؟"

- **Doctor not found in the clinic**
  Reject: "د.[X] مو من أطباء عيادتك."

- **Past week**
  Reject. Historical schedules are locked.

---

## Common mistakes to avoid

- Do not assume scope. Always confirm period vs shift.
- Do not assign a doctor as delegator while they are also
  the regular doctor for the same period.
- Do not silently replace an existing delegator. Always ask.
- Do not invent doctor IDs.
- Do not call `assign_delegator` without explicit user
  confirmation.

---

## Example conversation

```
TL: خلّي د.أحمد ديليقيتر الأحد P2

AI: [calls get_clinic_doctors()] — Ahmed is active
    [calls get_slot(this_week, sunday, P2)] — Ahmed is not regular in P2
    [calls get_delegator(this_week, sunday, P2)] — Sami is current

AI: د.سامي هو ديليقيتر الأحد P2 حالياً. أبدله بـ د.أحمد؟

TL: نعم

AI: [calls assign_delegator(this_week, sunday, P2, ahmed_id)]
    تم. د.أحمد ديليقيتر الأحد P2.
```

**Shift-scope assignment:**
```
TL: عيّن د.سامي ديليقيتر الشفت الصباحي الاثنين

AI: [pre-flight checks] — Sami is regular in P1 Monday

AI: د.سامي طبيب عياده بـ P1 الاثنين، وراح يصير ديليقيتر
    للشفت الصباحي (P1+P2). هذا يعني دوره مزدوج بـ P1. متابع؟

TL: نعم، نحتاج تغطيه

AI: [calls assign_delegator(this_week, monday, morning_shift, sami_id)]
    تم. د.سامي ديليقيتر الشفت الصباحي الاثنين.
```

**Removal:**
```
TL: شيل ديليقيتر الخميس P4

AI: [calls get_delegator(this_week, thursday, P4)] — Mohammed is current

AI: أزيل د.محمد من الديليقيتر للخميس P4. ما راح يكون فيه
    ديليقيتر لهذي الفتره. متابع؟

TL: نعم

AI: [calls remove_delegator(this_week, thursday, P4)]
    تم. لا يوجد ديليقيتر للخميس P4.
```
