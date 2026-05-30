// ═══════════════════════════════════════════════════════════════
// Test #3 — Board scenario: hybrid_evening_days
// ═══════════════════════════════════════════════════════════════
// قروب A:  أحد صباح · إثنين صباح · ثلاثاء مساء · أربعاء مساء · خميس مساء
// البورد:  hybrid_evening_days → الأحد + الإثنين مساء، الباقي صباح
//          محمي من الاحتياطي (includeInExRotation = false)
// التريني: كلهم مبتدئون (beginner)
// الأسبوع: 2026-05-31
// ═══════════════════════════════════════════════════════════════

import { schedule, loadScheduleData } from '../lib/algorithms/schedule';
import type { TraineeMode, WeekDay, Shift } from '../lib/algorithms/schedule';
import { supabase } from '../lib/supabase';

const CLINIC_ID = '10000000-0000-0000-0000-000000000001';
const WEEK_START = process.argv[2] || '2026-05-31';
const DAYS: WeekDay[] = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday'];
const DAY_LABEL: Record<string, string> = {
  sunday: 'الأحد', monday: 'الإثنين', tuesday: 'الثلاثاء',
  wednesday: 'الأربعاء', thursday: 'الخميس',
};
const A_SHIFT: Record<WeekDay, Shift> = {
  sunday: 'morning', monday: 'morning', tuesday: 'evening',
  wednesday: 'evening', thursday: 'evening',
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
  const traineeIds = new Set(trainees.map((t) => t.id));

  const board = data.doctors.filter((d) => d.groupTemplate.key === 'board');

  divider(`اختبار #3 — البورد hybrid_evening_days · الأسبوع ${WEEK_START}`);
  console.log(`عدد العيادات: ${data.clinicCount}`);
  console.log(`البورد (${board.length}): ${board.map((b) => b.name).join('، ') || 'لا يوجد'}`);
  console.log('المدربون والتريني المبتدئون:');
  for (const t of trainees) {
    const sup = data.doctors.find((d) => d.id === t.supervisorDoctorId);
    console.log(`  ${t.name} → ${sup?.name ?? 'بلا مدرب'}`);
  }
  console.log('\nشفتات قروب A:');
  for (const d of DAYS) console.log(`  ${DAY_LABEL[d]}: ${A_SHIFT[d] === 'morning' ? 'صباح' : 'مساء'}`);

  const result = await schedule.build({
    weekStart: WEEK_START,
    clinicId: CLINIC_ID,
    aShiftPlan: A_SHIFT,
    boardConfig: {
      scenario: { kind: 'hybrid_evening_days', eveningDays: ['sunday', 'monday'] },
      includeInExRotation: false,
    },
    traineeModes,
    dryRun: false,
  });

  console.log(
    `\nالنتيجة: success=${result.success}, slots=${result.slotsCreated}, doctors=${result.doctorsAssigned}, warnings=${result.warnings.length}`,
  );
  if (result.warnings.length) console.log('تنبيهات:', result.warnings);
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

  const short = (s: string, n = 22) => (s.length > n ? s.slice(0, n - 1) + '…' : s.padEnd(n));
  const renderCell = (here: any[] | undefined) => {
    if (!here || here.length === 0) return short('', 22);
    const labels = here.map((s) => {
      const tag = board.some((b) => b.id === s.doctor_id) ? '★' : '';
      const name = traineeIds.has(s.doctor_id) ? `+${s.doctor_name}` : s.doctor_name;
      return `${tag}${name}`;
    });
    return short(labels.join(' / '), 22);
  };

  for (const day of DAYS) {
    divider(`${DAY_LABEL[day]}  (قروب A: ${A_SHIFT[day] === 'morning' ? 'صباح' : 'مساء'})`);
    const daySlots = rows.filter((s) => s.day_of_week === day);

    const mClinic = new Map<number, Record<number, any[]>>();
    const eClinic = new Map<number, Record<number, any[]>>();
    const mDel: any[] = [], eDel: any[] = [], mEx: any[] = [], eEx: any[] = [];

    for (const s of daySlots) {
      if (s.role === 'clinic') {
        const map = s.period <= 2 ? mClinic : eClinic;
        const byP = map.get(s.clinic_number) || {};
        (byP[s.period] = byP[s.period] || []).push(s);
        map.set(s.clinic_number, byP);
      } else if (s.role === 'delegator') {
        (s.period <= 2 ? mDel : eDel).push(s);
      } else if (s.role === 'ex') {
        // EX: period=0، clinic_number=1 صباح / 2 مساء
        (s.clinic_number === 1 ? mEx : eEx).push(s);
      }
    }

    const clinicNums = [...new Set([...mClinic.keys(), ...eClinic.keys()])].sort((a, b) => a - b);

    const printShift = (
      title: string, clinicMap: Map<number, Record<number, any[]>>,
      del: any[], ex: any[], p1: number, p2: number, t1: string, t2: string,
    ) => {
      if (clinicMap.size === 0 && del.length === 0 && ex.length === 0) return;
      console.log(`\n${title}:`);
      console.log('عيادة'.padEnd(8) + t1.padEnd(24) + t2.padEnd(24));
      console.log('-'.repeat(56));
      for (const c of clinicNums) {
        const byP = clinicMap.get(c);
        if (!byP) continue;
        console.log(`ع${c}`.padEnd(8) + renderCell(byP[p1]) + renderCell(byP[p2]));
      }
      if (del.length) {
        console.log('دليقيتر'.padEnd(8) + renderCell(del.filter((s) => s.period === p1)) + renderCell(del.filter((s) => s.period === p2)));
      }
      if (ex.length) {
        const names = ex.map((s) => (traineeIds.has(s.doctor_id) ? `+${s.doctor_name}` : s.doctor_name));
        console.log('احتياطي'.padEnd(8) + names.join(' / '));
      }
    };

    printShift('الصباح', mClinic, mDel, mEx, 1, 2, 'P1 (7:00-10:30)', 'P2 (10:30-14:00)');
    printShift('المساء', eClinic, eDel, eEx, 3, 4, 'P3 (14:00-17:30)', 'P4 (17:30-21:00)');
  }

  console.log('\nرمز: ★ = بورد · +اسم = تريني مبتدئ (ظل مدربه)');
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
