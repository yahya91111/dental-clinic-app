// عرضٌ كاملٌ لحالة المستخدم: «يحيى» (مضيفٌ الخميس) يغيب → المحرّكُ الظلّيّ يُعيد التوازن
// بمقايضاتٍ عابرةٍ للأيّام، ثمّ الإلغاء يُرجِع كلَّ شيء. عرضٌ فقط — لا مساسَ بالحيّ.
//   set -a; . ./.env; set +a; npx tsx scripts/lab-repro.ts
import { buildBaseline, resolveDay, replay, delOf, soloOf, exOf, seqOf, idOf, DAYS } from './lib-resolver';
import type { Cfg, St } from './lib-resolver';
import type { WeekDay } from '../lib/algorithms/schedule';

const AR: Record<string, string> = { sunday: 'الأحد', monday: 'الإثنين', tuesday: 'الثلاثاء', wednesday: 'الأربعاء', thursday: 'الخميس' };
const REAL = ['محمد', 'شهد', 'فاطمة', 'إسراء', 'نورا', 'خالد', 'سعد', 'ريم', 'هند'];
const W = 'أسبوع';
const mk = (n: number, M: number): Cfg => ({ names: Array.from({ length: n }, (_, i) => `د${i + 1}`), lightIds: new Set(), boardIds: new Set(), M, weeks: ['أسبوع', 'أسبوع+'] });

// ابحث عن حالةٍ تُشغّل المقايضاتِ العابرةَ للأيّام: عضوُ زوجِ استضافة (عيادة فترة + استضافة أخرى) يغيب → سلسلة.
function findScenario(): { cfg: Cfg; base: St; day: WeekDay; victim: string } | null {
  let fallback: { cfg: Cfg; base: St; day: WeekDay; victim: string } | null = null;
  for (const [n, M] of [[7, 3], [8, 3], [9, 3], [6, 3], [10, 3]] as [number, number][]) {
    const cfg = mk(n, M); let base: St;
    try { base = buildBaseline(cfg); } catch { continue; }
    for (const day of DAYS) {
      const sl = base[W]![day]!;
      // جرّب كلَّ طبيبٍ حاضرٍ كغائب؛ نُفضّل أوّلَ حالةٍ تُشغّل مقايضةً عابرةً للأيّام.
      for (const cand of new Set(sl.filter((s) => s.role !== 'ex').map((s) => s.doctor.id))) {
        const st = JSON.parse(JSON.stringify(base)) as St;
        const r = resolveDay(cfg, st, W, day, [{ kind: 'abs', id: cand }]);
        const swaps = r.logs.filter((l) => l.startsWith('⇄'));
        if (swaps.length) return { cfg, base, day, victim: cand };
        if (!fallback) fallback = { cfg, base, day, victim: cand };
      }
    }
  }
  return fallback;
}
const found = findScenario();
if (!found) { console.log('لم أجد سيناريو زوجِ استضافة'); process.exit(0); }
const { cfg, base, day: ABS_DAY, victim: thuHost } = found;
const nameMap = new Map<string, string>(); nameMap.set(thuHost, 'يحيى');
let k = 0; for (let i = 0; i < cfg.names.length; i++) { const id = idOf(i); if (id === thuHost) continue; nameMap.set(id, REAL[k++] ?? id); }
const NM = (id: string) => nameMap.get(id) ?? id;

function grid(st: St, title: string) {
  console.log(`\n┌─ ${title} ─────────────`);
  for (const d of DAYS) {
    const sl = st[W]![d]!; if (!sl.length) continue;
    const line = (p: number) => {
      const clin = sl.filter((s) => s.role === 'clinic' && s.period === p && s.clinicNumber > 0).sort((a, b) => a.clinicNumber - b.clinicNumber).map((s) => `ع${s.clinicNumber}:${NM(s.doctor.id)}`);
      const del = sl.filter((s) => s.role === 'delegator' && s.period === p).map((s) => NM(s.doctor.id));
      return `   ف${p}: ${clin.join('  ')}   ⟨دل: ${del.map((x) => x).join('،') || '—'}⟩`;
    };
    const ex = [...new Set(sl.filter((s) => s.role === 'ex').map((s) => NM(s.doctor.id)))];
    console.log(`│ ${AR[d]}:`);
    console.log(`│ ${line(1)}`);
    console.log(`│ ${line(2)}${ex.length ? `   [احتياط: ${ex.join('،')}]` : ''}`);
  }
  console.log('└────────────────────────');
}

function counts(st: St, title: string) {
  const d = delOf(cfg, st), s = soloOf(cfg, st), e = exOf(cfg, st);
  console.log(`\n  ${title} — العدّادات (دل / منفرد / حِمل=دل+منفرد / احتياط):`);
  for (let i = 0; i < cfg.names.length; i++) {
    const id = idOf(i); const dl = d.get(id)!, so = s.get(id)!, ex = e.get(id)!;
    console.log(`    ${NM(id).padEnd(8)} دل=${dl}  منفرد=${so}  حِمل=${dl + so}  احتياط=${ex}${id === thuHost ? '   ← يحيى (الغائب)' : ''}`);
  }
}

console.log(`════════════ المشهد: «يحيى» يغيب يوم ${AR[ABS_DAY]} — ومقايضةٌ عابرةٌ للأيّام تُعيد التوازن ════════════`);
console.log(`(الإعداد: ${cfg.names.length} أطبّاء / ${cfg.M} عيادات — اختاره السكربتُ لأنّه يُشغّل المقايضة الصريحة)`);
grid(base, 'الجدول قبل الغياب');
counts(base, 'قبل');

// طبّق الغياب على نسخةٍ، والتقط المقايضات + اللوغ
const st = JSON.parse(JSON.stringify(base)) as St;
const res = resolveDay(cfg, st, W, ABS_DAY, [{ kind: 'abs', id: thuHost }]);

console.log('\n\n════════════ ماذا فعل المحرّك ════════════');
console.log('  خطواتُ التغطية والترقية:');
for (const l of res.logs.filter((l) => !l.startsWith('⇄'))) console.log(`    · ${l}`);
console.log('\n  ⇄ المقايضاتُ العابرةُ للأيّام (موازنةُ الحِمل):');
const swaps = res.logs.filter((l) => l.startsWith('⇄'));
if (swaps.length) for (const l of swaps) console.log(`    ${l.replace('⇄ موازنة دل: ', '⇄ ')}`);
else console.log('    (لا حاجةَ لمقايضات — متوازنٌ بالتغطية وحدها)');

grid(st, 'الجدول بعد الغياب + الموازنة');
counts(st, 'بعد');

// التحقّق: لا حاضرٌ تحت حِمله الأساس (مع وجود فائض) = عدلٌ تامّ
const db = delOf(cfg, base), sbm = soloOf(cfg, base), da = delOf(cfg, st), sam = soloOf(cfg, st);
const hB = (id: string) => db.get(id)! + sbm.get(id)!; const hA = (id: string) => da.get(id)! + sam.get(id)!;
const ids = cfg.names.map((_, i) => idOf(i));
const up = ids.filter((id) => id !== thuHost && hA(id) > hB(id)).map(NM);
const dn = ids.filter((id) => id !== thuHost && hA(id) < hB(id)).map(NM);
console.log(`\n  ✦ تقييمُ العدل: ${up.length && dn.length ? `🔴 فائض=${up.join('،')} مع مسلوب=${dn.join('،')}` : '✅ لا فائضَ مع مسلوبٍ معًا — لا ظلمَ قابلٌ للإصلاح'}`);
if (up.length && !dn.length) console.log(`     (فائضٌ حتميٌّ فقط — دورُ يحيى الغائب لا بدّ أن يُحمَل: ${up.join('،')})`);

// ════ الإلغاء ════
console.log('\n\n════════════ الإلغاء (عودة يحيى) ════════════');
const cancelled = replay(cfg, base, []); // حذفُ الحدث من السجلّ
const sig = (s: St) => seqOf(cfg).map(({ week, day }) => s[week]![day]!.map((x) => `${x.role}|p${x.period}|c${x.clinicNumber}|${x.doctor.id}`).sort().join(',')).join('||');
console.log(`  بصمةُ الجدول بعد الإلغاء == الأساس حرفيًّا؟  ${sig(cancelled) === sig(base) ? '✅ نعم — عاد كلُّ شيءٍ تمامًا' : '❌ لا'}`);
counts(cancelled, 'بعد الإلغاء');
process.exit(0);
