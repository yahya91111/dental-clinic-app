/* تغطيةُ الحالة الرفيعة (D=M+1 = ٤ أطباء/٣ عيادات): شكلٌ مُركَّبٌ يدويًّا (٣ منفرد + ١ مضيف
   متفرّغ) على يومٍ نظيف، ثمّ نُطبّق الأحداثَ الحيّة ونتحقّق من قواعد المستخدم:
     • غياب  → العيادةُ أوّلًا: ٣ منفردين على ٣ عيادات، الاستضافةُ تسقط (لا مضيف).
     • استئذان (منفرد-عيادة أو منفرد-دليقيتر) → يعمل فترتَه المفتوحة، والمحجوبةُ تبقى فارغة.
   لا إشعارات — استدعاءٌ مباشرٌ للمحرّك.   set -a; . ./.env; set +a; npx tsx scripts/test-thin-coverage.ts */
import { supabase } from '../lib/supabase';
import { requestsV2, withXdayJournal } from '../lib/algorithms/requests_v2';
import * as sh from '../lib/algorithms/solver_shadow';
import { loadScheduleData } from '../lib/algorithms/schedule';

const CID = '10000000-0000-0000-0000-000000000001';
const WEEK = '2099-11-01';
const DAY = 'tuesday';
const LEADER = { id: 'leader-test', role: 'team_leader' as const };
let pass = 0; let fail = 0; const fails: string[] = [];
const check = (n: string, c: boolean, d = '') => { if (c) { pass++; console.log('  ✅ ' + n); } else { fail++; fails.push(`${n} — ${d}`); console.log('  🔴 ' + n + (d ? ' — ' + d : '')); } };
const fn = (s?: string) => (s || '').split(' ').slice(0, 2).join(' ');

async function dayRows() { const { data } = await supabase.from('schedule_slots').select('id,doctor_id,doctor_name,period,clinic_number,role,status').eq('clinic_id', CID).eq('week_start', WEEK).eq('day_of_week', DAY); return (data || []) as any[]; }
const act = (rows: any[], id: string, p: number) => rows.find((r) => r.doctor_id === id && r.status === 'active' && r.period === p && (r.role === 'clinic' || r.role === 'delegator'));
async function clean() { await supabase.from('schedule_slots').delete().eq('clinic_id', CID).eq('week_start', WEEK); }
async function ins(row: any) { await supabase.from('schedule_slots').insert({ clinic_id: CID, week_start: WEEK, day_of_week: DAY, status: 'active', source: 'manual', ...row }); }

// يبني الشكلَ الرفيع: A→ع1، B→ع2، C→ع3 (كلٌّ منفرد ف1+ف2)، H→دليقيتر ف1+ف2 (مضيفٌ متفرّغ).
async function buildThin(A: any, B: any, C: any, H: any) {
  await clean();
  for (const [d, c] of [[A, 1], [B, 2], [C, 3]] as const) {
    await ins({ period: 1, clinic_number: c, doctor_id: d.id, doctor_name: d.name, role: 'clinic' });
    await ins({ period: 2, clinic_number: c, doctor_id: d.id, doctor_name: d.name, role: 'clinic' });
  }
  await ins({ period: 1, clinic_number: 0, doctor_id: H.id, doctor_name: H.name, role: 'delegator' });
  await ins({ period: 2, clinic_number: 0, doctor_id: H.id, doctor_name: H.name, role: 'delegator' });
}
function snap(rows: any[], nameOf: Map<string, string>) {
  return rows.filter((r) => r.status === 'active' && (r.role === 'clinic' || r.role === 'delegator'))
    .sort((a, b) => a.period - b.period || a.clinic_number - b.clinic_number)
    .map((r) => `${fn(nameOf.get(r.doctor_id))}:${r.role === 'delegator' ? 'دل' : 'ع' + r.clinic_number}/ف${r.period}`).join('  ');
}

async function main() {
  const { data: origS } = await supabase.from('schedule_settings').select('clinic_count').eq('clinic_id', CID);
  const origCC = (origS && origS[0]?.clinic_count) ?? 2;
  try {
    await supabase.from('schedule_settings').update({ clinic_count: 3 }).eq('clinic_id', CID);
    // بِركةُ المحرّك نفسها (نفسُ تعريف poolIds): عاديٌّ نشط، لا بورد/متدرّب/تخفيف — حتّى يتعرّفَ
    // عليهم المحرّكُ في نطاق COVER (لا BOARD) فينفّذَ النزول/الاستئذان كما هو مقصود.
    const { data: ld } = await loadScheduleData(CID, WEEK);
    const roster = (ld?.doctors ?? []).filter((d: any) => d.groupTemplate?.key !== 'board' && d.workStatus !== 'trainee' && d.workStatus !== 'light_duty').map((d: any) => ({ id: d.id, name: d.name }));
    if (roster.length < 4) { console.log(`بِركةٌ صغيرة (${roster.length})`); process.exit(1); }
    const [A, B, C, H] = roster;
    const nameOf = new Map<string, string>(roster.map((d) => [d.id, d.name]));
    const runCov = async (label: string) => {
      const c = await sh.applyCoverage({ clinicId: CID, weekStart: WEEK, label });
      await sh.applyReserveRepay({ clinicId: CID, weekStart: WEEK, label }, sh.reservePairsFromMoves(c.moves));
      await sh.applyNewHeartRebalance({ clinicId: CID, weekStart: WEEK, label });
    };

    // ═══ الحالة ١: غياب منفرد-عيادة (A) ═══
    console.log('\n═══ ١) غياب منفرد-عيادة (د. ' + fn(A.name) + ') — متوقّع: ٣ منفردين/٣ عيادات، لا مضيف ═══');
    await buildThin(A, B, C, H);
    console.log('  قبل: ' + snap(await dayRows(), nameOf));
    await requestsV2.setScheduleStatus(LEADER, { clinicId: CID, weekStart: WEEK, day: DAY, doctorId: A.id, doctorName: A.name, status: 'sick_leave', shift: 'morning' } as any);
    await withXdayJournal(CID, WEEK, { day: DAY, doctorId: A.id }, () => runCov('غياب-منفرد'));
    let rows = await dayRows();
    console.log('  بعد: ' + snap(rows, nameOf));
    {
      const clinicsCovered = new Set<number>();
      for (const p of [1, 2]) for (const cnum of [1, 2, 3]) if (rows.some((r) => r.status === 'active' && r.role === 'clinic' && r.clinic_number === cnum && r.period === p)) clinicsCovered.add(cnum * 10 + p);
      check('العيادات الثلاث مغطّاةٌ في الفترتين (٦ مقاعد)', clinicsCovered.size === 6, `${clinicsCovered.size}/6`);
      const solos = [B, C, H].filter((d) => act(rows, d.id, 1)?.role === 'clinic' && act(rows, d.id, 2)?.role === 'clinic' && act(rows, d.id, 1)?.clinic_number === act(rows, d.id, 2)?.clinic_number);
      check('٣ أطباءَ منفردون بالعيادة (B،C،والمضيفُ نزل)', solos.length === 3, `منفردون=${solos.map((d) => fn(d.name)).join('،')}`);
      check('لا مضيفَ (الاستضافةُ سقطت — العيادةُ أوّلًا)', !rows.some((r) => r.status === 'active' && r.role === 'delegator'), rows.filter((r) => r.status === 'active' && r.role === 'delegator').map((r) => fn(r.doctor_name)).join('،'));
    }

    // ═══ الحالة ٢: استئذان منفرد-عيادة (B) يحجب ف١ — متوقّع: B عيادة ف٢ فقط، ف١ فارغة ═══
    console.log('\n═══ ٢) استئذان منفرد-عيادة (د. ' + fn(B.name) + ') يحجب ف١ — متوقّع: عيادتُه ف٢ فقط، ف١ فارغة ═══');
    await buildThin(A, B, C, H);
    await requestsV2.setScheduleStatus(LEADER, { clinicId: CID, weekStart: WEEK, day: DAY, doctorId: B.id, doctorName: B.name, status: 'permission_start', shift: 'morning' } as any);
    rows = await dayRows();
    console.log('  بعد: ' + snap(rows, nameOf));
    check('B خرج من ف١', !act(rows, B.id, 1), JSON.stringify(act(rows, B.id, 1) || null));
    check('B يعمل عيادتَه ف٢', act(rows, B.id, 2)?.role === 'clinic' && act(rows, B.id, 2)?.clinic_number === 2, '');
    check('ع٢ ف١ فارغةٌ (لا أحدَ يغطّيها — لا فائض)', !rows.some((r) => r.status === 'active' && r.role === 'clinic' && r.clinic_number === 2 && r.period === 1), '');

    // ═══ الحالة ٣: استئذان منفرد-دليقيتر (H) يحجب ف١ — متوقّع: يستضيف ف٢ فقط، استضافةُ ف١ فارغة ═══
    console.log('\n═══ ٣) استئذان منفرد-دليقيتر (د. ' + fn(H.name) + ') يحجب ف١ — متوقّع: استضافةُ ف٢ فقط، ف١ فارغة ═══');
    await buildThin(A, B, C, H);
    await requestsV2.setScheduleStatus(LEADER, { clinicId: CID, weekStart: WEEK, day: DAY, doctorId: H.id, doctorName: H.name, status: 'permission_start', shift: 'morning' } as any);
    rows = await dayRows();
    console.log('  بعد: ' + snap(rows, nameOf));
    check('H خرج من ف١', !act(rows, H.id, 1), JSON.stringify(act(rows, H.id, 1) || null));
    check('H يستضيف ف٢', act(rows, H.id, 2)?.role === 'delegator', '');
    check('استضافةُ ف١ فارغةٌ (لا أحدَ بديل — منفردون مشغولون)', !rows.some((r) => r.status === 'active' && r.role === 'delegator' && r.period === 1), rows.filter((r) => r.status === 'active' && r.role === 'delegator' && r.period === 1).map((r) => fn(r.doctor_name)).join('،'));

    // ═══ الحالة ٤: كنسلُ استئذانٍ رفيع يعيد المقعدَ المُخلى حرفيًّا ═══
    console.log('\n═══ ٤) كنسلُ استئذان منفرد-عيادة (د. ' + fn(B.name) + ') — متوقّع: يعود ع٢ ف١ ═══');
    await buildThin(A, B, C, H);
    await requestsV2.setScheduleStatus(LEADER, { clinicId: CID, weekStart: WEEK, day: DAY, doctorId: B.id, doctorName: B.name, status: 'permission_start', shift: 'morning' } as any);
    let mid = await dayRows();
    check('قبل الكنسل: ع٢ ف١ فارغة', !mid.some((r) => r.status === 'active' && r.role === 'clinic' && r.clinic_number === 2 && r.period === 1), '');
    await requestsV2.cancelStatus(LEADER, { clinicId: CID, weekStart: WEEK, day: DAY, doctorId: B.id, restoreToPrevPlace: true } as any).catch(() => ({}));
    rows = await dayRows();
    console.log('  بعد الكنسل: ' + snap(rows, nameOf));
    check('عاد B إلى ع٢ في الفترتين (المقعدُ المُخلى رجع)', act(rows, B.id, 1)?.role === 'clinic' && act(rows, B.id, 1)?.clinic_number === 2 && act(rows, B.id, 2)?.clinic_number === 2, '');
    check('لا صفوفُ prev_placement عالقةٌ لـ B', !rows.some((r) => r.doctor_id === B.id && r.role !== 'clinic' && r.role !== 'delegator' && r.status === 'active' && r.period > 0), '');

    // لا حجزَ مزدوجٌ في أيّ فترةٍ في أيّ حالة (تحقّقٌ عامّ على آخر حالة)
    for (const p of [1, 2]) { const seen = new Map<string, number>(); for (const r of rows.filter((x) => x.status === 'active' && x.period === p && (x.role === 'clinic' || x.role === 'delegator'))) seen.set(r.doctor_id, (seen.get(r.doctor_id) || 0) + 1); check(`لا حجزَ مزدوجٌ ف${p}`, ![...seen.values()].some((v) => v > 1)); }

    console.log(`\n══════ النتيجة: ${pass} PASS / ${fail} FAIL ══════`);
    if (fails.length) { console.log('الإخفاقات:'); fails.forEach((f) => console.log('  • ' + f)); }
  } finally {
    await clean();
    await supabase.from('schedule_settings').update({ clinic_count: origCC }).eq('clinic_id', CID);
  }
  process.exit(fail ? 1 : 0);
}
main().catch((e) => { console.error('ERR', e.message, e.stack); process.exit(1); });
