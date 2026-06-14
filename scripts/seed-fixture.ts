import { supabase } from '../lib/supabase';
import { schedule } from '../lib/algorithms/schedule';
import { getAllGroupMembers } from '../lib/database';
const CID = '10000000-0000-0000-0000-000000000001';
const WEEK = '2099-01-04';
const DAYS = ['sunday','monday','tuesday','wednesday','thursday'] as const;

async function main() {
  console.log('يوم 2099-01-04 =', new Date('2099-01-04T00:00:00').getDay(), '(0=أحد)');
  // امسح الأسبوع الوهميّ أوّلًا
  await supabase.from('schedule_slots').delete().eq('week_start', WEEK).eq('clinic_id', CID);

  // المتدرّبون → ظلّ (beginner)
  const { data: members } = await getAllGroupMembers(CID);
  const trainees = ((members||[]) as any[]).filter((m)=>m.work_status==='trainee');
  const traineeModes: Record<string,'beginner'> = {};
  for (const t of trainees) traineeModes[t.doctor_id] = 'beginner';
  console.log('متدرّبون (ظلّ):', trainees.map((t:any)=>t.doctor_id.slice(0,8)).join(', '));

  const aShiftPlan = Object.fromEntries(DAYS.map((d)=>[d,'morning'])) as any;
  const res = await schedule.build({
    weekStart: WEEK, clinicId: CID,
    aShiftPlan,
    boardConfig: { scenario: { kind: 'all_morning' }, includeInExRotation: false },
    traineeModes,
    dryRun: false,
  } as any);
  console.log('\nbuild:', JSON.stringify({ success: res.success, error: (res as any).error, slots: (res as any).savedCount ?? (res as any).previewSlots?.length ?? '?' }));

  const { count } = await supabase.from('schedule_slots').select('*',{count:'exact',head:true}).eq('week_start',WEEK).eq('status','active').gt('period',0);
  console.log('خانات نشطة بعد البناء:', count);
}
main().catch((e)=>{ console.error('ERR', e.message, e.stack); process.exit(1); });
