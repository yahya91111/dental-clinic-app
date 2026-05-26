# Manage Groups

## When to use

The Team Leader wants to create, rename, modify, or delete
a doctor group within the clinic. This also covers moving
doctors between groups and managing EX (reserve) assignments
per shift.

Trigger phrases (examples):
- "أنشئ قروب جديد للصباحي"
- "غيّر اسم القروب أ إلى قروب الصباح"
- "أضف د.أحمد لقروب الصباح"
- "انقل د.سامي من قروب أ إلى قروب ب"
- "احذف قروب ب"
- "عيّن د.محمد EX للشفت الصباحي يوم الأحد"
- "manage groups"

Do NOT use this workflow for:
- Scheduling doctors to specific slots → use `create_weekly`
  or `edit_slot`
- Marking absences → use `mark_unavailable`
- Assigning a delegator → use `assign_delegator`

---

## Group rules (reference)

For full rules, see `rules/group_separation.md` and
`rules/clinic_preferences.md`. Key points:

- A doctor belongs to **exactly one group** at a time. No
  shared membership.

- Group size is **variable**, set indirectly by Regional
  Manager hiring decisions. The **minimum healthy size is
  6 doctors** for a primary clinical group; fewer than 6
  indicates a staffing shortage and should be flagged.

- Groups do not mix in the same period (see
  `rules/group_separation.md`).

- Every group has a **classification** in `ai_preferences`:
  `primary` (clinical, rotates between shifts — max 2),
  `trainee` (linked to a parent primary group), `board`
  (single Board group), or `excluded` (administrative,
  not scheduled). See `rules/clinic_preferences.md`.

- **EX (reserve)** is assigned **per shift, per day**, not
  per group. Each shift (morning or evening) on a given day
  can have one EX doctor who covers shortages.

---

## Required tools

### Group management
- `get_groups(clinic_id)` — list all groups in the clinic
  with member counts.
- `get_group(group_id)` — group details and full member list.
- `create_group(name)` — create a new empty group.
- `rename_group(group_id, new_name)` — rename a group.
- `delete_group(group_id)` — delete a group. Only allowed
  if the group has no members (or members have been reassigned).
- `add_doctor_to_group(doctor_id, group_id)` — add doctor
  to a group. Doctor must not already belong to another group.
- `remove_doctor_from_group(doctor_id, group_id)` — remove
  doctor from their group. Leaves them ungrouped.
- `move_doctor_to_group(doctor_id, from_group, to_group)` —
  atomic move from one group to another.

### EX (reserve) management
- `get_ex(week_start, day, shift)` — returns the EX doctor
  for that day and shift, or null.
- `assign_ex(week_start, day, shift, doctor_id)` — sets
  the EX doctor for the shift.
- `remove_ex(week_start, day, shift)` — clears the EX for
  the shift.

---

## Pre-flight checks

### For group operations
1. Confirm the target group exists (or that the name is
   unique when creating).
2. Confirm any doctor referenced exists in the clinic.
3. For `add_doctor_to_group`: confirm the doctor is not
   already in another group.
4. For `delete_group`: confirm the group is empty or that
   the user has a plan for the members.
5. For `move_doctor_to_group`: confirm both source and
   target groups exist.

### For EX operations
1. Confirm the doctor exists and is active in the clinic.
2. Confirm the doctor is not on leave/permission/vacation
   that day.
3. Confirm the doctor is not already scheduled as a regular
   doctor or delegator in that shift (EX must be unassigned
   to the shift's regular slots).
4. Confirm the day/week is not in the past.

---

## Steps

### Group operations

1. Identify the operation (create / rename / add member /
   remove member / move / delete) and the involved
   group(s) and doctor(s).

2. Run the relevant pre-flight checks.

3. Present the proposed change:
   - Create: "إنشاء قروب جديد باسم [X]."
   - Rename: "قروب [old name] → [new name]"
   - Add: "إضافة د.[name] إلى قروب [X]"
   - Remove: "إزالة د.[name] من قروب [X] (يصير بدون قروب)"
   - Move: "نقل د.[name] من قروب [X] إلى قروب [Y]"
   - Delete: "حذف قروب [X]" — and warn if members exist.

4. Wait for explicit confirmation.

5. Call the relevant tool.

6. **For `create_group` only**: immediately after the create
   succeeds, ask the TL to classify the new group using
   `ask_tl_choice`:

   "قروب '[name]' — ما نوعه؟"
   [أساسي للعمل] [تريني] [بورد] [مستثنى من التوزيع]

   - If "أساسي" and `primary_groups` already has 2 → refuse
     and explain: "فيه قروبين أساسيين بالفعل. لازم تغيّر
     تصنيف وحد منهم أولاً."
   - If "تريني" → follow-up: "مع أي قروب أساسي مرتبط؟"
     [list primary group names]
   - If "بورد" and `board_group_id` is already set → ask
     "تبدّل قروب البورد الحالي؟" [نعم] [لا]
   - Save the classification via
     `update_clinic_ai_preferences` immediately.

   See `rules/clinic_preferences.md` for the full
   classification rules.

   **For `delete_group`**: also remove the group's id from
   `group_classification` (whichever field it was in), then
   inform the TL: "حذفت تصنيفه أيضاً."

7. Report the result in one short line:
   - "تم إنشاء قروب [X] (مصنّف: [نوع])."
   - "تم نقل د.[name] إلى قروب [Y]."

### EX operations

1. Identify the day, shift (morning / evening), and doctor.

2. Run the pre-flight checks.

3. Present:
   - Assign: "تعيين د.[name] EX للشفت [morning/evening] يوم [day]."
   - If existing EX: "د.[old] → د.[new] (EX للشفت [morning/evening] يوم [day])"
   - Remove: "إزالة EX للشفت [morning/evening] يوم [day]."

4. Wait for explicit confirmation.

5. Call `assign_ex(...)` or `remove_ex(...)`.

6. Report the result.

---

## Presentation format

### Group ops
```
[operation]: [details]
```

Examples:
```
إنشاء قروب: "قروب الصباح"
نقل: د.أحمد (قروب أ → قروب ب)
حذف: قروب ج (الأعضاء: د.سامي، د.علي — راح يصيرون بدون قروب)
```

### EX ops
```
EX [day] [shift]: [doctor] أو [old] → [new]
```

---

## Edge cases

- **Doctor already in another group** (for add operation)
  Reject: "د.أحمد ينتمي لقروب [X]. الطبيب لا يكون بأكثر من
  قروب. تبي تنقله؟"

- **Group has fewer than 6 doctors after operation**
  Allow but warn: "⚠ قروب [X] راح يكون فيه [N] أطباء، أقل
  من الحد الأدنى الصحي (6). يدل على نقص."

- **Delete a group with members**
  Do not silently delete. Ask: "قروب [X] فيه [N] أطباء. شو
  أسوي فيهم؟
   1. أنقلهم لقروب آخر
   2. أتركهم بدون قروب
   3. ألغي الحذف"

- **Rename to an existing group name**
  Reject: "اسم [X] مستخدم. اختر اسم ثاني."

- **EX doctor conflict** (already regular or delegator that shift)
  Reject: "د.أحمد معيّن طبيب عياده/ديليقيتر بالشفت [X]. ما
  يقدر يكون EX بنفس الشفت."

- **EX assignment when one already exists**
  Always ask before replacing: "د.سامي هو EX حالي للشفت
  [X] يوم [Y]. أبدله بـ د.أحمد؟"

- **EX for past day**
  Reject. Historical data is locked.

- **Moving the last doctor out of a group**
  Allow but warn: "قروب [X] راح يصير فاضي بعد النقل. تبي
  تحذفه؟"

---

## Common mistakes to avoid

- Do not add a doctor to multiple groups. One doctor = one group.
- Do not silently delete a group with members.
- Do not assign EX to a shift where the doctor is already
  active as regular or delegator.
- Do not invent doctor IDs or group IDs.
- Do not skip the size warning when a group falls below 6.

---

## Example conversation

```
TL: أضف د.أحمد لقروب الصباح

AI: [calls get_groups(clinic_id)]
    [checks if Ahmed is in another group] — Ahmed is ungrouped

AI: إضافة د.أحمد إلى قروب الصباح.

    حالياً قروب الصباح فيه 5 أطباء، راح يصير 6 (الحد الأدنى الصحي).

    أحفظ؟

TL: نعم

AI: [calls add_doctor_to_group(ahmed, morning_group)]
    تم. د.أحمد بقروب الصباح.
```

**Move example:**
```
TL: انقل د.سامي من قروب أ إلى قروب ب

AI: [calls get_groups, get_group for both]

AI: نقل د.سامي:
    - قروب أ: 7 → 6 أطباء
    - قروب ب: 5 → 6 أطباء

    أحفظ؟

TL: نعم

AI: [calls move_doctor_to_group(sami, group_a, group_b)]
    تم. د.سامي بقروب ب.
```

**Delete with members:**
```
TL: احذف قروب ج

AI: [calls get_group(c)] — has 3 members

AI: قروب ج فيه 3 أطباء: د.محمد، د.علي، د.خالد.
    شو أسوي فيهم؟
    1. أنقلهم لقروب آخر (أي قروب؟)
    2. أتركهم بدون قروب
    3. ألغي الحذف

TL: 2

AI: تأكيد:
    - إزالة 3 أطباء من قروب ج (يصيرون بدون قروب)
    - حذف قروب ج

    أحفظ؟

TL: نعم

AI: [calls remove_doctor_from_group for each, then delete_group]
    تم. قروب ج محذوف، 3 أطباء بدون قروب الآن.
```

**EX assignment:**
```
TL: عيّن د.محمد EX للشفت الصباحي يوم الأحد

AI: [pre-flight checks] — Mohammed is not regular/delegator Sunday morning
    [calls get_ex(this_week, sunday, morning)] — currently empty

AI: تعيين د.محمد EX للشفت الصباحي يوم الأحد.

    أحفظ؟

TL: نعم

AI: [calls assign_ex(this_week, sunday, morning, mohammed_id)]
    تم. د.محمد EX للشفت الصباحي يوم الأحد.
```
