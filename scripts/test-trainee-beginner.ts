// ═══════════════════════════════════════════════════════════════
// Test trainee in "beginner" mode (shadow of supervisor)
// ═══════════════════════════════════════════════════════════════
// المنطق المتوقَّع:
//   - التريني المبتدئ ظل كامل للمدرب في كل أدواره:
//       * مدرب clinic → تريني نفس العياده + الفترة (clinic)
//       * مدرب delegator → تريني delegator نفس الفترات
//       * مدرب احتياطي → تريني احتياطي معاه
//   - لا يدخل عد الأطباء عند توزيع العيادات
//   - لو المدرب غائب أو في إجازة → التريني احتياط تلقائي
// ═══════════════════════════════════════════════════════════════

import { schedule, loadScheduleData } from '../lib/algorithms/schedule';
import type { TraineeMode } from '../lib/algorithms/schedule';
import { supabase } from '../lib/supabase';

const CLINIC_ID = '10000000-0000-0000-0000-000000000001';
const WEEK_START = '2026-05-31';
const DAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday'] as const;

function divider(label: string) {
  console.log(`\n${'─'.repeat(78)}\n${label}\n${'─'.repeat(78)}`);
}

async function buildAndCheck(
  data: Awaited<ReturnType<typeof loadScheduleData>>['data'],
  traineeModes: Record<string, TraineeMode>,
  label: string,
) {
  const trainees = data!.doctors.filter((d) => d.workStatus === 'trainee');
  divider(label);
  const result = await schedule.build({
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
  });
  console.log(
    `success=${result.success}, slots=${result.slotsCreated}, doctors=${result.doctorsAssigned}, warnings=${result.warnings.length}`,
  );
  if (!result.success) {
    console.log('أخطاء:', result.errors);
    return;
  }

  const { data: slots } = await supabase
    .from('schedule_slots')
    .select('day_of_week, period, clinic_number, doctor_id, doctor_name, role, status')
    .eq('clinic_id', CLINIC_ID)
    .eq('week_start', WEEK_START)
    .eq('status', 'active');
  const rows = (slots || []) as any[];
  const slotKey = (s: any) =>
    `${s.day_of_week}|${s.period}|${s.clinic_number}|${s.role}`;

  for (const t of trainees) {
    const tSlots = rows.filter((s) => s.doctor_id === t.id);
    const sup = data!.doctors.find((d) => d.id === t.supervisorDoctorId);
    const supSlots = sup ? rows.filter((s) => s.doctor_id === sup.id) : [];

    console.log(`\n● ${t.name}  (مدرب: ${sup?.name ?? '—'})`);

    const byDay = new Map<string, { role: string; period: number; clinic: number }[]>();
    for (const ts of tSlots) {
      const arr = byDay.get(ts.day_of_week) || [];
      arr.push({ role: ts.role, period: ts.period, clinic: ts.clinic_number });
      byDay.set(ts.day_of_week, arr);
    }
    for (const d of DAYS) {
      const entries = byDay.get(d) || [];
      if (entries.length === 0) {
        console.log(`    ${d.padEnd(10)} —`);
      } else {
        const desc = entries
          .map((e) => {
            if (e.role === 'clinic') return `clinic ع${e.clinic} P${e.period}`;
            if (e.role === 'delegator') return `دليقيتر P${e.period}`;
            return 'احتياطي';
          })
          .join(' + ');
        console.log(`    ${d.padEnd(10)} ${desc}`);
      }
    }

    if (sup) {
      const supKeys = new Set(supSlots.map(slotKey));
      const tKeys = new Set(tSlots.map(slotKey));
      const expected = new Set([...supKeys]);
      // الأيام التي ليس فيها مدرب → نتوقع احتياطي للتريني
      const supDays = new Set(supSlots.map((s) => s.day_of_week));
      const traineeAbsentDays = DAYS.filter((d) => !supDays.has(d));
      for (const d of traineeAbsentDays) {
        // مفتاح احتياطي صباح: day|0|0|ex (أو مساء)
        // لا نعرف الشفت بدون scenario context — نتحقق فقط من وجود ex لذلك اليوم
      }
      const matched = [...supKeys].filter((k) => tKeys.has(k)).length;
      const missingFromSup = [...supKeys].filter((k) => !tKeys.has(k));
      const orphanExDays = DAYS.filter((d) => {
        // تريني عنده ex يوم وما عند المدرب خانة في ذلك اليوم
        const tHasExThatDay = tSlots.some((s) => s.day_of_week === d && s.role === 'ex');
        const supHasAnythingThatDay = supSlots.some((s) => s.day_of_week === d);
        return tHasExThatDay && !supHasAnythingThatDay;
      });
      console.log(`    ✓ مطابق المدرب في ${matched}/${supKeys.size} خانة`);
      if (missingFromSup.length > 0) {
        console.log(`    ✗ ناقصة: ${missingFromSup.join(', ')}`);
      }
      if (orphanExDays.length > 0) {
        console.log(`    ✓ احتياطي تلقائي يوم مدرب غائب: ${orphanExDays.join(', ')}`);
      }
    }
  }
}

async function main() {
  const { data, error } = await loadScheduleData(CLINIC_ID, WEEK_START);
  if (error || !data) {
    console.log('فشل التحميل:', error);
    return;
  }

  const trainees = data.doctors.filter((d) => d.workStatus === 'trainee');
  if (trainees.length === 0) {
    console.log('لا يوجد تريني في هذه العيادة');
    return;
  }

  divider('التريني والمشرفون');
  for (const t of trainees) {
    const sup = data.doctors.find((d) => d.id === t.supervisorDoctorId);
    console.log(
      `- ${t.name.padEnd(28)} → مشرف: ${sup ? `${sup.name} (${sup.groupTemplate.name})` : 'لا يوجد'}`,
    );
  }

  const traineeModes: Record<string, TraineeMode> = {};
  for (const t of trainees) traineeModes[t.id] = 'beginner';

  // ─── سيناريو A: كل المدربين حاضرون ───
  await buildAndCheck(data, traineeModes, 'سيناريو A: كل المدربين حاضرون');

  // ─── سيناريو B: محاكاة غياب مدرب يوم الأحد ───
  const firstTrainee = trainees[0];
  const sup = firstTrainee
    ? data.doctors.find((d) => d.id === firstTrainee.supervisorDoctorId)
    : undefined;
  if (!sup) {
    console.log('\nلا يمكن محاكاة الغياب: التريني الأول بلا مدرب');
    return;
  }
  divider(`محاكاة: نضع غياب (sick_leave) للمدرب ${sup.name} يوم الأحد`);
  // أدخل سجل غياب مباشرة في DB قبل البناء
  const { error: insErr } = await supabase.from('schedule_slots').insert({
    clinic_id: CLINIC_ID,
    week_start: WEEK_START,
    day_of_week: 'sunday',
    period: 1,
    clinic_number: 0,
    doctor_id: sup.id,
    doctor_name: sup.name,
    role: 'clinic',
    status: 'sick_leave',
    source: 'manual',
  });
  if (insErr) {
    console.log('فشل إدخال سجل الغياب:', insErr.message);
    return;
  }

  try {
    await buildAndCheck(
      data,
      traineeModes,
      `سيناريو B: المدرب ${sup.name} غائب يوم الأحد`,
    );
  } finally {
    // تنظيف: احذف سجل الغياب
    await supabase
      .from('schedule_slots')
      .delete()
      .eq('clinic_id', CLINIC_ID)
      .eq('week_start', WEEK_START)
      .eq('doctor_id', sup.id)
      .eq('day_of_week', 'sunday')
      .eq('status', 'sick_leave');
    console.log('\n[تنظيف] حذف سجل الغياب المؤقت');
  }
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
