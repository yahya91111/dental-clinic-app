// رقم ٢ — الكنسل بعد تغيُّر العالم. حدثان يصلان تِباعًا (سجلّان منفصلان)، الثاني يُحَلّ
// في عالمٍ غيّره الأوّل. ثمّ نكنسل الأوّل ونرى ماذا يحدث للثاني (التشابك/الchurn).
//   npx tsx scripts/labCancel2.ts
import { buildBaseline, replay, exOf, delOf, seqOf, idOf, nmOf, DAYS, AR } from './lib-resolver';
import type { Cfg, St, Journal } from './lib-resolver';
import type { WeekDay } from '../lib/algorithms/schedule';

const NAMES = ['محمد', 'أحمد', 'خالد', 'سعد', 'فهد', 'علي', 'عمر', 'زيد'];
const WEEKS = ['2026-09-03', '2026-09-10'];
const cfg: Cfg = { names: NAMES, lightIds: new Set(['d8']), boardIds: new Set(), M: 3, weeks: WEEKS };
const nm = nmOf(cfg);
const W1 = WEEKS[0]!;

const renderDay = (st: St, week: string, day: WeekDay, base?: St): string => {
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
  const changed = base && JSON.stringify(slots) !== JSON.stringify(base[week]![day]);
  return `${(AR[day] + (changed ? ' ⚠️' : '')).padStart(9)} │ ${parts.join('   ')}`;
};
const showW1 = (st: St, title: string, base?: St) => { console.log(`\n${title}`); for (const d of DAYS) console.log(renderDay(st, W1, d, base)); };
const exStr = (st: St) => cfg.names.map((_, i) => { const id = idOf(i); return `${nm(id)}:${exOf(cfg, st).get(id)}`; }).join(' ');

const baseline = buildBaseline(cfg);

// السجلّ: حدثان تِباعًا في يومٍ واحد (وصلا في وقتين مختلفين) — مُعالَجان كسجلّين منفصلين.
//   A: محمد طبيّة الأربعاء (الاحتياطيّ سعد يغطّيه).
//   B (لاحقًا): أحمد طبيّة الأربعاء (وقد تغيّر العالم: سعد صار يغطّي محمد، فلا احتياطيّ → ينزل المضيف).
const A = { id: 'A', week: W1, day: 'wednesday' as WeekDay, events: [{ kind: 'abs' as const, id: 'd1' }] };
const B = { id: 'B', week: W1, day: 'wednesday' as WeekDay, events: [{ kind: 'abs' as const, id: 'd2' }] };

console.log('══════════════════════════════════════════════════════════════════════');
console.log('  رقم ٢ — كنسل الحدث الأوّل بعد أن غيّر الحدثُ الثاني العالمَ بناءً عليه');
console.log('══════════════════════════════════════════════════════════════════════');

showW1(baseline, '① الأساس (أسبوع ١):');

const afterA = replay(cfg, baseline, [A] as Journal);
showW1(afterA, '② بعد A فقط (محمد طبيّة → سعد الاحتياطيّ يغطّيه):', baseline);

const afterAB = replay(cfg, baseline, [A, B] as Journal);
showW1(afterAB, '③ بعد A ثمّ B (أحمد طبيّة، والعالم تغيّر: لا احتياطيّ → نزولُ المضيف):', baseline);
console.log(`   عدّاد الاحتياط الآن: ${exStr(afterAB)}`);

// الآن: محمد يكنسل طبيّته (A). نحذف A من السجلّ ونُعيد البناء → يبقى B وحده.
const afterCancelA = replay(cfg, baseline, [B] as Journal);
showW1(afterCancelA, '④ بعد كنسل A (يبقى B وحده): سعد تحرّر فعاد ليغطّي أحمد، والمضيف رجع:', afterAB);
console.log(`   عدّاد الاحتياط الآن: ${exStr(afterCancelA)}`);

// مقارنة: ما الذي «اضطرب» (churn) بين ③ و④ غيرَ عودة محمد؟
const churn = DAYS.flatMap((d) => {
  const before = afterAB[W1]![d]!, after = afterCancelA[W1]![d]!;
  const bm = new Map(before.filter((s) => s.role !== 'ex').map((s) => [`${s.role}/${s.clinicNumber}/${s.period}`, s.doctor.id]));
  const am = new Map(after.filter((s) => s.role !== 'ex').map((s) => [`${s.role}/${s.clinicNumber}/${s.period}`, s.doctor.id]));
  const keys = new Set([...bm.keys(), ...am.keys()]);
  const moved = new Set<string>();
  for (const k of keys) if (bm.get(k) !== am.get(k)) { if (bm.get(k) && bm.get(k) !== 'd1') moved.add(bm.get(k)!); if (am.get(k) && am.get(k) !== 'd1') moved.add(am.get(k)!); }
  return moved.size ? [`${AR[d]}: ${[...moved].map(nm).join('، ')}`] : [];
});
console.log(`\n🔄 ما اضطرب بين ③ و④ (عدا عودة محمد): ${churn.length ? churn.join(' | ') : 'لا شيء'}`);
console.log('\nالسؤال: هل نقبل هذا الاضطراب (إعادةُ اشتقاقٍ نظيفة/أعدل) أم نُبقي ما أُبلِغ به الأطبّاء (أقلّ اضطرابًا)؟');
