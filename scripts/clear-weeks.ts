// ═══════════════════════════════════════════════════════════════
// Clear schedule_slots for specific weeks (test reset)
// ═══════════════════════════════════════════════════════════════
// يمسح كل خانات الجدول للأسابيع المحددة من عيادة الاختبار.
// يعرض العدد قبل المسح وبعده للتأكيد.
// ═══════════════════════════════════════════════════════════════

import { supabase } from '../lib/supabase';

const CLINIC_ID = '10000000-0000-0000-0000-000000000001';
// أسابيع من سطر الأوامر إن وُجدت، وإلا الافتراضي
const WEEKS = process.argv.slice(2).length > 0
  ? process.argv.slice(2)
  : ['2026-05-24', '2026-05-31', '2026-06-07'];

async function countWeek(week: string): Promise<number> {
  const { count, error } = await supabase
    .from('schedule_slots')
    .select('id', { count: 'exact', head: true })
    .eq('clinic_id', CLINIC_ID)
    .eq('week_start', week);
  if (error) {
    console.log(`  ⚠️  فشل العدّ لأسبوع ${week}: ${error.message}`);
    return -1;
  }
  return count ?? 0;
}

async function main() {
  console.log('قبل المسح:');
  for (const w of WEEKS) {
    console.log(`  أسبوع ${w}: ${await countWeek(w)} خانة`);
  }

  console.log('\nجارٍ المسح...');
  for (const w of WEEKS) {
    const { error } = await supabase
      .from('schedule_slots')
      .delete()
      .eq('clinic_id', CLINIC_ID)
      .eq('week_start', w);
    if (error) {
      console.log(`  ❌ فشل مسح أسبوع ${w}: ${error.message}`);
    } else {
      console.log(`  ✓ تم مسح أسبوع ${w}`);
    }
  }

  console.log('\nبعد المسح:');
  for (const w of WEEKS) {
    console.log(`  أسبوع ${w}: ${await countWeek(w)} خانة`);
  }
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
