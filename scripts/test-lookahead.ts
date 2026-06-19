/* نواة النظر-للأمام (الامتصاص قبل الحدث) — اختبارٌ مُصطنَعٌ بنتائج محسوبةٍ بالضبط.
 * السيناريو المحوريّ: خالد هو **الوحيد** المؤهَّل لدليقيتر الأربعاء (مُجبَر)، وهو أيضًا
 * الأحقّ للاثنين. الحلّال الأماميّ يُثقِله (الاثنين+الأربعاء=٢). النظر-للأمام يجب أن
 * **يُرتاحه يوم الاثنين** (يحجزه للأربعاء المُجبَر) → لمسٌ **قبل** الحدث. لا كتابة. */
import { solveLookahead } from '../lib/algorithms/solver';
import type { HeavySeat } from '../lib/algorithms/solver';

let pass = 0; let fail = 0; const fails: string[] = [];
const check = (n: string, c: boolean, d = '') => { if (c) { pass++; console.log('  PASS ' + n); } else { fail++; fails.push(`${n} — ${d}`); console.log('  FAIL ' + n + ' — ' + d); } };
const doc = (id: string, name: string) => ({ id, name, groupTemplate: { key: 'group_a' } as any, groupId: 'g', workStatus: 'normal' as any, supervisorDoctorId: null });

// أختام: اثنين=#1، أربعاء=#3 (صباح).
const MON = 'w#1#0'; const WED = 'w#3#0';

function main() {
  const docs = [doc('K', 'خالد'), doc('S', 'سعد'), doc('F', 'فهد')];

  // ① السيناريو المحوريّ: خالد مُجبَرٌ الأربعاء، والأحقّ للاثنين. التوزيع الحاليّ
  //    (الأماميّ) أثقله: الاثنين=خالد، الأربعاء=خالد.
  const seats: HeavySeat[] = [
    { id: `del|${MON}|K`, stamp: MON, kind: 'delegator', eligible: ['K', 'S', 'F'], current: 'K' },
    { id: `del|${WED}|K`, stamp: WED, kind: 'delegator', eligible: ['K'], current: 'K' }, // مُجبَر
  ];
  // خالد الأقدم حداثةً (الأحقّ)، سعد/فهد أحدث.
  const prior = new Map([['K', ''], ['S', 'w#0#0'], ['F', 'w#0#0']]);
  const rec = solveLookahead(docs, seats, prior);
  console.log('① القسمة:', rec.fullAssignment.map((a) => `${a.seatId.split('|')[1]}→${docs.find((d) => d.id === a.doctorId)?.name}`).join('، '));
  console.log('   إعادة القسمة:', rec.assignments.map((a) => `${a.from}→${a.to}`).join('، ') || '(لا شيء)', '| حِمل', rec.maxLoadBefore, '→', rec.maxLoadAfter);

  const wedHolder = rec.fullAssignment.find((a) => a.seatId.includes(WED))!.doctorId;
  const monHolder = rec.fullAssignment.find((a) => a.seatId.includes(MON))!.doctorId;
  const khaledLoad = rec.loadAfter.find((x) => x.id === 'K')?.load ?? 0;

  check('① خالد يبقى على الأربعاء المُجبَر', wedHolder === 'K', wedHolder);
  check('① الاثنين أُعطي لغير خالد (امتصاصٌ قبل الحدث)', monHolder !== 'K', monHolder);
  check('① حِمل خالد صار ١ لا ٢ (لا إثقال)', khaledLoad === 1, `${khaledLoad}`);
  check('① أقصى الحِمل قلّ ٢→١', rec.maxLoadBefore === 2 && rec.maxLoadAfter === 1, `${rec.maxLoadBefore}→${rec.maxLoadAfter}`);
  // **التمحيص الحاسم:** اللمس وقع في يومٍ (الاثنين=#1) **قبل** يوم الحدث (الأربعاء=#3).
  check('① **لمسٌ قبل الحدث** (الاثنين قبل الأربعاء)', rec.daysTouched.includes(1) && !rec.daysTouched.includes(3), `أيّام=${rec.daysTouched}`);
  check('① الأهليّة محترمة والقسمة محفوظة', rec.eligibilityRespected && rec.conserved, '');

  // ② التحقّق العكسيّ: لو لم يكن خالد مُجبَرًا (الأربعاء مفتوحٌ للجميع)، لا داعي لإرتاحه
  //    الاثنين بالضرورة — لكن لا إثقال أبدًا (أقصى حِمل ≤ ١ مع ٣ أطبّاء ومقعدين).
  const seats2: HeavySeat[] = [
    { id: `del|${MON}|K`, stamp: MON, kind: 'delegator', eligible: ['K', 'S', 'F'], current: 'K' },
    { id: `del|${WED}|K`, stamp: WED, kind: 'delegator', eligible: ['K', 'S', 'F'], current: 'K' },
  ];
  const rec2 = solveLookahead(docs, seats2, prior);
  check('② بلا إجبار: لا إثقال (أقصى حِمل ١)', rec2.maxLoadAfter === 1, `${rec2.maxLoadAfter}`);
  check('② بلا إجبار: الأهليّة محترمة', rec2.eligibilityRespected && rec2.conserved, '');

  // ③ مقياس «دورةٌ واحدة للعائد»: عائدٌ (K، حداثته '') وسطَ ٣ مقاعدَ مفتوحة → يأخذ
  //    واحدًا فقط (الحِمل يمنع تكديسه)، والبقيّة تتوزّع.
  const seats3: HeavySeat[] = ['w#1#0', 'w#2#0', 'w#3#0'].map((st) => ({ id: `del|${st}|x`, stamp: st, kind: 'delegator', eligible: ['K', 'S', 'F'], current: 'S' }));
  const rec3 = solveLookahead(docs, seats3, new Map([['K', ''], ['S', 'w#0#0'], ['F', 'w#0#1']]));
  const kLoad3 = rec3.loadAfter.find((x) => x.id === 'K')?.load ?? 0;
  check('③ العائد يأخذ دورًا واحدًا فقط (لا تكديس)', kLoad3 === 1, `${kLoad3}`);
  check('③ توزيعٌ متوازن (أقصى حِمل ١)', rec3.maxLoadAfter === 1, `${rec3.maxLoadAfter}`);

  console.log(`\n══════ النتيجة: ${pass} PASS / ${fail} FAIL ══════`);
  if (fails.length) fails.forEach((f) => console.log('  • ' + f));
  process.exit(fail ? 1 : 0);
}
main();
