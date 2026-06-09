// تشخيص: اطبع آخر كروت النقص (gap_alert) وإشعارات الطلب + عيّنة أسماء أطباء.
// npx tsx --env-file=.env scripts/dump-coverage.ts
import { supabase } from '../lib/supabase';

async function main() {
  const { data: gaps } = await supabase
    .from('notifications')
    .select('id, type, body, is_read, action_status, data, created_at')
    .eq('type', 'gap_alert')
    .order('created_at', { ascending: false })
    .limit(5);
  console.log('═══ gap_alert (آخر 5) ═══');
  for (const n of (gaps || []) as any[]) {
    console.log('\n— id:', n.id.slice(0, 8), '| read:', n.is_read, '| status:', n.action_status);
    console.log('  body:', n.body);
    const d = n.data || {};
    console.log('  data.v:', d.v, '| absent:', d.absent_doctor_name, '| week:', d.week_start);
    console.log('  data.days:', JSON.stringify(d.days, null, 1));
    if (d.coverage) console.log('  data.coverage(OLD):', JSON.stringify(d.coverage));
    if (d.thread) console.log('  data.thread.len:', Array.isArray(d.thread) ? d.thread.length : '?');
  }

  const { data: infos } = await supabase
    .from('notifications')
    .select('id, body, is_read, data, created_at')
    .eq('type', 'request_info')
    .order('created_at', { ascending: false })
    .limit(5);
  console.log('\n═══ request_info (آخر 5) ═══');
  for (const n of (infos || []) as any[]) {
    console.log('— body:', n.body, '| read:', n.is_read, '| items:', JSON.stringify(n.data?.items));
  }

  const { data: docs } = await supabase.from('doctors').select('name').limit(12);
  console.log('\n═══ عيّنة أسماء أطباء ═══');
  console.log((docs || []).map((d: any) => JSON.stringify(d.name)).join('\n'));
}
main().catch((e) => { console.error(e); process.exit(1); });
