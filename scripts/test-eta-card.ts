/* ساعةُ دخولِ المنتظِرِ على كرتِه = ساعتُه في المخطّطِ نفسِه — اختبارٌ محضٌ (بلا قاعدةِ بيانات).
 *
 * الكرتُ في القائمةِ كان يقولُ «Waiting» ولا يقولُ متى، والمخطّطُ يعرفُ متى. فصارَ يأخذُها
 * منه أخذًا (etaFromLanes) لا يحسبُها من جديد — فلا يفترقُ الرقمانِ أبدًا مهما تغيّرَ الدور.
 * والمأخوذُ مَن لم يدخلْ بعدُ وحدَه: الجاري والمنجَزُ لهما ساعاتُهما المسجَّلة، ومَن كان
 * «خلفَ الشفت» لا كتلةَ له فلا وعدَ له بساعة.
 *
 * تشغيل: npx tsx scripts/test-eta-card.ts
 */
import { buildLanes, etaFromLanes } from '../screens/MainQueue/queueLanes';
import type { Break } from '../screens/MainQueue/queueLanes';
import type { Patient } from '../screens/MainQueue/constants';

let pass = 0, fail = 0;
const ok = (cond: boolean, label: string) => {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.log(`  ✗ ${label}`); }
};
const hm = (m: number) => `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`;

const pat = (n: number, minutes: number, extra: Partial<Patient> = {}): Patient => ({
  id: `p${n}`, queue_number: n, name: `Patient ${n}`,
  clinic: 'Clinic', condition: 'Checkup', treatment: 'Filling',
  status: 'normal', expected_minutes: minutes,
  registered_at: new Date(2026, 0, 1, 8, 0),
  ...extra,
} as unknown as Patient);

const CHAIRS = ['1', '2'];
const NO_BREAK: Break[] = [];

console.log('\n— ساعةُ الكرتِ هي ساعةُ الكتلةِ نفسِها —');
{
  const now = 9 * 60;
  const ps = [pat(1, 30), pat(2, 20), pat(3, 45), pat(4, 15)];
  const { lanes } = buildLanes(ps, now, CHAIRS, NO_BREAK);
  const eta = etaFromLanes(lanes);
  let same = true, count = 0;
  for (const l of lanes) for (const b of l.blocks) {
    if (b.kind !== 'fut' && b.kind !== 'eld') continue;
    count++;
    if (eta[b.p.id] !== b.start) same = false;
  }
  ok(count > 0 && same, `كلُّ منتظِرٍ ساعتُه ساعةُ كتلتِه بالضبط (${count} كتلة)`);
  ok(Object.keys(eta).length === count, 'ولا يدخلُ في الخريطةِ مَن ليس منتظِرًا');
}

console.log('\n— مَن دخلَ أو انتهى لا يُوعَدُ بساعةِ دخول —');
{
  const now = 10 * 60;
  const ps = [
    pat(1, 30, { status: 'complete', clinic: '1', completed_at: new Date(2026, 0, 1, 9, 30) }),
    pat(2, 30, { clinic: '1', clinic_entry_at: new Date(2026, 0, 1, 9, 45) }),
    pat(3, 25),
  ];
  const { lanes } = buildLanes(ps, now, CHAIRS, NO_BREAK);
  const eta = etaFromLanes(lanes);
  ok(eta['p1'] === undefined, 'المنجَزُ لا ساعةَ دخولٍ له — عندَه ساعةُ انتهاءٍ مسجَّلة');
  ok(eta['p2'] === undefined, 'والجاري لا ساعةَ دخولٍ له — قد دخلَ فعلًا');
  ok(eta['p3'] !== undefined && eta['p3'] >= now, `والمنتظِرُ وحدَه له وعدٌ (${hm(eta['p3'])})`);
}

console.log('\n— «خلفَ الشفت» لا وعدَ له —');
{
  // تبديلُ شفتٍ ١٣:٠٠، والساعةُ ١٢:٤٠، ومريضٌ علاجُه ٦٠ دقيقةً لا يسعُه ما بقي
  const WALL: Break[] = [{ start: 13 * 60, end: 14 * 60 + 30, fixed: true }];
  const now = 12 * 60 + 40;
  const ps = [pat(1, 60, { registered_at: new Date(2026, 0, 1, 12, 35) })];
  const { lanes } = buildLanes(ps, now, CHAIRS, WALL);
  const eta = etaFromLanes(lanes);
  const beyond = lanes.reduce((n, l) => n + l.beyond.length, 0);
  const placed = lanes.reduce((n, l) => n + l.blocks.filter((b) => b.kind === 'fut' || b.kind === 'eld').length, 0);
  ok(beyond + placed >= 1, 'المريضُ إمّا موضوعٌ أو خلفَ الشفت');
  ok(Object.keys(eta).length === placed, 'ومَن خلفَ الشفتِ لا يدخلُ الخريطةَ — لا كتلةَ له فلا ساعة');
}

console.log('\n— لا يُوعَدُ بماضٍ: كلُّ ساعةٍ في الخريطةِ آتيةٌ لا فائتة —');
{
  for (const now of [8 * 60, 9 * 60 + 30, 11 * 60, 15 * 60]) {
    const ps = [pat(1, 30), pat(2, 40), pat(3, 20), pat(4, 50), pat(5, 25)];
    const { lanes } = buildLanes(ps, now, CHAIRS, [{ start: 13 * 60, end: 14 * 60 + 30, fixed: true }]);
    const eta = etaFromLanes(lanes);
    const vals = Object.values(eta);
    // وبعدَ التبديلِ لا وعدَ أصلًا لمَن سُجِّلَ في الشفتِ الأوّل — وهذا صوابٌ لا نقص
    ok(vals.every((v) => v >= now), `عندَ ${hm(now)}: ${vals.length} وعدًا، ولا وعدَ منها فائت`);
  }
}

console.log('\n— خريطةٌ فارغةٌ لا تنفجر —');
{
  ok(Object.keys(etaFromLanes([])).length === 0, 'لا صفوفَ → لا وعود');
  const { lanes } = buildLanes([], 10 * 60, CHAIRS, NO_BREAK);
  ok(Object.keys(etaFromLanes(lanes)).length === 0, 'ولا مرضى → لا وعود');
}

console.log(`\n${fail === 0 ? '✅' : '❌'}  ${pass} ناجح · ${fail} فاشل\n`);
process.exit(fail === 0 ? 0 : 1);
