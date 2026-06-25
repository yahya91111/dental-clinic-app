/* أداةُ الليدر الشاملة leader_apply: دفعةٌ مرتّبة، تجاوزُ الحُرّاس (بورد/ظلّ/تخفيف)،
 * بوّابةُ القائد. تستدعي الموزّع مباشرةً (بلا نموذج).
 *   set -a; . ./.env; set +a; npx tsx scripts/test-leader-apply.ts */
import { supabase } from '../lib/supabase';
import { loadScheduleData, schedule } from '../lib/algorithms/schedule';
import { dispatchRequestToolV2, FINAL_MARK } from '../lib/ai_v2/tools_requests_v2';
import type { WeekDay, Shift, TraineeMode } from '../lib/algorithms/schedule';

const CID = '10000000-0000-0000-0000-000000000001';
const W = '2099-02-01';
const DAY: WeekDay = 'wednesday';
const DAYS: WeekDay[] = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday'];
let pass = 0; let fail = 0;
const check = (n: string, c: boolean, d = '') => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n + ' — ' + d); } };

async function build() {
  await supabase.from('schedule_slots').delete().eq('clinic_id', CID).eq('week_start', W);
  const pre = await loadScheduleData(CID, W);
  const tm: Record<string, TraineeMode> = {};
  for (const t of (pre.data?.doctors ?? []).filter((d) => d.workStatus === 'trainee')) tm[t.id] = 'beginner';
  const aShiftPlan = Object.fromEntries(DAYS.map((d) => [d, 'morning' as Shift])) as Record<WeekDay, Shift>;
  await schedule.build({ weekStart: W, clinicId: CID, aShiftPlan, boardConfig: { scenario: { kind: 'all_morning' as const }, includeInExRotation: false }, traineeModes: tm, dryRun: false });
}
async function dayRows() {
  const { data } = await supabase.from('schedule_slots').select('doctor_id,doctor_name,period,clinic_number,role,status')
    .eq('clinic_id', CID).eq('week_start', W).eq('day_of_week', DAY);
  return (data || []) as any[];
}
const activeAt = (rows: any[], id: string, p: number) =>
  rows.find((r) => r.doctor_id === id && r.status === 'active' && r.period === p && (r.role === 'clinic' || r.role === 'delegator'));
const hasClinic = (rows: any[], id: string) => rows.some((r) => r.doctor_id === id && r.status === 'active' && r.role === 'clinic' && r.period > 0);
const isReserve = (rows: any[], id: string) => rows.some((r) => r.doctor_id === id && r.status === 'extra' && r.period === 0);

type Doc = { id: string; name: string; groupTemplate: { key: string }; workStatus: string; supervisorDoctorId?: string };
function ctxFor(role: string, docs: Doc[], leaderId: string) {
  return {
    clinicId: CID,
    user: { id: leaderId, name: 'قائد', role },
    roster: docs.map((d) => ({ id: d.id, name: d.name, groupKey: d.groupTemplate.key })),
  };
}
const apply = async (ctx: any, operations: any[]) => {
  const raw = await dispatchRequestToolV2('leader_apply', { weekStart: W, operations }, ctx);
  return { raw, final: raw.startsWith(FINAL_MARK), text: raw.startsWith(FINAL_MARK) ? raw.slice(FINAL_MARK.length) : raw };
};

async function main() {
  const { data: origS } = await supabase.from('schedule_settings').select('clinic_count').eq('clinic_id', CID);
  const origCC = (origS && origS[0]?.clinic_count) ?? 3;
  await supabase.from('schedule_settings').update({ clinic_count: 3 }).eq('clinic_id', CID);
  try {
    await build();
    const data = (await loadScheduleData(CID, W)).data!;
    const docs = data.doctors as Doc[];
    const idx = (id: string) => docs.findIndex((d) => d.id === id) + 1;
    const leaderId = docs[0]!.id;
    const lead = ctxFor('team_leader', docs, leaderId);

    // ───────── بوّابة القائد: الطبيب يُرفض ─────────
    {
      const doctorCtx = ctxFor('doctor', docs, docs[1]!.id);
      const r = await apply(doctorCtx, [{ op: 'set_status', day: DAY, doctorIndex: 2, status: 'extra' }]);
      check('بوّابة: الطبيب لا يستطيع leader_apply', !r.final && r.raw.startsWith('Tool error') && r.raw.includes('فأعلى'), r.raw.slice(0, 80));
    }

    // ───────── دفعةٌ مرتّبة: أخرِج R1 احتياطًا ثمّ ضع R2 في مقعده، واجعل R3 دليقيتر ─────────
    {
      const rows = await dayRows();
      const trainees = new Set(docs.filter((d) => d.workStatus === 'trainee').map((d) => d.id));
      const boardIds = new Set(docs.filter((d) => d.groupTemplate.key === 'board').map((d) => d.id));
      const reg = (id: string) => !trainees.has(id) && !boardIds.has(id);
      // مقعدُ عيادةٍ لطبيبٍ عاديّ ف١
      const seat = rows.find((r) => r.role === 'clinic' && r.status === 'active' && r.period === 1 && r.clinic_number > 0 && reg(r.doctor_id));
      const R1 = seat!.doctor_id;
      // احتياطيّ عاديّ (extra) ليأخذ مقعده
      const exRow = rows.find((r) => r.status === 'extra' && r.period === 0 && reg(r.doctor_id));
      const R2 = exRow ? exRow.doctor_id : docs.find((d) => reg(d.id) && d.id !== R1 && !hasClinic(rows, d.id))?.id;
      // عاديٌّ ثالث ليصير دليقيتر (له فترةٌ حرّة) — أيّ عاديّ غير R1/R2
      const R3 = docs.find((d) => reg(d.id) && d.id !== R1 && d.id !== R2)?.id;
      if (R1 && R2 && R3) {
        const r = await apply(lead, [
          { op: 'set_status', day: DAY, doctorIndex: idx(R1), status: 'extra' },
          { op: 'place', day: DAY, doctorIndex: idx(R2), clinicNumber: seat!.clinic_number, periods: [seat!.period] },
          { op: 'delegator', day: DAY, doctorIndex: idx(R3) },
        ]);
        const after = await dayRows();
        check('دفعة: النتيجة نهائيّة (٣ عمليّات)', r.final && r.text.includes('نُفِّذ'), r.text.slice(0, 120));
        check('دفعة: R1 صار احتياطًا (خرج من العيادة)', isReserve(after, R1) && !hasClinic(after, R1));
        check('دفعة: R2 أخذ مقعد R1', !!activeAt(after, R2, seat!.period) && after.some((x) => x.doctor_id === R2 && x.clinic_number === seat!.clinic_number && x.period === seat!.period && x.role === 'clinic'));
        check('دفعة: R3 صار دليقيتر', after.some((x) => x.doctor_id === R3 && x.role === 'delegator' && x.status === 'active'));
      } else { console.log('  (تخطّي الدفعة: لم تكتمل العناصر R1/R2/R3)'); }
    }

    // ───────── تجاوز الحارس: بورد ─────────
    await build();
    {
      const rows = await dayRows();
      const board = docs.find((d) => d.groupTemplate.key === 'board' && hasClinic(rows, d.id));
      if (board) {
        const r = await apply(lead, [{ op: 'set_status', day: DAY, doctorIndex: idx(board.id), status: 'sick_leave', shift: 'morning' }]);
        const after = await dayRows();
        check('تجاوز: leader_apply يُمرّض طبيبَ بورد (بلا حظر)', r.final && !hasClinic(after, board.id) && after.some((x) => x.doctor_id === board.id && x.status === 'sick_leave'), r.text.slice(0, 100));
      } else { console.log('  (تخطّي البورد: لا طبيبَ بورد في عيادة)'); }
    }

    // ───────── تجاوز الحارس: ظلّ المتدرّب يُنقل مستقلًّا (إخراج ثمّ وضع في عيادةٍ غير عيادة مشرفه) ─────────
    await build();
    {
      const rows = await dayRows();
      const shadow = docs.find((d) => d.workStatus === 'trainee' && d.supervisorDoctorId);
      if (shadow) {
        const supId = shadow.supervisorDoctorId!;
        const supClinics = new Set(rows.filter((r) => r.doctor_id === supId && r.role === 'clinic' && r.status === 'active' && r.period > 0).map((r) => r.clinic_number));
        const target = [1, 2, 3].find((c) => !supClinics.has(c)) ?? 1;
        const r = await apply(lead, [
          { op: 'set_status', day: DAY, doctorIndex: idx(shadow.id), status: 'extra' },
          { op: 'place', day: DAY, doctorIndex: idx(shadow.id), clinicNumber: target, periods: [1] },
        ]);
        const after = await dayRows();
        check('تجاوز: leader_apply ينقل ظلَّ المتدرّب مستقلًّا (بلا قيد اللصوق)', r.final && after.some((x) => x.doctor_id === shadow.id && x.clinic_number === target && x.period === 1 && x.role === 'clinic' && x.status === 'active'), r.text.slice(0, 140));
      } else { console.log('  (تخطّي الظلّ: لا متدرّبَ ظلّ)'); }
    }

    // ───────── تجاوز الحارس: تخفيف يُوضَع في الفترة الثانية ─────────
    await build();
    {
      const rows = await dayRows();
      const light = docs.find((d) => d.workStatus === 'light_duty');
      const seat2 = rows.find((r) => r.role === 'clinic' && r.status === 'active' && r.period === 2 && r.clinic_number > 0);
      if (light && seat2) {
        const r = await apply(lead, [{ op: 'place', day: DAY, doctorIndex: idx(light.id), clinicNumber: seat2.clinic_number, periods: [2] }]);
        const after = await dayRows();
        check('تجاوز: leader_apply يضع التخفيف في ف٢ (بلا قيد الفترة الأولى)', r.final && after.some((x) => x.doctor_id === light.id && x.period === 2 && x.role === 'clinic' && x.status === 'active'), r.text.slice(0, 100));
      } else { console.log('  (تخطّي التخفيف: لا طبيبَ تخفيف في العيادة)'); }
    }
  } finally {
    await supabase.from('schedule_slots').delete().eq('clinic_id', CID).eq('week_start', W);
    await supabase.from('schedule_settings').update({ clinic_count: origCC }).eq('clinic_id', CID);
  }
  console.log(`\n${pass} PASS / ${fail} FAIL`);
  process.exit(fail ? 1 : 0);
}
main().catch((e) => { console.error('ERR', e.message, e.stack); supabase.from('schedule_settings').update({ clinic_count: 3 }).eq('clinic_id', CID).then(() => process.exit(1)); });
