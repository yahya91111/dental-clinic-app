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

// نافذة «الجلسة الواحدة»: طلباتٌ تُقدَّم معًا تصل خلال ثوانٍ (نداءات متتابعة). ما بعد
// هذه النافذة = جلسةٌ جديدة → كرت/إشعار مستقلّ، لا دمج مع السابق.
const BATCH_WINDOW_MS = 90 * 1000;

// ─── تسميات عربيّة للصياغة ─────────────────────────────────────
const DAY_AR: Record<WeekDay, string> = {
  sunday: 'الأحد', monday: 'الإثنين', tuesday: 'الثلاثاء',
  wednesday: 'الأربعاء', thursday: 'الخميس',
};
const periodLabel = (p: number): string =>
  ['', 'الأولى', 'الثانية', 'الثالثة', 'الرابعة'][p] || `${p}`;

/** «د. اسم» مرّة واحدة فقط — الأسماء المخزَّنة قد تحمل اللقب أصلاً (لا «د.د.»). */
const dr = (name?: string): string => {
  const n = (name || '').trim();
  if (!n) return '';
  return /^د\s*\./.test(n) ? n : `د.${n}`;
};

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
 * **يُجمَع**: عدّة طلبات/أيّام من الطبيب نفسه في الأسبوع نفسه → إشعار علمٍ **واحد** غير
 * مقروء، تُلحَق به بقيّة السطور (الأحد، الإثنين، الثلاثاء…) بدل إشعارٍ لكلّ يوم.
 * التجميع بـ (القائد، الطبيب، الأسبوع) ما دام الإشعار غير مقروء. يحتاج day للتمييز.
 * ملاحظة: تبديل طبيبين متّفقين لا يُستدعى هنا (لا إزعاج للّيدر).
 */
export async function notifyLeaderOfRequest(args: {
  clinicId: string;
  leaderId: string;
  senderId: string;
  senderName: string;
  summary: string;     // «مرضية يوم الأحد» — يصوغها المساعد
  weekStart?: string;  // للتجميع (طلبات نفس الأسبوع)
  day?: string;        // مفتاح التمييز (لا يتكرّر السطر لو أُعيد نفس اليوم)
}): Promise<NotifResult> {
  try {
    const now = Date.now();
    // إشعار علمٍ غير مقروء لنفس (القائد، الطبيب، الأسبوع) **ومن نفس الجلسة**؟ أَلحِق به.
    // خارج النافذة الزمنيّة = طلبٌ جديد منفصل → إشعار جديد.
    const { data: rows } = await supabase
      .from('notifications')
      .select('id, data, is_read')
      .eq('clinic_id', args.clinicId)
      .eq('recipient_id', args.leaderId)
      .eq('sender_id', args.senderId)
      .eq('type', NotifType.REQUEST_INFO)
      .eq('is_read', false);
    const existing = ((rows || []) as { id: string; data: any; is_read: boolean }[]).find(
      (r) =>
        (r.data?.week_start ?? '') === (args.weekStart ?? '') &&
        now - (r.data?.batch_at ?? 0) < BATCH_WINDOW_MS,
    );

    if (existing) {
      const items: { day?: string; summary: string }[] = Array.isArray(existing.data?.items)
        ? existing.data.items.slice()
        : existing.data?.summary
          ? [{ summary: existing.data.summary as string }]
          : [];
      const i = args.day != null ? items.findIndex((x) => x.day === args.day) : -1;
      const entry = { day: args.day, summary: args.summary };
      if (i >= 0) items[i] = entry; else items.push(entry);
      const body = `${args.senderName}: ${items.map((x) => x.summary).join('، ')}`;
      await supabase
        .from('notifications')
        .update({ data: { ...existing.data, items, week_start: args.weekStart, batch_at: now }, body, is_read: false })
        .eq('id', existing.id);
      return ok();
    }

    return sendInfo({
      clinicId: args.clinicId,
      recipientId: args.leaderId,
      senderId: args.senderId,
      senderName: args.senderName,
      type: NotifType.REQUEST_INFO,
      title: 'طلب جديد',
      body: `${args.senderName}: ${args.summary}`,
      data: { items: [{ day: args.day, summary: args.summary }], week_start: args.weekStart, batch_at: now },
    });
  } catch (e) {
    return fail(e instanceof Error ? e.message : 'خطأ غير متوقّع.');
  }
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
      `يوم ${DAY_AR[args.day]} — تبديل مع ${dr(args.absentDoctorName)}؟`;

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
      body: `وافق ${args.accepterName ? dr(args.accepterName) : 'زميلك'} وتمّت تغطية فترتك يوم ${DAY_AR[d.day]}.`,
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
    body: `يطلب ${dr(args.requesterName)} التبديل معك يوم ${DAY_AR[args.day]}.`,
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
}): Promise<NotifResult & { requesterId?: string; requesterName?: string; resultSent?: boolean; resultError?: string }> {
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
    const res = await sendInfo({
      clinicId: d.clinic_id, recipientId: d.requester_id,
      senderId: args.targetId, senderName: who,
      type: NotifType.REQUEST_RESULT, title: 'تمّ التبديل',
      body: `وافق ${who ? dr(who) : 'الطرف الآخر'} على التبديل يوم ${DAY_AR[d.day]} — تمّ.`,
    });
    return { success: true, requesterId: d.requester_id, requesterName: d.requester_name, resultSent: res.success, resultError: res.error };
  } catch (e) {
    return fail(e instanceof Error ? e.message : 'خطأ غير متوقّع.');
  }
}

/** رفض تبديلٍ: يثبّته مرفوضًا ويُبلِغ الطالب بالاعتذار */
export async function rejectSwap(args: {
  notificationId: string;
  targetName?: string;
}): Promise<NotifResult & { requesterId?: string; requesterName?: string; resultSent?: boolean; resultError?: string }> {
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
    const res = await sendInfo({
      clinicId: d.clinic_id, recipientId: d.requester_id,
      senderName: who,
      type: NotifType.REQUEST_RESULT, title: 'رُفض التبديل',
      body: `اعتذر ${who ? dr(who) : 'الطرف الآخر'} عن التبديل يوم ${DAY_AR[d.day]}.`,
    });
    return { success: true, requesterId: d.requester_id, requesterName: d.requester_name, resultSent: res.success, resultError: res.error };
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
  const reason = args.absentDoctorName ? ` (غياب ${dr(args.absentDoctorName)})` : '';
  const { id, error } = await sendAction({
    clinicId: args.clinicId, recipientId: args.leaderId,
    senderId: args.senderId, senderName: args.senderName,
    type: NotifType.GAP_ALERT, title: 'نقص يحتاج تغطية',
    body: `العيادة ${args.gap.clinicNumber} الفترة ${periodLabel(args.gap.period)} يوم ${DAY_AR[args.day]} بلا تغطية${reason}.`,
    data: {
      clinic_id: args.clinicId, week_start: args.weekStart, day: args.day, gap: args.gap,
      absent_doctor_name: args.absentDoctorName,
    },
  });
  return { success: !error, error, id };
}

/**
 * يفتح كرت تغطيةٍ للّيدر بنصٍّ افتتاحيّ **حتميّ جاهز** (يكتبه المحرّك ويُعرَض كما
 * هو). الذكاء لا يصوغ الافتتاحيّة — يقرؤها ويُكمل. صامت (لا رنّة) كنوع gap_alert.
 */
export async function alertLeaderCoverage(args: {
  clinicId: string;
  leaderId: string;
  weekStart: string;
  day: WeekDay;
  gap: Gap;
  brief: string;
  absentDoctorName?: string;
  twoPeriods?: { id: string; name: string } | null;
  reserves?: { id: string; name: string }[];
  senderId?: string;
  senderName?: string;
}): Promise<{ success: boolean; error?: string; id?: string }> {
  const { id, error } = await sendAction({
    clinicId: args.clinicId, recipientId: args.leaderId,
    senderId: args.senderId, senderName: args.senderName,
    type: NotifType.GAP_ALERT, title: 'نقص يحتاج تغطية',
    body: args.brief,
    data: {
      clinic_id: args.clinicId, week_start: args.weekStart, day: args.day, gap: args.gap,
      absent_doctor_name: args.absentDoctorName,
      two_periods: args.twoPeriods ?? null,
      reserves: args.reserves ?? [],
    },
  });
  return { success: !error, error, id };
}

/**
 * v2 — يُبلِغ القائد بنقصٍ نتج عن غياب طبيب، حاملًا **الحقائق المنظَّمة** (لا نصًّا
 * جاهزًا): أماكن النقص (عيادة/دليقيتر، بلا فترات) + زميل الفترتين + الاحتياطيّون.
 * الذكاء يصوغ الرسالة بصوته من هذه الحقائق عند فتح القائد للأوربّ. صامت كـ gap_alert.
 * إشعار واحد للحدث: يحلّ محلّ إشعار العلم حين يكون هناك نقص.
 */
export async function notifyLeaderCoverage(args: {
  clinicId: string;
  leaderId: string;
  weekStart: string;
  day: WeekDay;
  coverage: unknown; // CoverageBrief من requests_v2 (حقائق منظَّمة)
  senderId?: string;
  senderName?: string;
}): Promise<{ success: boolean; error?: string; id?: string }> {
  const c = args.coverage as { absentName?: string } | null;
  const { id, error } = await sendAction({
    clinicId: args.clinicId, recipientId: args.leaderId,
    senderId: args.senderId, senderName: args.senderName,
    type: NotifType.GAP_ALERT, title: 'نقص يحتاج تغطية',
    body: `نقصٌ يوم ${DAY_AR[args.day]}${c?.absentName ? ` بغياب ${dr(c.absentName)}` : ''}.`,
    data: {
      v: 2, clinic_id: args.clinicId, week_start: args.weekStart, day: args.day,
      coverage: args.coverage,
    },
  });
  return { success: !error, error, id };
}

/** نصّ جسم كرت النقص (للعرض في القائمة): أسماء الغائبين (الكرت قد يجمع أكثر من
 *  غائب لليوم نفسه — كلّ بندٍ يحمل absentName) + أيّام النقص الفعليّة. */
function coverageBody(
  absentName: string,
  days: { day: WeekDay; gaps?: unknown[]; absentName?: string }[],
): string {
  const gapEntries = days.filter((d) => (d.gaps?.length || 0) > 0);
  const names = [...new Set(gapEntries.map((d) => dr(d.absentName || absentName)).filter(Boolean))];
  const nameStr = names.length ? names.join(' و') : dr(absentName);
  const gapDays = [...new Set(gapEntries.map((d) => DAY_AR[d.day] || d.day))];
  return gapDays.length
    ? `نقصٌ بغياب ${nameStr} — ${gapDays.join('، ')}.`
    : `نقصٌ بغياب ${nameStr}.`;
}

/**
 * v2 متعدّد الأيّام **ومتعدّد الغائبين** — كرتٌ واحد للقائد:
 *  • أيّام غياب الطبيب نفسه (في الأسبوع نفسه ومن نفس الجلسة الزمنيّة) تُلحَق بكرته.
 *  • وغيابُ طبيبٍ **آخر في يومٍ فيه نقصٌ معلّق أصلًا** ينضمّ إلى الكرت نفسه (بلا قيد
 *    النافذة): طبيبان مرضية بنفس اليوم = كرتٌ واحد بأسمائهما، فيُقترح حلّ اليوم مرّةً
 *    واحدة. كلّ بندٍ في days[] يحمل (اليوم + هويّة غائبه) — اليوم قد يتكرّر بغائبَين.
 * يستبدل بند (اليوم، الغائب) إن تكرّر، ويُبطل الخيط المحفوظ كي يُعيد الذكاء صياغة
 * الكلّ دفعةً واحدة؛ وإلّا أنشأ كرتًا جديدًا — **فقط إن كان لهذا اليوم نقصٌ فعليّ**
 * (يومٌ بلا نقص وحده لا يستحقّ تنبيهًا، لكنه يُذكَر «مغطّى» إن انضمّ لكرتٍ فيه نقص).
 * dayBrief = CoverageBrief (gaps فارغة = يومٌ بلا نقص). صامت كـ gap_alert.
 */
export async function upsertLeaderCoverage(args: {
  clinicId: string;
  leaderId: string;
  weekStart: string;
  day: WeekDay;
  absentDoctorId: string;
  absentDoctorName: string;
  dayBrief: { day: WeekDay; gaps?: unknown[] } & Record<string, unknown>;
  dayHasGap: boolean;
  senderId?: string;
  senderName?: string;
}): Promise<{ success: boolean; error?: string; id?: string }> {
  try {
    const now = Date.now();
    const { data: rows } = await supabase
      .from('notifications')
      .select('id, data, action_status')
      .eq('clinic_id', args.clinicId)
      .eq('recipient_id', args.leaderId)
      .eq('type', NotifType.GAP_ALERT);
    const cards = ((rows || []) as { id: string; data: any; action_status: string | null }[]).filter(
      (r) => {
        const d = r.data || {};
        const pending = !r.action_status || r.action_status === 'pending';
        return pending && d.v === 2 && !d.placement && d.week_start === args.weekStart;
      },
    );
    // مالك البند: البنود الجديدة تحمل absentId؛ القديمة (بندٌ واحد لغائب الكرت) لا.
    const entryOwner = (x: Record<string, unknown>, d: any) =>
      String((x as { absentId?: string }).absentId || d?.absent_doctor_id || '');
    // ١) غيابٌ فيه نقص + كرتٌ معلّق فيه نقصٌ لليوم نفسه → انضمام (بلا قيد النافذة)
    // ٢) وإلّا: كرت الغائب نفسه من نفس الجلسة (النافذة الزمنيّة) — تجميع متعدّد الأيّام
    const sameDayCard = args.dayHasGap
      ? cards.find((r) =>
        (Array.isArray(r.data?.days) ? (r.data.days as { day: WeekDay; gaps?: unknown[] }[]) : [])
          .some((x) => x.day === args.day && (x.gaps?.length || 0) > 0))
      : undefined;
    const ownCard = cards.find(
      (r) => r.data?.absent_doctor_id === args.absentDoctorId
        && now - (r.data?.batch_at ?? 0) < BATCH_WINDOW_MS,
    );
    const existing = sameDayCard || ownCard;

    if (existing) {
      const days: { day: WeekDay }[] = Array.isArray(existing.data?.days) ? existing.data.days.slice() : [];
      const i = days.findIndex(
        (x) => x.day === args.day && entryOwner(x, existing.data) === args.absentDoctorId,
      );
      if (i >= 0) days[i] = args.dayBrief;
      else if (
        args.dayHasGap
        || existing.data?.absent_doctor_id === args.absentDoctorId
        || days.some((x) => entryOwner(x, existing.data) === args.absentDoctorId)
      ) {
        days.push(args.dayBrief);
      } else {
        // يومٌ بلا نقص لغائبٍ لا قصّة له في هذا الكرت — لا يُضاف ضجيجًا ولا يُمسّ الكرت
        return { success: true, id: existing.id };
      }
      const nextData = { ...existing.data, days, batch_at: now };
      delete (nextData as Record<string, unknown>).thread; // أبطِل الخيط ليُعاد التوليد بكلّ الأيّام
      // لو لم يبقَ أيّ نقص فعليّ (استُبدلت كلّ الأيّام بنسخٍ مغطّاة) → أغلِق الكرت كي لا
      // يبقى معلّقًا كاذبًا «نقص» بلا نقص.
      const anyGap = (days as { gaps?: unknown[] }[]).some((d) => (d.gaps?.length || 0) > 0);
      await supabase
        .from('notifications')
        .update({
          data: nextData,
          body: coverageBody(args.absentDoctorName, days as { day: WeekDay; gaps?: unknown[] }[]),
          is_read: !anyGap,                            // نقصٌ جديد → يحمرّ؛ لا نقص → يهدأ
          action_status: anyGap ? 'pending' : 'accepted',
        })
        .eq('id', existing.id);
      return { success: true, id: existing.id };
    }

    // لا كرت سابق → أنشئ فقط إن كان لهذا اليوم نقصٌ فعليّ
    if (!args.dayHasGap) return { success: true };
    const { id, error } = await sendAction({
      clinicId: args.clinicId, recipientId: args.leaderId,
      senderId: args.senderId, senderName: args.senderName,
      type: NotifType.GAP_ALERT, title: 'نقص يحتاج تغطية',
      body: coverageBody(args.absentDoctorName, [args.dayBrief]),
      data: {
        v: 2, clinic_id: args.clinicId, week_start: args.weekStart,
        absent_doctor_id: args.absentDoctorId, absent_doctor_name: args.absentDoctorName,
        days: [args.dayBrief], batch_at: now,
      },
    });
    return { success: !error, error, id };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : 'خطأ غير متوقّع.' };
  }
}

/**
 * v2 — كرت «عودة تحتاج مكانًا»: طبيبٌ ألغى حالته بنفسه ومكانه السابق مُغطًّى فلا
 * يُعاد تلقائيًّا — كرتُ فعلٍ للقائد يفتح خيطًا يسأله فيه الذكاء أين يضع العائد
 * (بلا اقتراحات) وينفّذ أمره. يُرسَل بدل إشعار العلم (لا الاثنين معًا — إشعار واحد
 * لكلّ حدث). لا يُكرَّر: كرتٌ معلّق لنفس (القائد، الأسبوع، اليوم، الطبيب) يُكتفى به.
 */
export async function alertLeaderPlacement(args: {
  clinicId: string;
  leaderId: string;
  weekStart: string;
  day: WeekDay;
  doctorId: string;
  doctorName: string;
  canceledStatusAr?: string;  // «مرضية» — لصياغة العنوان فقط
  senderId?: string;
  senderName?: string;
}): Promise<{ success: boolean; error?: string; id?: string }> {
  try {
    const { data: rows } = await supabase
      .from('notifications')
      .select('id, data, action_status')
      .eq('clinic_id', args.clinicId)
      .eq('recipient_id', args.leaderId)
      .eq('type', NotifType.GAP_ALERT);
    const dup = ((rows || []) as { id: string; data: any; action_status: string | null }[]).find((r) => {
      const d = r.data || {};
      const pending = !r.action_status || r.action_status === 'pending';
      return pending && d.v === 2 && d.placement
        && d.week_start === args.weekStart
        && d.placement.day === args.day
        && d.placement.doctor_id === args.doctorId;
    });
    if (dup) return { success: true, id: dup.id };

    const statusAr = args.canceledStatusAr || 'حالته';
    // العائد قد يكون القائد المستلِم نفسه (ألغى حالته بنفسه) → خاطِبه مباشرة
    const self = args.doctorId === args.leaderId;
    const { id, error } = await sendAction({
      clinicId: args.clinicId, recipientId: args.leaderId,
      senderId: args.senderId, senderName: args.senderName,
      type: NotifType.GAP_ALERT, title: 'عودة تحتاج مكانًا',
      body: self
        ? `ألغيتَ ${statusAr === 'حالته' ? 'حالتك' : 'ال' + statusAr} يوم ${DAY_AR[args.day]} ومكانك السابق مُغطًّى — حدّد أين تعود.`
        : `أُلغيت ${statusAr === 'حالته' ? 'حالة' : statusAr} ${dr(args.doctorName)} يوم ${DAY_AR[args.day]} ومكانه مُغطًّى — حدّد أين يوضَع.`,
      data: {
        v: 2, clinic_id: args.clinicId, week_start: args.weekStart,
        placement: {
          day: args.day, doctor_id: args.doctorId,
          doctor_name: args.doctorName, status_ar: statusAr,
        },
        batch_at: Date.now(),
      },
    });
    return { success: !error, error, id };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : 'خطأ غير متوقّع.' };
  }
}

/**
 * v2 — بعد وضع العائد فعليًّا في مكانٍ (place_in_clinic) تُغلَق كروت «عودة تحتاج
 * مكانًا» المطابقة عند **كلّ** القادة (قائدٌ يحلّ والبقيّة تُغلَق تلقائيًّا).
 * فشله لا يُفشل التنسيب.
 */
export async function resolvePlacementV2(args: {
  clinicId: string;
  weekStart: string;
  day: WeekDay;
  doctorId: string;
}): Promise<void> {
  try {
    const { data } = await supabase
      .from('notifications')
      .select('id, data, action_status')
      .eq('clinic_id', args.clinicId)
      .eq('type', NotifType.GAP_ALERT);
    const rows = (data || []) as { id: string; data: any; action_status: string | null }[];
    for (const r of rows) {
      const d = r.data || {};
      const pending = !r.action_status || r.action_status === 'pending';
      if (!pending || d.v !== 2 || !d.placement) continue;
      if (d.week_start !== args.weekStart) continue;
      if (d.placement.day !== args.day || d.placement.doctor_id !== args.doctorId) continue;
      await supabase
        .from('notifications')
        .update({ action_status: 'accepted', is_read: true })
        .eq('id', r.id);
    }
  } catch { /* إغلاق الكروت تحسينٌ — لا يُفشل التنسيب المنفَّذ */ }
}

/**
 * v2 — بعد **تنفيذ** التغطية فعليًّا (cover_gap / apply_coverage_option) يُحدِّث كروت
 * النقص عند **كلّ القادة** (قائدٌ واحد يحلّ، والبقيّة تُغلَق كروتهم تلقائيًّا):
 * يَشطب النقصَ المُغطّى من يومه في data.days[]؛ فإن لم يبقَ نقصٌ في أيّ يوم
 * أُغلق الكرت (accepted)، وإلّا بقي معلّقًا بالأيّام المتبقّية فقط. يُبطل الخيط
 * المحفوظ كي يُعاد توليده بالحقائق الجديدة. فشله لا يُفشل التغطية.
 */
export async function resolveCoverageV2(args: {
  clinicId: string;
  weekStart: string;
  day: WeekDay;
  absentDoctorId: string;
  /** ما الذي غُطّي: عيادة (برقمها إن عُرف) / دليقيتر / النقص المركّب كاملًا /
   *  اليوم كلّه يسقط من الكرت (إلغاء الحالة — لم يعد هناك غياب أصلًا) /
   *  أو fresh: حقائق اليوم أُعيد حسابها بعد التغطية (المعادلة من جديد — يدعم
   *  التغطية الجزئيّة: ما بقي نقصًا يظهر بمرشّحيه المحدَّثين لا البائتين) */
  covered: { kind: 'clinic'; clinicNumber?: number } | { kind: 'delegator' } | { kind: 'combo' } | { kind: 'all' }
    | { kind: 'fresh'; gaps: unknown[]; reserves?: unknown[] };
}): Promise<void> {
  try {
    const { data } = await supabase
      .from('notifications')
      .select('id, data, action_status')
      .eq('clinic_id', args.clinicId)
      .eq('type', NotifType.GAP_ALERT);
    const rows = (data || []) as { id: string; data: any; action_status: string | null }[];
    for (const r of rows) {
      const d = r.data || {};
      const pending = !r.action_status || r.action_status === 'pending';
      if (!pending || d.v !== 2) continue;
      if (d.week_start !== args.weekStart) continue;
      const days: { day: WeekDay; absentId?: string; gaps?: { kind?: string; clinicNumber?: number }[] }[] =
        Array.isArray(d.days) ? d.days.slice() : [];
      // الكرت قد يجمع أكثر من غائب — البند المستهدَف هو (اليوم، هذا الغائب) بعينه.
      // البنود القديمة بلا absentId مالكها غائب الكرت (absent_doctor_id).
      const i = days.findIndex(
        (x) => x.day === args.day && (x.absentId || d.absent_doctor_id) === args.absentDoctorId,
      );
      if (i < 0) continue;
      if (args.covered.kind === 'all') {
        // أُلغيت الحالة — لا غياب أصلًا → اليوم كلّه يسقط من الكرت
        days.splice(i, 1);
      } else if (args.covered.kind === 'fresh') {
        // استبدل حقائق اليوم بالمحسوبة حديثًا (لا نقص متبقٍّ → gaps فارغة واليوم يبقى «مغطّى»)
        days[i] = {
          ...days[i],
          gaps: args.covered.gaps as { kind?: string; clinicNumber?: number }[],
          ...(args.covered.reserves ? { reserves: args.covered.reserves } : {}),
        } as (typeof days)[number];
      } else {
        // اشطب النقص المُغطّى وحده — وأبقِ ما سواه في نفس اليوم
        const covered = args.covered;
        const gaps = (days[i].gaps || []).filter((g) => {
          if (covered.kind === 'combo') return g.kind !== 'delegator_combo';
          if (covered.kind === 'delegator') return g.kind !== 'delegator';
          if (g.kind !== 'clinic') return true;
          // عيادة: يبقى فقط إن عُرف الرقمان واختلفا
          return g.clinicNumber != null && covered.clinicNumber != null
            && g.clinicNumber !== covered.clinicNumber;
        });
        days[i] = { ...days[i], gaps };
      }
      const nextData = { ...d, days };
      delete (nextData as Record<string, unknown>).thread; // أعِد التوليد بالحقائق الجديدة
      const anyGap = days.some((x) => (x.gaps?.length || 0) > 0);
      await supabase
        .from('notifications')
        .update({
          data: nextData,
          body: days.length === 0
            ? `أُلغي غياب ${dr(d.absent_doctor_name || '')} — لا نقص.`
            : coverageBody(d.absent_doctor_name || '', days),
          is_read: !anyGap,                              // بقي نقص بيومٍ آخر → يبقى أحمر
          action_status: anyGap ? 'pending' : 'accepted', // لا نقص → أُغلق عند الجميع
        })
        .eq('id', r.id);
    }
  } catch { /* تحديث الكروت تحسينٌ — لا يُفشل التغطية المنفَّذة */ }
}

/**
 * يُنهي كروت النقص المطابقة (نفس العيادة/الفترة/اليوم/الأسبوع) بعد التغطية
 * الفعليّة — كي يخفت زرّ الذكاء ولا يبقى الكرت معلّقًا.
 */
export async function resolveGapAlert(args: {
  clinicId: string; weekStart: string; day: WeekDay; clinicNumber: number; period: number;
}): Promise<void> {
  const { data } = await supabase
    .from('notifications')
    .select('id, data, action_status')
    .eq('clinic_id', args.clinicId)
    .eq('type', NotifType.GAP_ALERT);
  const rows = (data || []) as { id: string; data: any; action_status: string | null }[];
  for (const r of rows) {
    const pending = !r.action_status || r.action_status === 'pending';
    if (!pending) continue;
    if (
      r.data?.week_start === args.weekStart && r.data?.day === args.day &&
      r.data?.gap?.clinicNumber === args.clinicNumber && r.data?.gap?.period === args.period
    ) {
      await supabase.from('notifications').update({ action_status: 'accepted', is_read: true }).eq('id', r.id);
    }
  }
}

// ─── تجميع التصدير ─────────────────────────────────────────────
export const notifications = {
  // إعلاميّ
  notifyScheduleCreated, notifyLeaderOfRequest, broadcast, resolveAudience,
  // تغطية
  openCoverageRequests, acceptCoverage, rejectCoverage, sweepCoverageGroup,
  // تبديل بموافقة
  openSwapRequest, acceptSwap, rejectSwap,
  // تصعيد للّيدر + الافتتاحيّة الحتميّة + تجميع متعدّد الأيّام + إنهاء الكرت بعد التغطية
  alertLeaderGap, alertLeaderCoverage, notifyLeaderCoverage, upsertLeaderCoverage, resolveGapAlert, resolveCoverageV2,
  alertLeaderPlacement, resolvePlacementV2,
};
