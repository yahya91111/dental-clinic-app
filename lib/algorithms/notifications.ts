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
  TRAINEE_ATTACHED: 'trainee_attached', // info: للمدرّب — أُلحق به متدرّب لهذا اليوم
  COVERAGE_FILL: 'coverage_fill',       // action: ترتيب تعويض نقصٍ جاهز — للقائد [نفّذ]
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
  standalone?: boolean; // حدثٌ مميَّز (إلغاء/إرجاع) لا يُدمَج في إشعار سابق — إشعار جديد دائمًا
}): Promise<NotifResult> {
  try {
    const now = Date.now();
    // الإلغاء/الإرجاع يصل **مستقلًّا** (standalone): حدثٌ مميَّز لا يُدمَج في إشعار
    // التسجيل السابق — وإلّا اختفى خبرُه بإحلاله محلّ بند نفس اليوم (فيظنّ القائد
    // أنّ شيئًا لم يصل). الطلبات العاديّة تُجمَّع كالمعتاد.
    if (!args.standalone) {
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

/** ترتيب تعويض نقصٍ جاهز — كرت [نفّذ] للقائد. الفرق محسوبٌ في الكود (لا يُكشَف
 *  «إعادة توزيع الشفت» — سرّيّة الآليّة). يُحذف القائم المعلّق لنفس (القائد/اليوم/
 *  الشفت) ويُنشأ محدَّثًا، فلا تكرار. */
export async function notifyCoverageFill(args: {
  clinicId: string;
  leaderId: string;
  weekStart: string;
  day: WeekDay;
  shift: 'morning' | 'evening';
  absentNames: string[];
  diff: { seat: string; from: string; to: string }[];
  slots: Record<string, unknown>[];
}): Promise<NotifResult> {
  try {
    // أزِل القائم المعلّق لنفس الموقف (إنعاشٌ لا تكرار)
    const { data: existing } = await supabase
      .from('notifications')
      .select('id, data')
      .eq('clinic_id', args.clinicId)
      .eq('recipient_id', args.leaderId)
      .eq('type', NotifType.COVERAGE_FILL)
      .eq('action_status', 'pending');
    for (const r of (existing || []) as { id: string; data: any }[]) {
      if (r.data?.day === args.day && r.data?.shift === args.shift
        && (r.data?.week_start ?? '') === args.weekStart) {
        await supabase.from('notifications').delete().eq('id', r.id);
      }
    }
    const shiftAr = args.shift === 'morning' ? 'صباحًا' : 'مساءً';
    const names = args.absentNames.length ? args.absentNames.map(dr).join(' و') : 'النقص';
    const { error } = await createNotification({
      clinic_id: args.clinicId,
      recipient_id: args.leaderId,
      type: NotifType.COVERAGE_FILL,
      title: 'تعويض نقص',
      body: `ترتيب تعويض نقص ${names} — ${DAY_AR[args.day]} ${shiftAr}.`,
      data: {
        kind: 'coverage_fill', day: args.day, shift: args.shift,
        absent_names: args.absentNames, diff: args.diff, slots: args.slots,
        week_start: args.weekStart, batch_at: Date.now(),
      },
      action_type: 'execute',
      action_status: 'pending',
      is_read: false,
    });
    return error ? fail(error.message) : ok();
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

/** إبلاغ المدرّب أنّ متدرّبًا أُلحق به في عيادته ذلك اليوم (للعلم) */
export async function notifyTraineeAttached(args: {
  clinicId: string;
  supervisorId: string;
  traineeName: string;
  day: WeekDay;
  weekStart: string;
  senderId?: string;
  senderName?: string;
}): Promise<NotifResult> {
  try {
    return await sendInfo({
      clinicId: args.clinicId, recipientId: args.supervisorId,
      senderId: args.senderId, senderName: args.senderName,
      type: NotifType.TRAINEE_ATTACHED,
      title: 'متدرّب معك اليوم',
      body: `سيكون ${dr(args.traineeName)} معك في عيادتك يوم ${DAY_AR[args.day]} (لهذا اليوم فقط).`,
      data: { week_start: args.weekStart, day: args.day },
    });
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

    // القفل الذرّيّ أوّلًا — قبل أيّ تنفيذٍ في الجدول (لا يقبله إلّا واحد)
    const { data: claimed } = await supabase
      .from('notifications')
      .update({ action_status: 'accepted', is_read: true })
      .eq('id', args.notificationId)
      .eq('action_status', 'pending')
      .select('id');
    if (!claimed || claimed.length === 0) return fail('عولِج هذا الطلب مسبقًا.');

    // سباق الإخوة: شقيقٌ آخر حجز كرته في اللحظة نفسها؟ من رأى محجوزًا قبله
    // انسحب وطوى كرته قبل أيّ تنفيذ — فلا تُطبَّق التغطية مرّتين أبدًا.
    const { data: siblings } = await supabase
      .from('notifications')
      .select('id, action_status')
      .filter('data->>coverage_group', 'eq', d.coverage_group);
    if ((siblings || []).some(
      (r: { id: string; action_status: string | null }) =>
        r.id !== args.notificationId && r.action_status === 'accepted',
    )) {
      await supabase.from('notifications').delete().eq('id', args.notificationId);
      return fail('سبقك زميلٌ آخر — انتهى الطلب.');
    }

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
    if (!swap.success) {
      // تعذّر التنفيذ → يُفكّ الحجز ويعود الكرت قابلًا للضغط (لا موت صامت)
      await supabase
        .from('notifications')
        .update({ action_status: 'pending' })
        .eq('id', args.notificationId);
      return fail(swap.error || 'تعذّر تطبيق التبديل.');
    }

    // ألغِ البقيّة بصمت (حذف)
    await supabase
      .from('notifications')
      .delete()
      .filter('data->>coverage_group', 'eq', d.coverage_group)
      .neq('id', args.notificationId);

    // التغطية حرّكت الجدول → طلبات تبديلٍ معلّقة لطرفيها تُبطَل ويُبلَّغ أصحابها
    await invalidateSwapsTouching({
      weekStart: d.week_start, day: d.day,
      doctorIds: [d.absent_doctor_id, args.accepterId],
    });

    // إنعاش كروت النقص عند **كلّ** القادة: زميلٌ قبِل التغطية فسُدّ النقص — أعِد
    // حساب حقائق اليوم (المعادلة من جديد) كي ينطفئ الأحمر الكاذب ولا يبقى الكرت
    // معلّقًا «يوجد نقص» بلا نقص. يُنعَش كلّ غائبي اليوم لا المُغطَّى وحده: المُغطّي
    // صار مشغولًا فقد يسقط من اقتراحات غائبٍ آخر في الكرت نفسه. فشله لا يُفشل التغطية.
    try {
      const { computeDayCoverageBriefs } = await import('./requests_v2');
      const briefs = await computeDayCoverageBriefs({
        clinicId: d.clinic_id, weekStart: d.week_start, day: d.day,
      });
      const ids = new Set(briefs.map((b) => b.absentId));
      const all = ids.has(d.absent_doctor_id)
        ? briefs
        : [...briefs, { day: d.day, absentId: d.absent_doctor_id, absentName: d.absent_doctor_name, gaps: [], reserves: [] }];
      for (const b of all) {
        await resolveCoverageV2({
          clinicId: d.clinic_id, weekStart: d.week_start, day: d.day,
          absentDoctorId: b.absentId,
          covered: { kind: 'fresh', gaps: b.gaps, reserves: b.reserves },
        });
      }
    } catch { /* إنعاش الكروت تحسينٌ — لا يُفشل التغطية المنفَّذة */ }

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
// طلب قرار — طلب تبديل مراكز (v2): مجموعة كروت، أوّل موافقٍ يفوز
// ═══════════════════════════════════════════════════════════════
// الطلب الواحد قد يذهب لعدّة أطبّاء (كرتٌ لكلّ مستلم، يجمعها swap_group).
// • الصلاحيّة: ٢٤ ساعة أو دخول يوم التبديل — أيّهما أقرب (إسقاط كسول).
// • القبول ذرّيّ: أوّل من يوافق يُنفَّذ معه فورًا وتختفي كروت البقيّة.
// • الرفض صامت للطالب؛ رفض الجميع (أو انتهاء الكلّ) → إشعار «لم يقبل أحد» مرّة.
// • إعادة فحص الصلاحيّة لحظة الموافقة (المحرّك يرفض إن تغيّر الجدول).

type SwapDataV2 = {
  v: 2;
  clinic_id: string; week_start: string; day: WeekDay;
  requester_id: string; requester_name: string;
  target_id: string; target_name: string;
  swap_group: string;
  expires_at: string; // ISO
  /** وسم تبديل الاستئذان: لتصعيد الكرت للقائد فقط بعد رفض الشفتين، وإعادة العرض للطالب. */
  perm?: PermSwapTag;
};

/** وسم مجموعة تبديلٍ ناتجةٍ عن استئذانٍ يتعارض مع استلام صاحبه لوقته. */
export type PermSwapTag = {
  blocked: number[];          // الفترة المحجوبة (لإعادة الحساب وكرت القائد)
  targetPeriod?: number;      // فترة شفت الطالب نفسه (لإعادة عرض «الفترة»)
  side: 'same' | 'other';     // الجانب المستهدَف في هذه المجموعة (نفس الشفت / الآخر)
  statusAr: string;           // «استئذان نهاية الدوام» — لكرت القائد
  leaderIds: string[];        // قادة العيادة (للتصعيد عند رفض الشفتين)
};

const DAY_INDEX: Record<WeekDay, number> = {
  sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4,
};

/** صلاحيّة طلب التبديل: ٢٤ ساعة أو بداية يوم التبديل — أيّهما أقرب.
 *  اليوم بدأ أصلًا (طلبٌ ليومه)؟ حتى نهاية اليوم أو ٢٤ ساعة. */
function swapExpiry(weekStart: string, day: WeekDay): string {
  const now = Date.now();
  const dayStart = new Date(`${weekStart}T00:00:00`);
  dayStart.setDate(dayStart.getDate() + DAY_INDEX[day]);
  const startMs = dayStart.getTime();
  const in24h = now + TWENTY_FOUR_HOURS_MS;
  const cap = startMs > now ? startMs : startMs + TWENTY_FOUR_HOURS_MS; // بدأ اليوم → نهايته
  return new Date(Math.min(in24h, cap)).toISOString();
}

const swapExpired = (d: SwapDataV2): boolean =>
  !!d.expires_at && new Date(d.expires_at).getTime() < Date.now();

/** كروت مجموعة تبديل */
async function loadSwapGroup(group: string): Promise<{
  id: string; recipient_id: string; data: SwapDataV2; action_status: string | null;
}[]> {
  const { data } = await supabase
    .from('notifications')
    .select('id, recipient_id, data, action_status')
    .eq('type', NotifType.SWAP_REQUEST)
    .filter('data->>swap_group', 'eq', group);
  return (data || []) as { id: string; recipient_id: string; data: SwapDataV2; action_status: string | null }[];
}

const isPendingRow = (s: string | null) => !s || s === 'pending';

/** «لم يقبل أحد» للطالب — مرّة واحدة لكلّ مجموعة (يتحقّق من عدم سبق الإرسال). */
async function notifyGroupExhausted(group: string, d: SwapDataV2): Promise<void> {
  const { data } = await supabase
    .from('notifications')
    .select('id')
    .eq('type', NotifType.REQUEST_RESULT)
    .filter('data->>swap_group', 'eq', group)
    .limit(1);
  if (data && data.length > 0) return; // أُبلغ سابقًا
  await sendInfo({
    clinicId: d.clinic_id, recipientId: d.requester_id,
    type: NotifType.REQUEST_RESULT, title: 'طلب التبديل',
    body: `لم يقبل أحدٌ طلب التبديل يوم ${DAY_AR[d.day]}.`,
    data: { swap_v2: true, swap_group: group },
  });
  // تبديل استئذان: رُفض هذا الجانب كاملًا → أعِد العرض للجانب الآخر، أو صعّد للقائد.
  if (d.perm) await escalatePermSwap(d);
}

/**
 * تصعيد تبديل الاستئذان بعد رفض جانبٍ كاملًا: إن بقي الجانب الآخر (الشفت/الفترة)
 * غير مُجرَّبٍ وفيه مرشّحون → كرتُ ذكاءٍ للطالب يعيد العرض (يضغط بنفسه، أورب أحمر).
 * رُفض الجانبان (أو لا مرشّحين) → كرت «استئذان يحتاج ترتيبًا» للقادة (المشكلة الحقيقيّة).
 */
async function escalatePermSwap(d: SwapDataV2): Promise<void> {
  try {
    if (!d.perm) return;
    const otherSide: 'same' | 'other' = d.perm.side === 'other' ? 'same' : 'other';
    // هل جُرّب الجانب الآخر أصلًا لنفس (الطالب، الأسبوع، اليوم)؟
    const { data: groups } = await supabase
      .from('notifications')
      .select('data')
      .eq('type', NotifType.SWAP_REQUEST)
      .filter('data->>requester_id', 'eq', d.requester_id)
      .filter('data->>week_start', 'eq', d.week_start)
      .filter('data->>day', 'eq', d.day);
    const triedSides = new Set(
      ((groups || []) as { data: SwapDataV2 }[]).map((g) => g.data?.perm?.side).filter(Boolean),
    );
    if (!triedSides.has(otherSide)) {
      const { requestsV2 } = await import('./requests_v2');
      const mode = otherSide === 'other'
        ? { kind: 'other_shift' as const }
        : { kind: 'period' as const, period: d.perm.targetPeriod ?? 0 };
      const listed = await requestsV2.listSwapTargets({
        clinicId: d.clinic_id, weekStart: d.week_start, day: d.day,
        requesterId: d.requester_id, mode, excludePeriods: d.perm.blocked,
      });
      if (listed.success && (listed.targets?.length || 0) > 0) {
        await offerPermRetry(d, otherSide); // كرت ذكاءٍ للطالب — يضغط الجانب الآخر بنفسه
        return;
      }
    }
    // رُفض الجانبان (أو لا مرشّحين متبقّين) → كرت القائد عند كلّ القادة
    for (const leaderId of d.perm.leaderIds) {
      await alertLeaderPermissionConflict({
        clinicId: d.clinic_id, leaderId,
        weekStart: d.week_start, day: d.day,
        doctorId: d.requester_id, doctorName: d.requester_name,
        statusAr: d.perm.statusAr,
        senderId: d.requester_id, senderName: d.requester_name,
      });
    }
  } catch { /* التصعيد تحسينٌ — لا يُفشل الرفض */ }
}

/** كرتُ ذكاءٍ للطالب (أورب أحمر) يعرض زرّ طلب التبديل من الجانب الآخر بعد رفض جانبٍ. */
async function offerPermRetry(d: SwapDataV2, side: 'same' | 'other'): Promise<void> {
  if (!d.perm) return;
  await sendAction({
    clinicId: d.clinic_id, recipientId: d.requester_id,
    senderId: d.requester_id, senderName: d.requester_name,
    type: NotifType.GAP_ALERT, title: 'لم يقبل أحد — جرّب الجانب الآخر',
    body: side === 'other'
      ? `لم يقبل أحدٌ التبديل في فترتك يوم ${DAY_AR[d.day]}. تطلب من الشفت الآخر؟`
      : `لم يقبل أحدٌ من الشفت الآخر يوم ${DAY_AR[d.day]}. تطلب من فترتك؟`,
    data: {
      v: 2, clinic_id: d.clinic_id, week_start: d.week_start,
      perm_retry: {
        day: d.day, side,
        blocked: d.perm.blocked,
        target_period: d.perm.targetPeriod,
        status_ar: d.perm.statusAr,
        leader_ids: d.perm.leaderIds,
        requester_name: d.requester_name,
      },
      batch_at: Date.now(),
    },
  });
}

/** إن ماتت المجموعة كلّها (لا معلّق ولا مقبول) → أبلغ الطالب مرّة. */
async function sweepSwapGroup(group: string): Promise<void> {
  const rows = await loadSwapGroup(group);
  if (rows.length === 0) return;
  if (rows.some((r) => r.action_status === 'accepted')) return;
  // أسقط المعلّق المنتهي
  let livePending = false;
  for (const r of rows) {
    if (!isPendingRow(r.action_status)) continue;
    if (swapExpired(r.data)) await supabase.from('notifications').delete().eq('id', r.id);
    else livePending = true;
  }
  if (!livePending) await notifyGroupExhausted(group, rows[0]!.data);
}

/**
 * أبطل طلبات التبديل المعلّقة التي مسّها تغييرٌ ناجح في الجدول (تبديل/تغطية):
 * كلّ كرتٍ معلّقٍ لنفس الأسبوع/اليوم أحدُ المعنيّين طالبُه أو مستلمُه → يُحذف.
 * ماتت مجموعةٌ بذلك كلّها؟ يُبلَّغ طالبها مرّةً: تغيّر الجدول — أعد الإرسال إن شئت.
 * المجموعة المنفَّذة نفسها تُستثنى (نجاحها بلاغُها).
 */
export async function invalidateSwapsTouching(args: {
  weekStart: string;
  day: WeekDay;
  doctorIds: string[];
  excludeGroup?: string;
}): Promise<void> {
  try {
    const ids = new Set(args.doctorIds);
    const { data } = await supabase
      .from('notifications')
      .select('id, data, action_status')
      .eq('type', NotifType.SWAP_REQUEST)
      .filter('data->>week_start', 'eq', args.weekStart)
      .filter('data->>day', 'eq', args.day);
    const touched = ((data || []) as { id: string; data: SwapDataV2; action_status: string | null }[])
      .filter((r) => r.data?.v === 2 && r.data.swap_group !== args.excludeGroup
        && isPendingRow(r.action_status)
        && (ids.has(r.data.requester_id) || ids.has(r.data.target_id)));
    if (touched.length === 0) return;
    const groups = new Map<string, SwapDataV2>();
    for (const r of touched) {
      await supabase.from('notifications').delete().eq('id', r.id);
      groups.set(r.data.swap_group, r.data);
    }
    for (const [group, d] of groups) {
      const remaining = await loadSwapGroup(group);
      if (remaining.some((r) => isPendingRow(r.action_status) || r.action_status === 'accepted')) continue;
      await sendInfo({
        clinicId: d.clinic_id, recipientId: d.requester_id,
        type: NotifType.REQUEST_RESULT, title: 'طلب التبديل',
        body: `تغيّر الجدول يوم ${DAY_AR[d.day]} فأُغلق طلب التبديل — أعد إرساله إن ما زلت تريده.`,
        data: { swap_v2: true, swap_group: group },
      });
    }
  } catch { /* تنظيف غير حرج — لا يُفشل العمليّة الأصل */ }
}

/** قادة العيادة (لإشعار العلم عند تبديلٍ بين شفتين) */
async function clinicLeaderIds(clinicId: string): Promise<string[]> {
  const { data } = await supabase
    .from('doctors')
    .select('id')
    .eq('clinic_id', clinicId)
    .eq('role', 'team_leader');
  return ((data as { id: string }[] | null) || []).map((r) => r.id).filter(Boolean);
}

/** تبديل بين شفتين تمّ → علمٌ لكلّ القادة (عدا الطرفين والمستثنى). */
export async function notifyLeadersCrossShiftSwap(args: {
  clinicId: string;
  day: WeekDay;
  aName: string;
  bName: string;
  excludeIds?: string[];
}): Promise<void> {
  const skip = new Set(args.excludeIds || []);
  const leaders = await clinicLeaderIds(args.clinicId);
  for (const id of leaders) {
    if (skip.has(id)) continue;
    await sendInfo({
      clinicId: args.clinicId, recipientId: id,
      type: NotifType.REQUEST_INFO, title: 'تبديل بين الشفتين',
      body: `تمّ تبديلٌ بين ${dr(args.aName)} و${dr(args.bName)} يوم ${DAY_AR[args.day]} (شفتان مختلفان).`,
    });
  }
}

/**
 * يفتح طلب تبديل: كرتٌ (موافق/رفض) لكلّ مستلم، تجمعها مجموعة واحدة.
 * طلبٌ معلّقٌ قائمٌ لنفس الطالب/اليوم/الأسبوع → رفض (يُلغى أوّلًا أو يُنتظر).
 */
export async function openSwapGroup(args: {
  clinicId: string;
  weekStart: string;
  day: WeekDay;
  requesterId: string;
  requesterName: string;
  targets: { id: string; name: string }[];
  perm?: PermSwapTag;
}): Promise<{ success: boolean; error?: string; count?: number; group?: string }> {
  try {
    if (args.targets.length === 0) return { success: false, error: 'لا مستلمين للطلب.' };
    // يومٌ انقضى → الطلب يولد منتهيًا ويُحذف قبل أن يُرى — ارفض بصراحةٍ بدل موتٍ صامت
    if (new Date(swapExpiry(args.weekStart, args.day)).getTime() <= Date.now()) {
      return { success: false, error: `يوم ${DAY_AR[args.day]} انقضى — لا يُفتح طلب تبديلٍ ليومٍ مضى.` };
    }
    // منع الازدواج: طلب معلّق حيّ لنفس اليوم
    const { data: existing } = await supabase
      .from('notifications')
      .select('id, data, action_status')
      .eq('type', NotifType.SWAP_REQUEST)
      .filter('data->>requester_id', 'eq', args.requesterId)
      .filter('data->>week_start', 'eq', args.weekStart)
      .filter('data->>day', 'eq', args.day);
    for (const r of (existing || []) as { id: string; data: SwapDataV2; action_status: string | null }[]) {
      if (!isPendingRow(r.action_status)) continue;
      if (swapExpired(r.data)) {
        await supabase.from('notifications').delete().eq('id', r.id);
      } else {
        return { success: false, error: 'لديك طلب تبديلٍ قائمٌ لهذا اليوم — ألغِه أوّلًا أو انتظر نتيجته.' };
      }
    }

    // تقاطع: مستهدفٌ لديه هو طلبٌ معلّقٌ موجّهٌ إليك لنفس اليوم → لا كرت له
    // (يُردّ على طلبه بدل طلبٍ مضادّ يلغيه التنفيذان معًا). بقي غيره؟ يُرسَل للبقيّة.
    const { data: reverse } = await supabase
      .from('notifications')
      .select('id, data, action_status')
      .eq('type', NotifType.SWAP_REQUEST)
      .filter('data->>target_id', 'eq', args.requesterId)
      .filter('data->>week_start', 'eq', args.weekStart)
      .filter('data->>day', 'eq', args.day);
    const crossing = new Set<string>();
    for (const r of (reverse || []) as { data: SwapDataV2; action_status: string | null }[]) {
      if (isPendingRow(r.action_status) && !swapExpired(r.data)) crossing.add(r.data.requester_id);
    }
    const targets = args.targets.filter((t) => !crossing.has(t.id));
    if (targets.length === 0) {
      return {
        success: false,
        error: args.targets.length === 1
          ? 'لديه طلب تبديلٍ موجّهٌ إليك أصلًا لهذا اليوم — ردّ عليه من إشعاراتك بدل طلبٍ مضادّ.'
          : 'لديهم طلبات تبديلٍ موجّهةٌ إليك أصلًا لهذا اليوم — ردّ عليها من إشعاراتك بدل طلبٍ مضادّ.',
      };
    }

    const group = `${args.requesterId}|${args.weekStart}|${args.day}|${Date.now()}`;
    const expiresAt = swapExpiry(args.weekStart, args.day);
    let sent = 0;
    for (const t of targets) {
      const data: SwapDataV2 = {
        v: 2,
        clinic_id: args.clinicId, week_start: args.weekStart, day: args.day,
        requester_id: args.requesterId, requester_name: args.requesterName,
        target_id: t.id, target_name: t.name,
        swap_group: group, expires_at: expiresAt,
        ...(args.perm ? { perm: args.perm } : {}),
      };
      const { error } = await sendAction({
        clinicId: args.clinicId, recipientId: t.id,
        senderId: args.requesterId, senderName: args.requesterName,
        type: NotifType.SWAP_REQUEST, title: 'طلب تبديل',
        body: `يطلب ${dr(args.requesterName)} التبديل معك يوم ${DAY_AR[args.day]} — كلٌّ يستلم مكان الآخر كاملًا.`,
        data,
      });
      if (!error) sent += 1;
    }
    return sent > 0
      ? { success: true, count: sent, group }
      : { success: false, error: 'تعذّر إرسال الطلب.' };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : 'خطأ غير متوقّع.' };
  }
}

/**
 * قبول طلب تبديل: قفلٌ ذرّيّ (أوّل موافقٍ يفوز)، إعادة فحصٍ وتنفيذٌ عبر المحرّك،
 * إخفاء كروت البقيّة، إبلاغ الطالب، وعلمُ القادة إن كان التبديل بين شفتين.
 */
export async function acceptSwap(args: {
  notificationId: string;
  targetId: string;
  targetRole?: string;
  targetName?: string;
}): Promise<NotifResult & { requesterName?: string; resultSent?: boolean; resultError?: string }> {
  try {
    const notif = await loadNotif(args.notificationId);
    if (!notif) return fail('الطلب غير موجود.');
    const d = notif.data as SwapDataV2;
    if (!isPendingRow(notif.action_status)) return fail('عولِج هذا الطلب مسبقًا.');
    if (swapExpired(d)) {
      // الكنّاس وحده يحذف — يرى المجموعة قبل أن تفرغ فيبلّغ الطالب إن ماتت
      if (d.swap_group) await sweepSwapGroup(d.swap_group);
      else await supabase.from('notifications').delete().eq('id', args.notificationId);
      return fail('انتهت مهلة هذا الطلب.');
    }
    // سبقك زميل؟ (كرتٌ شقيق مقبول)
    if (d.swap_group) {
      const rows = await loadSwapGroup(d.swap_group);
      if (rows.some((r) => r.id !== notif.id && r.action_status === 'accepted')) {
        await supabase.from('notifications').delete().eq('id', args.notificationId);
        return fail('سبقك زميلٌ آخر — انتهى الطلب.');
      }
    }
    // القفل الذرّيّ: لا يقبله إلّا واحد
    const { data: claimed } = await supabase
      .from('notifications')
      .update({ action_status: 'accepted', is_read: true })
      .eq('id', args.notificationId)
      .eq('action_status', 'pending')
      .select('id');
    if (!claimed || claimed.length === 0) return fail('عولِج هذا الطلب مسبقًا.');

    // سباق الإخوة: قَبِل شقيقان في اللحظة نفسها؟ القفل أعلاه لكلّ صفٍّ على حدة،
    // فكلاهما يحجز صفَّه. نعيد قراءة المجموعة **بعد** الحجز: من رأى شقيقًا محجوزًا
    // قبله انسحب وطوى كرته قبل أيّ تنفيذ — فلا يُنفَّذ التبديل مرّتين أبدًا.
    // (التزامن الحرفيّ للقراءتين قد يُسقط المحاولتين معًا — انسحابٌ آمنٌ لا إفساد.)
    if (d.swap_group) {
      const rows = await loadSwapGroup(d.swap_group);
      if (rows.some((r) => r.id !== notif.id && r.action_status === 'accepted')) {
        await supabase.from('notifications').delete().eq('id', args.notificationId);
        return fail('سبقك زميلٌ آخر — انتهى الطلب.');
      }
    }

    // إعادة الفحص والتنفيذ — المحرّك يرفض إن تغيّر الجدول
    const { swapFullPositions } = await import('./requests_v2');
    const swap = await swapFullPositions(
      { id: args.targetId, role: args.targetRole || 'doctor' },
      {
        clinicId: d.clinic_id, weekStart: d.week_start, day: d.day,
        aId: d.requester_id, bId: d.target_id,
      },
    );
    if (!swap.success) {
      // الطلب لم يعد صالحًا → أسقط الكرت كي لا يبقى قابلًا للضغط، وأبلغ الطالب صراحةً
      // (بلا swap_group في البيانات كي لا يكتم «لم يقبل أحد» إن بقيت كروتٌ حيّةٌ لغيره)
      await supabase.from('notifications').delete().eq('id', args.notificationId);
      const tryWho = args.targetName || d.target_name;
      await sendInfo({
        clinicId: d.clinic_id, recipientId: d.requester_id,
        senderId: args.targetId, senderName: tryWho,
        type: NotifType.REQUEST_RESULT, title: 'طلب التبديل',
        body: `حاول ${tryWho ? dr(tryWho) : 'زميلك'} قبول طلب التبديل يوم ${DAY_AR[d.day]} لكنّ الجدول تغيّر فتعذّر إتمامه.`,
        data: { swap_v2: true },
      });
      return fail(swap.error || 'الطلب لم يعد صالحًا.');
    }

    // كروت البقيّة المعلّقة تختفي
    if (d.swap_group) {
      const rows = await loadSwapGroup(d.swap_group);
      for (const r of rows) {
        if (r.id !== notif.id && isPendingRow(r.action_status)) {
          await supabase.from('notifications').delete().eq('id', r.id);
        }
      }
    }

    // إبلاغ الطالب بالموافقة
    const who = args.targetName || d.target_name;
    const res = await sendInfo({
      clinicId: d.clinic_id, recipientId: d.requester_id,
      senderId: args.targetId, senderName: who,
      type: NotifType.REQUEST_RESULT, title: 'تمّ التبديل',
      body: `وافق ${who ? dr(who) : 'زميلك'} على طلب التبديل يوم ${DAY_AR[d.day]} — تمّ التبديل.`,
      data: { swap_v2: true, swap_group: d.swap_group },
    });

    // بين شفتين؟ علمٌ للقادة تلقائيًّا (عدا الطرفين)
    if (swap.crossShift) {
      await notifyLeadersCrossShiftSwap({
        clinicId: d.clinic_id, day: d.day,
        aName: d.requester_name, bName: who || d.target_name,
        excludeIds: [d.requester_id, d.target_id],
      });
    }
    // زال تعارض استئذانٍ بهذا التبديل؟ كروت «استئذان يحتاج ترتيبًا» تُغلَق تلقائيًّا
    await resolvePermissionAlertV2({
      clinicId: d.clinic_id, weekStart: d.week_start, day: d.day,
      doctorIds: [d.requester_id, d.target_id],
    });
    // طلبات تبديلٍ معلّقة مسّها هذا التبديل (متقاطعة أو متوازية) → تُبطَل ويُبلَّغ أصحابها
    await invalidateSwapsTouching({
      weekStart: d.week_start, day: d.day,
      doctorIds: [d.requester_id, d.target_id], excludeGroup: d.swap_group,
    });
    return { success: true, requesterName: d.requester_name, resultSent: res.success, resultError: res.error };
  } catch (e) {
    return fail(e instanceof Error ? e.message : 'خطأ غير متوقّع.');
  }
}

/**
 * رفض طلب تبديل: يثبّته مرفوضًا **بصمت** (لا إشعار للطالب)، وإن كان آخر معلّقٍ
 * في المجموعة (رفض الجميع/انتهى الباقي) → «لم يقبل أحد» للطالب مرّة واحدة.
 */
export async function rejectSwap(args: {
  notificationId: string;
  targetName?: string;
}): Promise<NotifResult> {
  try {
    const notif = await loadNotif(args.notificationId);
    if (!notif) return fail('الطلب غير موجود.');
    const d = notif.data as SwapDataV2;
    if (!isPendingRow(notif.action_status)) return fail('عولِج هذا الطلب مسبقًا.');
    await supabase
      .from('notifications')
      .update({ action_status: 'rejected', is_read: true })
      .eq('id', args.notificationId)
      .eq('action_status', 'pending');
    if (d.swap_group) await sweepSwapGroup(d.swap_group);
    return ok();
  } catch (e) {
    return fail(e instanceof Error ? e.message : 'خطأ غير متوقّع.');
  }
}

/** إسقاط كسول لكروت التبديل المنتهية عند مستلمٍ (يُستدعى عند فتح الإشعارات). */
export async function pruneExpiredSwaps(recipientId: string): Promise<void> {
  try {
    const { data } = await supabase
      .from('notifications')
      .select('id, data, action_status')
      .eq('type', NotifType.SWAP_REQUEST)
      .eq('recipient_id', recipientId);
    // الكنّاس وحده يحذف — لو حذفنا هنا أوّلًا لفرغت المجموعة قبل أن يراها فسكت
    const groups = new Set<string>();
    for (const r of (data || []) as { id: string; data: SwapDataV2; action_status: string | null }[]) {
      if (isPendingRow(r.action_status) && r.data?.v === 2 && swapExpired(r.data) && r.data.swap_group) {
        groups.add(r.data.swap_group);
      }
    }
    for (const g of groups) await sweepSwapGroup(g);
  } catch { /* صمت — تنظيف كسول */ }
}

/**
 * حالة طلبات التبديل المفتوحة لطالبٍ («شصار على طلبي؟») — لكلّ مجموعة:
 * اليوم، المرسَل إليهم، كم رفض، كم بقي، ومن وافق إن وُجد. تُسقط المنتهي كسولًا.
 */
export async function swapGroupsStatus(args: {
  requesterId: string;
}): Promise<{
  groups: {
    group: string; day: WeekDay; weekStart: string;
    total: number; pending: number; rejected: number;
    acceptedBy?: string; expired: boolean;
  }[];
}> {
  const { data } = await supabase
    .from('notifications')
    .select('id, data, action_status')
    .eq('type', NotifType.SWAP_REQUEST)
    .filter('data->>requester_id', 'eq', args.requesterId);
  const byGroup = new Map<string, { data: SwapDataV2; rows: { id: string; data: SwapDataV2; action_status: string | null }[] }>();
  for (const r of (data || []) as { id: string; data: SwapDataV2; action_status: string | null }[]) {
    if (r.data?.v !== 2 || !r.data.swap_group) continue;
    const g = byGroup.get(r.data.swap_group) || { data: r.data, rows: [] };
    g.rows.push(r);
    byGroup.set(r.data.swap_group, g);
  }
  const out: {
    group: string; day: WeekDay; weekStart: string;
    total: number; pending: number; rejected: number;
    acceptedBy?: string; expired: boolean;
  }[] = [];
  for (const [group, g] of byGroup) {
    const expired = swapExpired(g.data);
    let pending = 0; let rejected = 0; let acceptedBy: string | undefined;
    for (const r of g.rows) {
      if (r.action_status === 'accepted') acceptedBy = r.data.target_name;
      else if (r.action_status === 'rejected') rejected += 1;
      else if (isPendingRow(r.action_status)) pending += 1;
    }
    if (expired && !acceptedBy) {
      // أسقط المعلّق المنتهي وأبلغ «لم يقبل أحد» إن لزم
      await sweepSwapGroup(group);
      pending = 0;
    }
    out.push({
      group, day: g.data.day, weekStart: g.data.week_start,
      total: g.rows.length, pending, rejected, acceptedBy, expired,
    });
  }
  return { groups: out };
}

/** إلغاء طلب تبديلٍ معلّق (الطالب): يحذف كروت المجموعة المعلّقة. وافق أحدٌ؟ فات الإلغاء. */
export async function cancelSwapGroup(args: {
  requesterId: string;
  weekStart: string;
  day?: WeekDay;
}): Promise<NotifResult & { canceledDays?: WeekDay[] }> {
  try {
    const { data } = await supabase
      .from('notifications')
      .select('id, data, action_status')
      .eq('type', NotifType.SWAP_REQUEST)
      .filter('data->>requester_id', 'eq', args.requesterId)
      .filter('data->>week_start', 'eq', args.weekStart);
    const rows = ((data || []) as { id: string; data: SwapDataV2; action_status: string | null }[])
      .filter((r) => r.data?.v === 2 && (!args.day || r.data.day === args.day));
    // الإلغاء يخصّ الطلب **الحيّ المعلّق** فقط. للطالب قد تكون عدّة مجموعاتٍ لنفس
    // اليوم عبر الزمن (محاولاتٌ سابقة)؛ كرتٌ «مقبولٌ» من مجموعةٍ قديمة لا يخصّ طلبه
    // الحاليّ — فلا يجوز أن يمنع الإلغاء أو يدّعي أنّ تبديلًا تمّ (كان يكذب).
    const pending = rows.filter((r) => isPendingRow(r.action_status) && !swapExpired(r.data));
    if (pending.length === 0) return fail('لا يوجد طلب تبديلٍ معلّقٌ لإلغائه.');
    // وافقَ زميلٌ على **نفس المجموعة الحيّة** (سباقٌ نادر: قبولٌ ومعلّقٌ معًا) → تمّ.
    const liveGroups = new Set(pending.map((r) => r.data.swap_group));
    if (rows.some((r) => r.action_status === 'accepted' && liveGroups.has(r.data.swap_group))) {
      return fail('وافق أحد الزملاء وتمّ التبديل — لم يعد طلبًا ليُلغى. أرسل طلبًا عكسيًّا إن أردت التراجع.');
    }
    const days = new Set<WeekDay>();
    for (const r of pending) {
      await supabase.from('notifications').delete().eq('id', r.id);
      days.add(r.data.day);
    }
    return { ...ok(), canceledDays: [...days] };
  } catch (e) {
    return fail(e instanceof Error ? e.message : 'خطأ غير متوقّع.');
  }
}

// ═══════════════════════════════════════════════════════════════
// طلب قرار — تنبيه الليدر بنقصٍ يحتاج تصرّفًا (تصعيد)
// ═══════════════════════════════════════════════════════════════

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
        return pending && d.v === 2 && !d.placement && !d.perm_retry && d.week_start === args.weekStart;
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
  customBody?: string;        // نصّ جسمٍ جاهز (تحويل مرضيّةٍ مُغطّاةٍ إلى استئذان ونحوه)
  converted?: boolean;        // الحدث تحويل حالةٍ إلى استئذانٍ لا إلغاؤها — لصياغة البذرة
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
      body: args.customBody
        ?? (self
          ? `ألغيتَ ${statusAr === 'حالته' ? 'حالتك' : 'ال' + statusAr} يوم ${DAY_AR[args.day]} ومكانك السابق مُغطًّى — حدّد أين تعود.`
          : `أُلغيت ${statusAr === 'حالته' ? 'حالة' : statusAr} ${dr(args.doctorName)} يوم ${DAY_AR[args.day]} ومكانه مُغطًّى — حدّد أين يوضَع.`),
      data: {
        v: 2, clinic_id: args.clinicId, week_start: args.weekStart,
        placement: {
          day: args.day, doctor_id: args.doctorId,
          doctor_name: args.doctorName, status_ar: statusAr,
          ...(args.converted ? { converted: true } : {}),
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
 * v2 — كرت «استئذان يحتاج ترتيبًا»: طبيبٌ استأذن وهو يستلم خانةً في فترةٍ يحجبها
 * استئذانه — كرتُ فعلٍ للقائد (أحمر حتّى يُحلّ): يفتح خيطًا يعرض فيه الذكاء الحال
 * وينفّذ ما يأمر به القائد (تبديل/نقل). يُغلَق تلقائيًّا متى زال التعارض (تبديلٌ
 * نجح أو أُلغي الاستئذان) عبر resolvePermissionAlertV2. لا يُكرَّر لنفس
 * (القائد، الأسبوع، اليوم، الطبيب).
 */
export async function alertLeaderPermissionConflict(args: {
  clinicId: string;
  leaderId: string;
  weekStart: string;
  day: WeekDay;
  doctorId: string;
  doctorName: string;
  statusAr: string;   // «استئذان بداية الدوام» — للجسم والبذرة
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
      return pending && d.v === 2 && d.perm_conflict
        && d.week_start === args.weekStart
        && d.perm_conflict.day === args.day
        && d.perm_conflict.doctor_id === args.doctorId;
    });
    if (dup) return { success: true, id: dup.id };

    const { id, error } = await sendAction({
      clinicId: args.clinicId, recipientId: args.leaderId,
      senderId: args.senderId, senderName: args.senderName,
      type: NotifType.GAP_ALERT, title: 'استئذان يحتاج ترتيبًا',
      body: `${dr(args.doctorName)} ${args.statusAr} يوم ${DAY_AR[args.day]} وهو يستلم وقت استئذانه — يلزم تبديل فترة عمله.`,
      data: {
        v: 2, clinic_id: args.clinicId, week_start: args.weekStart,
        perm_conflict: {
          day: args.day, doctor_id: args.doctorId,
          doctor_name: args.doctorName, status_ar: args.statusAr,
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
 * v2 — يُغلق كروت «استئذان يحتاج ترتيبًا» عند **كلّ** القادة متى زال التعارض فعلًا.
 * يُعاد حساب التعارض من الجدول الحيّ (لا ثقة بالحدث المستدعي): الطبيب ما زال
 * مستأذنًا ويستلم خانةً في فترةٍ محجوبة → الكرت يبقى؛ غير ذلك → يُغلَق (تمّ).
 * يُستدعى بعد كلّ تبديلٍ ناجح وبعد إلغاء الحالة. فشله لا يُفشل العمليّة.
 */
export async function resolvePermissionAlertV2(args: {
  clinicId: string;
  weekStart: string;
  day: WeekDay;
  doctorIds: string[];
}): Promise<void> {
  try {
    const { data: slots } = await supabase
      .from('schedule_slots')
      .select('doctor_id, period, role, status')
      .eq('clinic_id', args.clinicId)
      .eq('week_start', args.weekStart)
      .eq('day_of_week', args.day);
    const all = (slots || []) as { doctor_id: string; period: number; role: string; status: string }[];
    const stillConflicted = (docId: string): boolean => {
      const perm = all.find(
        (r) => r.doctor_id === docId && r.period === 0
          && (r.status === 'permission_start' || r.status === 'permission_end'),
      );
      if (!perm) return false; // لا استئذان أصلًا → لا تعارض
      const blocked = perm.status === 'permission_start' ? [1, 3] : [2, 4];
      return all.some(
        (r) => r.doctor_id === docId && r.status === 'active' && r.period > 0
          && (r.role === 'clinic' || r.role === 'delegator') && blocked.includes(r.period),
      );
    };
    const resolved = args.doctorIds.filter((id) => !stillConflicted(id));
    if (resolved.length === 0) return;

    const { data } = await supabase
      .from('notifications')
      .select('id, data, action_status')
      .eq('clinic_id', args.clinicId)
      .eq('type', NotifType.GAP_ALERT);
    for (const r of (data || []) as { id: string; data: any; action_status: string | null }[]) {
      const d = r.data || {};
      const pending = !r.action_status || r.action_status === 'pending';
      if (!pending || d.v !== 2 || !d.perm_conflict) continue;
      if (d.week_start !== args.weekStart) continue;
      if (d.perm_conflict.day !== args.day) continue;
      if (!resolved.includes(d.perm_conflict.doctor_id)) continue;
      await supabase
        .from('notifications')
        .update({ action_status: 'accepted', is_read: true })
        .eq('id', r.id);
    }
  } catch { /* إغلاق الكروت تحسينٌ — لا يُفشل العمليّة المنفَّذة */ }
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
 * الفعليّة — كي يخفت زرّ الذكاء ولا يبقى الكرت معلّقًا. (يستعمله مساعد v1.)
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
  notifyTraineeAttached,
  // تغطية
  openCoverageRequests, acceptCoverage, rejectCoverage, sweepCoverageGroup,
  // طلب تبديل (مجموعة كروت — أوّل موافقٍ يفوز)
  openSwapGroup, acceptSwap, rejectSwap, pruneExpiredSwaps,
  swapGroupsStatus, cancelSwapGroup, notifyLeadersCrossShiftSwap,
  invalidateSwapsTouching,
  // تصعيد للّيدر + الافتتاحيّة الحتميّة + تجميع متعدّد الأيّام + إنهاء الكرت بعد التغطية
  alertLeaderCoverage, resolveGapAlert, resolveCoverageV2,
  alertLeaderPlacement, resolvePlacementV2,
  alertLeaderPermissionConflict, resolvePermissionAlertV2,
  // تعويض النقص (إعادة ترتيب الشفت) — كرت [نفّذ] للقائد
  notifyCoverageFill,
};
