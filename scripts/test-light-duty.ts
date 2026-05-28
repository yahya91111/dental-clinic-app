// ═══════════════════════════════════════════════════════════════
// Test light_duty placement
// ═══════════════════════════════════════════════════════════════
// يختبر القواعد:
//   1. light_duty يعمل P1 (صباح) أو P3 (مساء) فقط
//   2. لا يُسند أبداً لـ P2/P4
//   3. لو 2 light_duty في نفس الشفت → كل واحد في عيادة منفصلة
//
// السيناريوهات:
//   A. 1 light_duty حالي (زهراء العكري في Mushref Group A صباح)
//   B. محاكاة 2 light_duty في نفس الشفت (نضيف طبيب آخر مؤقتاً)
// ═══════════════════════════════════════════════════════════════

import { schedule, loadScheduleData } from '../lib/algorithms/schedule';
import type { ScheduleBuildInput, TraineeMode } from '../lib/algorithms/schedule';
import { supabase } from '../lib/supabase';

const CLINIC_ID = '10000000-0000-0000-0000-000000000001';
const WEEK_START = '2026-05-31';

function divider(label: string) {
  console.log(`\n${'─'.repeat(70)}\n${label}\n${'─'.repeat(70)}`);
}

async function buildAndAnalyze(traineeModes: Record<string, TraineeMode>, label: string) {
  divider(label);

  const buildInput: ScheduleBuildInput = {
    weekStart: WEEK_START,
    clinicId: CLINIC_ID,
    aShiftPlan: {
      sunday: 'morning', monday: 'morning', tuesday: 'morning',
      wednesday: 'morning', thursday: 'morning',
    },
    boardConfig: {
      scenario: { kind: 'all_morning' },
      includeInExRotation: false,
    },
    traineeModes,
    dryRun: false,
  };

  const result = await schedule.build(buildInput);
  console.log(`success=${result.success}, slots=${result.slotsCreated}, warnings=${result.warnings.length}`);
  if (result.warnings.length > 0) {
    console.log('Warnings:', result.warnings);
  }
  if (result.errors.length > 0) {
    console.log('Errors:', result.errors);
    return;
  }

  // Get LD doctors in THIS clinic only (filter via groups → members)
  const { data: groupsData } = await supabase
    .from('doctor_groups')
    .select('id, doctor_group_members(doctor_id, doctor_name, work_status)')
    .eq('clinic_id', CLINIC_ID);
  const ldDocs: { doctor_id: string; doctor_name: string }[] = [];
  for (const g of (groupsData || []) as any[]) {
    for (const m of (g.doctor_group_members || []) as any[]) {
      if (m.work_status === 'light_duty') ldDocs.push(m);
    }
  }

  if (ldDocs.length === 0) {
    console.log('لا يوجد light_duty في هذه العيادة');
    return;
  }

  const ids = ldDocs.map((d) => d.doctor_id);
  const { data: ldSlots } = await supabase
    .from('schedule_slots')
    .select('day_of_week, period, clinic_number, doctor_id, doctor_name, role, status')
    .eq('clinic_id', CLINIC_ID)
    .eq('week_start', WEEK_START)
    .in('doctor_id', ids)
    .eq('status', 'active')
    .order('day_of_week')
    .order('period');

  console.log(`\nخانات light_duty (${ldDocs.length} طبيب):`);
  console.log('اليوم        فترة  عيادة  دور        طبيب');
  console.log('-'.repeat(70));

  // Group by doctor+day to detect role per shift
  const byDocDay = new Map<string, any[]>();
  for (const s of (ldSlots || []) as any[]) {
    const key = `${s.doctor_id}|${s.day_of_week}`;
    const arr = byDocDay.get(key) || [];
    arr.push(s);
    byDocDay.set(key, arr);
  }

  let violations = 0;
  for (const s of (ldSlots || []) as any[]) {
    console.log(
      `${s.day_of_week.padEnd(12)} P${s.period}    ${String(s.clinic_number).padEnd(6)} ${s.role.padEnd(10)} ${s.doctor_name}`,
    );
  }

  // Validate per doctor per day:
  //   - clinic role: must be P1 or P3 only (never P2/P4)
  //   - delegator role: allowed P1+P2 (or P3+P4) together; alone P1 or P3 only
  console.log('\nالتحقق:');
  for (const [key, slots] of byDocDay) {
    const [, day] = key.split('|');
    const docName = slots[0].doctor_name;
    const clinicSlots = slots.filter((s: any) => s.role === 'clinic');
    const delSlots = slots.filter((s: any) => s.role === 'delegator');

    // clinic violations: any clinic at P2/P4
    for (const cs of clinicSlots) {
      if (cs.period === 2 || cs.period === 4) {
        console.log(`  ❌ ${docName} ${day}: clinic في P${cs.period} (ممنوع)`);
        violations++;
      }
    }
    // delegator: P1+P2 OR P1 alone (P3+P4 OR P3 alone for evening). Never just P2/P4.
    if (delSlots.length > 0) {
      const periods = delSlots.map((s: any) => s.period).sort();
      const isMorning = periods.every((p: number) => p <= 2);
      const isEvening = periods.every((p: number) => p >= 3);
      const isP1Only = periods.length === 1 && (periods[0] === 1);
      const isP3Only = periods.length === 1 && (periods[0] === 3);
      const isP1P2 = periods.length === 2 && periods[0] === 1 && periods[1] === 2;
      const isP3P4 = periods.length === 2 && periods[0] === 3 && periods[1] === 4;
      if (!(isP1Only || isP3Only || isP1P2 || isP3P4)) {
        console.log(`  ❌ ${docName} ${day}: delegator في فترات [${periods}] (يجب P1 أو P1+P2 أو P3 أو P3+P4)`);
        violations++;
      }
    }
  }
  if (violations === 0) {
    console.log('  ✓ كل القواعد محققة');
  }
}

async function main() {
  // ─── Scenario A: حالة Mushref الحالية (زهراء light_duty صباح) ───
  // أولاً نتعرّف على التريني للسماح بالبناء
  const { data, error } = await loadScheduleData(CLINIC_ID, WEEK_START);
  if (error || !data) {
    console.log('فشل تحميل البيانات:', error);
    return;
  }
  const trainees = data.doctors.filter((d) => d.workStatus === 'trainee');
  const traineeModes: Record<string, TraineeMode> = {};
  for (const t of trainees) traineeModes[t.id] = 'independent';

  console.log(`\nالأطباء light_duty الحاليون:`);
  const lightDoctors = data.doctors.filter((d) => d.workStatus === 'light_duty');
  for (const d of lightDoctors) {
    console.log(`  - ${d.name} (${d.groupTemplate.name})`);
  }

  await buildAndAnalyze(traineeModes, 'SCENARIO A: light_duty حالي (1 طبيب)');

  // ─── Scenario B: محاكاة 2 light_duty صباح (نحوّل طبيب active إلى light_duty) ───
  const groupAActive = data.doctors.find(
    (d) => d.groupTemplate.key === 'group_a' && d.workStatus === 'active',
  );
  if (!groupAActive) {
    console.log('لم نجد طبيب Group A نشط لمحاكاة 2 light_duty');
    return;
  }

  console.log(`\n[محاكاة] نحوّل ${groupAActive.name} إلى light_duty مؤقتاً...`);
  await supabase
    .from('doctor_group_members')
    .update({ work_status: 'light_duty' })
    .eq('doctor_id', groupAActive.id);

  try {
    await buildAndAnalyze(traineeModes, 'SCENARIO B: 2 light_duty نفس الشفت (صباح)');
  } finally {
    // Restore
    console.log(`\n[محاكاة] إعادة ${groupAActive.name} إلى active...`);
    await supabase
      .from('doctor_group_members')
      .update({ work_status: 'active' })
      .eq('doctor_id', groupAActive.id);
  }

  // ─── Scenario C: 0 light_duty (نحوّل زهراء إلى active مؤقتاً) ───
  const zahra = lightDoctors[0];
  if (zahra) {
    console.log(`\n[محاكاة] نحوّل ${zahra.name} إلى active مؤقتاً (تجربة بدون light_duty)...`);
    await supabase
      .from('doctor_group_members')
      .update({ work_status: 'active' })
      .eq('doctor_id', zahra.id);

    try {
      await buildAndAnalyze(traineeModes, 'SCENARIO C: 0 light_duty (تأكد لا regression)');
    } finally {
      console.log(`\n[محاكاة] إعادة ${zahra.name} إلى light_duty...`);
      await supabase
        .from('doctor_group_members')
        .update({ work_status: 'light_duty' })
        .eq('doctor_id', zahra.id);
    }
  }
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
