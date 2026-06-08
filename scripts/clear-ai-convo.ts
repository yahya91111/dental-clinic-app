// ═══════════════════════════════════════════════════════════════
// مسح محادثات الذكاء (الكروت/الإشعارات) لطبيبٍ بالاسم — للتجربة
// ═══════════════════════════════════════════════════════════════
// Usage:
//   npx tsx --env-file=.env scripts/clear-ai-convo.ts "يحيى"
//   npx tsx --env-file=.env scripts/clear-ai-convo.ts "يحيى" all   ← يمسح كلّ إشعاراته
//
// بلا "all": يمسح أنواع محادثة الذكاء فقط (swap_request / coverage_request /
// gap_alert / request_result). مع "all": يمسح كلّ إشعارات المستلِم.
// ═══════════════════════════════════════════════════════════════

import { supabase } from '../lib/supabase';

const NAME = process.argv[2] || 'يحيى';
const ALL = process.argv[3] === 'all';

const AI_CHAT_TYPES = ['swap_request', 'coverage_request', 'gap_alert', 'request_result'];

async function main() {
  const { data: docs, error: dErr } = await supabase
    .from('doctors')
    .select('id, name')
    .ilike('name', `%${NAME}%`);
  if (dErr) { console.log('doctor lookup error:', dErr.message); return; }
  if (!docs?.length) { console.log('لا يوجد طبيب يطابق:', NAME); return; }

  for (const d of docs as { id: string; name: string }[]) {
    let q = supabase.from('notifications').delete().eq('recipient_id', d.id);
    if (!ALL) q = q.in('type', AI_CHAT_TYPES);
    const { data, error } = await q.select('id');
    console.log(
      `${d.name} (${d.id.slice(0, 8)}): حُذِف ${data?.length ?? 0} ${ALL ? 'إشعار' : 'محادثة ذكاء'}` +
      (error ? `  ⚠ ${error.message}` : ''),
    );
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
