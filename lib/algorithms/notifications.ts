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
// وتُسقَط كسولًا عند العرض/الفحص (pruneExpiredSwaps).
// ═══════════════════════════════════════════════════════════════

import { supabase } from '../supabase';
import { createNotification, getAllGroupMembers } from '../database';
import { swapInSchedule, type WeekDay, type Shift } from './requests_v2';

// نوعان صغيران كانا في وحدة الطلبات القديمة (V1، حُذفت) — أُبقيا هنا حيث يُستعملان
// وحدهما (طلبات التغطية بالعرض broadcast). كلّ المنطق صار في requests_v2.
type Gap = { clinicNumber: number; period: number; shift: Shift };
type CoverageCandidate = {
  doctorId: string;
  doctorName: string;
  clinicNumber: number;   // عيادته الحاليّة
  period: number;         // الفترة الأخرى التي يعمل فيها
};

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
  SEAT_CHANGE: 'seat_change',           // card: «طرأ تغييرٌ على جدولك» — للطبيب المتأثّر (قبل/بعد على الجدول)
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

const DAY_OFFSET: Record<WeekDay, number> = { sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4 };
/** تاريخ يومٍ من الأسبوع (weekStart = أحد) بصيغة «d/M» — فارغٌ إن تعذّر. */
function dayDate(weekStart: string | undefined, day: WeekDay): string {
  if (!weekStart || !/^\d{4}-\d{2}-\d{2}$/.test(weekStart)) return '';
  const d = new Date(`${weekStart}T00:00:00`);
  d.setDate(d.getDate() + DAY_OFFSET[day]);
  return `${d.getDate()}/${d.getMonth() + 1}`;
}
/** «الأحد 14/6» — اسم اليوم متبوعًا بتاريخه (يسقط التاريخ بهدوءٍ إن غاب الأسبوع). */
function dayWithDate(weekStart: string | undefined, day: WeekDay): string {
  const dt = dayDate(weekStart, day);
  return dt ? `${DAY_AR[day]} ${dt}` : DAY_AR[day];
}

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
  scheduleChanged?: boolean; // الطلب غيّر الجدول → وسمٌ في data (الأورب يتولّى عرضه لاحقًا)
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
        const changed = args.scheduleChanged || !!existing.data?.schedule_changed;
        const body = `${args.senderName}: ${items.map((x) => x.summary).join('، ')}`;
        await supabase
          .from('notifications')
          .update({ data: { ...existing.data, items, week_start: args.weekStart, batch_at: now, schedule_changed: changed }, body, is_read: false })
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
      data: { items: [{ day: args.day, summary: args.summary }], week_start: args.weekStart, batch_at: now, schedule_changed: !!args.scheduleChanged },
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

/**
 * إبلاغ طبيبٍ تغيّر مقعدُه (تعويضُ غيابٍ أو تبديلُ استئذان) — للعلم، يصل صفحة الذكاء
 * (الجرس) بتفاصيل صريحة: العيادة والفترة واليوم. لكلّ طبيبٍ إشعارٌ واحدٌ ليومه (نحذف
 * السابق غير المقروء لنفس اليوم فلا يتكرّر). لا يُرسَل للغائب نفسه (هو يعلم).
 */
export async function notifyDoctorSeatChange(args: {
  clinicId: string;
  recipientId: string;
  weekStart: string;
  day: WeekDay;
  seats: { clinicNumber: number; period: number; solo?: boolean; delegator?: boolean }[];
  reason?: 'coverage' | 'swap';
  senderId?: string;
  senderName?: string;
}): Promise<NotifResult> {
  try {
    if (!args.seats.length) return ok();
    // أزِل إشعار تغيّرٍ سابقًا غير مقروءٍ لنفس (المتلقّي، الأسبوع، اليوم) — تحديثٌ لا تكرار.
    const { data: prev } = await supabase
      .from('notifications')
      .select('id, data, is_read')
      .eq('clinic_id', args.clinicId)
      .eq('recipient_id', args.recipientId)
      .eq('type', NotifType.REQUEST_RESULT);
    for (const r of (prev || []) as { id: string; data: any; is_read: boolean }[]) {
      if (!r.is_read && r.data?.seat_change && r.data?.week_start === args.weekStart && r.data?.day === args.day) {
        await supabase.from('notifications').delete().eq('id', r.id);
      }
    }
    const parts = args.seats.map((s) => s.delegator
      ? `دليقيتر الفترة ${s.period}`
      : `عيادة ${s.clinicNumber} الفترة ${s.period}${s.solo ? ' (منفردًا)' : ''}`);
    const lead = args.reason === 'swap' ? 'بُدّلت فترتك' : 'تغيّر جدولك';
    const body = `${lead} يوم ${dayWithDate(args.weekStart, args.day)} — أصبحتَ في ${parts.join('، ')}.`;
    return await sendInfo({
      clinicId: args.clinicId, recipientId: args.recipientId,
      senderId: args.senderId, senderName: args.senderName,
      type: NotifType.REQUEST_RESULT, title: 'تغيّر جدولك',
      body,
      data: {
        week_start: args.weekStart, day: args.day,
        seat_change: {
          reason: args.reason ?? 'coverage',
          seats: args.seats.map((s) => ({ clinic_number: s.clinicNumber, period: s.period, solo: !!s.solo })),
        },
        batch_at: Date.now(),
      },
    });
  } catch (e) {
    return fail(e instanceof Error ? e.message : 'خطأ غير متوقّع.');
  }
}

// ═══════════════════════════════════════════════════════════════
// كرت «طرأ تغييرٌ على جدولك» — للطبيب المتأثّر بأيّ تغييرٍ على الجدول
// ═══════════════════════════════════════════════════════════════
// يُنشئه طبقةُ الفرق (withSeatChangeDiff): تلتقط موضع الطبيب قبل/بعد أيّ عمليّة
// (نقل القائد، تغطية، موازنة العدل الصامتة، تبديل) عبر كلّ الأيّام والأسابيع، فتُرسل
// كرتًا واحدًا لكلّ حدثٍ يحمل تغييراته كلَّها. النقرُ يعرض الجدول الحقيقيّ معتمًا مع
// مكانه القديم منطفئًا والجديد مضيئًا (الواجهة). كلُّ حدثٍ كرتٌ جديد (لا دمج).

/** خانةٌ مرجعيّة في الكرت: عيادة/دليقيتر (period>0) أو احتياط (extra: clinic=0,period=0). */
export type SeatRef = { clinic: number; period: number; role: 'clinic' | 'delegator' | 'extra' };
/** تغيّرُ يومٍ واحد لطبيب: مواضعه قبل (old) وبعد (new). new فارغة = خرج (غياب). */
export type SeatChange = { weekStart: string; day: WeekDay; old: SeatRef[]; new: SeatRef[] };

/**
 * كرت «طرأ تغييرٌ على جدولك» لطبيبٍ واحد — حدثٌ واحدٌ يجمع كلّ تغييراته (أيّام/أسابيع).
 * كرتٌ جديدٌ لكلّ حدث (لا دمج مع سابق) — تغييرٌ لاحقٌ ⇒ كرتٌ آخر. يصل صفحة الذكاء
 * (الأورب) ويُحمِّر الأيقونة، ويُدفَع عبر مُحفِّز قاعدة البيانات (حتى والتطبيق مغلق).
 */
export async function notifySeatChangeCard(args: {
  clinicId: string;
  recipientId: string;
  recipientName: string;
  changes: SeatChange[];
  senderId?: string;
  senderName?: string;
}): Promise<NotifResult> {
  try {
    if (!args.changes.length) return ok();
    const dayList = [...new Set(args.changes.map((c) => dayWithDate(c.weekStart, c.day)))];
    const body = `طرأ تغييرٌ على جدولك — ${dayList.join('، ')}.`;
    const { error } = await createNotification({
      clinic_id: args.clinicId,
      recipient_id: args.recipientId,
      sender_id: args.senderId,
      sender_name: args.senderName,
      type: NotifType.SEAT_CHANGE,
      title: 'طرأ تغييرٌ على جدولك',
      body,
      data: {
        v: 1, kind: 'seat_change',
        doctor_id: args.recipientId, doctor_name: args.recipientName,
        changes: args.changes.map((c) => ({
          week_start: c.weekStart, day: c.day,
          old: c.old.map((s) => ({ clinic: s.clinic, period: s.period, role: s.role })),
          new: c.new.map((s) => ({ clinic: s.clinic, period: s.period, role: s.role })),
        })),
        batch_at: Date.now(),
      },
      is_read: false,
    });
    return error ? fail(error.message) : ok();
  } catch (e) {
    return fail(e instanceof Error ? e.message : 'خطأ غير متوقّع.');
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
  // ملاحظة: تصعيدُ تبديل الاستئذان (كرت إعادة العرض للطالب + كرت «استئذان يحتاج ترتيبًا»
  // للقائد) أُزيل — صار حلُّ تعارض الاستئذان تلقائيًّا بالكامل في محرّك الطلبات/القلب الجديد
  // (تبديلُ فترةٍ أو نقلُ استضافةٍ ثمّ امتصاصٌ عبر الأيّام)، فلا حاجةَ لجولة قبولٍ يدويّة.
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

    // إعادة الفحص والتنفيذ — المحرّك يرفض إن تغيّر الجدول. نلفّه بطبقة الفرق فيصل
    // كرتُ «طرأ تغييرٌ على جدولك» لكلّ متأثّر؛ المبدِّلان يُكتمان في يوم التبديل (يعلمانه).
    const { swapFullPositions, withSeatChangeDiff } = await import('./requests_v2');
    const swap = await withSeatChangeDiff(
      {
        clinicId: d.clinic_id, weekStart: d.week_start,
        senderId: args.targetId, senderName: args.targetName || d.target_name,
        suppress: new Set([
          `${d.requester_id}|${d.week_start}|${d.day}`,
          `${d.target_id}|${d.week_start}|${d.day}`,
        ]),
      },
      () => swapFullPositions(
        { id: args.targetId, role: args.targetRole || 'doctor' },
        {
          clinicId: d.clinic_id, weekStart: d.week_start, day: d.day,
          aId: d.requester_id, bId: d.target_id,
        },
      ),
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
 * v2 — كرت «تغطية نقص — تحتاج قرارك»: نقصٌ لم يُسدّ بالاحتياطيّ العاديّ، والمتاح
 * احتياطيًّا **خاصّ** (بورد/متدرّب) لا يُوضع تلقائيًّا. كرتُ فعلٍ للقائد يفتح خيطًا
 * يعرض فيه الذكاء المرشّحين ويسأله: مَن يُستدعى؟ أو لا أحد. ينفّذ أمره بأداة
 * cover_gap_with_reserve. لا يُكرَّر لنفس (القائد، الأسبوع، اليوم). يُغلَق متى حُسم.
 */
export async function notifyLeaderReserveChoice(args: {
  clinicId: string;
  leaderId: string;
  weekStart: string;
  day: WeekDay;
  seats: { clinicNumber: number; period: number }[];
  candidates: { doctorId: string; doctorName: string; kind: 'board' | 'trainee' }[];
  absentNames: string[];
  senderId?: string;
  senderName?: string;
}): Promise<{ success: boolean; error?: string; id?: string }> {
  try {
    if (!args.seats.length || !args.candidates.length) return { success: false, error: 'لا مقاعد/مرشّحين.' };
    const { data: rows } = await supabase
      .from('notifications')
      .select('id, data, action_status')
      .eq('clinic_id', args.clinicId)
      .eq('recipient_id', args.leaderId)
      .eq('type', NotifType.GAP_ALERT);
    const dup = ((rows || []) as { id: string; data: any; action_status: string | null }[]).find((r) => {
      const d = r.data || {};
      const pending = !r.action_status || r.action_status === 'pending';
      return pending && d.v === 2 && d.reserve_choice
        && d.week_start === args.weekStart && d.reserve_choice.day === args.day;
    });
    if (dup) return { success: true, id: dup.id };

    const kindAr = (k: 'board' | 'trainee') => (k === 'board' ? 'بورد' : 'متدرّب');
    const candList = args.candidates.map((c) => `${dr(c.doctorName)} (${kindAr(c.kind)})`).join('، ');
    const who = args.absentNames.length ? args.absentNames.map(dr).join(' و') : 'النقص';
    const { id, error } = await sendAction({
      clinicId: args.clinicId, recipientId: args.leaderId,
      senderId: args.senderId, senderName: args.senderName,
      type: NotifType.GAP_ALERT, title: 'تغطية نقص — قرارك',
      body: `بقي مقعدٌ بلا بديلٍ عاديّ بعد غياب ${who} يوم ${dayWithDate(args.weekStart, args.day)}. ` +
        `المتاح احتياطيًّا: ${candList}. افتح لتختار مَن يُغطّي أو ألّا تستدعي أحدًا.`,
      data: {
        v: 2, clinic_id: args.clinicId, week_start: args.weekStart,
        reserve_choice: {
          day: args.day,
          seats: args.seats.map((s) => ({ clinic_number: s.clinicNumber, period: s.period })),
          candidates: args.candidates.map((c) => ({ doctor_id: c.doctorId, doctor_name: c.doctorName, kind: c.kind })),
          absent_names: args.absentNames,
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
 * v2 — بعد حسم كرت «تغطية نقص — تحتاج قرارك» (استدعاء احتياطيّ أو رفض) تُغلَق الكروت
 * المطابقة عند **كلّ** القادة لنفس (الأسبوع، اليوم). فشله لا يُفشل العمليّة المنفَّذة.
 */
export async function resolveReserveChoiceV2(args: {
  clinicId: string; weekStart: string; day: WeekDay;
}): Promise<void> {
  try {
    const { data } = await supabase
      .from('notifications')
      .select('id, data, action_status')
      .eq('clinic_id', args.clinicId)
      .eq('type', NotifType.GAP_ALERT);
    for (const r of (data || []) as { id: string; data: any; action_status: string | null }[]) {
      const d = r.data || {};
      const pending = !r.action_status || r.action_status === 'pending';
      if (!pending || d.v !== 2 || !d.reserve_choice) continue;
      if (d.week_start !== args.weekStart || d.reserve_choice.day !== args.day) continue;
      await supabase.from('notifications').update({ action_status: 'accepted', is_read: true }).eq('id', r.id);
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

// ─── تجميع التصدير ─────────────────────────────────────────────
export const notifications = {
  // إعلاميّ
  notifyLeaderOfRequest, broadcast, resolveAudience,
  // طلب تبديل (مجموعة كروت — أوّل موافقٍ يفوز)
  openSwapGroup, acceptSwap, rejectSwap, pruneExpiredSwaps,
  swapGroupsStatus, cancelSwapGroup, notifyLeadersCrossShiftSwap,
  invalidateSwapsTouching,
  // تصعيد للّيدر + الافتتاحيّة الحتميّة + تجميع متعدّد الأيّام + إنهاء الكرت بعد التغطية
  resolveCoverageV2,
  alertLeaderPlacement, resolvePlacementV2,
  // كرت سؤال القائد عن استدعاء احتياطيّ خاصّ (بورد/متدرّب)
  notifyLeaderReserveChoice, resolveReserveChoiceV2,
  // إبلاغ طبيبٍ تغيّر مقعدُه (تعويض/تبديل)
  notifyDoctorSeatChange,
  // كرت «طرأ تغييرٌ على جدولك» (طبقة الفرق — أيّ تغيير)
  notifySeatChangeCard,
};
