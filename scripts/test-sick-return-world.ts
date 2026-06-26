/* الحالة #2 للمرضيّة (العالم تغيّر): A مريضٌ ومكانُه مُغطًّى، ثمّ مرض D أيضًا (العالم تغيّر)
 *  فصار شريكُ A منفردًا يُغطّي مقعده. كنسلُ مرضيّة A يجب أن يُجري **عودةً جراحيّة**
 *  (applyReturn، خيار أ): A يستردّ مقعده، شريكُه يعود لمقعده وحده، وتغطيةُ D لا تُمَسّ —
 *  بلا كرت قائد (covered=false). مشهدٌ مُدرَجٌ حتميّ (لا اعتماد على اختيارات التغطية). */
import { supabase } from '../lib/supabase';
import { requestsV2 } from '../lib/algorithms/requests_v2';
import { loadScheduleData } from '../lib/algorithms/schedule';

const CID = '10000000-0000-0000-0000-000000000001';
const W = '2099-01-04';
const DAY = 'sunday';
let pass = 0, fail = 0; const fails: string[] = [];
const check = (n: string, c: boolean, d = '') => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; fails.push(`${n} — ${d}`); console.log('  ✗ ' + n + ' — ' + d); } };
const clean = () => supabase.from('schedule_slots').delete().eq('clinic_id', CID).eq('week_start', W);
async function ins(row: Record<string, unknown>) { await supabase.from('schedule_slots').insert({ clinic_id: CID, week_start: W, day_of_week: DAY, source: 'request', ...row }); }
async function rowsNow() { const { data } = await supabase.from('schedule_slots').select('id,doctor_id,doctor_name,period,clinic_number,role,status').eq('clinic_id', CID).eq('week_start', W).eq('day_of_week', DAY); return (data || []) as any[]; }
const act = (rs: any[]) => rs.filter((r) => r.status === 'active' && r.period > 0 && (r.role === 'clinic' || r.role === 'delegator'));
const at = (rs: any[], c: number, p: number) => act(rs).find((r) => r.role === 'clinic' && r.clinic_number === c && r.period === p)?.doctor_id;

(async () => {
  try {
    const { data } = await loadScheduleData(CID, W);
    const pool = (data?.doctors ?? []).filter((d: any) => d.workStatus === 'active' && d.groupTemplate?.key !== 'board');
    if (pool.length < 4) { console.log('عاديّون < ٤ — تخطّي.'); console.log('\n0 PASS / 0 FAIL'); process.exit(0); }
    const [A, B, C, D] = pool;
    console.log(`A=${A.name.split(' ')[0]} (مريض، يُلغى) · شريكه B=${B.name.split(' ')[0]} · D=${D.name.split(' ')[0]} (مريضٌ — العالم تغيّر)`);

    await clean();
    // الحالة بعد تغيّر العالم: A مريض (محفوظ مقعده ع١ف١)، B منفردٌ في ع١ (يُغطّي مقعد A)؛
    // D مريض (محفوظ مقعده ع٢ف٢)، C منفردٌ في ع٢ (يُغطّي مقعد D).
    await ins({ period: 0, clinic_number: 1, doctor_id: A.id, doctor_name: A.name, role: 'clinic', status: 'sick_leave' });
    await ins({ period: 1, clinic_number: 1, doctor_id: A.id, doctor_name: A.name, role: 'prev_placement', status: 'active' });
    await ins({ period: 1, clinic_number: 1, doctor_id: B.id, doctor_name: B.name, role: 'clinic', status: 'active' }); // B يُغطّي مقعد A
    await ins({ period: 2, clinic_number: 1, doctor_id: B.id, doctor_name: B.name, role: 'clinic', status: 'active' }); // مقعد B الأصليّ
    await ins({ period: 1, clinic_number: 2, doctor_id: C.id, doctor_name: C.name, role: 'clinic', status: 'active' }); // مقعد C الأصليّ
    await ins({ period: 2, clinic_number: 2, doctor_id: C.id, doctor_name: C.name, role: 'clinic', status: 'active' }); // C يُغطّي مقعد D
    await ins({ period: 0, clinic_number: 2, doctor_id: D.id, doctor_name: D.name, role: 'clinic', status: 'sick_leave' });
    await ins({ period: 2, clinic_number: 2, doctor_id: D.id, doctor_name: D.name, role: 'prev_placement', status: 'active' });

    const before = await rowsNow();
    check('① قبل الكنسل: B منفردٌ في ع١ (يشغل مقعد A، وله مقعده ف٢)', at(before, 1, 1) === B.id && at(before, 1, 2) === B.id, `ع١ف١=${at(before, 1, 1)?.slice(-4)} ع١ف٢=${at(before, 1, 2)?.slice(-4)}`);

    // كنسل مرضيّة A عبر المحرّك (restoreToPrevPlace) — العالمُ تغيّر فيُتوقَّع applyReturn.
    const res: any = await requestsV2.cancelStatus({ id: A.id, role: 'team_leader' } as any, { clinicId: CID, weekStart: W, day: DAY as any, doctorId: A.id, restoreToPrevPlace: true } as any);
    check('② الكنسل نجح', res.success, res.error);
    check('③ عودةٌ جراحيّة (restored=true، بلا كرت قائد covered)', res.restored === true && !res.covered, JSON.stringify({ restored: res.restored, covered: res.covered, surgical: res.surgicalReturn }));

    const after = await rowsNow(); const a = act(after);
    check('④ A استردّ مقعده (ع١ف١)', at(after, 1, 1) === A.id, `ع١ف١=${at(after, 1, 1)?.slice(-4)}`);
    check('⑤ B عاد لمقعده وحده (ع١ف٢ فقط، لا ع١ف١)', at(after, 1, 2) === B.id && at(after, 1, 1) !== B.id, `ع١ف١=${at(after, 1, 1)?.slice(-4)} ع١ف٢=${at(after, 1, 2)?.slice(-4)}`);
    check('⑥ تغطيةُ D لم تُمَسّ (C ما زال منفردًا في ع٢)', at(after, 2, 1) === C.id && at(after, 2, 2) === C.id, `ع٢ف١=${at(after, 2, 1)?.slice(-4)} ع٢ف٢=${at(after, 2, 2)?.slice(-4)}`);
    check('⑦ D ما زال مريضًا', after.some((r) => r.doctor_id === D.id && r.period === 0 && r.status === 'sick_leave'), 'D عاد بالخطأ');
    // لا ازدواجَ دورٍ في الفترة
    let noDbl = true; for (const p of [1, 2]) { const ids = a.filter((r) => r.period === p).map((r) => r.doctor_id); if (ids.length !== new Set(ids).size) noDbl = false; }
    check('⑧ لا ازدواجَ دورٍ في الفترة', noDbl);
    // كلُّ العيادات مأهولة ف١+ف٢
    let staffed = true; const empt: string[] = [];
    for (const c of [1, 2]) for (const p of [1, 2]) if (!a.some((r) => r.role === 'clinic' && r.clinic_number === c && r.period === p)) { staffed = false; empt.push(`ع${c}ف${p}`); }
    check('⑨ ع١ وع٢ مأهولتان ف١+ف٢', staffed, empt.join('،'));
    const scene = new Set([A.id, B.id, C.id, D.id]);
    check('⑩ لا إقحامَ أطبّاءَ من خارج المشهد', [...new Set(a.map((r) => r.doctor_id))].every((id) => scene.has(id)), [...new Set(a.map((r) => r.doctor_id))].filter((id) => !scene.has(id)).map((x) => x.slice(-4)).join('،'));
  } finally {
    await clean();
  }
  console.log(`\n${pass} PASS / ${fail} FAIL`);
  if (fails.length) fails.forEach((f) => console.log('  • ' + f));
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('ERR', e.message, e.stack); process.exit(1); });
