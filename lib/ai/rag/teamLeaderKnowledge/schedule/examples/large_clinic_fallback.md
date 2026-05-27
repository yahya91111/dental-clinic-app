# Example: Large clinic — automatic fallback to per-day drafting

## Why this example matters

Most schedules fit comfortably in a single
`draft_weekly_schedule` call. But a large clinic with many
rooms and several special-group members can produce a JSON
payload that approaches the output token ceiling. When this
happens, the AI must **not** ask the TL what to do — it
should automatically fall back to building the week day by
day using `draft_day_schedule`.

This example shows the AI:
- Picking the default tool first (cheaper, faster)
- Detecting the `max_tokens` failure
- Switching to 5 per-day calls without losing the conversation
- Informing the TL once with a single line, not asking permission

---

## Scenario setup

The clinic has:
- **5 clinic rooms** (large)
- **Group 1** — 9 doctors
- **Group 2** — 8 doctors
- **Board** — 2 doctors, TL chose morning this week
- **Trainee Group 1** (linked to Group 1) — 2 trainees
  (one beginner, one competent)
- **Trainee Group 2** (linked to Group 2) — 1 beginner trainee

Effective load per shift is ~12-14 doctors. The full week's
JSON would contain roughly:
- 5 days × 4 periods × 5 rooms × 2 (doctor + delegator) = **200 slots**
- Plus role, status, and id fields per slot
- Estimated output: **~7,000-9,000 tokens** — close to the ceiling

---

## The conversation

```
TL: ابني جدول الأسبوع القادم

AI: [internal: reads clinic_info → 5 rooms]
    [internal: reads doctors → 17 regular + 2 board + 3 trainees]
    [internal: notes 3 trainees — must ask about each]

AI: قبل ما أوزّع، محتاج أعرف:
    1. البورد (د.A و د.B) — أي شفت هالأسبوع؟
    2. د.X — مع أي مدرّب؟
    3. د.Y — يستلم فتره لوحده ولا مع طبيب؟
    4. د.Z — مع أي مدرّب؟

TL: البورد صباحي.
    د.X مع د.M.
    د.Y لوحده.
    د.Z مع د.K.

AI: تمام. قول لي قروب 1 يداوم صباحي أي يوم.

TL: قروب 1 صباحي الأحد والاثنين والثلاثاء

AI: [internal: infers rotation —
     Sun/Mon/Tue: G1 morning, G2 evening
     Wed/Thu: G2 morning, G1 evening
     Board: morning all week
     Trainees follow parent group]

    [internal: builds full week JSON, ~200 slots]
    [internal: calls draft_weekly_schedule(json)]

    ↓ TOOL RESULT: error
    { "stop_reason": "max_tokens",
      "message": "Output truncated at 8192 tokens" }

    [internal: detects max_tokens — apply fallback rule]
    [internal: no retry of same tool; switch to per-day]

AI: الجدول كبير، أبنيه يوم يوم.

    [internal: calls draft_day_schedule("sunday", sunday_slots)]
    ↓ ✅ success (~1,400 tokens output)

    [internal: calls draft_day_schedule("monday", monday_slots)]
    ↓ ✅ success

    [internal: calls draft_day_schedule("tuesday", tuesday_slots)]
    ↓ ✅ success

    [internal: calls draft_day_schedule("wednesday", wednesday_slots)]
    ↓ ✅ success

    [internal: calls draft_day_schedule("thursday", thursday_slots)]
    ↓ ✅ success

AI: تم. الجدول كامل بالمسوّده. عاينه وعدّل الي تبيه،
    وقولي لما تبي تحفظ.

    ملاحظات:
    - البورد بعياده 5 طول الصباحي (د.A بـ P1، د.B بـ P2)
    - د.X مع د.M بأيام Group 1
    - د.Y موزّع كطبيب عادي
    - د.Z مع د.K بأيام Group 2

TL: تمام، احفظ

AI: [internal: calls confirm_weekly_schedule(next_sunday)]
    تم. جدول الأسبوع جاهز.
```

---

## What this example teaches the AI

### The fallback decision

1. **No upfront prediction** — The AI did NOT try to estimate
   the JSON size in advance. It tried the cheaper tool first
   and let it fail. Estimating is fragile; letting the API
   decide is reliable.

2. **No retry of the failed tool** — When `max_tokens` came
   back, the AI did NOT call `draft_weekly_schedule` again
   hoping for a different result. It switched tools immediately.

3. **No permission request** — The AI did NOT ask the TL
   "should I try a different approach?" The fallback is
   automatic. The TL only sees one informational sentence.

4. **Single status line, then silence** — The AI said
   "الجدول كبير، أبنيه يوم يوم" once, then ran 5 tool calls
   without commentary between each one. The TL gets the final
   confirmation after all 5 succeed.

### Order matters

The AI built days in order Sun → Mon → Tue → Wed → Thu.
This matches the week's natural flow and helps the TL
review the UI top-to-bottom.

### If one day fails mid-fallback

If `draft_day_schedule("wednesday", ...)` had failed, the
AI would NOT silently retry or skip. It would say:
"يوم الأربعاء فشل. أعيد المحاوله، أو نعدّل يدوي؟"
The 3 days already built remain in the draft.

### What did NOT change vs the weekly tool

- Same rules applied (group separation, fairness, etc.)
- Same questions to the TL upfront (Board, trainees, rotation)
- Same confirmation flow at the end
- Same final summary content

The fallback only changes **how** the draft is pushed to
the UI — not **what** the schedule contains.

---

## Anti-patterns avoided

- Did NOT pre-calculate JSON size to decide which tool to use.
  Tried the cheap one first, fell back on real failure.
- Did NOT ask the TL "should I try day-by-day?" — fallback
  is automatic.
- Did NOT abandon the conversation after the first failure.
- Did NOT retry the failed `draft_weekly_schedule` with the
  same payload.
- Did NOT spam the TL with "building Sunday... building
  Monday..." messages between tool calls.
- Did NOT lose the pre-flight context (clinic info, trainee
  placements, board shift) when switching tools.

---

## Related references

- Workflow: `workflows/create_weekly.md` (the tool-choice rule)
- Rules: `rules/special_groups.md`, `rules/coverage.md`
- Related example: `examples/distribution_with_board_and_trainee.md`
  (same idea, smaller clinic, weekly tool succeeds)
