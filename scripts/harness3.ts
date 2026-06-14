/* فحصٌ آليّ — الظلّ/المتدرّب، تحويل مرضية→استئذان، الدليقيتر، حرّاس المجموعة. */
import { supabase } from '../lib/supabase';
import { requestsV2 } from '../lib/algorithms/requests_v2';

const CID = '10000000-0000-0000-0000-000000000001';
const WEEK = '2099-01-04';
const PFX: Record<string, string> = {
  yahya: '95262a82', zainab: '63b47eea', esraa: 'ee1ddf37', abdullah: 'b41e3439',
  shahad: '3aebd552', mohammed: '65dfbacc', fatmaQattan: '045cecf9',
};
const full: Record<string, string> = {}; const names: Record<string, string> = {};
let pass = 0; let fail = 0; const fails: string[] = [];
function check(n: string, c: boolean, d = '') { if (c) { pass++; console.log(`  PASS ${n}`); } else { fail++; fails.push(`${n} — ${d}`); console.log(`  FAIL ${n} — ${d}`); } }
const TL = () => ({ id: full.yahya, role: 'team_leader' });
async function rowsOf(id: string, day: string) {
  const { data } = await supabase.from('schedule_slots').select('period,clinic_number,role,status,source').eq('week_start', WEEK).eq('clinic_id', CID).eq('day_of_week', day).eq('doctor_id', id);
  return (data || []) as any[];
}
const placedClinic = (rs: any[]) => rs.filter((r) => r.status === 'active' && r.period > 0 && (r.role === 'clinic' || r.role === 'delegator'));
const reserveRow = (rs: any[]) => rs.find((r) => r.status === 'extra');
async function ids() { const { data } = await supabase.from('doctors').select('id,name').eq('clinic_id', CID); for (const d of (data || []) as any[]) { names[d.id] = d.name; for (const k in PFX) if (d.id.startsWith(PFX[k])) full[k] = d.id; } }
// يجد يومًا يكون فيه الظلّ (id) مُلاصقًا لمدرّبه (نفس الخانات)
async function shadowDay(shadowId: string, supId: string) {
  for (const day of ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday']) {
    const sh = placedClinic(await rowsOf(shadowId, day)); const su = placedClinic(await rowsOf(supId, day));
    if (sh.length > 0 && su.length > 0 && sh.length === su.length && sh.every((r) => su.some((s) => s.period === r.period && s.clinic_number === r.clinic_number))) return day;
  }
  return '';
}

async function main() {
  await ids();

  console.log('\n====== ١) الظلّ يستأذن → ينتقل للاحتياط وحده ======');
  {
    const day = await shadowDay(full.zainab, full.yahya);
    check('وُجد يومٌ زينب فيه ظلٌّ ليحيى', !!day, 'لا يوم ظلّ');
    if (day) {
      const supBefore = placedClinic(await rowsOf(full.yahya, day)).length;
      const res: any = await requestsV2.setScheduleStatus({ id: full.zainab, role: 'doctor' }, { clinicId: CID, weekStart: WEEK, day, doctorId: full.zainab, doctorName: names[full.zainab], status: 'permission_end' } as any);
      check('الاستئذان يُعلَّم على الظلّ', res.success, res.error);
      check('الظلّ نُقل للاحتياط (shadowToReserve)', res.permission?.shadowToReserve === true, JSON.stringify(res.permission));
      check('زينب صارت احتياطًا', !!reserveRow(await rowsOf(full.zainab, day)), 'ليست احتياطًا');
      check('يحيى (المدرّب) لم يتأثّر', placedClinic(await rowsOf(full.yahya, day)).length === supBefore, 'تأثّر المدرّب');
      // إلغاء الظلّ → يعود لجانب مدرّبه
      const can: any = await requestsV2.cancelStatus(TL(), { clinicId: CID, weekStart: WEEK, day: day as any, doctorId: full.zainab, restoreToPrevPlace: true });
      check('إلغاء الظلّ يعيده لجانب مدرّبه', can.success && (can.shadowReturned || can.restored), JSON.stringify(can).slice(0, 90));
      check('زينب عادت تُلاصق يحيى', placedClinic(await rowsOf(full.zainab, day)).length === supBefore, 'لم تعد');
    }
  }

  console.log('\n====== ٢) تحويل مرضية → استئذان ======');
  {
    let day = '';
    for (const dd of ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday']) { if (placedClinic(await rowsOf(full.shahad, dd)).length > 0) { day = dd; break; } }
    const before = placedClinic(await rowsOf(full.shahad, day));
    check('شهد منسَّبٌ ابتداءً', before.length > 0, `day=${day}`);
    await requestsV2.setScheduleStatus(TL(), { clinicId: CID, weekStart: WEEK, day, doctorId: full.shahad, doctorName: names[full.shahad], status: 'sick_leave' } as any);
    check('بعد المرضية: خرج من العيادة', placedClinic(await rowsOf(full.shahad, day)).length === 0, 'بقي');
    const conv: any = await requestsV2.setScheduleStatus(TL(), { clinicId: CID, weekStart: WEEK, day, doctorId: full.shahad, doctorName: names[full.shahad], status: 'permission_end' } as any);
    check('التحويل إلى استئذان ينجح', conv.success, conv.error);
    const st0 = (await rowsOf(full.shahad, day)).filter((r) => r.period === 0 && r.status !== 'active');
    check('الحالة صارت استئذانًا (لا مرضية)', st0.length === 1 && st0[0].status === 'permission_end', JSON.stringify(st0.map((r: any) => r.status)));
    check('عاد إلى العيادة (الاستئذان يُبقيه)', placedClinic(await rowsOf(full.shahad, day)).length > 0, 'لم يعد');
    await requestsV2.cancelStatus(TL(), { clinicId: CID, weekStart: WEEK, day: day as any, doctorId: full.shahad, restoreToPrevPlace: true });
  }

  console.log('\n====== ٣) الدليقيتر ======');
  {
    const day = 'wednesday';
    // الدليقيتر الحاليّ في هذا اليوم
    const { data: delegs } = await supabase.from('schedule_slots').select('doctor_id,doctor_name,period').eq('week_start', WEEK).eq('clinic_id', CID).eq('day_of_week', day).eq('role', 'delegator').eq('status', 'active');
    const delegIds = [...new Set(((delegs || []) as any[]).map((r) => r.doctor_id))];
    check('يوجد دليقيتر في اليوم', delegIds.length > 0, 'لا دليقيتر');
    // غياب دليقيترٍ → نقصٌ في دوران الدليقيتر
    const dId = delegIds[0];
    const r: any = await requestsV2.setScheduleStatus(TL(), { clinicId: CID, weekStart: WEEK, day, doctorId: dId, doctorName: names[dId], status: 'sick_leave' } as any);
    check('تغييب الدليقيتر ينجح', r.success, r.error);
    const briefs: any = await requestsV2.computeDayCoverageBriefs({ clinicId: CID, weekStart: WEEK, day });
    const mine = briefs.find((b: any) => b.absentId === dId);
    check('نقصٌ يظهر بعد غياب الدليقيتر', !!mine && mine.gaps.length > 0, JSON.stringify(mine?.gaps));
    await requestsV2.cancelStatus(TL(), { clinicId: CID, weekStart: WEEK, day: day as any, doctorId: dId, restoreToPrevPlace: true });
    // تعيين دليقيتر: ضع طبيبًا محتاطًا حرًّا دليقيترًا
    const { data: extras } = await supabase.from('schedule_slots').select('doctor_id,doctor_name').eq('week_start', WEEK).eq('clinic_id', CID).eq('day_of_week', day).eq('status', 'extra');
    let freeId = ''; let freeName = '';
    for (const e of (extras || []) as any[]) { if (placedClinic(await rowsOf(e.doctor_id, day)).length === 0) { freeId = e.doctor_id; freeName = e.doctor_name; break; } }
    if (freeId) {
      const pd: any = await requestsV2.placeAsDelegator(TL(), { clinicId: CID, weekStart: WEEK, day: day as any, doctorId: freeId, doctorName: freeName });
      check(`تعيين ${freeName} دليقيترًا`, pd.success, JSON.stringify(pd).slice(0, 100));
      check('صار له صفّ دليقيتر', (await rowsOf(freeId, day)).some((r) => r.role === 'delegator' && r.status === 'active'), 'لا صفّ دليقيتر');
      await requestsV2.cancelStatus(TL(), { clinicId: CID, weekStart: WEEK, day: day as any, doctorId: freeId, restoreToPrevPlace: true }).catch(() => {});
    } else check('وُجد محتاطٌ حرٌّ للدليقيتر', false, 'لا محتاط');
  }

  console.log('\n====== ٤) حرّاس المجموعة (بلا تغييرٍ فعليّ) ======');
  {
    const g1: any = await requestsV2.moveDoctorGroup({ id: full.mohammed, role: 'doctor' }, full.mohammed, names[full.mohammed], null, null);
    check('طبيبٌ لا ينقل القروب', !g1.success, 'سُمح');
    const g2: any = await requestsV2.setDoctorGroupStatus({ id: full.mohammed, role: 'doctor' }, 'x', full.mohammed, 'light_duty');
    check('طبيبٌ لا يغيّر حالة القروب', !g2.success, 'سُمح');
  }

  console.log(`\n====== النتيجة: ${pass} PASS / ${fail} FAIL ======`);
  if (fails.length) { console.log('\nالإخفاقات:'); for (const f of fails) console.log('  • ' + f); }
}
main().catch((e) => { console.error('HARNESS ERR', e.message, e.stack); process.exit(1); });
