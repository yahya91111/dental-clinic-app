// تشخيص: خانات طبيبٍ بالاسم في أسبوعٍ — كلّ الأدوار/الحالات (incl. prev_placement).
// npx tsx --env-file=.env scripts/dump-slots.ts "يحيى" 2026-06-07
import { supabase } from '../lib/supabase';

const NAME = process.argv[2] || 'يحيى';
const WEEK = process.argv[3] || '2026-06-07';

async function main() {
  const { data: docs } = await supabase.from('doctors').select('id, name').ilike('name', `%${NAME}%`);
  if (!docs?.length) { console.log('لا طبيب يطابق', NAME); return; }
  for (const d of docs as { id: string; name: string }[]) {
    const { data: slots } = await supabase
      .from('schedule_slots')
      .select('day_of_week, period, clinic_number, role, status')
      .eq('week_start', WEEK)
      .eq('doctor_id', d.id)
      .order('day_of_week');
    console.log(`\n═══ ${d.name} (${d.id.slice(0, 8)}) — أسبوع ${WEEK} ═══`);
    const rows = (slots || []) as any[];
    if (!rows.length) { console.log('  لا خانات لهذا الطبيب في هذا الأسبوع.'); continue; }
    for (const s of rows) {
      console.log(`  ${s.day_of_week.padEnd(10)} P${s.period} clinic#${s.clinic_number} role=${s.role} status=${s.status}`);
    }
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
