/* إعادةُ التشكيل عند الهبوط للحالة الرفيعة: شكلٌ غنيٌّ (M+2 طبيب/M عيادة: زوجُ استضافة +
   زوجٌ عاديّ + منفردون) ثمّ مرضيّةُ طبيبٍ → M+1 يبقون → يجب أن يصير: M منفرد-عيادة + ١
   منفرد-دليقيتر. ويعكسه الكنسلُ حرفيًّا. لا إشعارات — استدعاءٌ مباشر.
   set -a; . ./.env; set +a; npx tsx scripts/test-thin-reshape.ts */
import { supabase } from '../lib/supabase';
import { requestsV2, withXdayJournal } from '../lib/algorithms/requests_v2';
import * as sh from '../lib/algorithms/solver_shadow';
import { loadScheduleData } from '../lib/algorithms/schedule';

const CID = '10000000-0000-0000-0000-000000000001';
const WEEK = '2099-11-15';
const DAY = 'tuesday';
const LEADER = { id: 'leader-test', role: 'team_leader' as const };
const fn = (s?: string) => (s || '').split(' ').slice(0, 2).join(' ');
let pass = 0; let fail = 0; const fails: string[] = [];
const check = (n: string, c: boolean, d = '') => { if (c) { pass++; console.log('  ✅ ' + n); } else { fail++; fails.push(`${n}${d ? ' — ' + d : ''}`); console.log('  🔴 ' + n + (d ? ' — ' + d : '')); } };

async function clean() { await supabase.from('schedule_slots').delete().eq('clinic_id', CID).eq('week_start', WEEK); }
async function ins(row: any) { await supabase.from('schedule_slots').insert({ clinic_id: CID, week_start: WEEK, day_of_week: DAY, status: 'active', source: 'manual', ...row }); }
async function dayRows() { const { data } = await supabase.from('schedule_slots').select('id,doctor_id,doctor_name,period,clinic_number,role,status').eq('clinic_id', CID).eq('week_start', WEEK).eq('day_of_week', DAY); return (data || []) as any[]; }
const sig = (rows: any[]) => rows.filter((r) => r.status === 'active' && (r.role === 'clinic' || r.role === 'delegator') && [1, 2].includes(r.period)).map((r) => `${r.role}|ف${r.period}|ع${r.clinic_number}|${r.doctor_id}`).sort().join('  ');

// شكلٌ غنيّ على M عيادة بـM+2 طبيب: ع1 زوجُ استضافة (docs[0],docs[1]) · ع2 زوجٌ عاديّ (docs[2],docs[3])
// · ع3..M منفردون (docs[4..]).  victim = أحدُ زوجِ ع2 العاديّ (docs[2]).
async function buildRich(M: number, docs: any[]) {
  await clean();
  await ins({ period: 1, clinic_number: 1, doctor_id: docs[0].id, doctor_name: docs[0].name, role: 'clinic' });
  await ins({ period: 2, clinic_number: 0, doctor_id: docs[0].id, doctor_name: docs[0].name, role: 'delegator' });
  await ins({ period: 1, clinic_number: 0, doctor_id: docs[1].id, doctor_name: docs[1].name, role: 'delegator' });
  await ins({ period: 2, clinic_number: 1, doctor_id: docs[1].id, doctor_name: docs[1].name, role: 'clinic' });
  await ins({ period: 1, clinic_number: 2, doctor_id: docs[2].id, doctor_name: docs[2].name, role: 'clinic' });
  await ins({ period: 2, clinic_number: 2, doctor_id: docs[3].id, doctor_name: docs[3].name, role: 'clinic' });
  for (let c = 3; c <= M; c++) { const d = docs[1 + c]; for (const p of [1, 2]) await ins({ period: p, clinic_number: c, doctor_id: d.id, doctor_name: d.name, role: 'clinic' }); }
}
function classify(rows: any[]) {
  const act = rows.filter((r) => r.status === 'active' && (r.role === 'clinic' || r.role === 'delegator') && [1, 2].includes(r.period));
  const byDoc = new Map<string, any[]>();
  for (const r of act) { const a = byDoc.get(r.doctor_id) ?? []; a.push(r); byDoc.set(r.doctor_id, a); }
  let solo = 0, host = 0, bad = 0;
  for (const [, ss] of byDoc) {
    const cl = ss.filter((s) => s.role === 'clinic'); const dl = ss.filter((s) => s.role === 'delegator');
    if (cl.length === 2 && cl[0].clinic_number === cl[1].clinic_number && !dl.length) solo++;
    else if (dl.length === 2 && !cl.length) host++;
    else bad++;
  }
  return { solo, host, bad };
}

async function runCase(M: number, docsCount: number) {
  const { data: ld } = await loadScheduleData(CID, WEEK);
  const pool = (ld?.doctors ?? []).filter((d: any) => d.groupTemplate?.key !== 'board' && d.workStatus !== 'trainee' && d.workStatus !== 'light_duty').map((d: any) => ({ id: d.id, name: d.name }));
  const docs = pool.slice(0, docsCount);
  console.log(`\n═══ ${docsCount}/${M} → مرضيّة → يجب ${M} منفرد + ١ دليقيتر ═══`);
  await supabase.from('schedule_settings').update({ clinic_count: M }).eq('clinic_id', CID);
  await buildRich(M, docs);
  const before = sig(await dayRows());
  const victim = docs[2]; // عضو زوجِ ع2 العاديّ
  await requestsV2.setScheduleStatus(LEADER, { clinicId: CID, weekStart: WEEK, day: DAY, doctorId: victim.id, doctorName: victim.name, status: 'sick_leave', shift: 'morning' } as any);
  const runCov = async () => { const c = await sh.applyCoverage({ clinicId: CID, weekStart: WEEK, label: 'reshape' }); await sh.applyReserveRepay({ clinicId: CID, weekStart: WEEK, label: 'reshape' }, sh.reservePairsFromMoves(c.moves)); await sh.applyNewHeartRebalance({ clinicId: CID, weekStart: WEEK, label: 'reshape' }); await sh.applyThinReshape({ clinicId: CID, weekStart: WEEK, label: 'reshape' }); };
  await withXdayJournal(CID, WEEK, { day: DAY, doctorId: victim.id }, runCov);
  const c = classify(await dayRows());
  check(`${docsCount}/${M}: ${M} منفرد + ١ دليقيتر، صفرُ شذوذ`, c.solo === M && c.host === 1 && c.bad === 0, `منفرد=${c.solo} دليقيتر=${c.host} شاذّ=${c.bad}`);
  await requestsV2.cancelStatus(LEADER, { clinicId: CID, weekStart: WEEK, day: DAY, doctorId: victim.id, restoreToPrevPlace: true } as any).catch(() => ({}));
  check(`${docsCount}/${M}: الكنسل يعيد الشكلَ الغنيّ حرفيًّا`, sig(await dayRows()) === before);
}

async function main() {
  const { data: origS } = await supabase.from('schedule_settings').select('clinic_count').eq('clinic_id', CID);
  const origCC = (origS && origS[0]?.clinic_count) ?? 2;
  try {
    await runCase(3, 5); // ٥/٣ → ٤/٣
    await runCase(2, 4); // ٤/٢ → ٣/٢
    await runCase(4, 6); // ٦/٤ → ٥/٤
    console.log(`\n══════ النتيجة: ${pass} PASS / ${fail} FAIL ══════`);
    if (fails.length) { console.log('الإخفاقات:'); fails.forEach((f) => console.log('  • ' + f)); }
  } finally {
    await clean();
    await supabase.from('schedule_settings').update({ clinic_count: origCC }).eq('clinic_id', CID);
  }
  process.exit(fail ? 1 : 0);
}
main().catch((e) => { console.error('ERR', e.message, e.stack); process.exit(1); });
