/* سيناريو الاحتياط الواقعيّ (ظلّ):
 *   الاثنين: يحيى كان احتياطيًّا، لكنّ شهد غاب فغطّى يحيى مكانه → يحيى **عمل** (لم يرتَح)،
 *            وشهد **غاب = ارتاح**.
 *   الأربعاء: شهد مُسجَّلٌ احتياطًا (سيرتاح ثانيةً!) ويحيى يستلم عيادة.
 * السؤال: هل يصحّح النظام فيمنح احتياطَ الأربعاء ليحيى (الأحقّ بالراحة) بدل شهد؟
 * قراءةٌ فقط — لا يكتب حرفًا. */
import { lastRestStamps, solveHeavyRecency } from '../lib/algorithms/solver';
import type { LoadedSlot, LoadedDoctor } from '../lib/algorithms/schedule';
import type { HeavySeat } from '../lib/algorithms/solver';

const W = '2099-01-04';
let pass = 0; let fail = 0; const fails: string[] = [];
const check = (n: string, c: boolean, d = '') => { if (c) { pass++; console.log('  PASS ' + n); } else { fail++; fails.push(`${n} — ${d}`); console.log('  FAIL ' + n + ' — ' + d); } };
const doc = (id: string, name: string): LoadedDoctor => ({ id, name, groupTemplate: { key: 'group_a' } as any, groupId: 'g', workStatus: 'normal' as any, supervisorDoctorId: null });
const slot = (o: Partial<LoadedSlot>): LoadedSlot => ({ id: 'x', weekStart: W, dayOfWeek: 'monday', period: 0, clinicNumber: 0, doctorId: '', doctorName: '', role: 'clinic', status: 'active', ...o });

function main() {
  const docs = [doc('Y', 'يحيى'), doc('S', 'شهد'), doc('B', 'بدر'), doc('F', 'فهد')];

  // ── التاريخ حتى ما قبل الأربعاء ──
  const history: LoadedSlot[] = [
    // الاثنين: شهد غاب (طبية) = ارتاح.
    slot({ dayOfWeek: 'monday', period: 0, doctorId: 'S', doctorName: 'شهد', status: 'sick_leave', role: 'clinic' }),
    // الاثنين: يحيى غطّى مكان شهد → عَمِل بالعيادة (نشط)، لم يرتَح.
    slot({ dayOfWeek: 'monday', period: 1, clinicNumber: 1, doctorId: 'Y', doctorName: 'يحيى', status: 'active', role: 'clinic' }),
    slot({ dayOfWeek: 'monday', period: 2, clinicNumber: 1, doctorId: 'Y', doctorName: 'يحيى', status: 'active', role: 'clinic' }),
    // بدر/فهد عملا الاثنين أيضًا (لم يرتاحا) — كي يكون يحيى وهما بلا راحةٍ حديثة.
    slot({ dayOfWeek: 'monday', period: 1, clinicNumber: 2, doctorId: 'B', doctorName: 'بدر', status: 'active', role: 'clinic' }),
    slot({ dayOfWeek: 'monday', period: 2, clinicNumber: 2, doctorId: 'F', doctorName: 'فهد', status: 'active', role: 'clinic' }),
  ];

  const rest = lastRestStamps(history);
  console.log('آخر راحةٍ لكلّ طبيب:', [...docs].map((d) => `${d.name}=${rest.get(d.id) || 'لم يرتَح'}`).join('، '));

  // ── مقعد احتياط الأربعاء: شاغله الحاليّ شهد، والمؤهَّلون الحاضرون ──
  const wedReserve: HeavySeat[] = [{ id: `ex|${W}#3#0|1|S`, stamp: `${W}#3#0`, kind: 'reserve', eligible: ['Y', 'S', 'B', 'F'], current: 'S' }];
  const r = solveHeavyRecency(docs, rest, wedReserve);
  const moved = r.assignments.find((a) => a.seatId === wedReserve[0]!.id);
  console.log('قرار احتياط الأربعاء:', moved ? `${moved.from} → ${moved.to}` : 'بقي لشهد (لا تغيير)');

  // شهد ارتاح الاثنين (غياب) → ختمُه حديث؛ يحيى عَمِل → بلا راحة ('') = الأحقّ.
  check('شهد له راحةٌ حديثة (الغياب = راحة)', (rest.get('S') ?? '') !== '', `${rest.get('S')}`);
  check('يحيى بلا راحةٍ حديثة (غطّى فعَمِل)', (rest.get('Y') ?? '') === '', `${rest.get('Y')}`);
  check('احتياط الأربعاء يُنقَل من شهد إلى يحيى (تصحيحُ العدل)', moved?.to === 'يحيى', `${moved?.to}`);
  check('الأهليّة محترمة', r.owedRespected, '');

  // ── تأكيدٌ عكسيّ: لو شهد لم يغب (عمل الاثنين مثل يحيى)، يبقى احتياط الأربعاء له ──
  const history2 = history.map((s) => (s.doctorId === 'S' && s.status === 'sick_leave')
    ? slot({ dayOfWeek: 'monday', period: 1, clinicNumber: 3, doctorId: 'S', doctorName: 'شهد', status: 'active', role: 'clinic' }) : s);
  const rest2 = lastRestStamps(history2);
  const r2 = solveHeavyRecency(docs, rest2, wedReserve);
  const moved2 = r2.assignments.find((a) => a.seatId === wedReserve[0]!.id);
  check('عكسيّ: لو لم يغب شهد، يبقى احتياطُه (لا تصحيح بلا سبب)', !moved2 || moved2.to === 'شهد', `${moved2?.to}`);

  console.log(`\n══════ النتيجة: ${pass} PASS / ${fail} FAIL ══════`);
  if (fails.length) fails.forEach((f) => console.log('  • ' + f));
  process.exit(fail ? 1 : 0);
}
main();
