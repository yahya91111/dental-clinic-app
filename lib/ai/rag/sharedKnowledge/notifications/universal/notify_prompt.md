# The Unified Notify Prompt

## Purpose

A single, consistent question pattern that runs after
**every** notable action — manual or AI-driven — to let
the user decide who (if anyone) should be notified.

This file replaces the older "auto-fire" model where each
template had its own confirm-or-not rule. The new model:

- **All notifications are optional.**
- **All notifications are user-chosen.**
- **One pattern fits every action.**

Read by all clinical-tier assistants. Management-tier
assistants use the same pattern with adjusted scope keys
(see `management/notify_prompt.md` when built).

---

## Why this design

Most clinical actions happen in person — doctors are
together in the clinic when a swap is arranged, an
absence is announced, or a coverage is decided. The
notification is a **record-keeping aid**, not the way
information actually travels.

So the user — not the AI — judges whether the
notification adds value. The AI's job is to ask
consistently and act on the answer.

The exception is the **future Requests page**, where
formal approvals require the TL to receive a mandatory
notification to approve/reject. That flow is separate
and not part of this pattern.

---

## The pattern

After completing any write action that other people
could conceivably care about, the assistant shows:

```
تم [إجراء مختصر]. أعلِم أحد؟
[المعنيّين فقط]
[أفراد محددين]
[القروب (+ التريني)]
[كل المركز]
[لا داعي]
```

The user picks one. The assistant resolves recipients
and sends. Done.

---

## The five options

### `المعنيّين فقط`
The doctors directly affected by the action. The
assistant resolves this from the action context.

Examples per action type:
- **Swap** → both swapped doctors
- **Absence with coverage** → the covering doctor
- **EX assignment** → the assigned doctor
- **Slot edit** → the old + new occupants

**Hide this option** if the action has no "other parties"
(e.g., TL marking own absence with no coverage assigned
yet — the only "affected" person is the TL themselves,
which is meaningless).

### `أفراد محددين`
A free pick from the clinic's doctor list. The assistant
opens a multi-select button menu of all clinic doctors
(excluding the actor). The user taps the ones they want.

Use cases:
- TL wants to inform a delegator about a swap without
  notifying the whole group.
- TL wants to tell one specific doctor about an
  EX assignment without group-wide noise.

After the pick, the assistant confirms the count:
"اخترت 2 أطباء. أرسل؟" [أرسل] [غيّر الاختيار]

### `القروب (+ التريني)`
The actor's primary group plus any linked trainee
groups (resolved via `recipients.md →
tl_group_with_trainees` for the TL, or
`absent_doctor_group_with_trainees` for a doctor).

**Hide this option** if the actor has no group (rare —
e.g., a doctor in "Unassigned" group classification).

### `كل المركز`
All active doctors in the clinic, excluding
administrative groups (per `excluded_groups` in
`group_classification`).

Always available unless the clinic has only one doctor
(the actor).

### `لا داعي`
Skip. No notification fires.

This is a valid, normal choice. Most actions in a small
clinic do not need a notification because everyone is
present.

---

## When to hide the prompt entirely (zero recipients)

If **all** of the above options would resolve to zero
recipients, do not ask. Close the action silently.

Conditions that trigger this skip:
- The action is on a draft/unpublished schedule that no
  doctor can see yet.
- The action affects only the actor themselves and no
  other doctor.
- The action is a no-op (e.g., deleting an empty slot).
- The clinic has only the actor as an active doctor.

The assistant still confirms the action ("تم.") but
omits the notify prompt.

---

## When to skip the prompt for a different reason

A few action types **embed** the notification in the
action itself, so the prompt is redundant:

- **Send announcement** (`send_announcement` workflow) —
  the announcement IS the notification. The audience
  selection happens earlier in the workflow.
- **Card button taps on incoming requests** — the card
  flow is its own UX; no follow-up notify prompt.

These cases are noted in their respective workflows.

---

## Resolution and send

Once the user picks an option:

1. **Resolve recipients** using the matching key from
   `recipients.md`.
2. **Apply the relevant template** from
   `event_templates.md` to build the text (substituting
   placeholders from the action context).
3. **Call `send_notification(recipient_ids, text)`**.
4. **Confirm:** "أُرسل لـ {count} {أطباء|طبيب}."

If resolution returns zero (e.g., empty trainee group),
say: "ما فيه مستلمين، ما أرسلت شي."

---

## Examples

### Example 1 — Swap via AI

```
TL: بدّل د.أحمد ود.خالد بفترة P3 الأحد
AI: [proposes the swap, TL confirms, AI executes]
AI: تم تبديل د.أحمد ود.خالد. أعلِم أحد؟
    [المعنيّين فقط] [أفراد محددين]
    [القروب (+ التريني)] [كل المركز] [لا داعي]
TL: [المعنيّين فقط]
AI: أُرسل لـ 2 أطباء.
```

### Example 2 — Manual EX assignment (Source C)

```
[TL opens app. DB trigger detected a manual EX
 assignment to د.سامي from yesterday.]

AI: لاحظت إنك عيّنت د.سامي EX لـ P4 الخميس.
    أعلِم أحد؟
    [المعنيّين فقط (د.سامي)] [أفراد محددين]
    [القروب (+ التريني)] [كل المركز] [لا داعي]
TL: [المعنيّين فقط]
AI: أُرسل لـ د.سامي.
```

### Example 3 — Zero recipients (skip)

```
TL: احذف الفتره الفاضيه يوم الأحد P2 عياده 3
AI: [executes deletion — slot was already empty]
AI: تم.
[No notify prompt — no one was affected.]
```

### Example 4 — Specific individuals

```
TL: استئذنت P4 الخميس
AI: [marks absence, asks coverage, TL picks
     د.خالد as reserve]
AI: تم. د.خالد بفترتك الخميس. أعلِم أحد؟
    [المعنيّين فقط (د.خالد)] [أفراد محددين]
    [القروب (+ التريني)] [كل المركز] [لا داعي]
TL: [أفراد محددين]
AI: اختر الأطباء:
    [د.خالد] [د.أحمد] [د.محمد] [د.سامي] [د.علي]
    [د.يوسف] [د.عبدالله]
TL: [د.خالد] [د.أحمد]
AI: اخترت د.خالد و د.أحمد. أرسل؟
    [أرسل] [غيّر الاختيار]
TL: [أرسل]
AI: أُرسل لـ 2 أطباء.
```

---

## Anti-patterns

- Do NOT auto-fire any notification without showing the
  prompt (except the embedded cases listed above).
- Do NOT change the option order between actions. The
  user learns the order; switching it slows them down.
- Do NOT pre-select an option. The user picks every
  time.
- Do NOT skip the prompt because "the previous action
  used the same recipients." Always ask.
- Do NOT add a sixth option for "edge case" — propose a
  change to this file instead.
- Do NOT show the prompt if zero recipients would
  result. Skip silently.

---

## Future: Requests page (mandatory notifications)

When the Requests page ships, it introduces a separate
class of notification: **formal approval requests**. The
TL must receive a mandatory notification when a doctor
submits a leave/swap/permission request for approval.

That flow does NOT use this prompt. It has its own
mandatory pipeline.

This file documents the **awareness-style** notifications
that the current Phase 1 system uses. The two systems
will coexist.

---

## Related references

- For the templates that supply text → `../clinical/event_templates.md`
- For recipient resolution keys → `../clinical/recipients.md`
- For database-triggered (Source C) events → `system_events.md`
- For per-role workflow integration → each role's `notifications/workflows/` folder
- For future Requests page (out of scope here) → project memory `project_requests_page_future`
