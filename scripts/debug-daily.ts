import { supabase } from '../lib/supabase';

const C = '10000000-0000-0000-0000-000000000001';
const W = process.argv[2] || '2026-05-31';
const NAME = process.argv[3] || 'يحيى';
const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday'];

async function main() {
  const { data: slots } = await supabase.from('schedule_slots')
    .select('day_of_week, period, clinic_number, doctor_name, role')
    .eq('clinic_id', C).eq('week_start', W).eq('status', 'active');
  const rows = (slots || []).filter((s: any) => String(s.doctor_name).includes(NAME)) as any[];
  console.log(`${NAME} — ${W}:`);
  for (const d of days) {
    const ds = rows.filter((r) => r.day_of_week === d).sort((a, b) => a.period - b.period);
    const label = ds.map((r) => `${r.role}P${r.period}${r.role === 'clinic' ? '/ع' + r.clinic_number : ''}`).join('  ');
    const isSolo = ds.filter((r) => r.role === 'clinic').length === 2
      && new Set(ds.filter((r) => r.role === 'clinic').map((r) => r.clinic_number)).size === 1;
    console.log('  ' + d.padEnd(11) + label + (isSolo ? '   ← منفرد' : ''));
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
