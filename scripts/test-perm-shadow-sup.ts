/* المستأذِنُ نفسُه مدرّبٌ وله ظلٌّ يطابقه: مضيفٌ زوجيّ (عيادة ف١ + دليقيتر ف٢) + ظلٌّ يطابقه
   كاملًا. استئذانُ بداية الدوام يُبدّله مع طبيبٍ حاضرٍ (شهد) ويُنزله لعيادة ف٢ → يجب أن
   **يتبعه ظلُّه** (لا يبقى مع شهد، ولا يصير دليقيترًا وحده). والكنسلُ يعيد المضيفَ الزوجيّ
   وشهد، ويُبقي الظلَّ عياديًّا ليحيى (لا دليقيتر منفرد، لا ازدواج).
     set -a; . ./.env; set +a; npx tsx scripts/test-perm-shadow-sup.ts */
import { supabase } from '../lib/supabase';
import { requestsV2, withXdayJournal } from '../lib/algorithms/requests_v2';
import { schedule, loadScheduleData } from '../lib/algorithms/schedule';

const CID = '10000000-0000-0000-0000-000000000001';
const WEEK = '2099-11-29';
const DAY = 'monday';
const LEADER = { id: 'leader-test', role: 'team_leader' as const };
const YAHYA = '95262a82-5f4d-4c9c-aacc-8c2e77494fa2'; // مدرّب
const SHAHAD = '3aebd552-747b-4e19-8ceb-4c1cc2b2dc6a';
const FAT = 'c173f26e-a138-4dbf-a6b5-4a7d36a72671';
const MUH = '65dfbacc-e411-4f18-949d-17411b1c0731';
let pass = 0, fail = 0; const fails: string[] = [];
const check = (n: string, c: boolean, d = '') => { if (c) { pass++; console.log('  ✅ ' + n); } else { fail++; fails.push(n + (d ? ' — ' + d : '')); console.log('  🔴 ' + n + (d ? ' — ' + d : '')); } };
const fn = (s: string) => (s || '').replace('د. ', '');

async function clean() { await supabase.from('schedule_slots').delete().eq('clinic_id', CID).eq('week_start', WEEK); }
async function ins(row: any) { await supabase.from('schedule_slots').insert({ clinic_id: CID, week_start: WEEK, day_of_week: DAY, status: 'active', source: 'ai', ...row }); }
async function rowsOf() {
  const { data } = await supabase.from('schedule_slots').select('doctor_id,doctor_name,period,clinic_number,role,status')
    .eq('clinic_id', CID).eq('week_start', WEEK).eq('day_of_week', DAY).in('period', [1, 2]).in('role', ['clinic', 'delegator']).eq('status', 'active');
  return (data || []) as any[];
}
function show(rows: any[], t: string) {
  console.log(`\n── ${t} ──`);
  for (const p of [1, 2]) console.log(`  ف${p}: ${rows.filter((r) => r.period === p).sort((a, b) => a.clinic_number - b.clinic_number).map((r) => `${r.role === 'delegator' ? 'دل' : 'ع' + r.clinic_number}:${fn(r.doctor_name)}`).join(' · ')}`);
}

async function main() {
  const { data: origS } = await supabase.from('schedule_settings').select('clinic_count').eq('clinic_id', CID);
  const origCC = (origS && origS[0]?.clinic_count) ?? 3;
  try {
    await supabase.from('schedule_settings').update({ clinic_count: 3 }).eq('clinic_id', CID);
    const { data: ld } = await loadScheduleData(CID, WEEK);
    const docs = ld?.doctors ?? [];
    const zainab: any = docs.find((d: any) => d.workStatus === 'trainee' && d.supervisorDoctorId === YAHYA);
    const c3: any = docs.find((d: any) => d.workStatus === 'active' && d.groupTemplate?.key !== 'board' && ![YAHYA, SHAHAD, FAT, MUH].includes(d.id));
    if (!zainab || !c3) throw new Error('لا ظلّ ليحيى أو لا طبيب حشو');
    const nm = (id: string) => docs.find((d: any) => d.id === id)?.name;

    // ع١ زوج-استضافة: يحيى(ع١ف١ + دلف٢) + فاطمه(دلف١ + ع١ف٢) · زينب تطابق يحيى كاملًا
    // ع٢ مشطورة: محمد ف١، شهد ف٢ (شهد حرّةٌ ف١ → شريكُ التبديل) · ع٣ منفرد (حشو)
    await clean();
    await ins({ period: 1, clinic_number: 1, doctor_id: YAHYA, doctor_name: nm(YAHYA), role: 'clinic' });
    await ins({ period: 2, clinic_number: 0, doctor_id: YAHYA, doctor_name: nm(YAHYA), role: 'delegator' });
    await ins({ period: 1, clinic_number: 1, doctor_id: zainab.id, doctor_name: zainab.name, role: 'clinic' }); // ظلّ
    await ins({ period: 2, clinic_number: 0, doctor_id: zainab.id, doctor_name: zainab.name, role: 'delegator' }); // ظلّ يستضيف معه
    await ins({ period: 1, clinic_number: 0, doctor_id: FAT, doctor_name: nm(FAT), role: 'delegator' });
    await ins({ period: 2, clinic_number: 1, doctor_id: FAT, doctor_name: nm(FAT), role: 'clinic' });
    await ins({ period: 1, clinic_number: 2, doctor_id: MUH, doctor_name: nm(MUH), role: 'clinic' });
    await ins({ period: 2, clinic_number: 2, doctor_id: SHAHAD, doctor_name: nm(SHAHAD), role: 'clinic' });
    await ins({ period: 1, clinic_number: 3, doctor_id: c3.id, doctor_name: c3.name, role: 'clinic' });
    await ins({ period: 2, clinic_number: 3, doctor_id: c3.id, doctor_name: c3.name, role: 'clinic' });
    show(await rowsOf(), 'الأساس (يحيى مضيف زوجيّ، زينب تطابقه كاملًا)');

    const noDouble = (rows: any[]) => {
      let dbl = '';
      for (const p of [1, 2]) for (const c of [1, 2, 3]) {
        const occ = rows.filter((r) => r.period === p && r.clinic_number === c && r.role === 'clinic' && r.doctor_id !== zainab.id);
        if (occ.length > 1) dbl += ` ف${p}/ع${c}:[${occ.map((o) => fn(o.doctor_name)).join('+')}]`;
      }
      return dbl;
    };

    // ── الأماميّ ──
    const res: any = await requestsV2.setScheduleStatus(LEADER, { clinicId: CID, weekStart: WEEK, day: DAY, doctorId: YAHYA, doctorName: nm(YAHYA), status: 'permission_start', shift: 'morning' } as any);
    console.log('\nتبديل:', JSON.stringify(res.permission?.swap));
    if (res.permission?.swap && 'withName' in res.permission.swap) {
      await withXdayJournal(CID, WEEK, { day: DAY, doctorId: YAHYA }, () =>
        schedule.rebalanceForward({ clinicId: CID, weekStart: WEEK, fromDay: DAY as any, fromShift: res.effShift ?? 'morning', today: WEEK } as any)).catch(() => {});
    }
    const after = await rowsOf(); show(after, 'بعد استئذان يحيى');
    const ySeat = after.filter((r) => r.doctor_id === YAHYA);
    const zSeat = after.filter((r) => r.doctor_id === zainab.id);
    const yClinics = new Set(ySeat.filter((r) => r.role === 'clinic').map((r) => `${r.period}|${r.clinic_number}`));
    check('يحيى خارج الفترة الأولى', !ySeat.some((r) => r.period === 1));
    check('التبديل مع الطبيب شهد (لا الظلّ)', res.permission?.swap?.withId === SHAHAD, 'withId=' + res.permission?.swap?.withName);
    check('الظلّ زينب تَبِع يحيى (عيادة فقط، نفس مقعده)', zSeat.length > 0 && zSeat.every((r) => r.role === 'clinic' && yClinics.has(`${r.period}|${r.clinic_number}`)), 'زينب=' + JSON.stringify(zSeat.map((r) => `ف${r.period}/${r.role === 'delegator' ? 'دل' : 'ع' + r.clinic_number}`)));
    check('الظلّ ليس دليقيترًا، ولم يبقَ مع شهد', !zSeat.some((r) => r.role === 'delegator'));
    check('لا حجزَ مزدوج (أماميّ)', noDouble(after) === '', noDouble(after));

    // ── الكنسل (مسار حيّ) ──
    const rs = await schedule.placementShift({ clinicId: CID, weekStart: WEEK, day: DAY, doctorId: YAHYA } as any).catch(() => 'morning' as const);
    const cres: any = await requestsV2.cancelStatus(LEADER, { clinicId: CID, weekStart: WEEK, day: DAY, doctorId: YAHYA, restoreToPrevPlace: true } as any).catch(() => ({}));
    if (rs && (cres.restored || cres.permSwapReverted)) await schedule.rebalanceForward({ clinicId: CID, weekStart: WEEK, fromDay: DAY as any, fromShift: rs, today: WEEK } as any).catch(() => {});
    const back = await rowsOf(); show(back, 'بعد الكنسل');
    const yB = back.filter((r) => r.doctor_id === YAHYA);
    const zB = back.filter((r) => r.doctor_id === zainab.id);
    const shB = back.filter((r) => r.doctor_id === SHAHAD);
    check('الكنسل: يحيى عاد مضيفًا زوجيًّا (ع١ف١ + دلف٢)', yB.some((r) => r.role === 'clinic' && r.period === 1 && r.clinic_number === 1) && yB.some((r) => r.role === 'delegator' && r.period === 2));
    check('الكنسل: شهد عادت لـع٢ف٢', shB.some((r) => r.role === 'clinic' && r.period === 2 && r.clinic_number === 2));
    check('الكنسل: الظلّ ظلٌّ عياديٌّ ليحيى (لا دليقيتر منفرد)', zB.length > 0 && zB.every((r) => r.role === 'clinic' && yB.some((y) => y.role === 'clinic' && y.period === r.period && y.clinic_number === r.clinic_number)), 'زينب=' + JSON.stringify(zB.map((r) => `ف${r.period}/${r.role === 'delegator' ? 'دل' : 'ع' + r.clinic_number}`)));
    check('الكنسل: لا حجزَ مزدوج', noDouble(back) === '', noDouble(back));

    console.log(`\n══════ ${pass} PASS / ${fail} FAIL ══════`);
    if (fails.length) fails.forEach((f) => console.log('  • ' + f));
  } finally {
    await clean();
    await supabase.from('schedule_settings').update({ clinic_count: origCC }).eq('clinic_id', CID);
  }
  process.exit(fail ? 1 : 0);
}
main().catch((e) => { console.error('ERR', e.message, e.stack); process.exit(1); });
