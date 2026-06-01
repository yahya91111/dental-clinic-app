// تحقّق: التخفيف لا ينفرد (إلا عند الشحّ الحادّ) ولا يجتمع مخفّفان في عيادة
import { loadScheduleData } from '../lib/algorithms/schedule';
import { supabase } from '../lib/supabase';

const C = '10000000-0000-0000-0000-000000000001';
const W = process.argv[2] || '2026-06-07';

async function main() {
  const { data } = await loadScheduleData(C, W);
  if (!data) { console.log('no data'); return; }
  const ldIds = new Set(data.doctors.filter((d) => d.workStatus === 'light_duty').map((d) => d.id));
  const ldNames = data.doctors.filter((d) => ldIds.has(d.id)).map((d) => d.name);
  console.log('التخفيف:', ldNames.join('، ') || 'لا يوجد');

  const { data: slots } = await supabase.from('schedule_slots')
    .select('day_of_week, period, clinic_number, doctor_id, doctor_name, role')
    .eq('clinic_id', C).eq('week_start', W).eq('status', 'active');
  const rows = (slots || []) as any[];

  // (أ) هل أيّ مخفّف منفرد؟ (خانتا clinic بنفس يوم|شفت|عيادة)
  const key = new Map<string, any[]>();
  for (const r of rows) {
    if (r.role !== 'clinic') continue;
    const sh = r.period <= 2 ? 'm' : 'e';
    const k = `${r.doctor_id}|${r.day_of_week}|${sh}|${r.clinic_number}`;
    (key.get(k) || key.set(k, []).get(k)!).push(r);
  }
  const ldSolos: string[] = [];
  for (const [k, arr] of key) if (arr.length === 2 && ldIds.has(arr[0].doctor_id)) ldSolos.push(`${arr[0].doctor_name} (${k.split('|').slice(1).join(' ')})`);

  // (ب) هل اجتمع مخفّفان في عيادة واحدة (نفس يوم|شفت|عيادة)؟
  const clinicOcc = new Map<string, Set<string>>();
  for (const r of rows) {
    if (r.role !== 'clinic') continue;
    const sh = r.period <= 2 ? 'm' : 'e';
    const k = `${r.day_of_week}|${sh}|ع${r.clinic_number}`;
    (clinicOcc.get(k) || clinicOcc.set(k, new Set()).get(k)!).add(r.doctor_id);
  }
  const twoLd: string[] = [];
  for (const [k, set] of clinicOcc) {
    const ldsHere = [...set].filter((id) => ldIds.has(id));
    if (ldsHere.length >= 2) twoLd.push(k);
  }

  console.log('\nمخفّف منفرد؟', ldSolos.length ? '✗ ' + ldSolos.join(' · ') : '✓ لا أحد');
  console.log('مخفّفان بعيادة؟', twoLd.length ? '✗ ' + twoLd.join(' · ') : '✓ لا');
}
main().catch((e) => { console.error(e); process.exit(1); });
