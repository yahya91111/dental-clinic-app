// يحذف كروت النقص (gap_alert v2) التي لا نقص فعليّ في أيّ يومٍ فيها (بقايا تجارب).
// npx tsx --env-file=.env scripts/clean-empty-gaps.ts
import { supabase } from '../lib/supabase';

async function main() {
  const { data } = await supabase
    .from('notifications')
    .select('id, data')
    .eq('type', 'gap_alert');
  const rows = (data || []) as { id: string; data: any }[];
  const empties = rows.filter((r) => {
    const days = Array.isArray(r.data?.days) ? r.data.days : r.data?.coverage ? [r.data.coverage] : [];
    return days.length === 0 || days.every((d: any) => (d.gaps?.length || 0) === 0);
  });
  if (!empties.length) { console.log('لا كروت فارغة.'); return; }
  const ids = empties.map((r) => r.id);
  const { error } = await supabase.from('notifications').delete().in('id', ids);
  console.log(error ? `⚠ ${error.message}` : `حُذِف ${ids.length} كرت نقصٍ فارغ.`);
}
main().catch((e) => { console.error(e); process.exit(1); });
