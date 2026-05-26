# Send Announcement (Team Leader)

## When to use

The Team Leader wants to send a free-form announcement to
all clinic doctors, a specific group, or specific
individuals. This is the manual "تعميم" path — distinct
from the auto-fired event notifications that come out of
other workflows (schedule published, swap done, etc.).

Trigger phrases (examples):
- "ابعت تعميم لكل الأطباء"
- "أبلّغ قروب الصباح إن الاجتماع غدا 10 صباحاً"
- "ابعت لـ د.أحمد ود.سامي إن المريض اللي بـ P2 يحتاج متابعه"
- "send announcement"

Do NOT use this workflow for:
- Announcing a schedule publish → handled inside `create_weekly`
  via the `schedule_published` template
- Notifying about a swap → handled inside `swap_on_behalf`
- Recording the TL's own absence → that uses `mark_unavailable`
  + the `tl_absence_recorded` template

---

## Required tools

- `ask_tl_choice(question, options[])` — used for every
  button question in this workflow.
- `get_groups(clinic_id)` — list the clinic's groups (for
  the "specific group" option).
- `get_clinic_doctors(clinic_id)` — list active doctors
  (for the "specific doctors" option).
- `send_notification(recipient_ids[], message_text)` — the
  actual send action.

---

## Pre-flight checks

1. Confirm the user is asking for a manual announcement
   (not one of the auto-fire flows). The trigger phrases
   are usually clear.
2. Read the TL's initial message for any details they
   already provided (audience, text). Skip the
   corresponding question if already answered.

---

## Steps

1. **Resolve the audience.** Ask via `ask_tl_choice` only
   if not already specified:
   ```
   "لمين تبي تبعت؟"
   [كل أطباء المركز]
   [قروب معيّن]
   [أطباء محدّدين]
   ```
   - "كل أطباء المركز" → recipient key `all_clinic_doctors`.
   - "قروب معيّن" → second question listing groups by name:
     ```
     "أي قروب؟"
     [Group 1] [Group 2] [التريني 1] ...
     ```
     Groups are pulled from `get_groups(clinic_id)`,
     excluding any group classified as `excluded` per
     `clinic_preferences.md`.
   - "أطباء محدّدين" → multi-select from clinic doctors
     (use repeated `ask_tl_choice` calls or a multi-select
     tool when available).

2. **Get the text.** Ask via `ask_tl_choice` only if the
   TL did not include their text in the initial message:
   ```
   "النص جاهز عندك ولا تبيني أعيد صياغته؟"
   [عندي نص جاهز — أعرضه عليك]
   [اكتب نصاً مبدئياً وأنا أرسله]
   [أعد صياغته بنبره رسميه]
   ```

   Branches:
   - "عندي نص جاهز" → ask the TL to paste/type it, then
     show it back as a preview.
   - "اكتب نصاً مبدئياً" → ask the TL for the key points
     in one line ("اجتماع غدا 10ص") then compose a
     formal version.
   - "أعد صياغته بنبره رسميه" → take the TL's existing
     text and rewrite per `tone.md` rules, preserving
     every fact.

3. **Show the preview.** Present the resolved audience
   and the final text as a single confirmation card:
   ```
   لـ: [audience description]
   النص:
   "{message_text}"

   [أرسل] [عدّل النص] [غيّر المستلمين] [إلغاء]
   ```

4. **On TL action:**
   - **[أرسل]** → resolve recipient IDs per
     `recipients.md`, call `send_notification(ids, text)`,
     report "تم. أُرسل لـ {count} شخص."
   - **[عدّل النص]** → return to step 2 (text input).
   - **[غيّر المستلمين]** → return to step 1.
   - **[إلغاء]** → stop. Confirm "ألغيت التعميم."

5. **On send failure**, report the error in one line. Do
   not retry silently.

---

## Edge cases

- **Empty audience after resolution** — if the chosen
  recipient key resolves to zero doctors (e.g., a group
  is empty), report "ما فيه مستلمين، ما أرسلت شي."
  Do not send.

- **Text is empty or whitespace** — refuse to send.
  Return to step 2.

- **TL asks to send to "كل المراكز" or another clinic** —
  decline: "خارج صلاحياتك. تقدر تبعت لأطباء عيادتك فقط."

- **TL pastes text in dialect, picks "verbatim"** — send
  as-is. Do NOT auto-rewrite. The TL chose verbatim.

- **TL pastes text and asks for rewrite, but the rewrite
  drops a detail** — re-include and re-preview. The
  rewrite must preserve every fact.

- **TL changes their mind between preview and send** — go
  back to whichever step they indicated. Never send
  without an explicit [أرسل] click.

---

## Common mistakes to avoid

- Do not skip the preview, even for very short texts.
- Do not auto-rewrite without the TL choosing the rewrite
  option.
- Do not assume the audience if the TL only said "ابعت
  تعميم" — always confirm.
- Do not call `send_notification` more than once for the
  same approval. Each send is one click.
- Do not include the TL's own ID in the recipient list
  (they wrote the message; they don't need to receive
  it).

---

## Example conversation

```
TL: ابعت تعميم لكل الأطباء أن الاجتماع غدا 10 صباحاً

AI: [internal: parses message]
    - Audience already specified: all clinic doctors
    - Text already specified (key points: meeting tomorrow 10am)
    - Format choice not specified → ask

AI: النص جاهز عندك ولا تبيني أعيد صياغته؟
    [عندي نص جاهز — هو اللي قلته]
    [أعد صياغته بنبره رسميه]

TL: [أعد صياغته بنبره رسميه]

AI: [internal: rewrites to formal tone]

AI: لـ: كل أطباء المركز (12 طبيب)
    النص:
    "يُعقد اجتماع غداً الساعه العاشره صباحاً.
    حضور الجميع مطلوب."

    [أرسل] [عدّل النص] [غيّر المستلمين] [إلغاء]

TL: [أرسل]

AI: [internal: calls send_notification(12 doctor_ids, text)]
    تم. أُرسل التعميم لـ 12 طبيب.
```

---

## Related references

- For the text style → `sharedKnowledge/notifications/universal/tone.md`
- For the principles (Golden Rule, scope) → `sharedKnowledge/notifications/universal/principles.md`
- For audience resolution → `sharedKnowledge/notifications/clinical/recipients.md`
- For auto-fire notifications (schedule, swap, etc.) → `sharedKnowledge/notifications/clinical/event_templates.md`
