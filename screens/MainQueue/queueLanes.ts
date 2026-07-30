/**
 * queueLanes — قلبُ مخطّطِ الدور: بناءُ المسارات من قائمةِ المرضى.
 *
 * مفصولٌ عن الرسمِ عمدًا. هذا الملفُّ لا يعرفُ شيئًا عن React ولا عن الشاشة،
 * فيمكنُ تشغيلُه وحدَه واختبارُ قراراتِه (scripts/test-timeline-wall.ts) —
 * وقواعدُ الترتيبِ هنا (البريكُ الثابتُ يقسمُ اليومَ إلى قطاعات، والموعدُ ليس
 * مسمارًا) أدقُّ من أن تُترَكَ بلا اختبارٍ يُثبِتُها.
 */
import { Patient, TREATMENT_DURATIONS } from './constants';

// المدّة: الطبيبُ يحدّدها لكلِّ مريض (expected_minutes)؛ وإلّا تقديرٌ من نوعِ العلاج.
export const estMinutes = (p: Patient): number =>
  (p.expected_minutes && p.expected_minutes > 0) ? p.expected_minutes : (TREATMENT_DURATIONS[p.treatment || ''] ?? 20);
// شرطُ الظهورِ في المخطّط: أن يكون الطبيبُ قد حدّد المدّة على الكرت.
export const hasDuration = (p: Patient): boolean => !!p.expected_minutes && p.expected_minutes > 0;
// ذوو الأولويّة إلى مقدّمةِ الدور: كبارُ السنّ + الاحتياجاتُ الخاصّة (يُختاران على الكرت).
export const isPriority = (p: Patient): boolean => !!p.isElderly || !!p.isSpecialNeeds;

export const minutesOfDay = (d?: Date): number | null =>
  d ? d.getHours() * 60 + d.getMinutes() : null;

// ── نافذةُ المخطّط: اليومُ التقويميُّ كاملًا، منتصفَ الليلِ إلى منتصفِ الليل ──
// مخطّطٌ لكلِّ يومٍ وحدَه: لا شيءَ يُجدوَلُ خارجَه ولا يعبرُ إلى الغد. وهو ما يجعلُ
// مخطّطَ يومٍ ماضٍ قابلًا للعرضِ في الأرشيفِ كما هو، بلا حسابٍ يعتمدُ على «الآن».
export const DAY_START = 0;
export const DAY_END = 24 * 60;

// تاريخُ اليومِ **بالتوقيتِ المحلّيّ**. لا تصلحُ toISOString هنا: هي بالـ UTC، وبغدادُ
// UTC+3، فالساعةُ الواحدةُ ليلًا تُعطي تاريخَ الأمسِ فيُحفَظُ مخطّطُ اليومِ تحتَ يومٍ سابق.
export const localDay = (d: Date = new Date()): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export const isRealClinic = (c?: string): boolean => !!c && /^clinic\s*\d+/i.test(c);
export const clinicNum = (c: string): number => parseInt((c.match(/\d+/) || ['0'])[0], 10);

export type Kind = 'done' | 'cur' | 'over' | 'fut' | 'eld' | 'lateDone' | 'break' | 'na';
// orig: وقتُ البريكِ الأصليُّ المحدَّد (كي نُظهِرَ «أُزيحَ · كان HH:MM» إن تحرّك) — للبريكِ فقط
// fixed: بريكٌ ثابتٌ (تبديلُ شفت) لا يتحرّكُ مهما حصل؛ وإلّا متحرّكٌ يُدفَعُ بانشغالٍ حقيقيّ
export type Blk = { start: number; end: number; kind: Kind; p: Patient; orig?: number; fixed?: boolean };
// beyond: منتظِرون انتهى شفتُهم قبلَ أن يأتيَ دورُهم — سيرحلون. لا يُرسَمُ لهم كرتٌ في
// الشفتِ التالي؛ شارةٌ ملاصقةٌ لكرتِ التبديلِ من اليسارِ تقولُ كم هم.
export type Lane = { clinic: string; short: string; blocks: Blk[]; beyond: Patient[] };
export type TimelineData = { lanes: Lane[]; dayStart: number; dayEnd: number };
export type Break = { start: number; end: number; fixed?: boolean };   // فترةُ استراحةٍ لكلِّ العيادات (دقائقُ من منتصف الليل)؛ fixed = ثابتٌ لا يتحرّك


// ── تبديلُ الشفتِ حاجزٌ لا يُخترَق (قاعدةُ عرضٍ زمنيّةٌ محضة) ──
// لا كرتَ يتداخلُ مع تبديلِ الشفت. حالتان تقعانِ في العملِ الحقيقيّ:
//  • **دخلَ داخلَ وقتِ التبديل** → مكانُه بعدَه (فالتبديلُ ماضٍ حينَ جلس)، ووقتُ دخولِه
//    الحقيقيُّ يبقى معروضًا فوقَ كرتِه فلا تضيعُ الحقيقةُ في الإزاحة.
//  • **تأخّرَ فانتهى داخلَه** → يبقى قبلَه كاملًا (فقد بدأَ قبلَ التبديل)، ووقتُ انتهائه كما سُجِّل.
// تُعيدُ نافذةَ العرض [ds, de] التي يجبُ أن يقعَ الكرتُ داخلَها، و moved = أُزيحَ عن ساعتِه.
export function drawWindow(b: Blk, seams: Blk[]): { ds: number; de: number; moved: boolean } {
  if (b.kind === 'break') return { ds: b.start, de: b.end, moved: false };
  let ds = b.start, moved = false;
  for (const s of seams) if (b.start >= s.start && b.start < s.end && s.end > ds) { ds = s.end; moved = true; }
  let de = Math.max(b.end, ds);
  for (const s of seams) if (s.start >= ds && s.start < de) de = s.start;
  return { ds, de: Math.max(de, ds), moved };
}

// ── المحورُ: من الحجزِ إلى البكسل ──
// حجزٌ = «من هذه المرساةِ إلى تلك لا بدَّ من كذا بكسلًا» (كتلةٌ تسعُ نفسَها، فراغٌ يسعُ وسمَه).
export type Claim = { from: number; to: number; w: number };

// وكان الحجزُ يُصرَفُ **كلُّه دفعةً واحدةً عندَ آخرِه**: فالمرساةُ الواقعةُ في وسطِه — وخطُّ
// «الآنَ» أوّلُها — لا تنالُ منه شيئًا، فتأخذُ الخطوةَ الافتراضيّةَ الصغيرةَ وحدَها. فيبقى
// خطُّ الزمنِ لاصقًا ببدايةِ الكرتِ الجاري طولَ العلاجِ ثمّ يقفزُ عرضَ الكرتِ كلَّه دفعةً
// حينَ يبلغُ نهايتَه. والحقُّ أنّ الحجزَ **مساحةٌ للزمنِ فيها نصيب**: فمَن وقعَ في وسطِه
// نالَ منه بقدرِ ما مضى من وقتِه. فيسيرُ خطُّ الآنَ في الكرتِ سيرَ شريطِ التقدُّمِ داخلَه
// سواءً بسواء، والساعةُ الواقعةُ داخلَ علاجٍ طويلٍ تقعُ في موضعِها منه لا في أوّله.
//
// step(from,to) = المسافةُ الافتراضيّةُ بين مرساتَين متجاورتَين (ما لم يُحجَزْ أكثرُ منها).
export function solveAxis(anchors: number[], claims: Claim[], step: (from: number, to: number) => number): Map<number, number> {
  const xm = new Map<number, number>();
  if (!anchors.length) return xm;
  xm.set(anchors[0], 0);
  for (let i = 1; i < anchors.length; i++) {
    const t = anchors[i], pt = anchors[i - 1];
    let xx = (xm.get(pt) as number) + step(pt, t);
    for (const c of claims) {
      if (c.from >= t || c.to < t) continue;         // لا يعنينا إلّا حجزٌ نحنُ في داخلِه أو عندَ آخره
      const fx = xm.get(c.from);
      if (fx === undefined) continue;               // طرفٌ ليس مرساةً — حجزٌ لا محلَّ له
      const share = c.to === t ? c.w : c.w * ((t - c.from) / (c.to - c.from));
      if (fx + share > xx) xx = fx + share;
    }
    xm.set(t, xx);
  }
  return xm;
}

// ── ساعةُ دخولِ المنتظِر ──
// كرتُ المريضِ في القائمةِ يقولُ متى يدخل، وساعتُه **هي ساعةُ المخطّطِ نفسُها** لا حسابٌ ثانٍ
// يُشبِهُها: تُقرأُ من الكتلةِ التي رسمَها المخطّطُ له. ولا يُؤخَذُ إلّا مَن لم يدخلْ بعد
// (fut/eld) — فالجاري والمنجَزُ لهما ساعاتُهما المسجَّلة، ومَن كان «خلفَ الشفت» لا كتلةَ له
// أصلًا فلا وعدَ له بساعة.
export function etaFromLanes(lanes: Lane[]): { [patientId: string]: number } {
  const out: { [patientId: string]: number } = {};
  for (const l of lanes) for (const b of l.blocks) if (b.kind === 'fut' || b.kind === 'eld') out[b.p.id] = b.start;
  return out;
}

// مريضٌ صوريٌّ لكتلةِ البريك (كي تُعامَلَ ككتلةٍ عاديّةٍ في الرسمِ والتخطيط دونَ حقلٍ اختياريّ)
const BREAK_P = { id: '__break__', name: 'Break', queue_number: -2, age: 0 } as Patient;

// ── لقطةُ يومٍ محفوظة ──
// المخطّطُ صورةٌ تُحسَبُ من بياناتٍ حاضرة، فإذا مضى اليومُ لم تعدْ قابلةً لإعادةِ الحساب:
// الأرشفةُ تُجبِرُ status='complete' على المنتظِرين، والبريكاتُ وعددُ الكراسي تُقرأُ من
// إعداداتِ المركزِ الحاليّةِ لا إعداداتِ ذلك اليوم. فنحفظُ ما رآه الطبيبُ كما رآه.
export type DayChart = {
  v: 1;
  day: string;                 // YYYY-MM-DD
  savedAtMin: number;          // «الآنَ» لحظةَ اللقطة — موضعُ خطِّ الزمنِ في العرضِ الأرشيفيّ
  dayStart: number; dayEnd: number;
  chairCount: number;
  breaks: Break[];
  lanes: Lane[];
};

// الحقولُ التي يقرؤها الرسمُ وحدَها — لا نُضاعِفُ ملفَّ المريضِ في جدولٍ آخر
const slimPatient = (p: Patient): Patient => ({
  id: p.id, name: p.name, queue_number: p.queue_number, age: p.age ?? 0,
  clinic: p.clinic, treatment: p.treatment, condition: p.condition,
  expected_minutes: p.expected_minutes, appointment_min: p.appointment_min,
  doctor_name: p.doctor_name, status: p.status,
  isElderly: p.isElderly, isSpecialNeeds: p.isSpecialNeeds,
  na_at: p.na_at,
} as Patient);

export function snapshotChart(
  data: TimelineData, breaks: Break[], day: string, nowMin: number,
): DayChart {
  return {
    v: 1, day, savedAtMin: nowMin,
    dayStart: data.dayStart, dayEnd: data.dayEnd,
    chairCount: data.lanes.length,
    breaks: breaks.map((b) => ({ ...b })),
    lanes: data.lanes.map((l) => ({
      clinic: l.clinic, short: l.short,
      blocks: l.blocks.map((b) => ({ ...b, p: slimPatient(b.p) })),
      beyond: l.beyond.map(slimPatient),
    })),
  };
}

// JSON لا يعرفُ Date: نُعيدُ ما يقرؤُه الرسمُ تاريخًا (na_at وحدَه) بعدَ القراءة
export function reviveChart(raw: any): DayChart | null {
  if (!raw || raw.v !== 1 || !Array.isArray(raw.lanes)) return null;
  const fix = (p: any): Patient => (p?.na_at ? { ...p, na_at: new Date(p.na_at) } : p);
  return {
    ...raw,
    lanes: raw.lanes.map((l: any) => ({
      ...l,
      blocks: (l.blocks ?? []).map((b: any) => ({ ...b, p: fix(b.p) })),
      beyond: (l.beyond ?? []).map(fix),
    })),
  };
}

// ── توفّرُ المواعيد (لحجزِ وقتِ الدخول من الكرت) ──
// هل الفترةُ [start, start+dur] متاحةٌ لموعدٍ جديد؟ متاحٌ = عيادةٌ واحدةٌ على الأقلِّ تبقى فارغةً
// طوالَ الفترةِ وفقَ الجدولِ المتوقَّعِ لكلِّ العيادات (كلُّ المرضى: داخلون + منتظِرون بالدور + محجوزون)
// وخارجَ البريك. الفحصُ لكلِّ عيادةٍ على حدة فلا يُحسَبُ كرسيٌّ فيه مريضان متتاليان ككرسيَّين.
// chairCount<1 (غيرُ معروف) → لا نمنع. excludeId يستثني كتلةَ المريضِ نفسِه عند تعديلِ حجزِه.
export function slotAvailable(
  start: number, dur: number, chairCount: number,
  lanes: Lane[], breaks: Break[], excludeId?: string,
): boolean {
  const end = start + dur;
  if (breaks.some((b) => start < b.end && end > b.start)) return false;
  if (chairCount < 1 || !lanes.length) return true;
  return lanes.some((lane) =>
    lane.blocks.every((b) =>
      // البريكُ يُفحَصُ أعلاه، و«غيرُ المتاح» لا يشغلُ كرسيًّا أصلًا
      b.kind === 'break' || b.kind === 'na' || b.p.id === excludeId || !(start < b.end && end > b.start)
    )
  );
}

// ── هل تسعُ هذه المدّةُ قبلَ تبديلِ الشفت؟ (لتنبيهِ الطبيبِ وهو يحدّدُ المدّةَ على الكرت) ──
// نقيسُ أوسعَ فجوةٍ باقيةٍ في الكراسي قبلَ أوّلِ تبديلٍ أمامَنا؛ فإن لم تسعْها المدّةُ المختارةُ
// فمكانُ المريضِ بعدَ التبديل. نُعيدُ ساعتَه ليقولَها التنبيهُ صراحةً، ونُعيدُ الفجوةَ ليعرضَ البديل.
// (تقديرٌ للعرضِ فقط — الحكمُ النهائيُّ لِـ placeWaiting، وهو يقرأُ لحظةَ التسجيلِ أيضًا.)
export function shiftFit(
  minutes: number, lanes: Lane[], breaks: Break[], nowMin: number, selfId?: string,
): { fits: boolean; gap: number; startsAt: number | null } {
  const wall = breaks.filter((b) => b.fixed && b.end > nowMin).sort((a, b) => a.start - b.start)[0];
  if (!wall || !lanes.length) return { fits: true, gap: Infinity, startsAt: null };
  let gap = 0;
  for (const l of lanes) {
    let t = nowMin;
    for (const b of l.blocks) {
      // البريكُ ليس شغلًا، و«غيرُ المتاح» لا يشغلُ كرسيًّا، وكتلةُ المريضِ نفسِه تُستثنى
      if (b.kind === 'break' || b.kind === 'na' || b.p.id === selfId) continue;
      if (b.start < wall.start) t = Math.max(t, b.end);
    }
    gap = Math.max(gap, wall.start - t);
  }
  gap = Math.max(0, gap);
  return { fits: minutes <= gap, gap, startsAt: minutes <= gap ? null : wall.end };
}

// ── بناءُ المسارات من المرضى ──
// chairsOverride: عددُ الكراسي من الجدولِ المبنيّ (إن وُجد)؛ وإلّا تُشتَقُّ من عياداتِ المرضى.
export function buildLanes(patients: Patient[], nowMin: number, chairsOverride?: string[], breaks: Break[] = []): TimelineData {
  // «غيرُ المتاح» (na) يبقى ظاهرًا في دورِه ضمنَ الطابور (يُلوَّنُ فقط، لا يُنقَلُ إلى مكانٍ آخر) — يُعالَجُ داخلَ حلقةِ الانتظار
  const active = patients.filter((p) => p.queue_number !== -1 && hasDuration(p));

  let chairs: string[];
  if (chairsOverride && chairsOverride.length) {
    chairs = chairsOverride.slice();
  } else {
    chairs = Array.from(new Set(active.map((p) => p.clinic).filter(isRealClinic))) as string[];
    chairs.sort((a, b) => clinicNum(a) - clinicNum(b));
    if (chairs.length === 0) chairs.push('Clinic 1');
  }

  const lanes: { [c: string]: Blk[] } = {};
  const free: { [c: string]: number } = {};
  // نهايةُ ما شغلَه مريضٌ **حقيقيّ** (داخلٌ أو منجَز) — بلا «الآنَ». تُقاسُ بها أدوارُ الطابورِ
  // كما كانت ستكونُ لو لم يتأخّرْ أحد، فنعرفُ مَن كان له مكانٌ في شفتِه حينَ سُجِّل.
  const realEnd: { [c: string]: number } = {};
  chairs.forEach((c) => { lanes[c] = []; free[c] = nowMin; realEnd[c] = 0; });
  const laneOf = (c?: string): string => (isRealClinic(c) && lanes[c!] ? c! : chairs[0]);

  const waiting: Patient[] = [];

  for (const p of active) {
    const entry = minutesOfDay(p.clinic_entry_at);
    const done = minutesOfDay(p.completed_at);
    const est = estMinutes(p);

    // غيرُ المتاحِ: لا يُعامَلُ كجارٍ أو منجَز — يُوضَعُ في دورِه ضمنَ الطابور (سيُلوَّنُ 'na' ويبقى مكانَه)
    if (p.status === 'na') { waiting.push(p); continue; }
    if (p.status === 'complete' || done != null) {
      const s = entry ?? (done != null ? done - est : nowMin);
      const e = Math.max(done ?? s + est, s + 5);
      const lane = laneOf(p.clinic);
      // أُنجزَ متأخّرًا إن تجاوزَ الزمنُ الفعليُّ المدّةَ المقدَّرة → يبقى أحمر (لا يتحوّلُ رماديًّا)
      const late = entry != null && (e - s) > est + 1;
      lanes[lane].push({ start: s, end: e, kind: late ? 'lateDone' : 'done', p });
      free[lane] = Math.max(free[lane], e); realEnd[lane] = Math.max(realEnd[lane], e);
    } else if (entry != null) {
      // دخلَ العيادة: يبقى شكلُ الكرتِ كما كانَ — كرتٌ بمقاسِ المدّةِ المقدَّرةِ كاملةً [الدخول → الدخول+المدّة]،
      // فـ«يمشي عليه الخطُّ الزمنيُّ» مُظهِرًا كم بقيَ ومتى ينتهي. وإن تجاوزَ المدّةَ (over) امتدَّ إلى الآنَ ليُبيّنَ زمنَ التأخير.
      const lane = laneOf(p.clinic);
      const estEnd = entry + est;
      const late = nowMin > estEnd;
      lanes[lane].push({ start: entry, end: late ? Math.max(nowMin, entry + 2) : estEnd, kind: late ? 'over' : 'cur', p });
      // الكرسيُّ مشغولٌ حتّى الإنجازِ المتوقَّعِ (أو الآنَ إن تجاوزَه) — لِتوقُّعٍ صحيحٍ لِمَن بعده
      free[lane] = Math.max(free[lane], estEnd, nowMin); realEnd[lane] = Math.max(realEnd[lane], estEnd);
    } else {
      waiting.push(p);
    }
  }

  // ── البريك لكلِّ عيادةٍ على حدة: كتلةٌ **ثابتةٌ في وقتِها المحدَّد** ──
  //   • الخطُّ الزمنيُّ لا يحرّكُه، والمنتظِرون المتوقَّعون لا يحرّكونَه، و«غيرُ المتاح» لا يحرّكُه.
  //   • يحرّكُه شيءٌ واحدٌ فقط: انشغالٌ **حقيقيٌّ** — مريضٌ دخلَ فعلًا (سُجِّل) عندَ/قبلَ وقتِ البريكِ وما زالَ
  //     يُعالَجُ خلالَه → يُرحَّلُ البريكُ إلى ما بعدِ انتهائِه. المتوقَّعون/غيرُ المتاحِ يلتفّونَ حولَه (يأتون بعدَه إن بلغوه).
  const brs = [...breaks].sort((a, b) => a.start - b.start);
  const movingIv: { [c: string]: { start: number; end: number }[] } = {};  // يُلتَفُّ حولَه (يُقفَزُ إلى ما بعدَه)
  const fixedIv: { [c: string]: { start: number; end: number }[] } = {};   // تبديلُ الشفت: حدٌّ لا يعبرُه كرت
  chairs.forEach((c) => { movingIv[c] = []; fixedIv[c] = []; });
  for (const c of chairs) {
    const realBlocks = lanes[c].slice();   // في هذه المرحلةِ كلُّ كتلِ العيادةِ حقيقيّةٌ (منجَز/جارٍ) — لم يُوضَعْ منتظِرٌ بعد
    for (const br of brs) {
      const d = Math.max(1, br.end - br.start);            // مدّةٌ ثابتةٌ (تُعرَضُ داخلَ الكرت)
      let s = br.start;
      // البريكُ **الثابت** (تبديلُ شفت) لا يتحرّكُ مهما حصل. أمّا **المتحرّك** فيُدفَعُ فقط بانشغالٍ حقيقيٍّ
      // يغطّي وقتَه (مريضٌ دخلَ عندَ/قبلَه وما زالَ) — لا الخطُّ الزمنيُّ ولا المتوقَّعون.
      if (!br.fixed) {
        for (let g = 0; g < 8; g++) {
          const cover = realBlocks.find((rb) => rb.start <= s && s < rb.end);
          if (!cover) break;
          s = cover.end;
        }
      }
      lanes[c].push({ start: s, end: s + d, kind: 'break', p: BREAK_P, orig: br.start, fixed: br.fixed });
      (br.fixed ? fixedIv[c] : movingIv[c]).push({ start: s, end: s + d });
    }
  }

  // يدفعُ بدايةَ الكرتِ إلى ما بعدِ أيِّ فترةٍ يتداخلُ معها (بريكٌ متحرّك)
  const avoidIv = (s: number, est: number, ivs: { start: number; end: number }[]): number => {
    let x = s;
    for (let g = 0; g < 16; g++) {
      let moved = false;
      for (const iv of ivs) if (x < iv.end && x + est > iv.start) { x = iv.end; moved = true; }
      if (!moved) break;
    }
    return x;
  };

  // ── قطاعاتُ اليوم ──
  // البريكُ **الثابتُ** (تبديلُ الشفت) يقسمُ اليومَ في كلِّ عيادةٍ إلى قطاعات، والعلاجُ يسعُ
  // في قطاعٍ واحدٍ **كاملًا** أو يُؤجَّلُ إلى تاليه: لا يعبرُ التبديلَ، ولا يبدأُ داخلَه،
  // ولا يُقَصُّ عندَه. ولكلِّ قطاعٍ وقتُ فراغِه الخاصُّ — فلو أُجِّلَ علاجٌ طويلٌ إلى ما بعدَ
  // التبديلِ بقيَتِ الفجوةُ التي لم تسعْه مفتوحةً لعلاجٍ أقصرَ يأتي بعدَه.
  const WORK_END = DAY_END;                                      // منتصفُ الليل: لا علاجَ يعبرُ إلى الغد
  const MIN_ROOM = 5;                                            // أقلُّ من هذا ليس متّسعًا، بل شظيّة
  const segs: { [c: string]: { start: number; end: number }[] } = {};
  const segFree: { [c: string]: number[] } = {};
  const segQueue: { [c: string]: number[] } = {};
  for (const c of chairs) {
    const fx = fixedIv[c].slice().sort((a, b) => a.start - b.start);
    const list: { start: number; end: number }[] = [];
    let s = 0;
    for (const f of fx) { if (f.start > s) list.push({ start: s, end: f.start }); s = Math.max(s, f.end); }
    list.push({ start: s, end: WORK_END });
    segs[c] = list;
    // فراغُ كلِّ قطاعٍ للرسم: بدايتُه، ولا يسبقُ ما شغلَه مريضٌ حقيقيّ (وهو ابتداءً «الآنَ»)
    segFree[c] = list.map((sg) => Math.max(sg.start, free[c]));
    // ودورُ الطابورِ فيه بلا «الآنَ» — للحكمِ على مَن كان له مكانٌ حينَ سُجِّل
    segQueue[c] = list.map((sg) => Math.max(sg.start, realEnd[c]));
  }
  // قطاعُ الشفتِ الحاليّ: آخرُ قطاعٍ بدأَ. وإن كنّا **داخلَ** التبديلِ نفسِه فالشفتُ الحاليُّ
  // هو الذي انقضى للتوّ — لا الذي لم يبدأْ بعد. فمَن ظلَّ منتظِرًا حتّى بلغَ الوقتُ التبديلَ
  // سيرحل، ولا يجوزُ أن نَعِدَه بدورٍ في شفتٍ ليس شفتَه.
  const curSeg = (c: string) => {
    const list = segs[c];
    let i = 0;
    for (let k = 0; k < list.length; k++) if (list[k].start <= nowMin) i = k;
    return i;
  };
  const laneFree = (c: string) => segFree[c][curSeg(c)];
  const earliestFree = (): string => chairs.reduce((best, c) => (laneFree(c) < laneFree(best) ? c : best), chairs[0]);
  // هل بقيَ في قطاعِ الشفتِ الحاليِّ وقتٌ صالحٌ أصلًا؟
  const roomBefore = (c: string) => {
    const i = curSeg(c);
    return segFree[c][i] + MIN_ROOM <= segs[c][i].end;
  };

  // ── وضعُ كرتٍ منتظِرٍ على كرسيّ ──
  // البريكُ **المتحرّك** يُلتَفُّ حولَه: الكرتُ يقفزُ إلى ما بعدَه كاملًا.
  // أمّا **الثابت** فيفرِّقُ بين حالتَي «لا يسعُه ما قبلَه» سؤالٌ واحد:
  //     **هل كان لهذا المريضِ مكانٌ في شفتِه حينَ سُجِّل؟**
  //   • **نعم** (سُجِّلَ ووقتُ علاجِه يسعُ قبلَ التبديل) → هو مريضُ هذا الشفتِ وحدَه: يُعالَجُ فيه
  //     أو لا يُعالَجُ أصلًا. فإن أكلَ الوقتُ متّسعَه — تأخّرنا عليه أو مضى التبديلُ وهو ينتظر —
  //     **رحل**: يعودُ false فيُعرَضُ شارةً خلفَ التبديل. ولا يُنقَلُ إلى شفتٍ ليس شفتَه أبدًا،
  //     فذاك ما يبدو على الشاشةِ عبورًا للبريكِ الثابت.
  //   • **لا** (سُجِّلَ والفجوةُ الباقيةُ أضيقُ من علاجِه) → لم يكن له مكانٌ هنا أصلًا، فيُسجَّلُ
  //     في أوّلِ قطاعٍ يسعُه: بعدَ التبديلِ مباشرةً. والفجوةُ تبقى مفتوحةً لمن هو أقصرُ منه.
  // هذه هي البوّابةُ الوحيدةُ لكلِّ كرتٍ مُعلَّق: منتظِرٌ، ذو موعد، أو «غيرُ متاح».
  const placeWaiting = (lane: string, p: Patient, kind: Kind): boolean => {
    const est = estMinutes(p);
    const list = segs[lane];
    const cur = curSeg(lane);
    const appt = p.appointment_min ?? 0;
    const put = (i: number, s: number) => {
      lanes[lane].push({ start: s, end: s + est, kind, p });
      segFree[lane][i] = s + est;
      return true;
    };
    // لحظةُ تسجيلِه. ولا تتجاوزُ «الآنَ» لأنّ المحاكاةَ تُرجِعُ الساعةَ إلى الوراء،
    // فيبدو المسجَّلُ قبلَ قليلٍ كأنّه سُجِّلَ في المستقبل.
    const reg = Math.min(minutesOfDay(p.registered_at ?? p.timestamp) ?? nowMin, nowMin);
    // والموعدُ المحجوزُ يَجُبُّ لحظةَ التسجيل: مَن حُجِزَ له وقتٌ فقد اختيرَ شفتُه اختيارًا.
    const anchor = appt > 0 ? appt : reg;
    let home = 0;                                                 // قطاعُ الشفتِ الذي يخصُّه
    for (let k = 0; k < list.length; k++) if (list[k].start <= anchor) home = k;
    // دورُه الحقيقيُّ في طابورِ ذلك الشفت: بعدَ مَن كانوا أمامَه، لا لحظةَ تسجيلِه وحدَها.
    const turn = Math.max(segQueue[lane][home], anchor);

    if (turn + est <= list[home].end) {                           // كان له مكانٌ في شفتِه
      segQueue[lane][home] = turn + est;                          // وأخذَ دورَه من الطابور
      if (cur > home) return false;                               // ومضى شفتُه وهو ينتظر → رحل
      const s = avoidIv(Math.max(segFree[lane][home], appt), est, movingIv[lane]);
      if (s + est > list[home].end) return false;                 // وأكلَ الوقتُ متّسعَه → رحل
      return put(home, s);
    }
    for (let i = Math.max(cur, home); i < list.length; i++) {     // لم يكن له مكانٌ أصلًا
      const s = avoidIv(Math.max(segFree[lane][i], appt, list[i].start), est, movingIv[lane]);
      if (s + est > list[i].end) continue;                        // لا يسعُه هذا القطاع → تاليه
      return put(i, s);
    }
    return false;                                                 // لا قطاعَ في اليومِ يسعُه
  };

  // ── الدور: المنتظِرون جميعًا في طابورٍ واحد ──
  //   الموعدُ المحجوزُ ليس مسمارًا — هو «لا قبلَ هذا الوقت». فذو الموعدِ يأخذُ دورَه في وقتِه
  //   إن كان الكرسيُّ فارغًا، وإن تأخّرَ الكرسيُّ (تأخّرَ مَن قبلَه أو دخلَ مريضٌ يمتدُّ عليه)
  //   انزاحَ هو أيضًا. والكرسيُّ لا يقفُ فارغًا بانتظارِه: مَن يستطيعُ أن يُعالَجَ ويُنهيَ قبلَه
  //   يتقدّم، فيدفعُه إلى الأمام.
  // «غيرُ المتاح» يُعزَلُ عن الدورِ تمامًا (يُوضَعُ في المؤخّرةِ لاحقًا)
  const naWaiting = waiting.filter((p) => p.status === 'na');
  const queue = waiting.filter((p) => p.status !== 'na');

  // ذوو الأولويّة (كبارُ السنّ + الاحتياجاتُ الخاصّة) إلى المقدّمة، ثمّ ترتيبُ الدور
  queue.sort((a, b) => (isPriority(b) ? 1 : 0) - (isPriority(a) ? 1 : 0) || a.queue_number - b.queue_number);

  // كرسيٌّ ملزِمٌ للمريض إن كانت له عيادةٌ محدَّدةٌ سلفًا؛ وإلّا فأيُّ كرسيّ
  const boundLane = (p: Patient): string | null =>
    (!isPriority(p) && isRealClinic(p.clinic) && lanes[p.clinic!]) ? p.clinic! : null;

  // ── اختيارُ الكرسيّ ──
  // نُقدّمُ الكراسيَّ التي ما زالَ في شفتِها متّسع، فنملأُ ما قبلَ التبديلِ في كلِّها أوّلًا.
  // ولا تُقيّدُنا عيادةٌ مكتوبةٌ على كرتٍ لم يدخلْ صاحبُه بعد — فهي نيّةٌ لا التزام، ولا يصحُّ
  // أن تُرحّلَه وكرسيٌّ آخرُ فارغٌ الآن.
  // وهذا اختيارُ مكانٍ لا حُكْم: مصيرُ كلِّ كرتٍ (يُرسَمُ · يُؤجَّلُ · يرحل) لِـ placeWaiting وحدَها.
  const beyond: { [c: string]: Patient[] } = {};
  chairs.forEach((c) => { beyond[c] = []; });

  const remaining = queue.slice();
  for (let guard = 0; remaining.length && guard < 400; guard++) {
    // نُقدّمُ الكراسيَّ التي ما زالَ في شفتِها متّسع؛ فإن استُهلكَتْ كلُّها فالبوّابةُ وحدَها
    // تفصل: مَن كان له مكانٌ فضاعَ يرحل، ومَن سُجِّلَ توًّا يُؤجَّلُ إلى ما بعدَ التبديل.
    const open = chairs.filter(roomBefore);
    const pool = open.length ? open : chairs;
    const lane = pool.reduce((best, c) => (laneFree(c) < laneFree(best) ? c : best), pool[0]);
    const t0 = laneFree(lane);
    // أوّلُ مَن يجوزُ أن يبدأَ الآنَ على هذا الكرسيّ — فلا يقفُ الكرسيُّ فارغًا بانتظارِ موعدٍ بعيد
    const fits = (p: Patient) => {
      const b = boundLane(p);
      return b === null || b === lane || !roomBefore(b);          // انتهى شفتُ عيادتِه → لا تُقيّدُه
    };
    let idx = remaining.findIndex((p) => (p.appointment_min ?? 0) <= t0 && fits(p));
    if (idx < 0) idx = remaining.findIndex(fits);
    if (idx < 0) idx = 0;                                        // لا أحدَ لهذا الكرسيّ: خُذِ الأوّلَ أيًّا كان
    const p = remaining.splice(idx, 1)[0];
    const b = boundLane(p);
    const target = b && (roomBefore(b) || !open.length) ? b : lane;
    if (!placeWaiting(target, p, isPriority(p) ? 'eld' : 'fut')) beyond[target].push(p);
  }

  // ── «غيرُ المتاح»: يُنقَلُ دائمًا إلى **مؤخّرةِ** الكروت (بعدَ كلِّ المنتظِرين) فلا يحجزُ وقتًا ولا يشوّشُ الدور ──
  //   نُودِعُه آخرَ العيادةِ (بعدَ آخرِ كرت)، ويُظهِرُ وقتَ ندائِه — لا وقتَ انتهاء. إن عادَ متاحًا
  //   فُقِدَ وسمُ 'na' فيعودُ تلقائيًّا إلى ترتيبِ دورِه حسبَ queue_number.
  //   وهو كغيرِه يمرُّ بالبوّابةِ نفسِها: لا يعبرُ التبديلَ ولا يقعُ داخلَه.
  for (const p of naWaiting) {
    const own = (isRealClinic(p.clinic) && lanes[p.clinic!]) ? p.clinic! : null;
    const open = chairs.filter(roomBefore);
    const lane = (own && roomBefore(own)) ? own
      : open.length ? open.reduce((best, c) => (laneFree(c) < laneFree(best) ? c : best), open[0])
      : (own ?? earliestFree());
    if (!placeWaiting(lane, p, 'na')) beyond[lane].push(p);
  }

  const laneList: Lane[] = chairs.map((c) => ({
    clinic: c,
    short: c.match(/\d+/) ? 'C' + c.match(/\d+/)![0] : c.slice(0, 3),
    blocks: lanes[c].sort((a, b) => a.start - b.start),
    beyond: beyond[c],
  }));

  // النافذةُ = اليومُ التقويميُّ كاملًا. ثابتةٌ لا تتمدّدُ بالبيانات: مخطّطُ اليومِ هو اليومُ
  // نفسُه، فمخطّطُ أمسِ في الأرشيفِ يُرسَمُ بمحورٍ واحدٍ مع مخطّطِ اليوم، ويصحُّ قياسُ أحدِهما بالآخر.
  return { lanes: laneList, dayStart: DAY_START, dayEnd: DAY_END };
}
