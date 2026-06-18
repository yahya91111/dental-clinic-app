/* المرحلة ١: مقياس العدل (كشف النقاط). يتحقّق أنّه يعكس العجلة (p1MinusP2 مطابق)،
 * ثمّ يعرض الكشف مقروءًا — «المراقب». قراءةٌ فقط. */
import { loadScheduleData } from '../lib/algorithms/schedule';
import { createWheels } from '../lib/algorithms/wheel';
import { computeScorecard, summarizeImbalance } from '../lib/algorithms/fairness';

const CID = '10000000-0000-0000-0000-000000000001';
const WEEK = '2099-01-04';
let pass = 0; let fail = 0; const fails: string[] = [];
const check = (n: string, c: boolean, d = '') => { if (c) { pass++; console.log('  PASS ' + n); } else { fail++; fails.push(`${n} — ${d}`); console.log('  FAIL ' + n + ' — ' + d); } };

async function main() {
  const { data, error } = await loadScheduleData(CID, WEEK);
  if (error || !data) { console.error('تعذّر التحميل:', error); process.exit(1); }
  const slots = data.existingSlots;

  // ① المقياس
  const sc = computeScorecard(data.doctors, slots);

  // ② التحقّق: p1MinusP2 من المقياس = p1MinusP2 من العجلة (نفس السجلّ، بلا ظلال مستثناة)
  const wheels = createWheels(data.doctors, slots);
  let mism = 0;
  for (const r of sc.rows) {
    const w = wheels.p1MinusP2.get(r.id) ?? 0;
    if (w !== r.p1MinusP2) { mism++; if (mism <= 5) console.log(`   ميزان مختلف: ${r.name} مقياس=${r.p1MinusP2} عجلة=${w}`); }
  }
  check('ميزان الفترات في المقياس يطابق العجلة تمامًا', mism === 0, `${mism} اختلاف`);
  check('الكشف يشمل كلّ الأطبّاء', sc.rows.length === data.doctors.length, `${sc.rows.length}/${data.doctors.length}`);
  check('ترتيب الاستحقاق مكتمل (لا تكرار/نقص)', new Set(sc.owedSolo).size === sc.rows.length, '');

  // ③ المراقب: عرضٌ مقروء
  console.log('\n══════ كشف النقاط (المراقب) — أسبوع ' + WEEK + ' ══════');
  console.log('الطبيب'.padEnd(22) + 'منفرد  دليقيتر  مقاعد  ميزان(ف١-ف٢)');
  for (const r of [...sc.rows].sort((a, b) => b.solo - a.solo || b.delegator - a.delegator)) {
    const owedMark = sc.owedSolo[0] === r.id ? '  ← الأكثر استحقاقًا (انفراد)' : '';
    console.log(r.name.slice(0, 20).padEnd(22) + String(r.solo).padEnd(7) + String(r.delegator).padEnd(9) + String(r.clinicSeats).padEnd(7) + String(r.p1MinusP2).padStart(3) + owedMark);
  }
  const sum = summarizeImbalance(sc);
  console.log('\nالملخّص:');
  console.log(`  فجوة الانفراد (وصفيّة): ${sum.soloGap} | فجوة الدليقيتر: ${sum.delegatorGap} | أقصى |ميزان|: ${sum.maxAbsP1MinusP2}`);
  console.log(`  الأكثر استحقاقًا للانفراد: ${sum.mostOwedSolo} | الأكثر تقدّمًا: ${sum.mostAheadSolo}`);

  console.log(`\n══════ النتيجة: ${pass} PASS / ${fail} FAIL ══════`);
  if (fails.length) fails.forEach((f) => console.log('  • ' + f));
  process.exit(fail ? 1 : 0);
}
main().catch((e) => { console.error('ERR', e.message, e.stack); process.exit(1); });
