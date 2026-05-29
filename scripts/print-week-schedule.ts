// ═══════════════════════════════════════════════════════════════
// Print full week schedule (TL view)
// ═══════════════════════════════════════════════════════════════
// يبني جدول أسبوع ويعرضه بصورة جدولية كاملة:
//   - كل يوم: عيادات الصباح والمساء + الدليقيتر + الاحتياط
//   - يظهر دور كل طبيب بوضوح
// ═══════════════════════════════════════════════════════════════

import { schedule, loadScheduleData } from '../lib/algorithms/schedule';
import type { TraineeMode } from '../lib/algorithms/schedule';
import { supabase } from '../lib/supabase';

const CLINIC_ID = '10000000-0000-0000-0000-000000000001';
const WEEK_START = process.argv[2] || '2026-06-07'; // الأسبوع التالي
const DAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday'] as const;
const DAY_LABEL: Record<string, string> = {
  sunday: 'الأحد',
  monday: 'الإثنين',
  tuesday: 'الثلاثاء',
  wednesday: 'الأربعاء',
  thursday: 'الخميس',
};

function divider(label: string) {
  console.log(`\n${'═'.repeat(78)}\n${label}\n${'═'.repeat(78)}`);
}

async function main() {
  const { data, error } = await loadScheduleData(CLINIC_ID, WEEK_START);
  if (error || !data) {
    console.log('فشل التحميل:', error);
    return;
  }

  const trainees = data.doctors.filter((d) => d.workStatus === 'trainee');
  const traineeModes: Record<string, TraineeMode> = {};
  for (const t of trainees) traineeModes[t.id] = 'beginner';

  divider(`بناء جدول الأسبوع ${WEEK_START} — كل التريني (${trainees.length}) مبتدئ`);
  console.log('\nالمدربون والتريني:');
  for (const t of trainees) {
    const sup = data.doctors.find((d) => d.id === t.supervisorDoctorId);
    console.log(`  ${t.name} → ${sup?.name ?? 'بلا مدرب'}`);
  }

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
    `\nالنتيجة: success=${result.success}, slots=${result.slotsCreated}, doctors=${result.doctorsAssigned}, warnings=${result.warnings.length}`,
  );
  if (!result.success) {
    console.log('أخطاء:', result.errors);
    return;
  }

  // اقرأ الخانات
  const { data: slots } = await supabase
    .from('schedule_slots')
    .select('day_of_week, period, clinic_number, doctor_id, doctor_name, role, status')
    .eq('clinic_id', CLINIC_ID)
    .eq('week_start', WEEK_START)
    .eq('status', 'active');
  const rows = (slots || []) as any[];

  // معرف التريني → اسم المدرب (للعرض)
  const traineeIds = new Set(trainees.map((t) => t.id));

  // اقصر اسم الطبيب لـ 18 حرف
  const short = (s: string, n = 18) => (s.length > n ? s.slice(0, n - 1) + '…' : s.padEnd(n));

  // اعرض كل يوم
  for (const day of DAYS) {
    divider(`${DAY_LABEL[day]} ${day}`);
    const daySlots = rows.filter((s) => s.day_of_week === day);

    // اجمع حسب shift و clinic
    const morningClinic = new Map<number, Record<number, any[]>>();
    const eveningClinic = new Map<number, Record<number, any[]>>();
    const morningDel: any[] = [];
    const eveningDel: any[] = [];
    const morningEx: any[] = [];
    const eveningEx: any[] = [];

    for (const s of daySlots) {
      const isMorning = s.period <= 2 || (s.period === 0 && false); // EX shift?
      const target = (s.period === 1 || s.period === 2) ? 'morning'
        : (s.period === 3 || s.period === 4) ? 'evening'
        : 'unknown'; // period=0 → نحتاج نوع آخر
      if (s.role === 'clinic') {
        const map = (s.period <= 2) ? morningClinic : eveningClinic;
        const byPeriod = map.get(s.clinic_number) || {};
        const arr = byPeriod[s.period] || [];
        arr.push(s);
        byPeriod[s.period] = arr;
        map.set(s.clinic_number, byPeriod);
      } else if (s.role === 'delegator') {
        if (s.period <= 2) morningDel.push(s); else eveningDel.push(s);
      } else if (s.role === 'ex') {
        // EX قد يكون period=0 أو فترة محددة. للتمييز نستخدم سياق سابق
        // الافتراضي: EX = الشفت كامل، نضعه في الصباح
        // لكن من تركيب الجدول نعلم أن EX دائماً صباح في الإعدادات الحالية (all_morning board)
        // الأفضل: لو period=0 نضعه في "احتياط الشفت" (نظهره في الصباح هنا)
        morningEx.push(s);
      }
    }

    // اطبع جدول الصباح
    const clinicNums = new Set<number>();
    for (const c of morningClinic.keys()) clinicNums.add(c);
    for (const c of eveningClinic.keys()) clinicNums.add(c);
    const sortedClinics = [...clinicNums].sort((a, b) => a - b);

    const renderCell = (slotsHere: any[] | undefined) => {
      if (!slotsHere || slotsHere.length === 0) return short('', 22);
      const labels = slotsHere.map((s) => {
        const name = s.doctor_name;
        return traineeIds.has(s.doctor_id) ? `+${name}` : name;
      });
      return short(labels.join(' / '), 22);
    };

    console.log('\nالصباح:');
    console.log('عيادة'.padEnd(8) + 'P1 (7:00-10:30)'.padEnd(24) + 'P2 (10:30-14:00)'.padEnd(24));
    console.log('-'.repeat(56));
    for (const c of sortedClinics) {
      const byPeriod = morningClinic.get(c);
      if (!byPeriod) continue;
      console.log(
        `ع${c}`.padEnd(8) +
          renderCell(byPeriod[1]) +
          renderCell(byPeriod[2]),
      );
    }
    if (morningDel.length > 0) {
      const byP1 = morningDel.filter((s) => s.period === 1);
      const byP2 = morningDel.filter((s) => s.period === 2);
      console.log(
        'دليقيتر'.padEnd(8) +
          renderCell(byP1) +
          renderCell(byP2),
      );
    }
    if (morningEx.length > 0) {
      const names = morningEx.map((s) => (traineeIds.has(s.doctor_id) ? `+${s.doctor_name}` : s.doctor_name));
      console.log('احتياطي '.padEnd(8) + names.join(' / '));
    }

    // المساء
    if (eveningClinic.size > 0 || eveningDel.length > 0 || eveningEx.length > 0) {
      console.log('\nالمساء:');
      console.log('عيادة'.padEnd(8) + 'P3 (14:00-17:30)'.padEnd(24) + 'P4 (17:30-21:00)'.padEnd(24));
      console.log('-'.repeat(56));
      for (const c of sortedClinics) {
        const byPeriod = eveningClinic.get(c);
        if (!byPeriod) continue;
        console.log(
          `ع${c}`.padEnd(8) +
            renderCell(byPeriod[3]) +
            renderCell(byPeriod[4]),
        );
      }
      if (eveningDel.length > 0) {
        const byP3 = eveningDel.filter((s) => s.period === 3);
        const byP4 = eveningDel.filter((s) => s.period === 4);
        console.log(
          'دليقيتر'.padEnd(8) +
            renderCell(byP3) +
            renderCell(byP4),
        );
      }
    }
  }

  console.log('\nرمز: +اسم = تريني مبتدئ (ظل مدربه)');
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
