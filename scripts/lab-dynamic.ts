// محكٌّ ديناميكيّ للنموذج الظلّيّ (lib-resolver): يُجهِد الزحامَ والإلغاء/العودة ودورانَ المنفرِد.
//   (أ-١) غيابٌ متعدّد الأيّام لنفس الطبيب → هل يَعلَق المنفرِد على شخصٍ واحد؟
//   (أ-٢) الإلغاء = حذفٌ من السجلّ + replay:  «لا تغيُّر» (عودةٌ حرفيّة) و«العالم تغيّر» (تكيُّف).
//   كلُّه ظلٌّ — لا مساسَ بالقلب الحيّ.   set -a; . ./.env; set +a; npx tsx scripts/lab-dynamic.ts
import { buildBaseline, replay, replayChecked, delOf, soloOf, exOf, seqOf, idOf, nmOf } from './lib-resolver';
import type { Cfg, St, Event, Journal } from './lib-resolver';
import type { WeekDay } from '../lib/algorithms/schedule';

const NAMES = ['محمد', 'أحمد', 'خالد', 'سعد', 'فهد', 'علي', 'عمر', 'زيد', 'ماجد', 'وليد'];
const WEEKS = ['2026-09-03', '2026-09-10'];
const mkCfg = (n: number, M: number): Cfg => ({ names: NAMES.slice(0, n), lightIds: new Set(), boardIds: new Set(), M, weeks: WEEKS });
let pass = 0, fail = 0; const fails: string[] = [];
const ok = (name: string, cond: boolean, d = '') => { if (cond) pass++; else { fail++; fails.push(`${name}${d ? ' — ' + d : ''}`); console.log(`    ❌ ${name}${d ? ' — ' + d : ''}`); } };

// بصمةٌ قانونيّةٌ لجدولٍ كامل (للمقارنة الحرفيّة عند الإلغاء)
function sig(cfg: Cfg, st: St): string {
  const parts: string[] = [];
  for (const { week, day } of seqOf(cfg)) {
    const rows = st[week]![day]!.map((s) => `${s.role}|p${s.period}|c${s.clinicNumber}|${s.doctor.id}`).sort();
    parts.push(`${week}/${day}:${rows.join(',')}`);
  }
  return parts.join('||');
}
const w1 = WEEKS[0]!;
function hostOn(st: St, day: WeekDay): string | null { return st[w1]![day]!.find((s) => s.role === 'delegator')?.doctor.id ?? null; }
function clinicOn(st: St, day: WeekDay): string | null { return st[w1]![day]!.find((s) => s.role === 'clinic' && s.clinicNumber > 0)?.doctor.id ?? null; }
function testCancelNoChange(cfg: Cfg, tag: string) {
  const base = buildBaseline(cfg);
  const host = hostOn(base, 'wednesday'); if (!host) return;
  const J: Journal = [{ id: 'e1', week: w1, day: 'wednesday', events: [{ kind: 'abs', id: host }] }];
  const applied = replay(cfg, base, J);
  // إلغاء = حذفُ المُدخَل من السجلّ ثمّ replay
  const cancelled = replay(cfg, base, J.filter((e) => e.id !== 'e1'));
  ok(`[${tag}] إلغاءٌ بلا تغيُّرٍ يُعيد البصمةَ حرفيًّا`, sig(cfg, cancelled) === sig(cfg, base));
  ok(`[${tag}] الجدولُ تغيّر فعلًا قبل الإلغاء (الاختبارُ ذو معنى)`, sig(cfg, applied) !== sig(cfg, base));
}

function testCancelWorldChanged(cfg: Cfg, tag: string) {
  const base = buildBaseline(cfg);
  const cThu = clinicOn(base, 'thursday'); const cTue = clinicOn(base, 'tuesday');
  if (!cThu || !cTue || cThu === cTue) return;
  // العالم: غيابان (الثلاثاء ثمّ الخميس). ثمّ نُلغي الثلاثاء فقط بينما الخميس باقٍ.
  const J: Journal = [
    { id: 'tue', week: w1, day: 'tuesday', events: [{ kind: 'abs', id: cTue }] },
    { id: 'thu', week: w1, day: 'thursday', events: [{ kind: 'abs', id: cThu }] },
  ];
  const both = replayChecked(cfg, base, J);
  const afterCancelTue = replayChecked(cfg, base, J.filter((e) => e.id !== 'tue'));
  // المرجع: كأنّ الخميسَ وحده غاب من البداية
  const onlyThu = replayChecked(cfg, base, [{ id: 'thu', week: w1, day: 'thursday', events: [{ kind: 'abs', id: cThu }] }]);
  ok(`[${tag}] إلغاءٌ والعالمُ متغيّرٌ = كأنّ الباقيَ وحدَه حدث (تكيُّفٌ سلس)`, sig(cfg, afterCancelTue.st) === sig(cfg, onlyThu.st),
    sig(cfg, afterCancelTue.st) === sig(cfg, onlyThu.st) ? '' : 'انحرافٌ عن الحالة المرجعيّة');
  ok(`[${tag}] لا كسرَ ثوابتَ أثناء العالم المتغيّر`, both.problems.length === 0 && afterCancelTue.problems.length === 0, [...both.problems, ...afterCancelTue.problems].join(' · '));
}

function testMultiDayAbsence(cfg: Cfg, tag: string) {
  const base = buildBaseline(cfg);
  // نفس الطبيب (عياديّ الأحد) غائبٌ الأحد→الأربعاء (٤ أيّام) — هل يَعلَق المنفرِدُ على مُغطٍّ واحد؟
  const victim = clinicOn(base, 'sunday'); if (!victim) return;
  const days: WeekDay[] = ['sunday', 'monday', 'tuesday', 'wednesday'];
  const J: Journal = days.map((d) => ({ id: `abs-${d}`, week: w1, day: d, events: [{ kind: 'abs', id: victim }] as Event[] }));
  const r = replayChecked(cfg, base, J);
  ok(`[${tag}] غيابٌ متعدّدُ الأيّام: لا كسرَ ثوابت`, r.problems.length === 0, r.problems.slice(0, 3).join(' · '));
  // الحِملُ الموحَّد (دل+منفرد) يجب أن يبقى متوازنًا — فوق+تحت معًا = ظلمٌ قابلٌ للإصلاح
  const delB = delOf(cfg, base), delA = delOf(cfg, r.st); const solB = soloOf(cfg, base), solA = soloOf(cfg, r.st);
  const ids = cfg.names.map((_, i) => idOf(i));
  const hB = (id: string) => delB.get(id)! + solB.get(id)!; const hA = (id: string) => delA.get(id)! + solA.get(id)!;
  const hvUp = ids.filter((id) => id !== victim && hA(id) > hB(id));
  const hvDn = ids.filter((id) => id !== victim && hA(id) < hB(id));
  ok(`[${tag}] غيابٌ متعدّدُ الأيّام: لا ظلمَ حِملٍ (دل+منفرد) قابلٌ للموازنة`, !(hvUp.length && hvDn.length), `فوق=${hvUp.map(nmOf(cfg)).join('،')} تحت=${hvDn.map(nmOf(cfg)).join('،')}`);
  // ▸ تشخيصُ التركّز: المنفرِد وخسارةُ الراحة — كم تتركّز على شخصٍ واحد؟ (الكمالُ = موزَّع، لا مكدَّس)
  const sa = soloOf(cfg, r.st);
  const soloLoads = ids.filter((id) => id !== victim).map((id) => sa.get(id)!).filter((n) => n > 0);
  const soloTotal = soloLoads.reduce((a, b) => a + b, 0); const soloMax = Math.max(0, ...soloLoads); const soloBearers = soloLoads.length;
  const exB = exOf(cfg, base), exA = exOf(cfg, r.st);
  const restLost = ids.filter((id) => id !== victim).map((id) => Math.max(0, exB.get(id)! - exA.get(id)!));
  const restTotal = restLost.reduce((a, b) => a + b, 0); const restMax = Math.max(0, ...restLost); const restBearers = restLost.filter((n) => n > 0).length;
  console.log(`      منفرد: إجمالي ${soloTotal} على ${soloBearers} طبيب، أقصى تركّزٍ ${soloMax}${soloMax >= 2 && soloBearers <= 1 ? ' ⚠️ مكدَّسٌ على واحد' : ''}`);
  console.log(`      راحةٌ مفقودة: إجمالي ${restTotal} على ${restBearers} طبيب، أقصى تركّزٍ ${restMax}${restMax >= 2 && restBearers <= 1 ? ' ⚠️ مكدَّسٌ على واحد' : ''}  (غائب=${nmOf(cfg)(victim)})`);
}

const CONFIGS: [string, Cfg][] = [['6/3', mkCfg(6, 3)], ['7/3', mkCfg(7, 3)], ['8/3', mkCfg(8, 3)], ['8/4', mkCfg(8, 4)], ['6/2', mkCfg(6, 2)], ['10/3', mkCfg(10, 3)]];
console.log('═══ محكُّ الديناميكا الظلّيّ ═══');
for (const [tag, cfg] of CONFIGS) {
  console.log(`\n── ${tag} ──`);
  try {
    testCancelNoChange(cfg, tag);
    testCancelWorldChanged(cfg, tag);
    testMultiDayAbsence(cfg, tag);
  } catch (e) { ok(`[${tag}] تشغيلٌ بلا استثناء`, false, (e as Error).message); }
}
console.log(`\n═══ ${pass} سليم / ${fail} خرق ═══`);
if (fails.length) { console.log('الخروق:'); for (const f of fails) console.log('  • ' + f); }
else console.log('✅ لا خرق.');
process.exit(fail ? 1 : 0);
