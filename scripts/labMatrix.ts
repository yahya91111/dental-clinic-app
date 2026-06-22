// مصفوفةُ اختبارٍ حتميّة: أعدادٌ مختلفة × سيناريوهاتٌ مختلفة → فحصُ الثوابت + اتّزان العدّادين.
//   npx tsx scripts/labMatrix.ts            (كلّ المصفوفة)
//   npx tsx scripts/labMatrix.ts -v <cfg>   (تفصيلٌ لإعدادٍ واحد)
import { buildBaseline, resolveDay, delOf, exOf, soloOf, seqOf, idOf, nmOf, DAYS, AR } from './lib-resolver';
import type { Cfg, St, Event, DaySlots } from './lib-resolver';
import type { WeekDay } from '../lib/algorithms/schedule';

const NAMES = ['محمد', 'أحمد', 'خالد', 'سعد', 'فهد', 'علي', 'عمر', 'زيد', 'ماجد', 'وليد', 'باسل', 'سامي'];
const WEEKS = ['2026-09-03', '2026-09-10'];
const mkCfg = (n: number, M: number, opts: { light?: number[]; board?: number[] } = {}): Cfg => ({
  names: NAMES.slice(0, n),
  lightIds: new Set((opts.light || []).map(idOf)),
  boardIds: new Set((opts.board || []).map(idOf)),
  M, weeks: WEEKS,
});

const CONFIGS: { tag: string; cfg: Cfg }[] = [
  { tag: '4/3 نحيف', cfg: mkCfg(4, 3) },
  { tag: '5/3', cfg: mkCfg(5, 3) },
  { tag: '6/3', cfg: mkCfg(6, 3) },
  { tag: '7/3', cfg: mkCfg(7, 3) },
  { tag: '8/3', cfg: mkCfg(8, 3) },
  { tag: '8/3+تخفيف', cfg: mkCfg(8, 3, { light: [7] }) },
  { tag: '9/3', cfg: mkCfg(9, 3) },
  { tag: '10/3', cfg: mkCfg(10, 3) },
  { tag: '6/2', cfg: mkCfg(6, 2) },
  { tag: '8/4', cfg: mkCfg(8, 4) },
  { tag: 'بورد٢ ٨/٣', cfg: mkCfg(8, 3, { board: [0, 1] }) },
  { tag: 'بورد٣ ٨/٣', cfg: mkCfg(8, 3, { board: [0, 1, 2] }) },
];

const clone = (st: St): St => JSON.parse(JSON.stringify(st));
type Roles = { host: string | null; reserve: string | null; clinics: { id: string; clinic: number; period: number }[]; boardClinicDocs: string[] };
function rolesOn(cfg: Cfg, st: St, week: string, day: WeekDay): Roles {
  const sl = st[week]![day]!;
  const host = sl.find((s) => s.role === 'delegator')?.doctor.id ?? null;
  const reserve = [...new Set(sl.filter((s) => s.role === 'ex' && !cfg.boardIds.has(s.doctor.id)).map((s) => s.doctor.id))][0] ?? null;
  const clinics = sl.filter((s) => s.role === 'clinic' && !cfg.boardIds.has(s.doctor.id)).map((s) => ({ id: s.doctor.id, clinic: s.clinicNumber, period: s.period }));
  const boardClinicDocs = [...new Set(sl.filter((s) => s.role === 'clinic' && cfg.boardIds.has(s.doctor.id)).map((s) => s.doctor.id))];
  return { host, reserve, clinics, boardClinicDocs };
}

// يقيس النتيجة: ثوابت صلبة + اتّزان
function evalScenario(cfg: Cfg, base: St, week: string, day: WeekDay, events: Event[]) {
  const st = clone(base);
  const before = clone(base);
  const res = resolveDay(cfg, st, week, day, events);
  const ids = cfg.names.map((_, i) => idOf(i));
  const absent = new Set(events.filter((e) => e.kind === 'abs').map((e) => (e as any).id));
  const isBoard = (id: string) => cfg.boardIds.has(id);
  // اتّزان **الحِمل الموحَّد** (دليقيتر + منفرِد) — هو ما يوازنه المحرّك الآن. تحت الأساس = مسلوب
  // (ظلمٌ قابلٌ للإصلاح)؛ فوقه = امتصاصٌ حتميٌّ (دورُ الغائب) أو منفرِدٌ مُجبَر.
  const db = delOf(cfg, before), da = delOf(cfg, st);
  const sb = soloOf(cfg, before), sa = soloOf(cfg, st);
  const hb = (id: string) => db.get(id)! + sb.get(id)!;
  const ha = (id: string) => da.get(id)! + sa.get(id)!;
  const delPresentBelow = ids.filter((id) => !isBoard(id) && !absent.has(id) && ha(id) < hb(id));
  const delPresentAbove = ids.filter((id) => !isBoard(id) && !absent.has(id) && ha(id) > hb(id));
  const delPresentOff = [...delPresentBelow, ...delPresentAbove];
  const delAbsentOff = ids.filter((id) => !isBoard(id) && absent.has(id) && ha(id) !== hb(id));
  // اتّزان الاحتياط: غيرُ الغائبين يجب ألّا ينقص احتياطهم (إلا ج)
  const eb = exOf(cfg, before), ea = exOf(cfg, st);
  const exPresentLost = ids.filter((id) => !isBoard(id) && !absent.has(id) && ea.get(id)! < eb.get(id)!);
  const soloFixable = false; // المنفرِد صار ضمن الحِمل الموحَّد أعلاه
  // البورد: دل=٠ دائمًا
  const boardHosted = ids.filter((id) => isBoard(id) && da.get(id)! > 0);
  const hardFail = [...res.problems, ...boardHosted.map((id) => `بورد ${nmOf(cfg)(id)} استضاف!`)];
  return { res, hardFail, delPresentOff, delPresentBelow, delPresentAbove, delAbsentOff, exPresentLost, soloFixable, st, before };
}

function scenariosFor(cfg: Cfg, base: St): { name: string; week: string; day: WeekDay; events: Event[] }[] {
  const out: { name: string; week: string; day: WeekDay; events: Event[] }[] = [];
  const wed: WeekDay = 'wednesday', thu: WeekDay = 'thursday', sun: WeekDay = 'sunday';
  const w1 = cfg.weeks[0]!;
  const rW = rolesOn(cfg, base, w1, wed);
  const rT = rolesOn(cfg, base, w1, thu);
  const rS = rolesOn(cfg, base, w1, sun);
  // غياب طبيب عيادة (وسط الأسبوع)
  if (rW.clinics[0]) out.push({ name: 'غياب عياديّ (أربعاء)', week: w1, day: wed, events: [{ kind: 'abs', id: rW.clinics[0].id }] });
  // غياب المضيف
  if (rW.host && !cfg.boardIds.has(rW.host)) out.push({ name: 'غياب المضيف', week: w1, day: wed, events: [{ kind: 'abs', id: rW.host }] });
  // غياب الاحتياطيّ
  if (rW.reserve) out.push({ name: 'غياب الاحتياطيّ', week: w1, day: wed, events: [{ kind: 'abs', id: rW.reserve }] });
  // استئذان عياديّ (يحجب فترته)
  if (rW.clinics[0]) out.push({ name: 'استئذان عياديّ', week: w1, day: wed, events: [{ kind: 'perm', id: rW.clinics[0].id, blk: rW.clinics[0].period }] });
  // استئذان المضيف ف1
  if (rW.host && !cfg.boardIds.has(rW.host)) out.push({ name: 'استئذان المضيف ف1', week: w1, day: wed, events: [{ kind: 'perm', id: rW.host, blk: 1 }] });
  // مركّب: غياب طبيبين
  if (rW.clinics.length >= 2) out.push({ name: 'مركّب: غياب طبيبين', week: w1, day: wed, events: [{ kind: 'abs', id: rW.clinics[0].id }, { kind: 'abs', id: rW.clinics[1].id }] });
  // مزيج: استئذان مضيف + غياب عياديّ
  if (rW.host && !cfg.boardIds.has(rW.host) && rW.clinics[0]) out.push({ name: 'مزيج: استئذان مضيف + غياب', week: w1, day: wed, events: [{ kind: 'perm', id: rW.host, blk: 1 }, { kind: 'abs', id: rW.clinics[0].id }] });
  // طرفيّ: غياب عياديّ يوم الخميس (نافذةٌ ضيّقة)
  if (rT.clinics[0]) out.push({ name: 'غياب عياديّ (خميس/طرفيّ)', week: w1, day: thu, events: [{ kind: 'abs', id: rT.clinics[0].id }] });
  // أوّليّ: غياب عياديّ الأحد (لا قَبْليّ)
  if (rS.clinics[0]) out.push({ name: 'غياب عياديّ (أحد/أوّليّ)', week: w1, day: sun, events: [{ kind: 'abs', id: rS.clinics[0].id }] });
  // مزيج شرس: استئذان عياديّ + غياب طبيبين
  if (rW.clinics.length >= 3) out.push({ name: 'شرس: استئذان + غياب طبيبين', week: w1, day: wed, events: [{ kind: 'perm', id: rW.clinics[0].id, blk: rW.clinics[0].period }, { kind: 'abs', id: rW.clinics[1].id }, { kind: 'abs', id: rW.clinics[2].id }] });
  // بورد: غياب بورديّ
  if (rW.boardClinicDocs[0]) out.push({ name: 'غياب بورديّ', week: w1, day: wed, events: [{ kind: 'abs', id: rW.boardClinicDocs[0] }] });
  return out;
}

const verbose = process.argv[2] === '-v';
const onlyTag = verbose ? process.argv[3] : null;
let totFail = 0, totIOU = 0, totBelow = 0, totExLost = 0, totSoloFix = 0, totRun = 0;
for (const { tag, cfg } of CONFIGS) {
  if (onlyTag && tag !== onlyTag) continue;
  let base: St;
  try { base = buildBaseline(cfg); } catch (e) { console.log(`${tag.padEnd(14)} ❌ فشل البناء: ${(e as Error).message}`); continue; }
  const scens = scenariosFor(cfg, base);
  const rows: string[] = [];
  for (const sc of scens) {
    totRun++;
    const r = evalScenario(cfg, base, sc.week, sc.day, sc.events);
    const hard = r.hardFail.length > 0;
    const hasBelow = !hard && r.delPresentBelow.length > 0;
    const hasAbove = !hard && r.delPresentAbove.length > 0;
    const fixable = hasBelow && hasAbove;                      // فائضٌ + مسلوبٌ معًا → السلسلةُ تَنقل (ظلمٌ حقيقيّ)
    const thinDrop = hasBelow && !hasAbove;                    // مسلوبٌ بلا فائض → الدورُ تساقط (نحيفٌ مقبول)
    const absorbOnly = hasAbove && !hasBelow;                  // فائضٌ فقط → امتصاصٌ حتميٌّ لدور الغائب
    const iou = hasBelow || hasAbove;
    const exLost = !hard && r.exPresentLost.length > 0;
    if (hard) totFail++; if (iou) totIOU++; if (fixable) totBelow++; if (exLost) totExLost++; if (r.soloFixable) totSoloFix++;
    const mark = hard ? '❌ كسر' : fixable ? '🔴 قابلٌ للإصلاح' : thinDrop ? '⚪ تساقطٌ نحيف' : absorbOnly ? '🟡 امتصاص' : exLost ? '🟠 احتياط' : '✅';
    rows.push(`   ${mark}  ${sc.name}`);
    if (hard) rows.push(`        🚨 ${r.hardFail.join(' · ')}`);
    if (hasBelow) rows.push(`        تحت الأساس (حِمل دل+منفرد): ${r.delPresentBelow.map(nmOf(cfg)).join('،')}${hasAbove ? ` · فوق: ${r.delPresentAbove.map(nmOf(cfg)).join('،')}` : ' (تساقطٌ نحيف — لا فائض)'}`);
    if (exLost) rows.push(`        احتياطٌ فُقِد لحاضر: ${r.exPresentLost.map(nmOf(cfg)).join('،')}`);
    if (verbose && (hard || iou || exLost || true)) for (const l of r.res.logs) rows.push(`           · ${l}`);
  }
  const bad = scens.filter((_, i) => false).length; void bad;
  console.log(`\n══ ${tag} (${scens.length} سيناريو) ══`);
  console.log(rows.join('\n'));
}
console.log(`\n${'─'.repeat(50)}`);
console.log(`الإجمال: ${totRun} سيناريو · ❌ كسر: ${totFail} · 🔴 دل قابلٌ للإصلاح: ${totBelow} · 🟣 منفرِدٌ قابلٌ للموازنة: ${totSoloFix} · 🟠 احتياط مفقود: ${totExLost}`);
console.log(totFail === 0 && totBelow === 0 ? '✅ لا كسرَ ولا ظلمَ قابلٍ للإصلاح — كلُّ تفاوتٍ إمّا امتصاصٌ حتميٌّ أو تساقطٌ نحيفٌ مقبول.' : totFail ? `🚨 ${totFail} كسرٌ يحتاج إصلاحًا.` : `🔴 ${totBelow} حالةٌ فيها فائضٌ ومسلوبٌ معًا — السلسلةُ يجب أن تَنقل.`);
