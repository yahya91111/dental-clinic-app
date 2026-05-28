// ═══════════════════════════════════════════════════════════════
// Test schedule.build directly — verify fairness & rotation
// ═══════════════════════════════════════════════════════════════
// يستدعي الخوارزمية مباشرة (بدون AI) ويطبع:
//   1. قائمة الأطباء المحمّلة (مع status)
//   2. عدد التريني وإذا كان فيه تريني نطلب modes
//   3. نتيجة البناء
//   4. توزيع كل طبيب (كم clinic / delegator / ex بالأسبوع)
//   5. توزيع كل يوم (عيادة1 يوم1 = من؟)
//
// Usage:
//   npx tsx --env-file=.env scripts/test-schedule-fairness.ts
// ═══════════════════════════════════════════════════════════════

import { schedule, loadScheduleData } from '../lib/algorithms/schedule';
import type { ScheduleBuildInput, TraineeMode } from '../lib/algorithms/schedule';
import { supabase } from '../lib/supabase';

const CLINIC_ID = '10000000-0000-0000-0000-000000000001'; // Mushref
const WEEK_START = '2026-05-31';

function divider(label: string) {
  console.log(`\n${'─'.repeat(70)}\n${label}\n${'─'.repeat(70)}`);
}

async function main() {
  // 1. Load data
  divider('1. تحميل بيانات العيادة');
  const { data, error } = await loadScheduleData(CLINIC_ID, WEEK_START);
  if (error || !data) {
    console.log('فشل التحميل:', error);
    return;
  }
  console.log(`عدد العيادات: ${data.clinicCount}`);
  console.log(`عدد الأطباء (في القروبات الـ4): ${data.doctors.length}`);

  // 2. Group breakdown
  divider('2. توزيع الأطباء على القروبات');
  const byGroup = new Map<string, typeof data.doctors>();
  for (const d of data.doctors) {
    const key = d.groupTemplate.name;
    const arr = byGroup.get(key) || [];
    arr.push(d);
    byGroup.set(key, arr);
  }
  for (const [group, docs] of byGroup.entries()) {
    const active = docs.filter((d) => d.workStatus === 'active').length;
    const vacation = docs.filter((d) => d.workStatus === 'vacation').length;
    const trainee = docs.filter((d) => d.workStatus === 'trainee').length;
    const light = docs.filter((d) => d.workStatus === 'light_duty').length;
    console.log(
      `${group.padEnd(10)} → total=${docs.length}, active=${active}, vacation=${vacation}, trainee=${trainee}, light=${light}`,
    );
  }
  // Print each doctor with their group key
  console.log('\nأسماء وقروباتهم:');
  for (const d of data.doctors) {
    console.log(`  ${d.name.padEnd(28)} → ${d.groupTemplate.key.padEnd(10)} status=${d.workStatus}`);
  }

  // 3. Set all trainees to 'independent' for this test
  const trainees = data.doctors.filter((d) => d.workStatus === 'trainee');
  const traineeModes: Record<string, TraineeMode> = {};
  for (const t of trainees) traineeModes[t.id] = 'independent';
  if (trainees.length > 0) {
    console.log(
      `\nتم تعيين ${trainees.length} تريني كـ independent للاختبار.`,
    );
  }

  // 4. Build (dryRun first to inspect)
  divider('3. بناء الجدول (dryRun=false، يكتب في DB)');
  const buildInput: ScheduleBuildInput = {
    weekStart: WEEK_START,
    clinicId: CLINIC_ID,
    aShiftPlan: {
      sunday: 'morning',
      monday: 'morning',
      tuesday: 'morning',
      wednesday: 'morning',
      thursday: 'morning',
    },
    boardConfig: {
      scenario: { kind: 'all_morning' },
      includeInExRotation: false,
    },
    traineeModes,
    dryRun: false,
  };

  const result = await schedule.build(buildInput);
  console.log('Result:', JSON.stringify(result, null, 2));

  if (!result.success) return;

  // 5. Query saved slots and analyze
  divider('4. تحليل التوزيع لكل طبيب (الأسبوع كاملاً)');
  const { data: savedSlots, error: qErr } = await supabase
    .from('schedule_slots')
    .select('day_of_week, period, clinic_number, doctor_id, doctor_name, role, status')
    .eq('clinic_id', CLINIC_ID)
    .eq('week_start', WEEK_START)
    .eq('status', 'active')
    .order('day_of_week')
    .order('period');
  if (qErr || !savedSlots) {
    console.log('فشل قراءة الجدول:', qErr);
    return;
  }
  console.log(`عدد الخانات المحفوظة: ${savedSlots.length}`);

  // Aggregate per doctor
  type Counts = { clinic: number; delegator: number; ex: number; name: string };
  const perDoc = new Map<string, Counts>();
  for (const s of savedSlots as Array<{
    day_of_week: string;
    period: number;
    clinic_number: number;
    doctor_id: string;
    doctor_name: string;
    role: string;
  }>) {
    const c = perDoc.get(s.doctor_id) || {
      clinic: 0,
      delegator: 0,
      ex: 0,
      name: s.doctor_name,
    };
    if (s.role === 'clinic') c.clinic++;
    else if (s.role === 'delegator') c.delegator++;
    else if (s.role === 'ex') c.ex++;
    perDoc.set(s.doctor_id, c);
  }

  // Print sorted by total load
  const rows = [...perDoc.values()].map((c) => ({
    ...c,
    total: c.clinic + c.delegator * 2,
  }));
  rows.sort((a, b) => b.total - a.total);
  console.log(
    'الاسم'.padEnd(30) + 'clinic'.padEnd(10) + 'delegator'.padEnd(12) + 'ex'.padEnd(6) + 'load',
  );
  console.log('-'.repeat(70));
  for (const r of rows) {
    console.log(
      r.name.padEnd(30) +
        String(r.clinic).padEnd(10) +
        String(r.delegator).padEnd(12) +
        String(r.ex).padEnd(6) +
        String(r.total),
    );
  }

  // 6. Print day-by-day clinic assignments (just morning shift)
  divider('5. تدوير يومي (شفت صباح، فترة P1، عيادة لكل يوم)');
  const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday'];
  const clinics = Array.from({ length: data.clinicCount }, (_, i) => i + 1);
  console.log(
    'اليوم'.padEnd(12) +
      clinics.map((c) => `عيادة ${c}`.padEnd(25)).join('') +
      'delegator'.padEnd(25),
  );
  console.log('-'.repeat(70));
  for (const day of days) {
    const p1Slots = (savedSlots as Array<{
      day_of_week: string;
      period: number;
      clinic_number: number;
      doctor_name: string;
      role: string;
    }>).filter((s) => s.day_of_week === day && s.period === 1);
    const cells: string[] = [day.padEnd(12)];
    for (const c of clinics) {
      const cell = p1Slots.find((s) => s.role === 'clinic' && s.clinic_number === c);
      cells.push((cell?.doctor_name || '—').padEnd(25));
    }
    const dlg = p1Slots.find((s) => s.role === 'delegator');
    cells.push((dlg?.doctor_name || '—').padEnd(25));
    console.log(cells.join(''));
  }
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
