// يمسح الخيط المحفوظ (data.thread) من كروت النقص المعلّقة كي تُعيد توليد الصياغة
// بالبذرة الجديدة عند فتحها. npx tsx --env-file=.env scripts/reset-gap-threads.ts
import { supabase } from '../lib/supabase';

async function main() {
  const { data } = await supabase
    .from('notifications')
    .select('id, data, action_status')
    .eq('type', 'gap_alert');
  const rows = (data || []) as { id: string; data: any; action_status: string | null }[];
  let n = 0;
  for (const r of rows) {
    const pending = !r.action_status || r.action_status === 'pending';
    if (!pending || !r.data?.thread) continue;
    const nextData = { ...r.data };
    delete nextData.thread;
    await supabase.from('notifications').update({ data: nextData, is_read: false }).eq('id', r.id);
    n++;
  }
  console.log(`أُعيد ضبط ${n} كرت (مُسح الخيط).`);
}
main().catch((e) => { console.error(e); process.exit(1); });
