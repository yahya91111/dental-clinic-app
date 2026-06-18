/* المرحلة ٢: الحلّال بالظلّ. يتحقّق أنّه (أ) يوافق العجلة على شفتٍ مبنيٍّ طازج
 * (صفر مبادلة)، (ب) يصحّح شفتاً مُفسَداً يدوياً بأقلّ مبادلة و|خلل| لا يزيد،
 * (ج) يحفظ النقاط دائماً (مجموع الفروق = صفر). قراءةٌ فقط — لا يكتب شيئاً. */
import { loadScheduleData } from '../lib/algorithms/schedule';
import type { LoadedSlot } from '../lib/algorithms/schedule';
import { solveShiftPeriods, splitTargetShift } from '../lib/algorithms/solver';

const CID = '10000000-0000-0000-0000-000000000001';
const WEEK = '2099-01-04';
let pass = 0; let fail = 0; const fails: string[] = [];
const check = (n: string, c: boolean, d = '') => { if (c) { pass++; console.log('  PASS ' + n); } else { fail++; fails.push(`${n} — ${d}`); console.log('  FAIL ' + n + ' — ' + d); } };

async function main() {
  const { data, error } = await loadScheduleData(CID, WEEK);
  if (error || !data) { console.error('تعذّر التحميل:', error); process.exit(1); }
  const all = [...data.pastSlots, ...data.existingSlots];

  // اختر شفتاً مستهدفاً به أزواج عيادة (الأحد صباحاً).
  const { contextSlots, shiftSlots } = splitTargetShift(all, WEEK, 'sunday', 'morning');
  const clinicSeats = shiftSlots.filter((s) => s.status === 'active' && s.role === 'clinic' && s.clinicNumber > 0);
  console.log(`الشفت المستهدف: الأحد صباحاً — ${clinicSeats.length} مقعد عيادة، السياق ${contextSlots.length} خانة.`);

  // (أ) شفتٌ مبنيٌّ طازج: نعطي الحلّال **نفس سياق العجلة السببيّ** (الماضي فقط —
  //     الأحد صباحاً أوّل شفت الأسبوع) فيجب أن يوافقها → صفر مبادلة، حفظٌ صحيح.
  const causalContext = data.pastSlots;
  const fresh = solveShiftPeriods(data.doctors, causalContext, shiftSlots);
  check('شفتٌ مبنيٌّ طازج: لا مبادلة (الحلّال = العجلة)', fresh.swaps.length === 0, `${fresh.swaps.length} مبادلة`);
  check('الإيصال يحفظ النقاط (مجموع الفروق = صفر)', fresh.ledgerBalanced, 'غير محفوظ');
  check('|الخلل| لا يسوء على الطازج', fresh.afterAbsImbalance <= fresh.beforeAbsImbalance, `${fresh.beforeAbsImbalance}→${fresh.afterAbsImbalance}`);

  // (ب) إفسادٌ يدويّ: اقلب فترتَي أوّل زوج عيادةٍ بحيث يخالف قرار العجلة. الحلّال
  //     يجب أن يقترح مبادلةً (أو أكثر) ولا يسوء الخلل، مع حفظٍ صحيح.
  // نصنع نسخةً مُفسَدة بقلب فترات مقاعد عيادةٍ واحدة (ف١↔ف٢).
  const firstClinic = clinicSeats.length ? Math.min(...clinicSeats.map((s) => s.clinicNumber)) : 0;
  const corrupt: LoadedSlot[] = shiftSlots.map((s) => {
    if (s.role === 'clinic' && s.clinicNumber === firstClinic && (s.period === 1 || s.period === 2)) {
      return { ...s, period: s.period === 1 ? 2 : 1 };
    }
    return s;
  });
  const fixed = solveShiftPeriods(data.doctors, causalContext, corrupt);
  console.log(`  إفساد ع${firstClinic}: الحلّال اقترح ${fixed.swaps.length} مبادلة — |خلل| ${fixed.beforeAbsImbalance}→${fixed.afterAbsImbalance}.`);
  check('الإفساد: الحلّال يحفظ النقاط', fixed.ledgerBalanced, 'غير محفوظ');
  check('الإفساد: |الخلل| لا يسوء بعد الحلّ', fixed.afterAbsImbalance <= fixed.beforeAbsImbalance, `${fixed.beforeAbsImbalance}→${fixed.afterAbsImbalance}`);
  check('الإفساد: الحلّ يطابق العجلة الطازجة', fixed.afterAbsImbalance === fresh.afterAbsImbalance, `حلّال=${fixed.afterAbsImbalance} عجلة=${fresh.afterAbsImbalance}`);

  // ③ عرض الإيصال (الظلّ): ماذا «سيفعل» دون تطبيق.
  console.log('\n══════ إيصال الحلّال (ظلّ — لم يُطبَّق) — الأحد صباحاً ══════');
  if (fixed.swaps.length === 0) console.log('  (لا مبادلات)');
  for (const sw of fixed.swaps) console.log(`  مبادلة ع${sw.clinicNumber}: ${sw.f1Doctor.name} (ف١→ف٢) ⇄ ${sw.f2Doctor.name} (ف٢→ف١)`);
  if (fixed.deltas.length) {
    console.log('  تغيّر الميزان:');
    for (const d of fixed.deltas) console.log(`    ${d.name}: ${d.before} → ${d.after}`);
  }
  console.log(`  الحفظ: ${fixed.ledgerBalanced ? 'صحيح ✓' : 'مكسور ✗'} | التحسّن: ${fixed.improvement}`);
  fixed.notes.forEach((n) => console.log('  • ' + n));

  // (د) حالةٌ مُركَّبةٌ لا لبس فيها: طبيبان، أحمد ميزانه الداخل +2 (أخذ ف١ مرّتين
  //     سابقاً) وبدر 0. لو وُضع أحمد في ف١ ثانيةً فالخلل أسوأ — الحلّال يجب أن
  //     يبدّل (بدر→ف١، أحمد→ف٢) فيقلّ الخلل بمقدار ٢ تماماً.
  const docs2 = [
    { id: 'A', name: 'أحمد', groupTemplate: { key: 'group_a' } as any, groupId: 'g', workStatus: 'normal' as any, supervisorDoctorId: null },
    { id: 'B', name: 'بدر', groupTemplate: { key: 'group_a' } as any, groupId: 'g', workStatus: 'normal' as any, supervisorDoctorId: null },
  ];
  const L = (over: Partial<LoadedSlot>): LoadedSlot => ({ id: 'x', weekStart: WEEK, dayOfWeek: 'monday', period: 1, clinicNumber: 1, doctorId: 'A', doctorName: 'أحمد', role: 'clinic', status: 'active', ...over });
  // سياق: أحمد أخذ ف١ مرّتين (ميزان +2)، بدر 0.
  const ctx2: LoadedSlot[] = [
    L({ weekStart: '2098-12-28', dayOfWeek: 'sunday', period: 1, clinicNumber: 1, doctorId: 'A', doctorName: 'أحمد' }),
    L({ weekStart: '2098-12-28', dayOfWeek: 'monday', period: 1, clinicNumber: 1, doctorId: 'A', doctorName: 'أحمد' }),
  ];
  // الشفت المُفسَد: أحمد في ف١ (الأسوأ)، بدر في ف٢.
  const bad: LoadedSlot[] = [
    L({ period: 1, clinicNumber: 1, doctorId: 'A', doctorName: 'أحمد' }),
    L({ period: 2, clinicNumber: 1, doctorId: 'B', doctorName: 'بدر' }),
  ];
  const r = solveShiftPeriods(docs2 as any, ctx2, bad);
  console.log(`\n(د) مُركَّبة: ${r.swaps.length} مبادلة، |خلل| ${r.beforeAbsImbalance}→${r.afterAbsImbalance}، تحسّن ${r.improvement}.`);
  check('(د) يقترح مبادلةً واحدة بالضبط', r.swaps.length === 1, `${r.swaps.length}`);
  check('(د) يبدّل بدر إلى ف١', r.swaps[0]?.f2Doctor.id === 'B', JSON.stringify(r.swaps[0]));
  check('(د) يقلّ الخلل بمقدار ٢', r.improvement === 2, `تحسّن=${r.improvement}`);
  check('(د) يحفظ النقاط', r.ledgerBalanced, 'مكسور');

  console.log(`\n══════ النتيجة: ${pass} PASS / ${fail} FAIL ══════`);
  if (fails.length) fails.forEach((f) => console.log('  • ' + f));
  process.exit(fail ? 1 : 0);
}
main().catch((e) => { console.error('ERR', e.message, e.stack); process.exit(1); });
