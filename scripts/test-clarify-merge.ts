/* بطاقةُ توضيحٍ واحدةٌ للاسمِ الواحد — لا بطاقةٌ لكلِّ يوم.
 *
 * «إسراء تفرّغ من الاثنين إلى الأربعاء» يُخرِجُه النموذجُ ثلاثةَ غيابات؛ وإسراءُ اسمٌ
 * مكرّرٌ في المركز، فكانت ثلاثَ بطاقاتٍ تسألُ السؤالَ نفسَه ثلاثًا. تُجمَعُ الآنَ في
 * واحدةٍ تحملُ أيّامَها، وجوابٌ واحدٌ يسري عليها كلِّها (applyResolved).
 *
 * تشغيل: npx tsx scripts/test-clarify-merge.ts
 */
import { sanitize, type RosterEntry, type ParsedExceptions } from '../lib/ai_v2/parseExceptions';
import { applyResolved } from '../lib/algorithms/scheduleFlow';

let pass = 0, fail = 0;
const ok = (cond: boolean, label: string) => {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.log(`  ✗ ${label}`); }
};

const roster: RosterEntry[] = [
  { id: 'd1', name: 'إسراء أحمد' },
  { id: 'd2', name: 'إسراء محمد' },   // الاسمُ نفسُه → مبهم
  { id: 'd3', name: 'زينب علي' },
];

const abs = (mention: string, day: string, status = 'vacation') =>
  ({ mention, day, daySpecified: true, status, scope: 'full' });

console.log('\n— اسمٌ مبهمٌ في ثلاثةِ أيّام —');
{
  const p = sanitize({ extraAbsences: [abs('إسراء', 'monday'), abs('إسراء', 'tuesday'), abs('إسراء', 'wednesday')] }, roster);
  ok(p.clarifications.length === 1, 'بطاقةٌ واحدةٌ لا ثلاث');
  ok(JSON.stringify(p.clarifications[0]?.days) === JSON.stringify(['monday', 'tuesday', 'wednesday']), 'تحملُ أيّامَها الثلاثة');
  ok(p.clarifications[0]!.candidates.length === 2, 'ومرشّحاها كما هما');
  ok(!!p.clarifications[0]!.id, 'ولها هُويّةٌ ثابتة');

  // جوابٌ واحدٌ → ثلاثةُ غيابات
  const applied = applyResolved(p, [{ clar: p.clarifications[0]!, doctorId: 'd2', day: 'monday' }]);
  ok(applied.extraAbsences.length === 3, 'جوابٌ واحدٌ يُنتِجُ ثلاثةَ غيابات');
  ok(applied.extraAbsences.every((a) => a.doctorId === 'd2'), 'كلُّها للطبيبةِ المختارة');
  ok(JSON.stringify(applied.extraAbsences.map((a) => a.day)) === JSON.stringify(['monday', 'tuesday', 'wednesday']), 'وبأيّامِها الثلاثة');
}

console.log('\n— ما لا يُجمَع —');
{
  // حالتانِ مختلفتانِ لنفسِ الاسم: طبيّةٌ يومًا وتفرّغٌ يومًا → بطاقتان
  const p = sanitize({ extraAbsences: [abs('إسراء', 'monday', 'sick_leave'), abs('إسراء', 'tuesday', 'vacation')] }, roster);
  ok(p.clarifications.length === 2, 'اختلافُ الحالةِ يمنعُ الجمع');
  ok(p.clarifications[0]!.id !== p.clarifications[1]!.id, 'ولكلٍّ هُويّةٌ مستقلّة');
}
{
  // اسمانِ مختلفان → بطاقتان
  const p = sanitize({ extraAbsences: [abs('إسراء', 'monday'), abs('زينب', 'monday')] }, roster);
  ok(p.clarifications.length === 1, 'الاسمُ الواضحُ لا بطاقةَ له');
  ok(p.extraAbsences.length === 1 && p.extraAbsences[0]!.doctorId === 'd3', 'ويمضي غيابًا مباشرةً');
}
{
  // بلا يومٍ صريح → لا جمع (لا يومَ يميّزُه، وجمعُه يُضيعُ غيابًا)
  const p: ParsedExceptions = sanitize({
    extraAbsences: [
      { mention: 'إسراء', daySpecified: false, status: 'vacation' },
      { mention: 'إسراء', daySpecified: false, status: 'vacation' },
    ],
  }, roster);
  ok(p.clarifications.length === 2, 'ناقصُ اليومِ لا يُجمَع');
  ok(p.clarifications.every((c) => c.needsDay === true), 'وكلاهما يسألُ عن يومِه');
}

console.log('\n— الاستئذان —');
{
  const p = sanitize({
    extraPermissions: [
      { mention: 'إسراء', day: 'sunday', daySpecified: true, kind: 'end' },
      { mention: 'إسراء', day: 'monday', daySpecified: true, kind: 'end' },
    ],
  }, roster);
  ok(p.clarifications.length === 1, 'الاستئذانُ يُجمَعُ كالغياب');
  const applied = applyResolved(p, [{ clar: p.clarifications[0]!, doctorId: 'd1', day: 'sunday' }]);
  ok(applied.extraPermissions.length === 2, 'وجوابُه يُنتِجُ استئذانَين');
  ok(applied.extraPermissions.every((x) => x.kind === 'end'), 'بنوعِهما المحفوظ');
}

console.log(`\n${fail === 0 ? '✅' : '❌'}  ${pass} ناجح · ${fail} فاشل\n`);
process.exit(fail === 0 ? 0 : 1);
