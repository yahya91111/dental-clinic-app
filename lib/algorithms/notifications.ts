// ═══════════════════════════════════════════════════════════════
// خوارزميّة الإشعارات — Notifications engine
// ═══════════════════════════════════════════════════════════════
// وحدة مستقلّة تُحوّل أحداث الطلبات إلى إشعارات. نوعان فقط:
//
//   • إعلاميّ (info)   → كرت في صفحة الإشعارات، لا يحتاج ردًّا.
//   • طلب قرار (action) → كرت ذكاء في صفحة الذكاء، يحتاج موافقة/رفضًا.
//
// مبدأ المايسترو: هذه الوحدة تحسب وتُرسل وتُطبّق فقط. الصياغة الحواريّة
// واختيار الحلّ يقودها مساعد الإشعارات. تستقبل كشف النقص من خوارزميّة
// الطلبات (detectGaps / findCoverageCandidates) وتُطبّق التبديل عبر
// swapInSchedule — هذا هو التسليم بين الوحدتين.
//
// قيد تقنيّ: لا مؤقّت خلفيّ. مهلة الـ24 ساعة تُخزَّن في data.expires_at
// وتُسقَط كسولًا عند العرض/الفحص (sweepCoverageGroup / pruneExpired).
// ═══════════════════════════════════════════════════════════════

import { supabase } from '../supabase';
import { createNotification, getAllGroupMembers } from '../database';
import {
  swapInSchedule,
  type WeekDay,
  type Shift,
  type Gap,
  type CoverageCandidate,
} from './requests';

// ─── أنواع ─────────────────────────────────────────────────────
export type NotifResult = { success: boolean; error?: string };
const ok = (): NotifResult => ({ success: true });
const fail = (error: string): NotifResult => ({ success: false, error });

/** أنواع الإشعارات في النظام */
export const NotifType = {
  SCHEDULE_CREATED: 'schedule_created', // info: أُنشئ جدول أسبوع
  REQUEST_INFO: 'request_info',         // info: إبلاغ الليدر بطلب/إلغاء
  BROADCAST: 'broadcast',               // info: إبلاغ الشفت/المركز
  COVERAGE_REQUEST: 'coverage_request', // action: طلب تغطية نقص (24س)
  SWAP_REQUEST: 'swap_request',         // action: تبديل طبيبين (موافقة)
  GAP_ALERT: 'gap_alert',               // action: تنبيه الليدر بنقصٍ يحتاج تصرّفًا
  REQUEST_RESULT: 'request_result',     // info: ردّ للطالب (تمّت الموافقة/الرفض)
} as const;

const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

// ─── تسميات عربيّة للصياغة ─────────────────────────────────────
const DAY_AR: Record<WeekDay, string> = {
  sunday: 'الأحد', monday: 'الإثنين', tuesday: 'الثلاثاء',
  wednesday: 'الأربعاء', thursday: 'الخميس',
};
const periodLabel = (p: number): string =>
  ['', 'الأولى', 'الثانية', 'الثالثة', 'الرابعة'][p] || `${p}`;

// ─── مُرسِلات أساسيّة ───────────────────────────────────────────
/** إشعار إعلاميّ (بلا action) — كرت في صفحة الإشعارات */
async function sendInfo(args: {
  clinicId?: string;
  recipientId: string;
  senderId?: string;
  senderName?: string;
  type: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
}): Promise<NotifResult> {
  const { error } = await createNotification({
    clinic_id: args.clinicId,
    recipient_id: args.recipientId,
    sender_id: args.senderId,
    sender_name: args.senderName,
    type: args.type,
    title: args.title,
    body: args.body,
    data: args.data,
    is_read: false, // يصل غير مقروء دائمًا (يحمّر الزرّ حتّى يُقرأ)
  });
  return error ? fail(error.message) : ok();
}

/** طلب قرار (action accept_reject pending) — كرت ذكاء في صفحة الذكاء */
async function sendAction(args: {
  clinicId?: string;
  recipientId: string;
  senderId?: string;
  senderName?: string;
  type: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
}): Promise<{ id?: string; error?: string }> {
  const { data, error } = await createNotification({
    clinic_id: args.clinicId,
    recipient_id: args.recipientId,
    sender_id: args.senderId,
    sender_name: args.senderName,
    type: args.type,
    title: args.title,
    body: args.body,
    data: args.data,
    action_type: 'accept_reject',
    action_status: 'pending',
    is_read: false,
  });
  return { id: data?.id, error: error?.message };
}

// ─── حلّ الجمهور (الشفت / المركز) ───────────────────────────────
type Member = { doctor_id: string; group_id?: string; work_status?: string };

/**
 * يُرجِع مُعرّفات أطباء المركز (كلّ القروبات) أو شفتٍ واحد (قروب محدّد).
 *  audience='center' → الجميع. audience='shift' → أعضاء groupId فقط.
 * يُستبعَد excludeId (عادةً صاحب الطلب نفسه).
 */
export async function resolveAudience(
  clinicId: string,
  audience: 'shift' | 'center',
  opts: { groupId?: string; excludeId?: string } = {},
): Promise<string[]> {
  const { data } = await getAllGroupMembers(clinicId);
  const members = (data || []) as Member[];
  const ids = members
    .filter((m) => (audience === 'center' ? true : m.group_id === opts.groupId))
    .map((m) => m.doctor_id)
    .filter((id) => id && id !== opts.excludeId);
  return Array.from(new Set(ids));
}

// ═══════════════════════════════════════════════════════════════
// إعلاميّ — info
// ═══════════════════════════════════════════════════════════════

/** إشعار إنشاء جدول أسبوع لكلّ أطباء العيادة (للعلم) */
export async function notifyScheduleCreated(args: {
  clinicId: string;
  weekStart: string;
  recipientIds?: string[]; // إن لم تُمرَّر تُجلَب كلّ أطباء العيادة
  senderId?: string;
  senderName?: string;
}): Promise<NotifResult> {
  try {
    const recipients =
      args.recipientIds && args.recipientIds.length
        ? args.recipientIds
        : await resolveAudience(args.clinicId, 'center');
    const title = 'جدول جديد';
    const body = `صدر جدول أسبوع ${args.weekStart}.`;
    for (const rid of recipients) {
      await sendInfo({
        clinicId: args.clinicId, recipientId: rid,
        senderId: args.senderId, senderName: args.senderName,
        type: NotifType.SCHEDULE_CREATED, title, body,
        data: { week_start: args.weekStart },
      });
    }
    return ok();
  } catch (e) {
    return fail(e instanceof Error ? e.message : 'خطأ غير متوقّع.');
  }
}

/**
 * إبلاغ الليدر بطلبٍ أو إلغاءٍ قدّمه طبيب (للعلم، تلقائيّ).
 * ملاحظة: تبديل طبيبين متّفقين لا يُستدعى هنا (لا إزعاج للّيدر).
 */
export async function notifyLeaderOfRequest(args: {
  clinicId: string;
  leaderId: string;
  senderId: string;
  senderName: string;
  summary: string; // «استئذان نهاية الدوام يوم الأحد» — يصوغها المساعد
}): Promise<NotifResult> {
  return sendInfo({
    clinicId: args.clinicId,
    recipientId: args.leaderId,
    senderId: args.senderId,
    senderName: args.senderName,
    type: NotifType.REQUEST_INFO,
    title: 'طلب جديد',
    body: `${args.senderName}: ${args.summary}`,
    data: { summary: args.summary },
  });
}

/** إبلاغ جمهورٍ (شفت/مركز) بحدثٍ — للعلم فقط (بعد سؤال «أبلغ المعنيّين؟») */
export async function broadcast(args: {
  clinicId: string;
  recipientIds: string[];
  senderId?: string;
  senderName?: string;
  title: string;
  body: string;
}): Promise<NotifResult> {
  try {
    for (const rid of args.recipientIds) {
      await sendInfo({
        clinicId: args.clinicId, recipientId: rid,
        senderId: args.senderId, senderName: args.senderName,
        type: NotifType.BROADCAST, title: args.title, body: args.body,
      });
    }
    return ok();
  } catch (e) {
    return fail(e instanceof Error ? e.message : 'خطأ غير متوقّع.');
  }
}

// ═══════════════════════════════════════════════════════════════
// طلب قرار — التغطية (24 ساعة، أوّل موافقة تُطبّق وتُلغي الباقي)
// ═══════════════════════════════════════════════════════════════

/** بيانات تُخزَّن مع كلّ طلب تغطية لتطبيق التبديل عند القبول */
type CoverageData = {
  coverage_group: string;
  stage: 'same_shift' | 'other_shift';
  expires_at: string;
  clinic_id: string;
  week_start: string;
  day: WeekDay;
  gap: Gap;
  absent_doctor_id: string;
  absent_doctor_name: string;
};

/**
 * يفتح طلبات تغطيةٍ لنقصٍ واحد: إشعار action لكلّ مرشّح، تشترك جميعها في
 * coverage_group واحد وتنتهي بعد 24 ساعة. القبول يُطبّق تبديلًا خانةً بخانة
 * بين الغائب والمُغطّي على نطاق الشفت، ويُلغي البقيّة بصمت.
 */
export async function openCoverageRequests(args: {
  clinicId: string;
  weekStart: string;
  day: WeekDay;
  gap: Gap;
  absentDoctorId: string;
  absentDoctorName: string;
  candidates: CoverageCandidate[];
  stage?: 'same_shift' | 'other_shift';
  senderId?: string;
  senderName?: string;
}): Promise<{ success: boolean; error?: string; groupId?: string; sent?: number }> {
  try {
    if (!args.candidates.length) return { success: false, error: 'لا يوجد مرشّحون للتغطية.' };
    const stage = args.stage ?? 'same_shift';
    const groupId = `cov_${args.clinicId}_${args.weekStart}_${args.day}_${args.gap.clinicNumber}_${args.gap.period}_${Date.now()}`;
    const expiresAt = new Date(Date.now() + TWENTY_FOUR_HOURS_MS).toISOString();
    const data: CoverageData = {
      coverage_group: groupId, stage, expires_at: expiresAt,
      clinic_id: args.clinicId, week_start: args.weekStart, day: args.day,
      gap: args.gap, absent_doctor_id: args.absentDoctorId, absent_doctor_name: args.absentDoctorName,
    };
    const title = 'طلب تغطية';
    const body =
      `تغطية العيادة ${args.gap.clinicNumber} الفترة ${periodLabel(args.gap.period)} ` +
      `يوم ${DAY_AR[args.day]} — تبديل مع د.${args.absentDoctorName}؟`;

    let sent = 0;
    for (const c of args.candidates) {
      const { error } = await sendAction({
        clinicId: args.clinicId, recipientId: c.doctorId,
        senderId: args.senderId, senderName: args.senderName,
        type: NotifType.COVERAGE_REQUEST, title, body, data,
      });
      if (!error) sent++;
    }
    return { success: sent > 0, groupId, sent, error: sent ? undefined : 'تعذّر إرسال الطلبات.' };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : 'خطأ غير متوقّع.' };
  }
}

/** يقرأ صفّ إشعار واحد (id, recipient_id, data, action_status) */
async function loadNotif(notificationId: string): Promise<{
  id: string; recipient_id: string; data: any; action_status: string | null;
} | null> {
  const { data, error } = await supabase
    .from('notifications')
    .select('id, recipient_id, data, action_status')
    .eq('id', notificationId)
    .single();
  if (error || !data) return null;
  return data as any;
}

const isExpired = (d: CoverageData): boolean =>
  !!d.expires_at && new Date(d.expires_at).getTime() < Date.now();

/**
 * قبول طلب تغطية: يُطبّق التبديل (خانة بخانة، نطاق الشفت) بين الغائب
 * والمُغطّي، يثبّت هذا الطلب «مقبولًا»، ويُلغي بقيّة طلبات المجموعة بصمت.
 * المُغطّي أحد طرفَي التبديل، فصلاحيّته كافية.
 */
export async function acceptCoverage(args: {
  notificationId: string;
  accepterId: string;
  accepterRole?: string;
  accepterName?: string;
}): Promise<NotifResult & { absentDoctorId?: string; absentDoctorName?: string }> {
  try {
    const notif = await loadNotif(args.notificationId);
    if (!notif) return fail('الطلب غير موجود.');
    const d = notif.data as CoverageData;
    if (!d?.coverage_group) return fail('بيانات الطلب ناقصة.');
    if (notif.action_status && notif.action_status !== 'pending') return fail('عولِج هذا الطلب مسبقًا.');
    if (isExpired(d)) return fail('انتهت مهلة الطلب.');

    // التبديل: الغائب ↔ المُغطّي خانةً بخانة. نفس الشفت → نطاق الشفت؛ الشفت
    // الآخر → اليوم كامل (كلٌّ يأخذ مكان الآخر مهما كان شفته/فترته/مكانه).
    const scope =
      d.stage === 'other_shift'
        ? { kind: 'day' as const }
        : { kind: 'shift' as const, shift: d.gap.shift };
    const swap = await swapInSchedule(
      { id: args.accepterId, role: args.accepterRole || 'doctor' },
      {
        clinicId: d.clinic_id, weekStart: d.week_start, day: d.day,
        doctorIds: [d.absent_doctor_id, args.accepterId],
        scope,
      },
    );
    if (!swap.success) return fail(swap.error || 'تعذّر تطبيق التبديل.');

    // ثبّت هذا «مقبولًا»، وألغِ البقيّة بصمت (حذف)
    await supabase
      .from('notifications')
      .update({ action_status: 'accepted', is_read: true })
      .eq('id', args.notificationId);
    await supabase
      .from('notifications')
      .delete()
      .filter('data->>coverage_group', 'eq', d.coverage_group)
      .neq('id', args.notificationId);

    // ردّ للطالب (الغائب): تمّت تغطية فترتك
    await sendInfo({
      clinicId: d.clinic_id, recipientId: d.absent_doctor_id,
      senderId: args.accepterId, senderName: args.accepterName,
      type: NotifType.REQUEST_RESULT, title: 'تمّت التغطية',
      body: `وافق ${args.accepterName ? 'د.' + args.accepterName : 'زميلك'} وتمّت تغطية فترتك يوم ${DAY_AR[d.day]}.`,
    });
    return { success: true, absentDoctorId: d.absent_doctor_id, absentDoctorName: d.absent_doctor_name };
  } catch (e) {
    return fail(e instanceof Error ? e.message : 'خطأ غير متوقّع.');
  }
}

/**
 * رفض طلب تغطية. يُرجِع allExhausted=true إن لم يبقَ في المجموعة طلبٌ
 * معلّق غير منتهٍ — عندها يصعّد المساعد (الشفت الآخر، ثمّ الليدر).
 */
export async function rejectCoverage(args: {
  notificationId: string;
}): Promise<NotifResult & { allExhausted?: boolean; groupId?: string; coverage?: CoverageData }> {
  try {
    const notif = await loadNotif(args.notificationId);
    if (!notif) return fail('الطلب غير موجود.');
    const d = notif.data as CoverageData;
    await supabase
      .from('notifications')
      .update({ action_status: 'rejected', is_read: true })
      .eq('id', args.notificationId);

    const outcome = await sweepCoverageGroup(d.coverage_group);
    // عند نفاد كلّ المرشّحين: أبلِغ الطالب (الغائب) أنّ التغطية لم تكتمل
    if (outcome === 'exhausted' && d?.absent_doctor_id) {
      await sendInfo({
        clinicId: d.clinic_id, recipientId: d.absent_doctor_id,
        type: NotifType.REQUEST_RESULT, title: 'لم تكتمل التغطية',
        body: `لم يوافق أحد على تغطية فترتك يوم ${DAY_AR[d.day]}.`,
      });
    }
    return { success: true, allExhausted: outcome === 'exhausted', groupId: d.coverage_group, coverage: d };
  } catch (e) {
    return fail(e instanceof Error ? e.message : 'خطأ غير متوقّع.');
  }
}

/**
 * يفحص مجموعة تغطيةٍ ويُسقط المنتهية كسولًا:
 *  - 'accepted'  : قُبِل أحد طلباتها.
 *  - 'pending'   : ما زال فيها طلبٌ حيّ (لم ينتهِ ولم يُرفَض).
 *  - 'exhausted' : رُفِض الجميع أو انتهت المهلة → يصعّد المساعد.
 * المنتهية المعلّقة تُحذف هنا (لا تبقى معروضة).
 */
export async function sweepCoverageGroup(
  groupId: string,
): Promise<'accepted' | 'pending' | 'exhausted'> {
  const { data } = await supabase
    .from('notifications')
    .select('id, data, action_status')
    .filter('data->>coverage_group', 'eq', groupId);
  const rows = (data || []) as { id: string; data: CoverageData; action_status: string | null }[];
  if (rows.some((r) => r.action_status === 'accepted')) return 'accepted';

  let livePending = false;
  for (const r of rows) {
    const pending = !r.action_status || r.action_status === 'pending';
    if (pending && isExpired(r.data)) {
      await supabase.from('notifications').delete().eq('id', r.id); // منتهٍ → أسقطه
    } else if (pending) {
      livePending = true;
    }
  }
  return livePending ? 'pending' : 'exhausted';
}

// ═══════════════════════════════════════════════════════════════
// طلب قرار — تبديل طبيبين (موافقة الطرف الآخر؛ لا إشعار للّيدر)
// ═══════════════════════════════════════════════════════════════

type SwapData = {
  clinic_id: string; week_start: string; day: WeekDay;
  doctor_ids: string[];
  scope: { kind: 'day' } | { kind: 'shift'; shift: Shift } | { kind: 'period'; period: number };
  requester_id: string; requester_name: string;
  target_id?: string; target_name?: string;
};

/** يرسل طلب تبديلٍ إلى الطرف الآخر لأخذ موافقته (action) */
export async function openSwapRequest(args: {
  clinicId: string;
  weekStart: string;
  day: WeekDay;
  requesterId: string;
  requesterName: string;
  targetId: string;
  targetName: string;
  scope: SwapData['scope'];
  doctorIds: string[];
}): Promise<{ success: boolean; error?: string; id?: string }> {
  const data: SwapData = {
    clinic_id: args.clinicId, week_start: args.weekStart, day: args.day,
    doctor_ids: args.doctorIds, scope: args.scope,
    requester_id: args.requesterId, requester_name: args.requesterName,
    target_id: args.targetId, target_name: args.targetName,
  };
  const { id, error } = await sendAction({
    clinicId: args.clinicId, recipientId: args.targetId,
    senderId: args.requesterId, senderName: args.requesterName,
    type: NotifType.SWAP_REQUEST, title: 'طلب تبديل',
    body: `يطلب د.${args.requesterName} التبديل معك يوم ${DAY_AR[args.day]}.`,
    data,
  });
  return { success: !error, error, id };
}

/** قبول تبديلٍ: يُطبّقه عبر المحرّك ويثبّته مقبولًا (لا إشعار للّيدر) */
export async function acceptSwap(args: {
  notificationId: string;
  targetId: string;
  targetRole?: string;
  targetName?: string;
}): Promise<NotifResult & { requesterId?: string; requesterName?: string }> {
  try {
    const notif = await loadNotif(args.notificationId);
    if (!notif) return fail('الطلب غير موجود.');
    const d = notif.data as SwapData;
    if (notif.action_status && notif.action_status !== 'pending') return fail('عولِج هذا الطلب مسبقًا.');
    const swap = await swapInSchedule(
      { id: args.targetId, role: args.targetRole || 'doctor' },
      { clinicId: d.clinic_id, weekStart: d.week_start, day: d.day, doctorIds: d.doctor_ids, scope: d.scope },
    );
    if (!swap.success) return fail(swap.error || 'تعذّر تطبيق التبديل.');
    await supabase
      .from('notifications')
      .update({ action_status: 'accepted', is_read: true })
      .eq('id', args.notificationId);

    // ردّ للطالب: تمّت الموافقة
    const who = args.targetName || d.target_name;
    await sendInfo({
      clinicId: d.clinic_id, recipientId: d.requester_id,
      senderId: args.targetId, senderName: who,
      type: NotifType.REQUEST_RESULT, title: 'تمّ التبديل',
      body: `وافق ${who ? 'د.' + who : 'الطرف الآخر'} على التبديل يوم ${DAY_AR[d.day]} — تمّ.`,
    });
    return { success: true, requesterId: d.requester_id, requesterName: d.requester_name };
  } catch (e) {
    return fail(e instanceof Error ? e.message : 'خطأ غير متوقّع.');
  }
}

/** رفض تبديلٍ: يثبّته مرفوضًا ويُبلِغ الطالب بالاعتذار */
export async function rejectSwap(args: {
  notificationId: string;
  targetName?: string;
}): Promise<NotifResult & { requesterId?: string; requesterName?: string }> {
  try {
    const notif = await loadNotif(args.notificationId);
    if (!notif) return fail('الطلب غير موجود.');
    const d = notif.data as SwapData;
    await supabase
      .from('notifications')
      .update({ action_status: 'rejected', is_read: true })
      .eq('id', args.notificationId);

    // ردّ للطالب: اعتذر الطرف الآخر
    const who = args.targetName || d.target_name;
    await sendInfo({
      clinicId: d.clinic_id, recipientId: d.requester_id,
      senderName: who,
      type: NotifType.REQUEST_RESULT, title: 'رُفض التبديل',
      body: `اعتذر ${who ? 'د.' + who : 'الطرف الآخر'} عن التبديل يوم ${DAY_AR[d.day]}.`,
    });
    return { success: true, requesterId: d.requester_id, requesterName: d.requester_name };
  } catch (e) {
    return fail(e instanceof Error ? e.message : 'خطأ غير متوقّع.');
  }
}

// ═══════════════════════════════════════════════════════════════
// طلب قرار — تنبيه الليدر بنقصٍ يحتاج تصرّفًا (تصعيد)
// ═══════════════════════════════════════════════════════════════

/**
 * يصعّد نقصًا غير مُغطّى إلى الليدر (action) — حين يرفض الجميع أو تنتهي
 * المهلة. المساعد بعدها يعرض على الليدر قائمة الحلول.
 */
export async function alertLeaderGap(args: {
  clinicId: string;
  leaderId: string;
  weekStart: string;
  day: WeekDay;
  gap: Gap;
  absentDoctorName?: string;
  senderId?: string;
  senderName?: string;
}): Promise<{ success: boolean; error?: string; id?: string }> {
  const reason = args.absentDoctorName ? ` (غياب د.${args.absentDoctorName})` : '';
  const { id, error } = await sendAction({
    clinicId: args.clinicId, recipientId: args.leaderId,
    senderId: args.senderId, senderName: args.senderName,
    type: NotifType.GAP_ALERT, title: 'نقص يحتاج تغطية',
    body: `العيادة ${args.gap.clinicNumber} الفترة ${periodLabel(args.gap.period)} يوم ${DAY_AR[args.day]} بلا تغطية${reason}.`,
    data: {
      clinic_id: args.clinicId, week_start: args.weekStart, day: args.day, gap: args.gap,
    },
  });
  return { success: !error, error, id };
}

// ─── تجميع التصدير ─────────────────────────────────────────────
export const notifications = {
  // إعلاميّ
  notifyScheduleCreated, notifyLeaderOfRequest, broadcast, resolveAudience,
  // تغطية
  openCoverageRequests, acceptCoverage, rejectCoverage, sweepCoverageGroup,
  // تبديل بموافقة
  openSwapRequest, acceptSwap, rejectSwap,
  // تصعيد للّيدر
  alertLeaderGap,
};
