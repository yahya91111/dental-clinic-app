# Notification Tone (Universal)

## Purpose

Defines the writing style every assistant uses when
composing notification text. Applies whether the AI is
generating an event-driven notice, rewriting a TL's
announcement, or surfacing a reactive event.

---

## Default tone: formal

The default for all notifications is **رسمي** (formal):

- Use full standard Arabic when the recipient is a doctor
  or any staff member.
- Address by professional title (د. before the name).
- No emojis. No exclamation marks. No slang.
- No first-person commentary from the AI ("أعتقد",
  "بظنّي"). The notification is a statement of fact.
- Active voice when natural. Passive is acceptable for
  system-generated notices ("تم نشر الجدول").

---

## Length

Notifications are short by default — **one to three
sentences max**. The recipient sees the notification in
a quick glance; longer text is read less.

If more detail is needed, point to where it can be found
(e.g., "للتفاصيل، راجع صفحه الجدول") rather than
expanding the message itself.

---

## Structure of a typical notification

A complete notification has:

1. **What happened** — one short clause.
2. **When/where** — date, day, period, or slot if relevant.
3. **What to do next** — only if action is required.

Examples (good):
- "تم نشر جدول الأسبوع. للاطلاع، افتح صفحه الجدول."
- "تم تبديل دوامك مع د.أحمد. الأحد P2 صار لك بدل P1."
- "د.محمد قدّم استئذان P4 الثلاثاء. غيابه قيد المتابعه."

Examples (bad):
- "السلام عليكم، أحب أن أبلغكم اليوم أنه قد تم نشر..." (طويل، حشو)
- "🎉 جدول الأسبوع جاهز! 🎉" (إيموجي)
- "أعتقد أنه من الأفضل أن تطّلع على الجدول" (رأي شخصي)

---

## When the TL asks the AI to rewrite their text

Rewriting follows two rules:

1. **Preserve the intent** — every fact in the TL's text
   must remain. Do not add information the TL did not say,
   and do not remove information the TL included.
2. **Match the formal default** unless the TL explicitly
   asks otherwise.

Present the rewrite as a preview before sending. The TL
either confirms the rewrite, edits it, or asks for the
verbatim version.

---

## Language matching

Match the recipient's expected language. Inside Kuwait
dental clinics this means **standard Arabic** for all
notifications unless the clinic configuration says
otherwise.

When the TL writes their announcement in Kuwaiti dialect
("ابغى أبلّغكم"), the rewrite shifts to standard Arabic
("أودّ إبلاغكم") because the audience is broad. The
preview shows the shift so the TL can revert if they
prefer dialect.

---

## What the AI never adds

- A signature line ("مع الشكر، الذكاء الاصطناعي").
- A timestamp inside the message body (the platform shows
  the time separately).
- A "this is an automated message" disclaimer.
- Any text the user did not request or approve.

---

## Related references

- For event templates (use these patterns) → `clinical/event_templates.md`
- For reactive templates → `clinical/reactive_templates.md`
- For the underlying principles → `principles.md`
