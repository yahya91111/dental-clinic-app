# Example: Announcement with AI rewrite

## Why this example matters

Most TL announcements are quick text the TL types fast.
The AI offers to rewrite into a formal tone before
sending. This example covers:
- The TL's text in dialect → AI's formal rewrite
- Preview before send (with edit option)
- Audience resolution from buttons
- The send + confirmation

It also shows the case where the TL had pre-specified
some details in the trigger message, and the AI skipped
the corresponding question.

---

## Scenario setup

- 3 clinic groups: قروب 1 (clinical, 7 doctors),
  قروب 2 (clinical, 6 doctors), التريني 1 (5 trainees).
- Total: 18 doctors in the clinic.
- TL wants to announce a mandatory training session
  tomorrow at 10 AM for the morning group only.

---

## The conversation

```
TL: ابعت لقروب الصباح إن باجر دوره تدريب 10 الصبح حضوركم ضروري

AI: [internal: parses message]
    - Audience: specified as "قروب الصباح"
      → map to the primary group currently on morning rotation
      → today this means قروب 1 (7 doctors)
    - Text: specified ("باجر دوره تدريب 10 الصبح حضوركم ضروري")
    - Format choice: not specified → ask

AI: نصّك بلهجه. تبيني أرسله كما هو ولا أعيد صياغته
    بنبره رسميه؟
    [أرسله كما هو] [أعد صياغته]

TL: [أعد صياغته]

AI: [internal: rewrites preserving every fact]
    [internal: original facts:
      - tomorrow
      - training session
      - 10 AM
      - attendance mandatory]

AI: لـ: قروب 1 (7 أطباء)
    النص بعد الصياغه:
    "يُعقد غداً دوره تدريبيه في تمام العاشره صباحاً.
    حضور الجميع مطلوب."

    [أرسل] [عدّل النص] [غيّر المستلمين] [إلغاء]

TL: [أرسل]

AI: [internal: get_doctors_by_group(قروب 1) → 7 IDs]
    [internal: calls send_notification(7 ids, text)]

AI: تم. أُرسل التعميم لـ 7 أطباء.
```

---

## Variation A — TL keeps the dialect text

```
TL: ابعت لقروب الصباح إن باجر دوره تدريب 10 الصبح حضوركم ضروري

AI: نصّك بلهجه. تبيني أرسله كما هو ولا أعيد صياغته
    بنبره رسميه؟
    [أرسله كما هو] [أعد صياغته]

TL: [أرسله كما هو]

AI: لـ: قروب 1 (7 أطباء)
    النص:
    "باجر دوره تدريب 10 الصبح حضوركم ضروري"

    [أرسل] [عدّل النص] [غيّر المستلمين] [إلغاء]

TL: [أرسل]

AI: تم. أُرسل التعميم لـ 7 أطباء.
```

---

## Variation B — TL did not specify the audience

```
TL: ابعت تعميم بدوره تدريب باجر 10 صباحاً

AI: لمين تبي تبعت؟
    [كل أطباء المركز]
    [قروب معيّن]
    [أطباء محدّدين]

TL: [قروب معيّن]

AI: أي قروب؟
    [قروب 1] [قروب 2] [التريني 1]

TL: [قروب 1]

AI: تبيني أعيد صياغته بنبره رسميه؟
    [نعم] [أرسله كما هو]

TL: [نعم]

AI: لـ: قروب 1 (7 أطباء)
    النص بعد الصياغه:
    "تُعقد دوره تدريبيه غداً في تمام العاشره صباحاً."

    [أرسل] [عدّل النص] [غيّر المستلمين] [إلغاء]

TL: [أرسل]

AI: تم. أُرسل التعميم لـ 7 أطباء.
```

---

## What this example teaches the AI

### Decision points the AI navigated

1. **Parse first, ask only what's missing.** In the main
   example, the TL specified the audience and the text in
   the trigger message. The AI only asked about the
   rewrite choice, nothing else.

2. **Rewrite preserves every fact.** Original had four
   facts (tomorrow, training, 10 AM, mandatory). The
   rewrite kept all four. No additions, no omissions.

3. **Preview is always shown.** Even when the TL chose
   verbatim, the preview card appeared so the TL saw
   exactly what would go out.

4. **One question per decision.** When the TL didn't
   specify the audience (Variation B), the AI asked
   "audience type" first, then "which group" — separate
   questions, not nested ones.

5. **Audience count surfaced.** The preview shows
   "(7 أطباء)" so the TL knows the scope before
   pressing send.

6. **No surprises in the recipient list.** The AI
   resolved "قروب الصباح" intelligently using the
   current rotation. If ambiguous, it would have asked.

### Rules and templates applied

- `sharedKnowledge/notifications/universal/tone.md` —
  formal rewrite rules
- `sharedKnowledge/notifications/universal/principles.md` —
  Golden Rule (confirm before send), scope binding
- `sharedKnowledge/notifications/clinical/recipients.md` —
  `specific_group` resolution
- `teamLeaderKnowledge/notifications/workflows/send_announcement.md` —
  the workflow steps

### Anti-patterns avoided

- Did NOT re-ask the audience when the TL already said
  "قروب الصباح".
- Did NOT re-ask the text content when the TL already
  typed it.
- Did NOT add "مع الشكر" or any signature.
- Did NOT add emojis or exclamation marks despite the
  TL's casual phrasing.
- Did NOT send without the preview confirmation.
- Did NOT include the TL's own ID in the recipient list.

---

## Related references

- Workflow: `../workflows/send_announcement.md`
- Tone rules: `../../../sharedKnowledge/notifications/universal/tone.md`
- Principles: `../../../sharedKnowledge/notifications/universal/principles.md`
