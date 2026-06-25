/* استئذانُ مُضيفٍ بوجود مدرّبٍ + ظلِّه: يجب أن يبدّل المحرّك مع الطبيب (إسراء درويش) لا مع
   الظلّ (عبدالله أحمد)، والظلُّ يلحق مدرّبه ولا يصير دليقيترًا أبدًا، بلا حجزٍ مزدوج. والكنسل
   يعكس حرفيًّا.  set -a; . ./.env; set +a; npx tsx scripts/test-perm-shadow.ts */
import { supabase } from '../lib/supabase';
import { requestsV2, withXdayJournal } from '../lib/algorithms/requests_v2';
import { schedule, loadScheduleData } from '../lib/algorithms/schedule';

const CID = '10000000-0000-0000-0000-000000000001';
const WEEK = '2099-11-22';
const DAY = 'thursday';
const LEADER = { id: 'leader-test', role: 'team_leader' as const };
// معرّفات دقيقة (تجنّبًا لتكرار الأسماء في العيادة)
const SHAHAD = { id: '3aebd552-747b-4e19-8ceb-4c1cc2b2dc6a', name: 'د. شهد اسماعيل' };
const ABD = { id: 'b41e3439-2e45-47c2-825d-0add97c1d09c', name: 'د. عبدالله أحمد' }; // ظلّ إسراء درويش
const ISRAA = { id: 'ee1ddf37-d248-468c-b2ac-cdc604312373', name: 'د. إسراء درويش' };
const MUH = { id: '65dfbacc-e411-4f18-949d-17411b1c0731', name: 'د. محمد احمد' };
const FAT = { id: 'c173f26e-a138-4dbf-a6b5-4a7d36a72671', name: 'د. فاطمه اسد' };
let pass = 0, fail = 0; const fails: string[] = [];
const check = (n: string, c: boolean, d = '') => { if (c) { pass++; console.log('  ✅ ' + n); } else { fail++; fails.push(n + (d ? ' — ' + d : '')); console.log('  🔴 ' + n + (d ? ' — ' + d : '')); } };

async function clean() { await supabase.from('schedule_slots').delete().eq('clinic_id', CID).eq('week_start', WEEK); }
async function ins(row: any) { await supabase.from('schedule_slots').insert({ clinic_id: CID, week_start: WEEK, day_of_week: DAY, status: 'active', source: 'ai', ...row }); }
async function insDay(day: string, row: any) { await supabase.from('schedule_slots').insert({ clinic_id: CID, week_start: WEEK, day_of_week: day, status: 'active', source: 'ai', ...row }); }
async function morning() {
  const { data } = await supabase.from('schedule_slots').select('doctor_id,doctor_name,period,clinic_number,role,status')
    .eq('clinic_id', CID).eq('week_start', WEEK).eq('day_of_week', DAY).in('period', [1, 2])
    .in('role', ['clinic', 'delegator']).eq('status', 'active');
  return (data || []) as any[];
}
function show(rows: any[], t: string) {
  console.log(`\n── ${t} ──`);
  for (const p of [1, 2]) console.log(`  ف${p}: ${rows.filter((r) => r.period === p).sort((a, b) => a.clinic_number - b.clinic_number).map((r) => `${r.role === 'delegator' ? 'دل' : 'ع' + r.clinic_number}:${(r.doctor_name || '').replace('د. ', '')}`).join('  ·  ')}`);
}
const sig = (rows: any[]) => rows.map((r) => `${r.role}|ف${r.period}|ع${r.clinic_number}|${r.doctor_id}`).sort().join('  ');

async function main() {
  const { data: origS } = await supabase.from('schedule_settings').select('clinic_count').eq('clinic_id', CID);
  const origCC = (origS && origS[0]?.clinic_count) ?? 3;
  try {
    await supabase.from('schedule_settings').update({ clinic_count: 3 }).eq('clinic_id', CID);
    const { data: ld } = await loadScheduleData(CID, WEEK);
    const used = new Set([SHAHAD.id, ABD.id, ISRAA.id, MUH.id, FAT.id]);
    const filler = (ld?.doctors ?? []).find((d: any) => !used.has(d.id) && d.workStatus === 'active' && d.groupTemplate?.key !== 'board');
    if (!filler) throw new Error('لا طبيبَ حشوٍ متاح');
    const ZP1 = { id: filler.id, name: filler.name }; // ع3 ف1 (نصف-زوج مع إسراء)

    await clean();
    // ع1: محمد منفرد · ع2: شهد(ع2 ف1 + دل ف2) زوجُ فاطمه(دل ف1 + ع2 ف2) · ع3: حشو ف1، إسراء ف2 + ظلُّها عبدالله ف2
    await ins({ period: 1, clinic_number: 1, doctor_id: MUH.id, doctor_name: MUH.name, role: 'clinic' });
    await ins({ period: 2, clinic_number: 1, doctor_id: MUH.id, doctor_name: MUH.name, role: 'clinic' });
    await ins({ period: 1, clinic_number: 2, doctor_id: SHAHAD.id, doctor_name: SHAHAD.name, role: 'clinic' });
    await ins({ period: 2, clinic_number: 0, doctor_id: SHAHAD.id, doctor_name: SHAHAD.name, role: 'delegator' });
    await ins({ period: 1, clinic_number: 0, doctor_id: FAT.id, doctor_name: FAT.name, role: 'delegator' });
    await ins({ period: 2, clinic_number: 2, doctor_id: FAT.id, doctor_name: FAT.name, role: 'clinic' });
    await ins({ period: 1, clinic_number: 3, doctor_id: ZP1.id, doctor_name: ZP1.name, role: 'clinic' });
    await ins({ period: 2, clinic_number: 3, doctor_id: ISRAA.id, doctor_name: ISRAA.name, role: 'clinic' });
    await ins({ period: 2, clinic_number: 3, doctor_id: ABD.id, doctor_name: ABD.name, role: 'clinic' }); // ظلّ إسراء
    // يومٌ مرجعيّ (الأربعاء): إسراء منفردةٌ ع3 الفترتين + ظلُّها عبدالله يطابقها — يُعرّف الظلَّ المبتدئ
    for (const p of [1, 2]) {
      await insDay('wednesday', { period: p, clinic_number: 3, doctor_id: ISRAA.id, doctor_name: ISRAA.name, role: 'clinic' });
      await insDay('wednesday', { period: p, clinic_number: 3, doctor_id: ABD.id, doctor_name: ABD.name, role: 'clinic' });
    }

    show(await morning(), 'الأساس (قبل استئذان شهد)');
    const before = sig(await morning());

    const res: any = await requestsV2.setScheduleStatus(LEADER, { clinicId: CID, weekStart: WEEK, day: DAY, doctorId: SHAHAD.id, doctorName: SHAHAD.name, status: 'permission_start', shift: 'morning' } as any);
    const perm = res.permission;
    console.log('\nتبديل:', JSON.stringify(perm?.swap));
    if (perm?.swap && 'withName' in perm.swap) {
      await withXdayJournal(CID, WEEK, { day: DAY, doctorId: SHAHAD.id }, () =>
        schedule.rebalanceForward({ clinicId: CID, weekStart: WEEK, fromDay: DAY as any, fromShift: res.effShift ?? 'morning', today: '2099-11-25' } as any));
    }
    const after = await morning();
    show(after, 'بعد استئذان شهد');

    const abdRows = after.filter((r) => r.doctor_id === ABD.id);
    const israaClinic = after.filter((r) => r.doctor_id === ISRAA.id && r.role === 'clinic');
    check('شهد خارج الفترة الأولى', !after.some((r) => r.doctor_id === SHAHAD.id && r.period === 1));
    check('الظلّ عبدالله ليس دليقيترًا أبدًا', !abdRows.some((r) => r.role === 'delegator'), JSON.stringify(abdRows.map((r) => `ف${r.period}/${r.role}/ع${r.clinic_number}`)));
    check('التبديل مع الطبيب إسراء درويش (لا الظلّ)', perm?.swap?.withId === ISRAA.id, 'withId=' + perm?.swap?.withName);
    const israaKeys = new Set(israaClinic.map((r) => `${r.period}|${r.clinic_number}`));
    check('الظلّ يلحق إسراء (عيادة فقط، نفس الفترة/العيادة)', abdRows.length > 0 && abdRows.every((r) => r.role === 'clinic' && israaKeys.has(`${r.period}|${r.clinic_number}`)), 'ظلّ=' + JSON.stringify(abdRows.map((r) => `ف${r.period}/ع${r.clinic_number}`)) + ' إسراء=' + JSON.stringify([...israaKeys]));
    let dbl = '';
    for (const p of [1, 2]) for (const c of [1, 2, 3]) {
      const occ = after.filter((r) => r.period === p && r.clinic_number === c && r.role === 'clinic' && r.doctor_id !== ABD.id);
      if (occ.length > 1) dbl += ` ف${p}/ع${c}:[${occ.map((o) => o.doctor_name.replace('د. ', '')).join('+')}]`;
    }
    check('لا حجزَ مزدوج (عدا الظلّ مع مدرّبه)', dbl === '', dbl);

    // كنسلٌ يحاكي المسارَ الحيّ: placementShift ← cancelStatus (استرداد جراحيّ) ← rebalanceForward (القلب الجديد)
    const returnShift = await schedule.placementShift({ clinicId: CID, weekStart: WEEK, day: DAY, doctorId: SHAHAD.id } as any).catch(() => 'morning' as const);
    const cres: any = await requestsV2.cancelStatus(LEADER, { clinicId: CID, weekStart: WEEK, day: DAY, doctorId: SHAHAD.id, restoreToPrevPlace: true } as any).catch(() => ({}));
    const autoRet = !!((cres.covered || cres.permSwapRecompute) && returnShift);
    if (returnShift && (autoRet || cres.restored)) await schedule.rebalanceForward({ clinicId: CID, weekStart: WEEK, fromDay: DAY as any, fromShift: returnShift, today: '2099-11-25' } as any).catch(() => {});
    show(await morning(), 'بعد الكنسل');
    check('الكنسل يعيد الأساس حرفيًّا', sig(await morning()) === before);

    console.log(`\n══════ ${pass} PASS / ${fail} FAIL ══════`);
    if (fails.length) fails.forEach((f) => console.log('  • ' + f));
  } finally {
    await clean();
    await supabase.from('schedule_settings').update({ clinic_count: origCC }).eq('clinic_id', CID);
  }
  process.exit(fail ? 1 : 0);
}
main().catch((e) => { console.error('ERR', e.message, e.stack); process.exit(1); });
