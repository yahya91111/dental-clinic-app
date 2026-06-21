// عرضُ الكنسل (رقم ١): العالم لم يتغيّر بعدُ — إلغاءُ الحدث الوحيد يُعيد كلَّ شيء للأساس تمامًا.
// النموذج: مصدرُ الأحداث. الجدول = الأساس + replay(journal). الكنسل = حذفُ الحدث + replay.
//   npx tsx scripts/labCancel.ts
import { buildBaseline, replay, delOf, exOf, seqOf, idOf, nmOf, DAYS, AR } from './lib-resolver';
import type { Cfg, St, Journal, JournalEntry } from './lib-resolver';
import type { WeekDay } from '../lib/algorithms/schedule';

const NAMES = ['محمد', 'أحمد', 'خالد', 'سعد', 'فهد', 'علي', 'عمر', 'زيد'];
const WEEKS = ['2026-09-03', '2026-09-10'];
const cfg: Cfg = { names: NAMES, lightIds: new Set(['d8']), boardIds: new Set(), M: 3, weeks: WEEKS };
const nm = nmOf(cfg);

// توقيعٌ كاملٌ لكلّ الأسبوعين (لكلّ الأيّام) — للمقارنة الدقيقة
const fullSig = (st: St): string =>
  seqOf(cfg).map(({ week, day }) => st[week]![day]!.map((s) => `${s.role}/${s.clinicNumber}/${s.period}/${s.doctor.id}`).sort().join(';')).join('||');
const countersStr = (st: St): string => {
  const d = delOf(cfg, st), e = exOf(cfg, st);
  return cfg.names.map((_, i) => { const id = idOf(i); return `${id}:د${d.get(id)}ح${e.get(id)}`; }).join(' ');
};
const renderDay = (st: St, week: string, day: WeekDay, mark = false): string => {
  const slots = st[week]![day]!;
  const clinic = new Map<number, Record<number, string>>(); const del: Record<number, string> = {}; const ex: string[] = [];
  for (const s of slots) {
    if (s.role === 'delegator') { del[s.period] = nm(s.doctor.id); continue; }
    if (s.role === 'ex') { ex.push(nm(s.doctor.id)); continue; }
    const c = clinic.get(s.clinicNumber) || {}; c[s.period] = nm(s.doctor.id); clinic.set(s.clinicNumber, c);
  }
  const parts: string[] = [];
  for (const c of [...clinic.keys()].sort((a, b) => a - b)) { const p = clinic.get(c)!; const solo = new Set(Object.values(p)).size === 1; parts.push(`ع${c}{${Object.keys(p).sort().map((pr) => `ف${pr}:${p[+pr]}`).join(' ')}}${solo ? '★' : ''}`); }
  if (Object.keys(del).length) parts.push(`دل{${Object.keys(del).sort().map((pr) => `ف${pr}:${del[+pr]}`).join(' ')}}`);
  if (ex.length) parts.push(`احتياط[${[...new Set(ex)].join('+')}]`);
  return `${(AR[day] + (mark ? ' ⚠️' : '')).padStart(9)} │ ${parts.join('   ')}`;
};
const showWeeks = (st: St, base: St, title: string) => {
  console.log(`\n${title}`);
  for (const w of WEEKS) for (const d of DAYS) { const changed = JSON.stringify(st[w]![d]) !== JSON.stringify(base[w]![d]); console.log(renderDay(st, w, d, changed)); }
};

const baseline = buildBaseline(cfg);
const baseSig = fullSig(baseline), baseCnt = countersStr(baseline);

type Case = { name: string; entry: JournalEntry };
const CASES: Case[] = [
  { name: 'طبيّة (غياب محمد الأربعاء)', entry: { id: 'e1', week: WEEKS[0]!, day: 'wednesday', events: [{ kind: 'abs', id: 'd1' }] } },
  { name: 'استئذان (المضيف خالد ف1 الأربعاء)', entry: { id: 'e2', week: WEEKS[0]!, day: 'wednesday', events: [{ kind: 'perm', id: 'd3', blk: 1 }] } },
  { name: 'مركّب (غياب محمد+علي الأربعاء)', entry: { id: 'e3', week: WEEKS[0]!, day: 'wednesday', events: [{ kind: 'abs', id: 'd1' }, { kind: 'abs', id: 'd6' }] } },
  { name: 'استئذان متأخّر (علي ف2 الخميس)', entry: { id: 'e4', week: WEEKS[0]!, day: 'thursday', events: [{ kind: 'perm', id: 'd6', blk: 2 }] } },
];

console.log('═══════════════════════════════════════════════════════════════');
console.log('  رقم ١ — الكنسل والعالم لم يتغيّر: إلغاءُ الحدث الوحيد يُعيد الأساس');
console.log('═══════════════════════════════════════════════════════════════');
console.log(`\nالأساس — العدّادات: ${baseCnt}`);

let allOk = true;
for (const c of CASES) {
  console.log(`\n${'─'.repeat(63)}\n● الحدث: ${c.name}`);
  // (أ) تطبيق الحدث
  const applied = replay(cfg, baseline, [c.entry]);
  const changedDays = seqOf(cfg).filter(({ week, day }) => JSON.stringify(applied[week]![day]) !== JSON.stringify(baseline[week]![day]));
  console.log(`  بعد التطبيق: ${changedDays.length} يومٌ تغيّر (${changedDays.map((x) => AR[x.day]).join('، ')}) — العدّادات: ${countersStr(applied)}`);
  // (ب) الكنسل = حذفُ الحدث من السجلّ ثمّ replay
  const afterCancel = replay(cfg, baseline, [] as Journal);
  const sigOk = fullSig(afterCancel) === baseSig;
  const cntOk = countersStr(afterCancel) === baseCnt;
  console.log(`  بعد الكنسل: الجدول مطابقٌ للأساس؟ ${sigOk ? '✅' : '❌'}  العدّادات مطابقة؟ ${cntOk ? '✅' : '❌'}`);
  if (!sigOk || !cntOk) { allOk = false; console.log('  🚨 فرقٌ بعد الكنسل!'); showWeeks(afterCancel, baseline, 'الناتج بعد الكنسل (⚠️ = مختلف عن الأساس):'); }
}

// عرضٌ تفصيليّ لحالةٍ واحدة (الطبيّة) قبل/بعد/بعد-الكنسل
console.log(`\n${'═'.repeat(63)}\n  مثالٌ مرئيّ — طبيّة محمد الأربعاء ثمّ كنسلها`);
const ex = replay(cfg, baseline, [CASES[0]!.entry]);
showWeeks(baseline, baseline, '① الأساس:');
showWeeks(ex, baseline, '② بعد الطبيّة (⚠️ = تغيّر):');
showWeeks(replay(cfg, baseline, []), baseline, '③ بعد الكنسل (لا ⚠️ = عاد للأساس تمامًا):');

console.log(`\n${'═'.repeat(63)}`);
console.log(allOk ? '✅ كلُّ الحالات: الكنسل أعاد الجدول والعدّادات للأساس تمامًا (صفر فرق).' : '🚨 بعض الحالات لم تعُد للأساس.');
