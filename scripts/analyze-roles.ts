// يحلّل أدوار قروب معيّن في أسبوع: لكل طبيب يعدّ
//   - solo  : عيادة كاملة لوحده (نفس العيادة P1+P2)
//   - half  : فترة واحدة بعيادة (زوج)
//   - deleg : دليقيتر
//   - ex    : احتياطي
//   - periods: مجموع الفترات الفعلية المعمولة
import { loadScheduleData } from '../lib/algorithms/schedule';
import { supabase } from '../lib/supabase';

const CLINIC_ID = '10000000-0000-0000-0000-000000000001';
const WEEK = process.argv[2] || '2026-05-24';
const GROUP = process.argv[3] || 'group_a';

async function main() {
  const { data } = await loadScheduleData(CLINIC_ID, WEEK);
  if (!data) { console.log('no data'); return; }
  const ids = new Map(data.doctors.filter((d) => d.groupTemplate.key === GROUP).map((d) => [d.id, d.name]));

  const { data: slots } = await supabase
    .from('schedule_slots')
    .select('day_of_week, period, clinic_number, doctor_id, role, status')
    .eq('clinic_id', CLINIC_ID).eq('week_start', WEEK).eq('status', 'active');
  const rows = (slots || []).filter((s: any) => ids.has(s.doctor_id)) as any[];

  type Tally = { solo: number; half: number; deleg: number; ex: number; periods: number };
  const t = new Map<string, Tally>();
  for (const id of ids.keys()) t.set(id, { solo: 0, half: 0, deleg: 0, ex: 0, periods: 0 });

  // جمّع خانات clinic لكل (طبيب،يوم،شفت) لتمييز solo عن half
  const clinicByKey = new Map<string, any[]>();
  for (const s of rows) {
    if (s.role === 'delegator') { t.get(s.doctor_id)!.deleg++; t.get(s.doctor_id)!.periods++; }
    else if (s.role === 'ex') { t.get(s.doctor_id)!.ex++; }
    else if (s.role === 'clinic') {
      t.get(s.doctor_id)!.periods++;
      const shift = s.period <= 2 ? 'm' : 'e';
      const key = `${s.doctor_id}|${s.day_of_week}|${shift}|${s.clinic_number}`;
      (clinicByKey.get(key) || clinicByKey.set(key, []).get(key)!).push(s);
    }
  }
  for (const [key, arr] of clinicByKey) {
    const id = key.split('|')[0]!;
    if (arr.length === 2) t.get(id)!.solo++;      // نفس العيادة فترتين = منفرد
    else t.get(id)!.half++;                         // فترة واحدة = زوج
  }

  console.log(`الأسبوع ${WEEK} · ${GROUP}`);
  console.log('الطبيب'.padEnd(22) + 'منفرد  نصف  دليقيتر  احتياطي  فترات');
  for (const [id, name] of ids) {
    const x = t.get(id)!;
    console.log(name.padEnd(22) + String(x.solo).padEnd(7) + String(x.half).padEnd(5) + String(x.deleg).padEnd(9) + String(x.ex).padEnd(9) + x.periods);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
