/* محكُّ طبقة تنسيق التبديل (notifications.ts) — يختبر تجريبيًّا:
 *   أ) طلب تبديلٍ لشفتٍ كامل (listSwapTargets other_shift + openSwapGroup)
 *   ب) أوّل موافقٍ يفوز + اختفاء الكرت عند الباقي (acceptSwap + إخفاء الإخوة)
 *   ج) سباق الموافقتين معًا (القفل الذرّيّ — لا تبديلٌ مزدوج أبدًا)
 *   د) رفض الجميع → «لم يقبل أحد» مرّةً واحدة
 *   هـ) إلغاء الطلب المعلّق (والإلغاء بعد الموافقة يفشل)
 *   و) إبطال الطلب عند مساس الجدول (invalidateSwapsTouching)
 *   ز) انتهاء المهلة (acceptSwap على كرتٍ منتهٍ)
 * أمانُ الـpush: نحذف رموزَ الدفع مؤقّتًا ونُعيدها في finally (صفر push).
 *   set -a; . ./.env; set +a; npx tsx scripts/test-swap-coordination.ts */
import { supabase } from '../lib/supabase';
import { requestsV2 } from '../lib/algorithms/requests_v2';
import { notifications, NotifType } from '../lib/algorithms/notifications';
import { schedule, loadScheduleData } from '../lib/algorithms/schedule';
import type { WeekDay, Shift, TraineeMode } from '../lib/algorithms/schedule';

const CID = '10000000-0000-0000-0000-000000000001';
const DAYS: WeekDay[] = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday'];
const AR: Record<string, string> = { sunday: 'الأحد', monday: 'الإثنين', tuesday: 'الثلاثاء', wednesday: 'الأربعاء', thursday: 'الخميس' };
const LEADER = { id: 'leader-test', role: 'team_leader' as const };
const W = '2099-09-20';
let pass = 0; let fail = 0; const fails: string[] = [];
function inv(scn: string, name: string, cond: boolean, detail = '') {
  if (cond) { pass++; } else { fail++; const m = `[${scn}] ${name}${detail ? ' — ' + detail : ''}`; fails.push(m); console.log(`    ❌ ${m}`); }
}
const fn = (s?: string) => (s || '').split(' ')[0];

type R = { id: string; doctor_id: string; doctor_name: string; period: number; clinic_number: number; role: string; status: string; day_of_week: string };
async function rows(day?: string): Promise<R[]> {
  let q = supabase.from('schedule_slots').select('id,doctor_id,doctor_name,period,clinic_number,role,status,day_of_week').eq('clinic_id', CID).eq('week_start', W);
  if (day) q = q.eq('day_of_week', day);
  const { data } = await q; return (data || []) as R[];
}
const SEAT = (r: R) => (r.status === 'active' && r.period > 0 && (r.role === 'clinic' || r.role === 'delegator')) || (r.status === 'extra' && r.period === 0);
const posKeys = (rs: R[], id: string) => rs.filter((r) => r.doctor_id === id && SEAT(r)).map((r) => `${r.status}|${r.role}|p${r.period}|c${r.clinic_number}`).sort().join(',');
const hasActive = (rs: R[], id: string) => rs.some((r) => r.doctor_id === id && r.status === 'active' && r.period > 0 && (r.role === 'clinic' || r.role === 'delegator'));

async function build() {
  await supabase.from('schedule_slots').delete().eq('clinic_id', CID).eq('week_start', W);
  const pre = await loadScheduleData(CID, W);
  const tm: Record<string, TraineeMode> = {};
  for (const t of (pre.data?.doctors ?? []).filter((d: any) => d.workStatus === 'trainee')) tm[t.id] = 'beginner';
  const aShiftPlan = Object.fromEntries(DAYS.map((d) => [d, 'morning' as Shift])) as Record<WeekDay, Shift>;
  await schedule.build({ weekStart: W, clinicId: CID, aShiftPlan, boardConfig: { scenario: { kind: 'all_morning' as const }, includeInExRotation: false }, traineeModes: tm, dryRun: false } as any).catch((e: any) => console.log('  build err', e?.message));
}

// كروت مجموعةٍ معيّنة / نتائج طالبٍ معيّن
async function cards(group: string) {
  const { data } = await supabase.from('notifications').select('id,recipient_id,action_status,data').eq('type', NotifType.SWAP_REQUEST).filter('data->>swap_group', 'eq', group);
  return (data || []) as { id: string; recipient_id: string; action_status: string | null; data: any }[];
}
async function results(reqId: string) {
  const { data } = await supabase.from('notifications').select('id,title,body,type,data').eq('clinic_id', CID).eq('recipient_id', reqId).eq('type', NotifType.REQUEST_RESULT);
  return (data || []) as { id: string; title: string; body: string; data: any }[];
}
async function crossShiftInfos() {
  const { data } = await supabase.from('notifications').select('id,title').eq('clinic_id', CID).eq('type', NotifType.REQUEST_INFO).eq('title', 'تبديل بين الشفتين');
  return (data || []) as any[];
}
let preNotifIds = new Set<string>();
async function wipeTestNotifs() {
  const { data } = await supabase.from('notifications').select('id').eq('clinic_id', CID);
  const extra = ((data || []) as { id: string }[]).map((r) => r.id).filter((id) => !preNotifIds.has(id));
  if (extra.length) await supabase.from('notifications').delete().in('id', extra);
}

async function main() {
  // ── احفظ رموزَ الدفع واحذفها مؤقّتًا (صفر push) ──
  const { data: allDocs } = await loadScheduleData(CID, W);
  const docs = (allDocs?.doctors ?? []) as any[];
  const ids = docs.map((d) => d.id);
  const { data: savedTokens } = await supabase.from('push_tokens').select('*').in('user_id', ids);
  const holderIds = [...new Set((savedTokens || []).map((t: any) => t.user_id))];
  console.log(`رموز دفعٍ محفوظة مؤقّتًا: ${(savedTokens || []).length} (لأطبّاء: ${holderIds.length})`);
  if (holderIds.length) await supabase.from('push_tokens').delete().in('user_id', holderIds);
  // احفظ بصمةَ إشعارات العيادة قبل التجربة (لحذف ما نُنشئه فقط)
  { const { data } = await supabase.from('notifications').select('id').eq('clinic_id', CID); preNotifIds = new Set(((data || []) as any[]).map((r) => r.id)); }

  const origCC = (await supabase.from('schedule_settings').select('clinic_count').eq('clinic_id', CID)).data?.[0]?.clinic_count ?? 2;
  try {
    await supabase.from('schedule_settings').update({ clinic_count: 3 }).eq('clinic_id', CID);
    const board = new Set(docs.filter((d) => d.groupTemplate?.key === 'board').map((d) => d.id));
    const trainee = new Set(docs.filter((d) => d.workStatus === 'trainee').map((d) => d.id));
    const plain = (id: string) => !board.has(id) && !trainee.has(id);
    const nameOf = (id: string) => docs.find((d) => d.id === id)?.name || '';

    await build();
    let day: WeekDay = 'sunday';
    let dRows = await rows(day);
    const morn = () => [...new Set(dRows.filter((r) => r.status === 'active' && (r.period === 1 || r.period === 2) && r.role === 'clinic' && plain(r.doctor_id)).map((r) => r.doctor_id))];
    const eve = () => [...new Set(dRows.filter((r) => r.status === 'active' && (r.period === 3 || r.period === 4) && r.role === 'clinic' && plain(r.doctor_id)).map((r) => r.doctor_id))];

    // ════════ أ) طلب تبديلٍ لشفتٍ كامل ════════
    console.log('\n══ أ) طلب لشفتٍ كامل (other_shift) ══');
    {
      const mornDocs = morn(); const eveDocs = eve();
      if (mornDocs.length >= 1 && eveDocs.length >= 1) {
        const R = mornDocs[0]!;
        const listed: any = await requestsV2.listSwapTargets({ clinicId: CID, weekStart: W, day, requesterId: R, mode: { kind: 'other_shift' } });
        inv('أ', 'listSwapTargets(other_shift) نجح', listed.success, listed.error || '');
        const tgts = (listed.targets || []);
        inv('أ', 'المستهدَفون كلُّهم من الشفت الآخر (مساء)', tgts.length > 0 && tgts.every((t: any) => eveDocs.includes(t.id) || !mornDocs.includes(t.id)), `${tgts.length} مستهدَف`);
        const opened: any = await notifications.openSwapGroup({ clinicId: CID, weekStart: W, day, requesterId: R, requesterName: nameOf(R), targets: tgts });
        inv('أ', 'openSwapGroup نجح', opened.success, opened.error || '');
        inv('أ', 'عدد الكروت = عدد المستهدَفين', opened.count === tgts.length, `count=${opened.count} tgts=${tgts.length}`);
        const grp = await cards(opened.group);
        inv('أ', 'كرتٌ واحدٌ لكلّ مستهدَف، كلُّها معلّقة', grp.length === tgts.length && grp.every((c) => !c.action_status || c.action_status === 'pending'));
        inv('أ', 'مستلمو الكروت = المستهدَفون', new Set(grp.map((c) => c.recipient_id)).size === tgts.length && grp.every((c) => tgts.some((t: any) => t.id === c.recipient_id)));
        // منع الازدواج: طلبٌ ثانٍ لنفس اليوم يُرفض
        const dup: any = await notifications.openSwapGroup({ clinicId: CID, weekStart: W, day, requesterId: R, requesterName: nameOf(R), targets: tgts });
        inv('أ', 'طلبٌ مكرّرٌ لنفس اليوم يُرفض', !dup.success, dup.error || '');
        console.log(`  ${fn(nameOf(R))} → ${tgts.length} من الشفت الآخر | ${tgts.map((t: any) => fn(t.name)).join('، ')}`);
      } else console.log('  أ) لا شفتان مختلفان — تخطّي');
    }
    await wipeTestNotifs();

    // ════════ ب) أوّل موافقٍ يفوز + اختفاء الباقي ════════
    console.log('\n══ ب) أوّل موافقٍ يفوز + إخفاء الإخوة ══');
    await build(); day = 'monday'; dRows = await rows(day);
    {
      const m = morn();
      if (m.length >= 3) {
        const [R, t1, t2] = m as string[];
        const before = await rows(day);
        const rPos = posKeys(before, R!); const t1Pos = posKeys(before, t1!);
        const opened: any = await notifications.openSwapGroup({ clinicId: CID, weekStart: W, day, requesterId: R!, requesterName: nameOf(R!), targets: [{ id: t1!, name: nameOf(t1!) }, { id: t2!, name: nameOf(t2!) }] });
        const grp = await cards(opened.group);
        const card1 = grp.find((c) => c.recipient_id === t1)!;
        const acc: any = await notifications.acceptSwap({ notificationId: card1.id, targetId: t1!, targetRole: 'doctor', targetName: nameOf(t1!) });
        inv('ب', 'القبول نجح', acc.success, acc.resultError || '');
        const after = await rows(day);
        inv('ب', 'التبديل نُفّذ فعلًا (R أخذ مقعد t1)', posKeys(after, R!) === t1Pos && posKeys(after, t1!) === rPos);
        const grp2 = await cards(opened.group);
        const accepted = grp2.filter((c) => c.action_status === 'accepted');
        const pending = grp2.filter((c) => !c.action_status || c.action_status === 'pending');
        inv('ب', 'كرتُ الموافِق صار accepted', accepted.length === 1 && accepted[0]!.recipient_id === t1);
        inv('ب', 'كرتُ الأخ الآخر اختفى (لا معلّق)', pending.length === 0, `معلّق=${pending.length}`);
        const res = await results(R!);
        inv('ب', 'وصل الطالبَ إشعارُ «تمّ»', res.some((x) => /وافق|تمّ/.test(x.body)));
        inv('ب', 'لا إشعارَ «بين الشفتين» (نفس الشفت)', (await crossShiftInfos()).length === 0);
      } else console.log('  ب) أقلّ من ٣ عياداتٍ صباحيّة — تخطّي');
    }
    await wipeTestNotifs();

    // ════════ ج) سباق الموافقتين معًا ════════
    console.log('\n══ ج) سباق الموافقتين (القفل الذرّيّ) ══');
    await build(); day = 'tuesday'; dRows = await rows(day);
    {
      const m = morn();
      if (m.length >= 3) {
        const [R, t1, t2] = m as string[];
        const before = await rows(day);
        const origSig = before.filter(SEAT).map((r) => `${r.doctor_id}|${r.period}|${r.clinic_number}|${r.role}|${r.status}`).sort().join('\n');
        const opened: any = await notifications.openSwapGroup({ clinicId: CID, weekStart: W, day, requesterId: R!, requesterName: nameOf(R!), targets: [{ id: t1!, name: nameOf(t1!) }, { id: t2!, name: nameOf(t2!) }] });
        const grp = await cards(opened.group);
        const c1 = grp.find((c) => c.recipient_id === t1)!; const c2 = grp.find((c) => c.recipient_id === t2)!;
        // موافقتان متزامنتان
        const [r1, r2] = await Promise.all([
          notifications.acceptSwap({ notificationId: c1.id, targetId: t1!, targetRole: 'doctor', targetName: nameOf(t1!) }),
          notifications.acceptSwap({ notificationId: c2.id, targetId: t2!, targetRole: 'doctor', targetName: nameOf(t2!) }),
        ]);
        const okCount = [r1, r2].filter((x: any) => x.success).length;
        inv('ج', 'لا تبديلٌ مزدوج (موافقٌ واحدٌ كحدٍّ أقصى)', okCount <= 1, `نجح=${okCount}`);
        const grp2 = await cards(opened.group);
        const acceptedCount = grp2.filter((c) => c.action_status === 'accepted').length;
        inv('ج', 'كرتٌ مقبولٌ واحدٌ كحدٍّ أقصى', acceptedCount <= 1, `accepted=${acceptedCount}`);
        const after = await rows(day);
        const newSig = after.filter(SEAT).map((r) => `${r.doctor_id}|${r.period}|${r.clinic_number}|${r.role}|${r.status}`).sort().join('\n');
        if (okCount === 0) {
          inv('ج', 'لا موافقٌ → الجدول كما كان (لا إفساد)', newSig === origSig);
          // رصدُ حالة الانسحاب المزدوج: ماذا يرى الطالب؟
          const remaining = await cards(opened.group);
          const res0 = await results(R!);
          console.log(`  [انسحابٌ مزدوج] كروتٌ باقية=${remaining.length} | إشعاراتُ الطالب=${res0.length}`);
          if (remaining.length === 0 && res0.length === 0) console.log('  ⚠️ ثغرةُ تنسيق (للخطوة ٢): المجموعةُ تلاشت بلا إشعارٍ للطالب');
        } else {
          const winner = (r1 as any).success ? t1! : t2!;
          inv('ج', 'موافقٌ واحدٌ → نُفّذ تبديلُه حصرًا', hasActive(after, winner) && hasActive(after, R!) && newSig !== origSig);
        }
        // فحصٌ بنيويّ: لا ازدواجَ مقعدٍ بعد السباق
        const seatMap = new Map<string, number>();
        for (const r of after.filter((r) => r.status === 'active' && r.role === 'clinic' && r.period > 0 && r.clinic_number > 0 && !trainee.has(r.doctor_id))) { const k = `${r.period}|${r.clinic_number}`; seatMap.set(k, (seatMap.get(k) || 0) + 1); }
        inv('ج', 'لا ازدواجَ مقعدٍ بعد السباق', [...seatMap.values()].every((v) => v <= 1));
        console.log(`  ${fn(nameOf(R!))} ↔ {${fn(nameOf(t1!))},${fn(nameOf(t2!))}} متزامنًا → نجح=${okCount}`);
      } else console.log('  ج) أقلّ من ٣ عياداتٍ صباحيّة — تخطّي');
    }
    await wipeTestNotifs();

    // ════════ د) رفض الجميع → «لم يقبل أحد» ════════
    console.log('\n══ د) رفض الجميع → «لم يقبل أحد» ══');
    await build(); day = 'wednesday'; dRows = await rows(day);
    {
      const m = morn();
      if (m.length >= 3) {
        const [R, t1, t2] = m as string[];
        const opened: any = await notifications.openSwapGroup({ clinicId: CID, weekStart: W, day, requesterId: R!, requesterName: nameOf(R!), targets: [{ id: t1!, name: nameOf(t1!) }, { id: t2!, name: nameOf(t2!) }] });
        const grp = await cards(opened.group);
        for (const c of grp) await notifications.rejectSwap({ notificationId: c.id, targetName: nameOf(c.recipient_id) });
        const grp2 = await cards(opened.group);
        inv('د', 'كلُّ الكروت صارت مرفوضة', grp2.every((c) => c.action_status === 'rejected'));
        const res = await results(R!);
        const exhausted = res.filter((x) => /لم يقبل أحد/.test(x.body));
        inv('د', '«لم يقبل أحد» وصل مرّةً واحدةً بالضبط', exhausted.length === 1, `عدد=${exhausted.length}`);
      } else console.log('  د) أقلّ من ٣ عياداتٍ صباحيّة — تخطّي');
    }
    await wipeTestNotifs();

    // ════════ هـ) إلغاء الطلب المعلّق + الإلغاء بعد القبول يفشل ════════
    console.log('\n══ هـ) إلغاء المعلّق / لا إلغاء بعد القبول ══');
    await build(); day = 'thursday'; dRows = await rows(day);
    {
      const m = morn();
      if (m.length >= 3) {
        const [R, t1, t2] = m as string[];
        // إلغاءٌ ناجح
        const op1: any = await notifications.openSwapGroup({ clinicId: CID, weekStart: W, day, requesterId: R!, requesterName: nameOf(R!), targets: [{ id: t1!, name: nameOf(t1!) }, { id: t2!, name: nameOf(t2!) }] });
        const cancel: any = await notifications.cancelSwapGroup({ requesterId: R!, weekStart: W, day });
        inv('هـ', 'إلغاء الطلب المعلّق نجح', cancel.success, cancel.error || '');
        inv('هـ', 'اليومُ المُلغى صحيح', (cancel.canceledDays || []).includes(day));
        inv('هـ', 'كروتُ المجموعة حُذفت', (await cards(op1.group)).length === 0);
        // الإلغاء بعد القبول يفشل
        const op2: any = await notifications.openSwapGroup({ clinicId: CID, weekStart: W, day, requesterId: R!, requesterName: nameOf(R!), targets: [{ id: t1!, name: nameOf(t1!) }] });
        const c = (await cards(op2.group))[0]!;
        await notifications.acceptSwap({ notificationId: c.id, targetId: t1!, targetRole: 'doctor', targetName: nameOf(t1!) });
        const lateCancel: any = await notifications.cancelSwapGroup({ requesterId: R!, weekStart: W, day });
        inv('هـ', 'الإلغاء بعد موافقةٍ يفشل', !lateCancel.success, lateCancel.error || '');
      } else console.log('  هـ) أقلّ من ٣ عياداتٍ صباحيّة — تخطّي');
    }
    await wipeTestNotifs();

    // ════════ و) إبطال الطلب عند مساس الجدول ════════
    console.log('\n══ و) invalidateSwapsTouching (قتلٌ كامل + إبطالٌ جزئيّ دقيق) ══');
    await build(); day = 'sunday'; dRows = await rows(day);
    {
      const m = morn();
      if (m.length >= 3) {
        const [R, t1, t2] = m as string[];
        // و١) مجموعةٌ بهدفٍ واحدٍ: مساسُ الهدف يقتل المجموعةَ ويُبلِّغ الطالب
        const op1: any = await notifications.openSwapGroup({ clinicId: CID, weekStart: W, day, requesterId: R!, requesterName: nameOf(R!), targets: [{ id: t1!, name: nameOf(t1!) }] });
        await notifications.invalidateSwapsTouching({ weekStart: W, day, doctorIds: [t1!] });
        inv('و', 'هدفٌ واحدٌ مَسّه التغيير → كلُّ الكروت حُذفت', (await cards(op1.group)).length === 0);
        inv('و', 'وصل الطالبَ «تغيّر الجدول»', (await results(R!)).some((x) => /تغيّر الجدول/.test(x.body)));
        // و٢) مجموعةٌ بهدفين: مساسُ هدفٍ واحدٍ يُبطِل كرتَه فقط، والمجموعةُ تبقى حيّةً للآخر
        const op2: any = await notifications.openSwapGroup({ clinicId: CID, weekStart: W, day, requesterId: R!, requesterName: nameOf(R!), targets: [{ id: t1!, name: nameOf(t1!) }, { id: t2!, name: nameOf(t2!) }] });
        const before = (await results(R!)).length;
        await notifications.invalidateSwapsTouching({ weekStart: W, day, doctorIds: [t1!] });
        const left = await cards(op2.group);
        inv('و', 'إبطالٌ دقيق: كرتُ الهدف المتأثّر فقط حُذف', left.length === 1 && left[0]!.recipient_id === t2);
        inv('و', 'المجموعةُ بقيت حيّةً (لا إبلاغَ زائدًا للطالب)', (await results(R!)).length === before);
      } else console.log('  و) أقلّ من ٣ عياداتٍ صباحيّة — تخطّي');
    }
    await wipeTestNotifs();

    // ════════ ز) انتهاء المهلة ════════
    console.log('\n══ ز) انتهاء المهلة ══');
    await build(); day = 'monday'; dRows = await rows(day);
    {
      const m = morn();
      if (m.length >= 2) {
        const [R, t1] = m as string[];
        const op: any = await notifications.openSwapGroup({ clinicId: CID, weekStart: W, day, requesterId: R!, requesterName: nameOf(R!), targets: [{ id: t1!, name: nameOf(t1!) }] });
        const c = (await cards(op.group))[0]!;
        // اجعل المهلةَ ماضية (تحديث data بلا تغيير body → لا push)
        const newData = { ...c.data, expires_at: '2000-01-01T00:00:00.000Z' };
        await supabase.from('notifications').update({ data: newData }).eq('id', c.id);
        const acc: any = await notifications.acceptSwap({ notificationId: c.id, targetId: t1!, targetRole: 'doctor', targetName: nameOf(t1!) });
        inv('ز', 'قبولُ كرتٍ منتهٍ يفشل', !acc.success, acc.error || '');
        inv('ز', 'رسالةُ الفشل = انتهاء المهلة', /انتهت|مهلة/.test(acc.error || ''), acc.error || '');
      } else console.log('  ز) أقلّ من عيادتين — تخطّي');
    }
    await wipeTestNotifs();
  } finally {
    // نظافة: احذف ما أنشأناه، أعِد الجدول والإعداد، ثمّ أعِد رموزَ الدفع
    await wipeTestNotifs();
    await supabase.from('schedule_slots').delete().eq('clinic_id', CID).eq('week_start', W);
    await supabase.from('schedule_settings').update({ clinic_count: origCC }).eq('clinic_id', CID);
    if (savedTokens && savedTokens.length) await supabase.from('push_tokens').upsert(savedTokens);
    const back = (await supabase.from('push_tokens').select('user_id').in('user_id', holderIds.length ? holderIds : ['x'])).data?.length || 0;
    console.log(`\nرموزُ الدفع أُعيدت: ${back}/${(savedTokens || []).length}`);
  }

  console.log(`\n════════ النتيجة: ${pass} حدٌّ سليم / ${fail} خرق ════════`);
  if (fails.length) { console.log('الخروق:'); for (const f of fails) console.log('  • ' + f); }
  else console.log('✅ لا خرقَ لأيّ حدٍّ صارمٍ في طبقة التنسيق.');
  process.exit(fail ? 1 : 0);
}
main().catch((e) => { console.error('ERR', e.message, e.stack); process.exit(1); });
