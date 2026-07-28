/* نقرُ الاحتياطيّ في وضعِ التبديل — اختبارٌ محضٌ (بلا قاعدةِ بيانات).
 *
 * كانت الشبكةُ تعرفُ الاحتياطيَّ بـ role==='ex'، وهي **صيغةٌ قديمة**: المحرّكُ يكتبُه اليومَ
 * role='clinic' + status='extra' + فترة 0 (saveSlots). فكانَ صفُّ الاحتياطيّ يُرسَمُ بلونِه
 * وليبلِه EX لكنّه يُبنى <View> لا زرًّا — فلا يستجيبُ للنقر، ولا يُبدَّلُ بأحد.
 * صارَ التعريفُ واحدًا (isReserveSlot) تستعملُه الشبكةُ لقابليّةِ النقرِ والمحرّكُ للتبديل.
 *
 * تشغيل: npx tsx scripts/test-reserve-tap.ts
 */
import {
  isReserveSlot, isSwappable, isReserveDoctor, shiftOfDoctor, swapDoctorsInDaySlots, type SupMap,
} from '../screens/Schedule/swap';
import type { ScheduleSlot } from '../screens/Schedule/types';

let pass = 0, fail = 0;
const ok = (cond: boolean, label: string) => {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.log(`  ✗ ${label}`); }
};

const S = (o: Partial<ScheduleSlot> & { doctorId: string; period: number; clinicNumber: number; role: any; status: any }): ScheduleSlot =>
  ({ id: `${o.doctorId}-${o.period}-${o.clinicNumber}-${o.status}`, day: 'sunday', doctorName: o.doctorId, ...o } as ScheduleSlot);

// الصيغةُ التي يكتبُها saveSlots فعلًا للاحتياطيّ: الدورُ 'clinic' لا 'ex'.
const RESERVE_AM = S({ doctorId: 'R', period: 0, clinicNumber: 1, role: 'clinic', status: 'extra' });
const RESERVE_PM = S({ doctorId: 'RP', period: 0, clinicNumber: 2, role: 'clinic', status: 'extra' });

console.log('\n— تعريفُ صفِّ الاحتياط —');
{
  ok(isReserveSlot(RESERVE_AM), 'الصيغةُ الحيّة (clinic/extra/فترة 0) تُعرَفُ احتياطًا');
  ok(isSwappable(RESERVE_AM), 'وهي قابلةٌ للتبديلِ في المحرّك');
  ok(!isReserveSlot(S({ doctorId: 'W', period: 1, clinicNumber: 1, role: 'clinic', status: 'active' })), 'خانةُ العملِ ليست احتياطًا');
  ok(!isReserveSlot(S({ doctorId: 'A', period: 1, clinicNumber: 1, role: 'clinic', status: 'sick_leave' })), 'وبطاقةُ الغيابِ ليست احتياطًا (لا تُنقَر)');
  // صيغةٌ قديمةٌ من أسابيعَ محفوظةٍ سابقًا: يرسمُها الجدولُ بليبلِ EX لكنّ المحرّكَ لا يبدّلُها
  // — فلا تُعرَضُ زرًّا كي لا يبدوَ النقرُ عاطلًا.
  const legacy = S({ doctorId: 'L', period: 0, clinicNumber: 1, role: 'ex', status: 'active' });
  ok(!isReserveSlot(legacy) && !isSwappable(legacy), 'الصيغةُ القديمةُ (role=ex/active) خارجَ التبديلِ والنقرِ معًا');
}

console.log('\n— الشفتُ والكشف —');
{
  const day = [RESERVE_AM, RESERVE_PM, S({ doctorId: 'W', period: 3, clinicNumber: 1, role: 'clinic', status: 'active' })];
  ok(isReserveDoctor(day, 'sunday', 'R'), 'isReserveDoctor يكشفُ محتاطَ الصباح');
  ok(!isReserveDoctor(day, 'sunday', 'W'), 'ولا يعُدُّ العاملَ محتاطًا');
  ok(shiftOfDoctor(day, 'sunday', 'R') === 'morning', 'محتاطُ العمود 1 = صباح');
  ok(shiftOfDoctor(day, 'sunday', 'RP') === 'evening', 'ومحتاطُ العمود 2 = مساء');
}

console.log('\n— التبديل: محتاطٌ ⇄ عاملُ عيادة —');
{
  const NO_SUP: SupMap = new Map();
  const slots: ScheduleSlot[] = [
    S({ doctorId: 'W', period: 1, clinicNumber: 1, role: 'clinic', status: 'active' }),
    S({ doctorId: 'W', period: 2, clinicNumber: 1, role: 'clinic', status: 'active' }),
    RESERVE_AM,
    S({ doctorId: 'X', period: 1, clinicNumber: 2, role: 'clinic', status: 'active' }),   // لا يُمَسّ
  ];
  const out = swapDoctorsInDaySlots(slots, 'sunday', 'R', 'W', NO_SUP);
  const r = out.filter((s) => s.doctorId === 'R');
  const w = out.filter((s) => s.doctorId === 'W');
  ok(r.length === 2 && r.every((s) => s.status === 'active' && s.period > 0), 'المحتاطُ أخذَ فترتَي العاملِ كلتيهما');
  ok(w.length === 1 && isReserveSlot(w[0]!), 'والعاملُ صارَ صفَّ الاحتياطِ نفسَه');
  ok(out.filter((s) => isReserveSlot(s)).length === 1, 'وعددُ صفوفِ الاحتياطِ كما هو');
  ok(out.some((s) => s.doctorId === 'X' && s.period === 1 && s.clinicNumber === 2), 'ومَن سواهما لم يتحرّك');
  // والعكسُ يجبُ أن يكونَ متماثلًا (النقرُ الأوّلُ على العاملِ ثمّ على المحتاط)
  const rev = swapDoctorsInDaySlots(slots, 'sunday', 'W', 'R', NO_SUP);
  const sig = (a: ScheduleSlot[]) => a.map((s) => `${s.period}|${s.clinicNumber}|${s.status}|${s.doctorId}`).sort().join(',');
  ok(sig(rev) === sig(out), 'وترتيبُ النقرتين لا يُغيّرُ النتيجة');
}

console.log(`\n${fail === 0 ? '✅' : '❌'}  ${pass} ناجح · ${fail} فاشل\n`);
process.exit(fail === 0 ? 0 : 1);
