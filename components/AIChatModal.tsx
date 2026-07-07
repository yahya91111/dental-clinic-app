// ═══════════════════════════════════════════════════════════════
// AIChatModal — محادثة الذكاء وسط الشاشة (تصميم بسيط مؤقّت)
// ═══════════════════════════════════════════════════════════════
// حديث الذكاء مع المستخدم — منفصل تمامًا عن صفحة الإشعارات.
//
// المحادثة (الرسائل + المُرسِل) **مشتركة** مع صفحة الذكاء الكاملة: نأخذها
// من الأب (messages/onSend) فما يُكتب هنا أو هناك هو نفسه. أمّا طلبات الذكاء
// المعلّقة (تبديل/تغطية) ونتائجها فتُحمَّل من قاعدة البيانات وتُعرض كرسائل.
// هذه الأنواع لا تظهر في الجرس إطلاقًا.
// ═══════════════════════════════════════════════════════════════

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Modal, View, Text, ScrollView, TextInput, TouchableOpacity, Pressable,
  ActivityIndicator, KeyboardAvoidingView, Platform, StyleSheet, PanResponder, Animated,
  Dimensions, Easing, Keyboard,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Path } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import { getNotifications, markAsRead, subscribeToNotifications } from '../lib/database';
import { notifications as notifEngine } from '../lib/algorithms/notifications';
import { sendMessageV2, type V2Message, type V2User } from '../lib/ai_v2';
import AssistantOffers from './AssistantOffers';
import { CardBadge, Pill, GlassCard, cardStyles, type CardKind } from './AICard';
import { ChatMessage } from './aiTypes';
import SeatChangeOverlay, { type SeatChangeUI } from './SeatChangeOverlay';
import { scale } from '../lib/scale';
import { GlassNavButton } from './GlassNavButton';
import { ChatBody, ChatInputBar, OutlinedText } from './ChatChrome';
import { ChatInkWater, FogHalo } from './ChatDissolve';
import { useSharedValue } from 'react-native-reanimated';

type Props = {
  visible: boolean;
  onClose: () => void;
  user: { id: string; name: string; role: string; clinicId?: string | null; clinicName?: string };
  clinicId?: string | null;
  /** المحادثة المشتركة مع صفحة الذكاء الكاملة */
  messages: ChatMessage[];
  onSend: (text: string, opts?: { task?: 'schedule' | 'requests'; contextData?: string; hidden?: boolean; freshConversation?: boolean }) => void;
  /** مسح المحادثة (فقاعات الذاكرة + كروت قاعدة البيانات) */
  onClearConversation?: () => void | Promise<void>;
  /** تعديل رسالةٍ مشتركة (نتيجة خيار) — للتزامن بين المحادثتين */
  onPatchMessage?: (id: string, patch: Partial<ChatMessage>) => void;
  /** بعد إجراءٍ غيّر الجدول (مسح) — لإنعاش الشبكة */
  onAfterAction?: () => void;
  isLoading?: boolean;
};

type ConvoNotif = {
  id: string; type: string; title: string; body: string;
  action_type?: string | null; action_status?: string | null; is_read?: boolean;
  created_at?: string; data?: any;
};

// أنواع «محادثة الذكاء» — مكانها الجات لا صفحة الإشعارات.
// طلبات التبديل (swap_request) ونتائجها (request_result مع data.swap_v2) مكانها
// **صفحة الإشعارات** حصرًا — لا تظهر هنا.
const AI_CHAT_TYPES = ['gap_alert', 'request_result'];
const inAIChat = (n: { type: string; data?: any }) =>
  AI_CHAT_TYPES.includes(n.type) && !(n.type === 'request_result' && n.data?.swap_v2);
const isActionType = (t: string) => t === 'gap_alert' || t === 'rebalance_consent';
const isPending = (n: { type: string; action_type?: string | null; action_status?: string | null }) =>
  isActionType(n.type) && n.action_type === 'accept_reject' && (!n.action_status || n.action_status === 'pending');

/** عدد عناصر محادثة الذكاء التي تُبقي الأورب كهرمانيّاً: **كرتٌ لم يُحَلّ** (معلّق — يبقى
 *  محسوبًا ولو قُرئ، فلا يطفئه فتحُ الكرت بل حلُّه done/dismiss) **أو** رسالةٌ غير مقروءة. */
export async function countUnreadAIChat(userId: string): Promise<number> {
  if (!userId) return 0;
  const { data } = await getNotifications(userId, 50);
  return (data || []).filter((n: ConvoNotif) => {
    // gap_alert: تغطية v2 — تبقى كهرمانيّةً ما دامت معلّقةً (لم تُحَلّ)، حتى بعد قراءتها.
    // تطفأ فقط بـ done/dismiss. القديمة بلا v2 تُستثنى.
    if (n.type === 'gap_alert') return n.data?.v === 2 && isPending(n);
    // كرت «طرأ تغييرٌ على جدولك»: يتوهّج حتى يفتحه الطبيب (يُقرأ).
    if (n.type === 'seat_change') return !n.is_read;
    // كرت «يوجد فترة فارغة»: يتوهّج للقائد حتى يطّلع عليه (يُقرأ) ثمّ يختفي.
    if (n.type === 'shortage_alert') return !n.is_read;
    // كرت «موازنةُ يومٍ عدّلتَه»: يتوهّج للقائد ما دام معلّقًا (لم يُحسَم بنعم/لا).
    if (n.type === 'rebalance_consent') return isPending(n);
    // بقيّة عناصر المحادثة: كرتٌ معلّق (لم يُحَلّ) أو رسالةٌ غير مقروءة.
    return inAIChat(n) && (isPending(n) || !n.is_read);
  }).length;
}

/** أحد الأسبوع الحاليّ — لإبقاء كروت التغطية المُنهاة ظاهرةً خلال أسبوعها فقط */
function currentSunday(): string {
  const d = new Date();
  d.setDate(d.getDate() - d.getDay());
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

const DAY_AR_SEED: Record<string, string> = {
  sunday: 'الأحد', monday: 'الإثنين', tuesday: 'الثلاثاء', wednesday: 'الأربعاء', thursday: 'الخميس',
};

/** «د. اسم» مرّة واحدة فقط — الأسماء المخزَّنة قد تحمل اللقب أصلاً (لا «د.د.»). */
const dr = (name?: string): string => {
  const n = (name || '').trim();
  if (!n) return '';
  return /^د\s*\./.test(n) ? n : `د. ${n}`;
};

/**
 * يبني سياق التغذية الخفيّ لنقصِ تغطية (v2): حقائق منظَّمة + تعليمات صياغة. الذكاء
 * يصوغ الرسالة بصوته كأنّه لاحظ النقص بنفسه — لا يذكر أنّها مُعطاة له ولا يذكر فترات.
 */
type SeedDoc = { id?: string; name: string };
type SeedGap = {
  kind: string;
  clinicNumber?: number;
  twoPeriodColleague?: SeedDoc | null;
  candidates?: SeedDoc[];
  fullCandidates?: SeedDoc[];                              // متفرّغون في كلّ الفترات الشاغرة
  partials?: { period?: number; candidates?: SeedDoc[] }[]; // لا حلّ كامل → مرشّحو كلّ فترة
  // إعادة توزيع اليوم — كلّ الخيارات (كلّ خيار: منفردٌ بالعيادة + بقيّة نقلاته)
  reshapeOptions?: { moves?: { doctor?: SeedDoc; period?: number; clinic?: number; from?: string }[] }[];
  clinicColleague?: SeedDoc | null;
  optionA?: { cover: SeedDoc; coverClinic: number; backfill: SeedDoc | null }[];
  optionB?: { clinicNumber: number; a: SeedDoc; b: SeedDoc }[];
};

// الكرت قد يجمع أكثر من غائب — بندٌ لكلّ (يوم، غائب)؛ البنود القديمة بلا absentId
// مالكها غائب الكرت (data.absent_doctor_id).
type SeedDay = { day: string; absentId?: string; absentName?: string; gaps?: SeedGap[]; reserves?: SeedDoc[] };

/** أيّام الكرت: data.days[] الجديد، أو coverage المفرد القديم (توافق رجعيّ). */
function coverageDays(d: Record<string, any>): SeedDay[] {
  if (Array.isArray(d.days)) return d.days as SeedDay[];
  if (d.coverage) return [d.coverage as SeedDay];
  return [];
}

function buildCoverageSeed(n: ConvoNotif, selfId?: string): string {
  const d = n.data || {};
  // كرت «عودة تحتاج مكانًا»: أُلغيت حالةٌ ومكان صاحبها مُغطًّى — الذكاء يسأل القائد
  // أين يوضَع العائد (بلا اقتراحات) وينفّذ أمره كما هو. العائد قد يكون القائد نفسه
  // (ألغى حالته بنفسه) — حينها يُخاطَب مباشرةً: «أين تريد أن تعود؟».
  if (d.placement) {
    const p = d.placement as { day?: string; doctor_id?: string; doctor_name?: string; status_ar?: string; converted?: boolean };
    const dayAr = DAY_AR_SEED[p.day || ''] || p.day || '';
    const self = !!selfId && p.doctor_id === selfId;
    // تحويل مرضيّةٍ/تفرّغٍ مُغطًّى إلى استئذان: حاضرٌ معظم اليوم لكن بلا مركز —
    // نفس سؤال «أين يوضَع؟» بصياغة التحويل لا الإلغاء.
    if (p.converted) {
      return [
        'حدثٌ داخليّ (لا تذكر أنّه مُعطى لك): طبيبٌ حوّل حالة غيابه (مرضية/تفرّغ) إلى',
        'استئذانٍ — أي أنّه حاضرٌ معظم اليوم — لكنّ مكانه السابق غُطّي وقت غيابه فلا',
        'يُعاد إليه تلقائيًّا. ابدأ أنت الحديث مع القائد كأنّك لاحظتَ ذلك بنفسك:',
        self
          ? 'وهو نفسه المحوِّل — أخبره أنّ مكانه السابق مُغطًّى واسأله **سطرًا واحدًا** أين'
          : `أخبره أنّ ${dr(p.doctor_name)} حوّل حالته إلى استئذانٍ يوم ${dayAr} ومكانه السابق`,
        self
          ? 'يعود — **بلا اقتراحات ولا خيارات**.'
          : 'مُغطًّى، واسأله **سطرًا واحدًا** أين يضعه — **بلا اقتراحات ولا خيارات**.',
        'ثمّ نفّذ ما يطلبه كما هو بأدواتك (ومرّر اليوم والأسبوع أدناه). أكّد بسطرٍ بعد التنفيذ.',
        '',
        `الأسبوع: ${d.week_start || ''}`,
        `اليوم: ${p.day || ''} (${dayAr})`,
        `الطبيب المستأذن: ${dr(p.doctor_name)}${self ? ' (هو القائد المخاطَب نفسه)' : ''}`,
      ].join('\n');
    }
    return [
      self
        ? 'حدثٌ داخليّ (لا تذكر أنّه مُعطى لك): القائد الذي تخاطبه ألغى حالته بنفسه،'
        : 'حدثٌ داخليّ (لا تذكر أنّه مُعطى لك): أُلغيت حالة طبيب، ومكانه السابق صار مُغطًّى',
      self
        ? 'ومكانه السابق صار مُغطًّى فلم يُعَد إليه تلقائيًّا. ابدأ أنت الحديث وخاطبه'
        : 'فلم يُعَد إليه تلقائيًّا. ابدأ أنت الحديث مع القائد كأنّك لاحظتَ ذلك بنفسك:',
      self
        ? `مباشرةً (هو نفسه العائد): أخبره أنّ مكانه السابق مُغطًّى، واسأله **سطرًا واحدًا**`
        : `أخبره أنّ ${p.status_ar || 'حالة'} ${dr(p.doctor_name)} يوم ${dayAr} أُلغيت وأنّ مكانه`,
      self
        ? 'أين يريد أن يعود — **بلا اقتراحات ولا خيارات**.'
        : 'السابق مُغطًّى، واسأله **سطرًا واحدًا** أين يضعه — **بلا اقتراحات ولا خيارات**.',
      'ثمّ نفّذ ما يطلبه كما هو (قد يكون مركّبًا بأكثر من نقلة — نفّذها كلّها بأدواتك،',
      'ومرّر اليوم والأسبوع أدناه). أكّد بسطرٍ بعد التنفيذ.',
      '',
      `الأسبوع: ${d.week_start || ''}`,
      `اليوم: ${p.day || ''} (${dayAr})`,
      `الطبيب العائد: ${dr(p.doctor_name)}${self ? ' (هو القائد المخاطَب نفسه)' : ''}`,
    ].join('\n');
  }
  // كرت «تغطية نقص — قرارك»: بقي مقعدٌ بلا بديلٍ معتاد، والمتاح فئةٌ لا تُستدعى
  // تلقائيًّا (بورد/متدرّب). الذكاء يعرض الأسماء على القائد ويسأله: مَن يُستدعى أو لا أحد.
  if (d.reserve_choice) {
    const rc = d.reserve_choice as {
      day?: string;
      seats?: { clinic_number?: number; period?: number }[];
      candidates?: { doctor_name?: string; kind?: string }[];
      absent_names?: string[];
    };
    const dayAr = DAY_AR_SEED[rc.day || ''] || rc.day || '';
    const kindAr = (k?: string) => (k === 'board' ? 'بورد' : 'متدرّب');
    const seatsAr = (rc.seats || []).map((s) => `عيادة ${s.clinic_number} الفترة ${s.period}`).join('، ');
    const candsAr = (rc.candidates || []).map((c) => `${dr(c.doctor_name)} (${kindAr(c.kind)})`).join('، ');
    const whoAr = (rc.absent_names || []).map(dr).join(' و');
    return [
      'حدثٌ داخليّ (لا تذكر أنّه مُعطى لك): غاب طبيبٌ وبقي مقعدُ عيادةٍ بلا بديلٍ معتاد،',
      'والمتاح لتغطيته الآن من فئةٍ لا تُستدعى تلقائيًّا (بورد/متدرّب). ابدأ أنت الحديث مع',
      'القائد كأنّك لاحظتَ ذلك بنفسك: أخبره بالمقعد الشاغر، واعرض عليه الأسماء المتاحة',
      'وخيار **«لا أحد»** صريحًا (ومعناه أنّك تترك التغطية لي أتكفّل بها من المتاح).',
      'واسأله **سطرًا واحدًا**: هل يستدعي أحدهم (ومن)؟ أم «لا أحد»؟ — بلا ضغطٍ ولا ترجيح.',
      'إن اختار اسمًا → نفّذ cover_gap_with_reserve (doctorIndex لذلك الاسم، مع العيادة',
      'والفترة أدناه). إن قال «لا أحد» → نفّذها بـ decline=true (أتكفّل أنا بالتغطية بالمتاح).',
      'أكّد بسطرٍ بعد التنفيذ.',
      '',
      `الأسبوع: ${d.week_start || ''}`,
      `اليوم: ${rc.day || ''} (${dayAr})`,
      `الغائب: ${whoAr}`,
      `المقعد الشاغر: ${seatsAr}`,
      `المتاح لتغطيته: ${candsAr}`,
    ].join('\n');
  }
  return '';
}

/** عنوان الكرت الثابت: الطبيب الغائب + أيّام النقص (بلا حلول وبلا فترات). */
function coverageTitle(n: ConvoNotif): string {
  const d = n.data || {};
  if (d.placement) {
    const p = d.placement as { day?: string; doctor_name?: string };
    const dayAr = DAY_AR_SEED[p.day || ''] || p.day || '';
    return `عودة تحتاج مكانًا — ${dr(p.doctor_name)}${dayAr ? `: ${dayAr}` : ''}`;
  }
  if (d.reserve_choice) {
    const rc = d.reserve_choice as { day?: string; absent_names?: string[] };
    const dayAr = DAY_AR_SEED[rc.day || ''] || rc.day || '';
    const who = (rc.absent_names || []).map(dr).join(' و');
    return `تغطية نقص — قرارك${who ? `: ${who}` : ''}${dayAr ? ` (${dayAr})` : ''}`;
  }
  return 'نقص';
}

const SEED_TRIGGER = 'ابدأ'; // أوّل رسالة خفيّة تُشغّل صياغة الذكاء داخل الكرت (لا تُعرَض)

// ───── جسمُ كرت «تغطية نقص — قرارك»: أزرارٌ بالكود (نصُّها من الخوارزميّة، لا الذكاء) ─────
// لكلّ مقعدٍ شاغر: أزرارُ المرشّحين (بورد/متدرّب) + زرّ «لا أحد». نقرُ مرشّحٍ يضعه
// (placeReserveByCode)؛ آخرُ مقعدٍ يُغلق الكرت. «لا أحد» يترك التغطية للمحرّك (declineReserveChoiceByCode).
function ReserveChoiceBody({ notif, clinicId, onSeen }: {
  notif: ConvoNotif;
  clinicId?: string | null;
  onSeen: () => void;
}) {
  const d = notif.data || {};
  const rc = (d.reserve_choice || {}) as {
    day?: string;
    seats?: { clinic_number?: number; period?: number }[];
    candidates?: { doctor_id?: string; doctor_name?: string; kind?: string }[];
  };
  const ws = String(d.week_start || '');
  const day = String(rc.day || '');
  const cid = clinicId || d.clinic_id || '';
  const seats = (rc.seats || []).filter((s) => s.clinic_number != null && s.period != null);
  const cands = (rc.candidates || []).filter((c) => !!c.doctor_id);
  const seatKey = (s: { clinic_number?: number; period?: number }) => `${s.clinic_number}|${s.period}`;
  const kindAr = (k?: string) => (k === 'board' ? 'بورد' : 'متدرّب');

  const [filled, setFilled] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const remaining = seats.filter((s) => !filled.has(seatKey(s)));
  const multi = seats.length > 1;

  const pick = useCallback(async (seat: { clinic_number?: number; period?: number }, c: { doctor_id?: string }) => {
    if (busy || !cid) return;
    setBusy(true); setErr(null);
    try {
      const nextFilled = new Set(filled); nextFilled.add(seatKey(seat));
      const isLast = seats.every((s) => nextFilled.has(seatKey(s)));
      const mod = await import('../lib/ai_v2/tools_requests_v2');
      const res = await mod.placeReserveByCode({
        clinicId: cid, weekStart: ws, day,
        clinicNumber: Number(seat.clinic_number), period: Number(seat.period),
        doctorId: String(c.doctor_id), closeCard: isLast,
      });
      if (!res.success) { setErr(res.error || 'تعذّر وضع الاحتياطيّ.'); return; }
      if (isLast) onSeen(); else setFilled(nextFilled);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'خطأ غير متوقّع.');
    } finally { setBusy(false); }
  }, [busy, cid, ws, day, filled, seats, onSeen]);

  const decline = useCallback(async () => {
    if (busy || !cid) return;
    setBusy(true); setErr(null);
    try {
      const mod = await import('../lib/ai_v2/tools_requests_v2');
      const res = await mod.declineReserveChoiceByCode({ clinicId: cid, weekStart: ws, day });
      if (!res.success) { setErr(res.error || 'تعذّر إكمال التغطية.'); return; }
      onSeen();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'خطأ غير متوقّع.');
    } finally { setBusy(false); }
  }, [busy, cid, ws, day, onSeen]);

  return (
    <View style={cardStyles.covBody}>
      <Text style={styles.bodyPara}>{notif.body}</Text>
      {!!err && <Text style={styles.rcErr}>{err}</Text>}
      {busy && <ActivityIndicator color="#7C3AED" style={{ marginVertical: scale(6) }} />}
      {remaining.map((seat) => (
        <View key={seatKey(seat)} style={{ marginTop: scale(6) }}>
          {multi && <Text style={styles.rcSeat}>عيادة {seat.clinic_number} الفترة {seat.period}</Text>}
          {cands.map((c) => (
            <TouchableOpacity
              key={`${seatKey(seat)}-${c.doctor_id}`} activeOpacity={0.85} disabled={busy}
              onPress={() => pick(seat, c)} style={styles.rcOpt}
            >
              <Text style={styles.rcOptTxt}>{dr(c.doctor_name)} ({kindAr(c.kind)})</Text>
            </TouchableOpacity>
          ))}
        </View>
      ))}
      <TouchableOpacity activeOpacity={0.85} disabled={busy} onPress={decline} style={[styles.rcOpt, styles.rcOptMuted]}>
        <Text style={styles.rcOptTxt}>لا أحد</Text>
      </TouchableOpacity>
    </View>
  );
}

// استدارةُ زاويةِ الكرت (نفسُ GlassCard) — تُستعمَل لملءِ زاويتَيه في درجِ السحب.
const SW_CORNER = scale(22);

// مسارُ رُبعِ الدائرةِ **المقعّرِ** الذي يطابقُ منحنى زاويةِ الكرتِ تمامًا (مركزُ القوسِ
// عندَ مركزِ استدارةِ الكرت) فيملأُ الفجوةَ عندَ الزاويةِ دونَ نتوءٍ محدّبٍ داخلَ الكرت.
const C = SW_CORNER;
const NOTCH_TOP = `M0 0 L${C} 0 A${C} ${C} 0 0 0 0 ${C} Z`;
const NOTCH_BOT = `M0 0 L0 ${C} L${C} ${C} A${C} ${C} 0 0 1 0 0 Z`;

/**
 * لونُ درجِ السحب: يملأُ **منطقةَ الكشفِ فقط** (بعرضِ `open`) فلا يمتدُّ خلفَ جسمِ الكرتِ
 * الشفّاف — ثمّ رُبعا دائرةٍ **مقعّران** (بنفسِ منحنى الكرت) يملآن **زاويتَيه المستديرتَين**
 * فقط، فتتّصلُ حدودُ اللونِ بحدودِ الكرتِ بلا فصلٍ وبلا نتوءٍ محدّبٍ داخلَ الكرت.
 */
function TrayColor({ colors, open }: { colors: [string, string]; open: number }) {
  return (
    <>
      <View style={{ position: 'absolute', top: 0, bottom: 0, left: 0, width: open }}>
        <LinearGradient colors={colors} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }} style={StyleSheet.absoluteFill} />
      </View>
      <Svg width={C} height={C} style={{ position: 'absolute', top: 0, left: open }}>
        <Path d={NOTCH_TOP} fill={colors[0]} />
      </Svg>
      <Svg width={C} height={C} style={{ position: 'absolute', bottom: 0, left: open }}>
        <Path d={NOTCH_BOT} fill={colors[1]} />
      </Svg>
    </>
  );
}

/**
 * كرت تغطية مستقلّ: عنوانٌ ثابت من المحرّك، ونقره يفتح **خيطًا خاصًّا** يصوغ فيه
 * الذكاء الحلول بسياق هذا النقص وحده (sendMessageV2 بحقائقه). يحلّ تشويش تعدّد
 * الطلبات: كلّ كرت حديثه منفصل. أوّل فتح يُعلّم الكرت مقروءًا فيهدأ الأوربّ.
 */
function CoverageCard({ notif, user, clinicId, onSeen }: {
  notif: ConvoNotif;
  user: { id: string; name: string; role: string; clinicId?: string | null; clinicName?: string };
  clinicId?: string | null;
  onSeen: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [history, setHistory] = useState<V2Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [reply, setReply] = useState('');
  const startedRef = useRef(false);

  // كرت «تغطية نقص — قرارك» (احتياطيّ خاصّ): خياراته أزرارٌ بالكود (الخوارزميّة تنصّ،
  // لا الذكاء — توفيرًا للكلفة). لا خيطَ ذكاءٍ ولا خانةَ كتابة.
  const isReserveChoice = !!notif.data?.reserve_choice;

  // حالة الكرت: معلّق (أحمر — تذكير) / متجاهَل (هذا القائد فقط) / تمّ (حُلّ يدويًّا
  // أو أغلقه المحرّك تلقائيًّا بعد تنفيذ التغطية = accepted)
  const status: 'pending' | 'ignored' | 'done' =
    !notif.action_status || notif.action_status === 'pending' ? 'pending'
      : notif.action_status === 'ignored' ? 'ignored' : 'done';

  // سحب الكرت يمينًا يكشف Done/Dismiss (متحرّك، يتبع الإصبع ويثبّت/يُغلق بنعومة)
  // يعمل **فقط والكرت مغلق** (expandedRef) — لا أثناء فتحه.
  const SW_OPEN = scale(140);
  const tx = useRef(new Animated.Value(0)).current;
  const swBase = useRef(0);
  const expandedRef = useRef(false);
  const closeSwipe = useCallback(() => {
    Animated.spring(tx, { toValue: 0, useNativeDriver: false, bounciness: 0, speed: 16 }).start();
    swBase.current = 0;
  }, [tx]);
  const horizontal = (g: { dx: number; dy: number }) => Math.abs(g.dx) > Math.abs(g.dy) * 1.2 && Math.abs(g.dx) > 8;
  const swipePan = useRef(PanResponder.create({
    onMoveShouldSetPanResponder: (_e, g) => !expandedRef.current && horizontal(g),
    // يخطف السحب الأفقيّ قبل أزرار الرأس/الحلول (وإلّا تبتلعه اللمسات الداخليّة)
    onMoveShouldSetPanResponderCapture: (_e, g) => !expandedRef.current && horizontal(g),
    onPanResponderGrant: () => { tx.stopAnimation((v: number) => { swBase.current = v; }); },
    onPanResponderMove: (_e, g) => {
      let x = swBase.current + g.dx;
      if (x < 0) x = 0; else if (x > SW_OPEN) x = SW_OPEN + (x - SW_OPEN) * 0.12;
      tx.setValue(Math.min(x, SW_OPEN));
    },
    onPanResponderRelease: (_e, g) => {
      const open = (swBase.current + g.dx) > SW_OPEN * 0.45;
      Animated.spring(tx, { toValue: open ? SW_OPEN : 0, useNativeDriver: false, bounciness: 0, speed: 16 }).start();
      swBase.current = open ? SW_OPEN : 0;
    },
    onPanResponderTerminationRequest: () => false,  // لا يخطف الـScrollView السحب في منتصفه
  })).current;

  const mark = useCallback(async (s: 'ignored' | 'done') => {
    try {
      const { updateNotificationAction } = await import('../lib/database');
      await updateNotificationAction(notif.id, s);
      onSeen();
    } catch { /* يُعاد المحاولة بسحبٍ آخر */ }
  }, [notif.id, onSeen]);

  // حذفُ الكرت (زرّ Delete في الدرج) — يُزيل الصفَّ نهائيًّا كبقيّة الكروت
  const onDelete = useCallback(async () => {
    closeSwipe();
    try {
      const { deleteNotification } = await import('../lib/database');
      await deleteNotification(notif.id);
      onSeen();
    } catch { /* يُعاد المحاولة بسحبٍ آخر */ }
  }, [notif.id, onSeen, closeSwipe]);

  // يحفظ الخيط في بيانات الإشعار (دمجٌ مع الحقائق) فلا يُعاد توليده عند كلّ فتح
  const persist = useCallback(async (h: V2Message[]) => {
    try {
      const { updateNotificationData } = await import('../lib/database');
      await updateNotificationData(notif.id, { ...(notif.data || {}), thread: h });
    } catch { /* الحفظ تحسينٌ لا حرج في فشله */ }
  }, [notif.id, notif.data]);

  const runTurn = useCallback(async (h: V2Message[]) => {
    setHistory(h);
    setLoading(true);
    try {
      const v2User: V2User = {
        id: user.id, name: user.name, role: user.role,
        clinicId: user.clinicId || undefined, clinicName: user.clinicName,
      };
      const res = await sendMessageV2({
        messages: h, user: v2User,
        clinicId: clinicId || user.clinicId || undefined,
        contextData: buildCoverageSeed(notif, user.id), task: 'requests',
      });
      const text = res.success ? res.message : (res.error || 'تعذّر تنفيذ الطلب.');
      const next: V2Message[] = [...h, { role: 'assistant', content: text }];
      setHistory(next);
      persist(next);
    } catch (e) {
      setHistory([...h, { role: 'assistant', content: e instanceof Error ? e.message : 'خطأ غير متوقّع.' }]);
    } finally {
      setLoading(false);
    }
  }, [notif, user, clinicId, persist]);

  const onToggle = useCallback(async () => {
    // السحب مفتوح؟ النقرة تُغلقه فقط — لا تفتح الكرت
    if (swBase.current > 0) { closeSwipe(); return; }
    const next = !expanded;
    expandedRef.current = next;
    setExpanded(next);
    if (next && !startedRef.current) {
      startedRef.current = true;
      try { await markAsRead(notif.id); onSeen(); } catch { /* يهدأ الأوربّ لاحقًا */ }
      // كرت الاحتياط: أزرارٌ بالكود — لا خيطَ ذكاءٍ (لا نداء للنموذج، توفيرًا للكلفة).
      if (isReserveChoice) return;
      // خيطٌ محفوظ سابقًا؟ حمّله بلا نداء للذكاء (توفير توكن). وإلّا ابدأ التوليد.
      const saved = Array.isArray(notif.data?.thread) ? (notif.data!.thread as V2Message[]) : null;
      if (saved && saved.length) setHistory(saved);
      else runTurn([{ role: 'user', content: SEED_TRIGGER }]);
    }
  }, [expanded, notif.id, notif.data, onSeen, runTurn, closeSwipe, isReserveChoice]);

  const send = useCallback((text: string) => {
    const t = text.trim();
    if (!t || loading) return;
    setReply('');
    runTurn([...history, { role: 'user', content: t }]);
  }, [history, loading, runTurn]);

  // ما يُعرَض: تجاوز رسالة التشغيل الخفيّة (index 0)، وآخر ردّ يحمل خياراته كأزرار
  const shown = history.filter((m, i) => !(i === 0 && m.role === 'user' && m.content === SEED_TRIGGER));

  const kind: CardKind = status === 'done' ? 'done' : status === 'ignored' ? 'ignored' : 'coverage';
  const nDays = coverageDays(notif.data || {}).length;
  const pillText = status === 'done' ? 'Done' : status === 'ignored' ? 'Dismissed'
    : `يحتاج ترتيبك${nDays > 1 ? ` · ${nDays} أيّام` : ''}`;

  return (
    <View style={styles.swWrap}>
      {/* درج Delete / Dismiss يُكشَف بالسحب يمينًا — اللونُ في منطقةِ الكشفِ فقط
          ورُبعا دائرةٍ يملآن زاويتَي الكرتِ فتتّصلُ الحدودُ دونَ لونٍ خلفَ جسمِ الكرت */}
      <Animated.View style={[styles.swTray, { opacity: tx.interpolate({ inputRange: [0, scale(16), SW_OPEN], outputRange: [0, 1, 1] }) }]}>
        <TrayColor colors={['rgba(86,78,150,0.92)', 'rgba(58,52,108,0.93)']} open={SW_OPEN} />
        <View style={styles.swActs}>
          <TouchableOpacity style={styles.swAct} activeOpacity={0.7} onPress={onDelete}>
            <Ionicons name="trash" size={scale(21)} color="#FCA5A5" />
            <Text style={[styles.swTxt, { color: '#FCA5A5' }]}>Delete</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.swAct} activeOpacity={0.7} onPress={() => { closeSwipe(); mark('ignored'); }}>
            <Ionicons name="close" size={scale(21)} color="#FDE68A" />
            <Text style={[styles.swTxt, { color: '#FDE68A' }]}>Dismiss</Text>
          </TouchableOpacity>
        </View>
      </Animated.View>

      <Animated.View style={{ transform: [{ translateX: tx }] }} {...swipePan.panHandlers}>
        <GlassCard kind={kind} glow={status === 'pending'} style={status === 'ignored' && cardStyles.glassDim}>
          <TouchableOpacity style={cardStyles.head} onPress={onToggle} activeOpacity={0.8}>
            <CardBadge kind={kind} live={status === 'pending'} />
            <View style={cardStyles.headTxt}>
              <Text style={cardStyles.cardTitle} numberOfLines={2}>{coverageTitle(notif)}</Text>
              <Pill kind={kind} text={pillText} />
            </View>
            <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={scale(18)} color="#8B83A8" />
          </TouchableOpacity>

      {expanded && (isReserveChoice ? (
        <ReserveChoiceBody notif={notif} clinicId={clinicId ?? user.clinicId} onSeen={onSeen} />
      ) : (
        <View style={cardStyles.covBody}>
          {/* نصّ الذكاء كفقرات (كالنموذج)، وردّ المستخدم كفقاعةٍ بنفسجيّة */}
          {shown.map((m, i) => (
            m.role === 'assistant'
              ? <Text key={i} style={styles.bodyPara}>{m.content}</Text>
              : (
                <View key={i} style={[styles.msg, styles.msgUser]}>
                  <Text style={[styles.msgTxt, styles.msgTxtUser]}>{m.content}</Text>
                </View>
              )
          ))}
          {loading && <ActivityIndicator color="#7C3AED" style={{ marginVertical: scale(6) }} />}

          {/* خانة حلٍّ مختلف — زرّ الإرسال (سهم) يمينًا */}
          <View style={styles.covInputRow}>
            <TouchableOpacity activeOpacity={0.85} onPress={() => send(reply)} disabled={loading}>
              <LinearGradient colors={['#A78BFA', '#7C3AED']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.sendBtn}>
                <Ionicons name="send" size={scale(17)} color="#FFFFFF" />
              </LinearGradient>
            </TouchableOpacity>
            <TextInput
              style={styles.covInput}
              value={reply}
              onChangeText={setReply}
              placeholder="حلٌّ مختلف؟ اكتب هنا"
              placeholderTextColor="rgba(244,241,255,0.42)"
              textAlign="right"
              onSubmitEditing={() => send(reply)}
            />
          </View>
        </View>
      ))}
        </GlassCard>
      </Animated.View>
    </View>
  );
}

// ───── كرت «طرأ تغييرٌ على جدولك» — توقّل + سحبٌ يمينًا يكشف زرّ «حذف» واحدًا ─────
function SeatChangeCard({ notif, onSeen }: { notif: ConvoNotif; onSeen: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const [open, setOpen] = useState(false);
  const d = notif.data || {};
  const changes: SeatChangeUI[] = Array.isArray(d.changes) ? d.changes : [];
  const live = !notif.is_read;
  const kind: CardKind = live ? 'coverage' : 'done';

  // سحب الكرت يمينًا يكشف زرّ «حذف» واحدًا — يعمل والكرت مغلق فقط (لا أثناء فتحه)
  const SW_OPEN = scale(78);
  const tx = useRef(new Animated.Value(0)).current;
  const swBase = useRef(0);
  const expandedRef = useRef(false);
  const closeSwipe = useCallback(() => {
    Animated.spring(tx, { toValue: 0, useNativeDriver: false, bounciness: 0, speed: 16 }).start();
    swBase.current = 0;
  }, [tx]);
  const horizontal = (g: { dx: number; dy: number }) => Math.abs(g.dx) > Math.abs(g.dy) * 1.2 && Math.abs(g.dx) > 8;
  const swipePan = useRef(PanResponder.create({
    onMoveShouldSetPanResponder: (_e, g) => !expandedRef.current && horizontal(g),
    onMoveShouldSetPanResponderCapture: (_e, g) => !expandedRef.current && horizontal(g),
    onPanResponderGrant: () => { tx.stopAnimation((v: number) => { swBase.current = v; }); },
    onPanResponderMove: (_e, g) => {
      let x = swBase.current + g.dx;
      if (x < 0) x = 0; else if (x > SW_OPEN) x = SW_OPEN + (x - SW_OPEN) * 0.12;
      tx.setValue(Math.min(x, SW_OPEN));
    },
    onPanResponderRelease: (_e, g) => {
      const o = (swBase.current + g.dx) > SW_OPEN * 0.45;
      Animated.spring(tx, { toValue: o ? SW_OPEN : 0, useNativeDriver: false, bounciness: 0, speed: 16 }).start();
      swBase.current = o ? SW_OPEN : 0;
    },
    onPanResponderTerminationRequest: () => false,
  })).current;

  const onDelete = useCallback(async () => {
    closeSwipe();
    try {
      const { deleteNotification } = await import('../lib/database');
      await deleteNotification(notif.id);
      onSeen();
    } catch { /* يُعاد المحاولة بسحبٍ آخر */ }
  }, [notif.id, onSeen, closeSwipe]);

  const onToggle = useCallback(async () => {
    if (swBase.current > 0) { closeSwipe(); return; }   // السحب مفتوح؟ النقرة تُغلقه فقط
    const next = !expanded;
    expandedRef.current = next;
    setExpanded(next);
    if (next && !notif.is_read) { try { await markAsRead(notif.id); onSeen(); } catch { /* يهدأ الأورب لاحقًا */ } }
  }, [expanded, notif.id, notif.is_read, onSeen, closeSwipe]);

  return (
    <View style={styles.swWrap}>
      {/* درج «حذف» — اللونُ في منطقةِ الكشفِ فقط + رُبعا دائرةٍ يملآن زاويتَي الكرتِ المستديرتَين
          فتتّصلُ الحدودُ بلا فصلٍ ودونَ أن يمتدَّ اللونُ خلفَ جسمِ الكرت. الزرُّ في منطقةِ الكشف. */}
      <Animated.View style={[styles.swTray, { opacity: tx.interpolate({ inputRange: [0, scale(16), SW_OPEN], outputRange: [0, 1, 1] }) }]}>
        <TrayColor colors={['rgba(150,58,72,0.93)', 'rgba(110,40,54,0.94)']} open={SW_OPEN} />
        <View style={{ position: 'absolute', top: 0, bottom: 0, left: 0, width: SW_OPEN }}>
          <TouchableOpacity style={styles.swAct} activeOpacity={0.7} onPress={onDelete}>
            <Ionicons name="trash" size={scale(21)} color="#FECDD3" />
            <Text style={[styles.swTxt, { color: '#FECDD3' }]}>حذف</Text>
          </TouchableOpacity>
        </View>
      </Animated.View>

      <Animated.View style={{ transform: [{ translateX: tx }] }} {...swipePan.panHandlers}>
        <GlassCard kind={kind} glow={live}>
          <TouchableOpacity style={cardStyles.head} onPress={onToggle} activeOpacity={0.8}>
            <CardBadge kind={kind} live={live} />
            <View style={cardStyles.headTxt}>
              <Text style={cardStyles.cardTitle} numberOfLines={2}>طرأ تغييرٌ على جدولك</Text>
              <Pill kind={kind} text={live ? 'جديد' : 'تمّ الاطّلاع'} />
            </View>
            <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={scale(18)} color="#8B83A8" />
          </TouchableOpacity>
          {expanded && (
            <View style={cardStyles.covBody}>
              <Text style={{ fontSize: scale(12), color: '#C9C0E8', textAlign: 'right' }}>{notif.body}</Text>
              <TouchableOpacity
                onPress={() => setOpen(true)}
                activeOpacity={0.85}
                style={{
                  flexDirection: 'row-reverse', alignItems: 'center', alignSelf: 'flex-end',
                  gap: scale(6), marginTop: scale(10), paddingVertical: scale(7), paddingHorizontal: scale(12),
                  borderRadius: scale(10), backgroundColor: 'rgba(255,255,255,0.08)',
                  borderWidth: scale(1), borderColor: 'rgba(255,255,255,0.16)',
                }}
              >
                <Ionicons name="grid-outline" size={scale(14)} color="#EDE8FF" />
                <Text style={{ fontSize: scale(12.5), color: '#F4F1FF', fontWeight: '700' }}>عرض على الجدول</Text>
              </TouchableOpacity>
            </View>
          )}
        </GlassCard>
      </Animated.View>

      <SeatChangeOverlay
        visible={open}
        onClose={() => setOpen(false)}
        doctorId={String(d.doctor_id || '')}
        doctorName={String(d.doctor_name || '')}
        changes={changes}
        clinicCount={Number(d.clinic_count || 0)}
      />
    </View>
  );
}

// ───── كرت «يوجد فترة فارغة» — نقصٌ تعذّر ملؤه (للقائد). توقّل + «تمّ الاطّلاع» + سحبٌ يمينًا «حذف» ─────
// لكلّ قائدٍ نسخته (صفٌّ مستقلّ): الحذف/الاطّلاع يخصّ المُطّلِع وحده. يختفي بعد الاطّلاع أو الحذف.
function ShortageCard({ notif, onSeen }: { notif: ConvoNotif; onSeen: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const live = !notif.is_read;
  const kind: CardKind = live ? 'coverage' : 'done';

  const SW_OPEN = scale(78);
  const tx = useRef(new Animated.Value(0)).current;
  const swBase = useRef(0);
  const expandedRef = useRef(false);
  const closeSwipe = useCallback(() => {
    Animated.spring(tx, { toValue: 0, useNativeDriver: false, bounciness: 0, speed: 16 }).start();
    swBase.current = 0;
  }, [tx]);
  const horizontal = (g: { dx: number; dy: number }) => Math.abs(g.dx) > Math.abs(g.dy) * 1.2 && Math.abs(g.dx) > 8;
  const swipePan = useRef(PanResponder.create({
    onMoveShouldSetPanResponder: (_e, g) => !expandedRef.current && horizontal(g),
    onMoveShouldSetPanResponderCapture: (_e, g) => !expandedRef.current && horizontal(g),
    onPanResponderGrant: () => { tx.stopAnimation((v: number) => { swBase.current = v; }); },
    onPanResponderMove: (_e, g) => {
      let x = swBase.current + g.dx;
      if (x < 0) x = 0; else if (x > SW_OPEN) x = SW_OPEN + (x - SW_OPEN) * 0.12;
      tx.setValue(Math.min(x, SW_OPEN));
    },
    onPanResponderRelease: (_e, g) => {
      const o = (swBase.current + g.dx) > SW_OPEN * 0.45;
      Animated.spring(tx, { toValue: o ? SW_OPEN : 0, useNativeDriver: false, bounciness: 0, speed: 16 }).start();
      swBase.current = o ? SW_OPEN : 0;
    },
    onPanResponderTerminationRequest: () => false,
  })).current;

  const onDelete = useCallback(async () => {
    closeSwipe();
    try {
      const { deleteNotification } = await import('../lib/database');
      await deleteNotification(notif.id);
      onSeen();
    } catch { /* يُعاد بسحبٍ آخر */ }
  }, [notif.id, onSeen, closeSwipe]);

  const onToggle = useCallback(() => {
    if (swBase.current > 0) { closeSwipe(); return; } // السحب مفتوح؟ النقرة تُغلقه فقط
    const next = !expanded;
    expandedRef.current = next;
    setExpanded(next);
  }, [expanded, closeSwipe]);

  // «تمّ الاطّلاع» يُعلّمه مقروءًا (فيختفي عند هذا القائد وحده) — لا قرارَ فيه، إعلامٌ فقط.
  const onAck = useCallback(async () => {
    try { await markAsRead(notif.id); onSeen(); } catch { /* يهدأ الأورب لاحقًا */ }
  }, [notif.id, onSeen]);

  return (
    <View style={styles.swWrap}>
      <Animated.View style={[styles.swTray, { opacity: tx.interpolate({ inputRange: [0, scale(16), SW_OPEN], outputRange: [0, 1, 1] }) }]}>
        <TrayColor colors={['rgba(150,58,72,0.93)', 'rgba(110,40,54,0.94)']} open={SW_OPEN} />
        <View style={{ position: 'absolute', top: 0, bottom: 0, left: 0, width: SW_OPEN }}>
          <TouchableOpacity style={styles.swAct} activeOpacity={0.7} onPress={onDelete}>
            <Ionicons name="trash" size={scale(21)} color="#FECDD3" />
            <Text style={[styles.swTxt, { color: '#FECDD3' }]}>حذف</Text>
          </TouchableOpacity>
        </View>
      </Animated.View>

      <Animated.View style={{ transform: [{ translateX: tx }] }} {...swipePan.panHandlers}>
        <GlassCard kind={kind} glow={live}>
          <TouchableOpacity style={cardStyles.head} onPress={onToggle} activeOpacity={0.8}>
            <CardBadge kind={kind} live={live} />
            <View style={cardStyles.headTxt}>
              <Text style={cardStyles.cardTitle} numberOfLines={2}>يوجد فترة فارغة</Text>
              <Pill kind={kind} text={live ? 'جديد' : 'تمّ الاطّلاع'} />
            </View>
            <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={scale(18)} color="#8B83A8" />
          </TouchableOpacity>
          {expanded && (
            <View style={cardStyles.covBody}>
              <Text style={{ fontSize: scale(12.5), color: '#C9C0E8', textAlign: 'right', lineHeight: scale(20) }}>{notif.body}</Text>
              {live && (
                <TouchableOpacity
                  onPress={onAck}
                  activeOpacity={0.85}
                  style={{
                    flexDirection: 'row-reverse', alignItems: 'center', alignSelf: 'flex-end',
                    gap: scale(6), marginTop: scale(10), paddingVertical: scale(7), paddingHorizontal: scale(12),
                    borderRadius: scale(10), backgroundColor: 'rgba(255,255,255,0.08)',
                    borderWidth: scale(1), borderColor: 'rgba(255,255,255,0.16)',
                  }}
                >
                  <Ionicons name="checkmark-circle-outline" size={scale(14)} color="#EDE8FF" />
                  <Text style={{ fontSize: scale(12.5), color: '#F4F1FF', fontWeight: '700' }}>تمّ الاطّلاع</Text>
                </TouchableOpacity>
              )}
            </View>
          )}
        </GlassCard>
      </Animated.View>
    </View>
  );
}

// ───── كرت «موازنةُ يومٍ عدّلتَه» — استئذانُ القائد قبل موازنة العدل ليومٍ عدّله يدويًّا ─────
// كرتُ قرار (نعم/لا): «نعم» يطبّق موازنةَ العدل على ذلك اليوم، «لا» يتركه كما رتّبه القائد.
// لكلّ قائدٍ نسخته؛ يُحسَم عند الجميع بأوّل قرار. يتوهّج ما دام معلّقًا (لم يُحسَم).
function RebalanceConsentCard({ notif, clinicId, onSeen }: {
  notif: ConvoNotif; clinicId?: string | null; onSeen: () => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const d = notif.data || {};
  const ws = String(d.week_start || '');
  const day = String(d.day || '');
  const cid = clinicId || d.clinic_id || '';

  const decide = useCallback(async (approve: boolean) => {
    if (busy || !cid || !ws || !day) return;
    setBusy(true); setErr(null);
    try {
      const mod = await import('../lib/ai_v2/tools_requests_v2');
      const res = approve
        ? await mod.approveRebalance({ clinicId: cid, weekStart: ws, day })
        : await mod.declineRebalance({ clinicId: cid, weekStart: ws, day });
      if (!res.success) { setErr(res.error || 'تعذّر إكمال العمليّة.'); return; }
      onSeen();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'خطأ غير متوقّع.');
    } finally { setBusy(false); }
  }, [busy, cid, ws, day, onSeen]);

  return (
    <GlassCard kind="decision" glow>
      <TouchableOpacity style={cardStyles.head} onPress={() => setExpanded((v) => !v)} activeOpacity={0.8}>
        <CardBadge kind="decision" live />
        <View style={cardStyles.headTxt}>
          <Text style={cardStyles.cardTitle} numberOfLines={2}>{notif.title || 'موازنةُ يومٍ عدّلتَه'}</Text>
          <Pill kind="decision" text="بانتظار قرارك" />
        </View>
        <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={scale(18)} color="#8B83A8" />
      </TouchableOpacity>
      {expanded && (
        <View style={cardStyles.covBody}>
          <Text style={{ fontSize: scale(12.5), color: '#C9C0E8', textAlign: 'right', lineHeight: scale(20) }}>{notif.body}</Text>
          {!!err && <Text style={{ color: '#FCA5A5', fontSize: scale(12), textAlign: 'right', marginTop: scale(6) }}>{err}</Text>}
          {busy ? (
            <ActivityIndicator color="#7C3AED" style={{ marginTop: scale(10) }} />
          ) : (
            <View style={[styles.reqActions, { marginTop: scale(10) }]}>
              <TouchableOpacity style={[styles.actBtn, styles.accept]} activeOpacity={0.85} onPress={() => decide(true)}>
                <Text style={styles.actTxt}>نعم</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.actBtn, styles.reject]} activeOpacity={0.85} onPress={() => decide(false)}>
                <Text style={styles.rejectTxt}>لا</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      )}
    </GlassCard>
  );
}

// ═══════════════════════════════════════════════════════════════
// AICardsView — لوحةُ كروت الإبلاغ المشتركة (تغطية نقص / موافقات / نتائج)
// ═══════════════════════════════════════════════════════════════
// مصدرٌ واحد: تُحمَّل من قاعدة البيانات وتُحدَّث فوريًّا (Realtime). تُستعمل في
// **المكانين**: محادثة الضغط المطوّل (AIChatModal) وصفحة الذكاء المنزلقة
// (AISchedulePanel) — فالكروت نفسها تظهر متزامنةً في كليهما، منفصلةً عن المحادثة.
export function AICardsView({ user, clinicId }: {
  user: { id: string; name: string; role: string; clinicId?: string | null; clinicName?: string };
  clinicId?: string | null;
}) {
  const [convo, setConvo] = useState<ConvoNotif[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const scrollRef = useRef<ScrollView>(null);

  const loadConvo = useCallback(async () => {
    if (!user?.id) return;
    const { data } = await getNotifications(user.id, 50);
    const sunday = currentSunday();
    const items = ((data || []) as ConvoNotif[])
      .filter((n) =>
        isPending(n)
        || (n.type === 'request_result' && !n.data?.swap_v2 && !n.is_read)
        || (n.type === 'gap_alert' && n.data?.v === 2 && String(n.data?.week_start || '') >= sunday)
        // كرت «طرأ تغييرٌ على جدولك»: يبقى ما دام غير مقروء أو فيه تاريخٌ ضمن الأسبوع الحاليّ فصاعدًا.
        || (n.type === 'seat_change' && (!n.is_read
          || (Array.isArray(n.data?.changes) && n.data.changes.some((c: { week_start?: string }) => String(c.week_start || '') >= sunday))))
        // كرت «يوجد فترة فارغة»: يظهر للقائد ما دام غير مقروء؛ يختفي بمجرّد الاطّلاع (لكلٍّ نسخته).
        || (n.type === 'shortage_alert' && !n.is_read)
        // كرت «موازنةُ يومٍ عدّلتَه»: يظهر للقائد ما دام معلّقًا؛ يختفي بحسمِه (نعم/لا).
        || (n.type === 'rebalance_consent' && isPending(n)));
    // getNotifications يُرجِع الأحدث أوّلًا — فالطلب الجديد يظهر بالأعلى (بلا reverse)
    setConvo(items);
    items.filter((n) => n.type === 'request_result').forEach((n) => markAsRead(n.id));
  }, [user?.id]);

  async function handleDecision(n: ConvoNotif, decision: 'accept' | 'reject') {
    if (!user?.id) return;
    setBusyId(n.id);
    try {
      let msg = '';
      const { updateNotificationAction } = await import('../lib/database');
      await updateNotificationAction(n.id, decision === 'accept' ? 'accepted' : 'rejected');
      msg = decision === 'accept' ? 'تمّ.' : 'رُفض.';
      setNote(msg);
      await loadConvo();
    } catch (e) {
      setNote(e instanceof Error ? e.message : 'خطأ غير متوقّع.');
    } finally {
      setBusyId(null);
    }
  }

  useEffect(() => { setNote(''); loadConvo(); }, [loadConvo]);
  useEffect(() => {
    if (!user?.id) return;
    const unsub = subscribeToNotifications(user.id, loadConvo);
    return unsub;
  }, [user?.id, loadConvo]);

  // طابورُ القرارات (طلبٌ مركّب / تراكمُ بطاقات): لا نعرض إلّا **بطاقةَ قرارٍ واحدةً** في
  // كلّ مرّة (الأحدث) — البقيّة تنتظر دورَها فتظهر تلقائيًّا بعد حسمِ الحاليّة (لا تكدّس).
  // بطاقاتُ «للعلم» (طرأ تغيير/فترة فارغة/نتيجة + التغطية التلقائيّة) لا تُقاطِع وتظهر كالمعتاد.
  const isDecisionCard = (n: ConvoNotif) =>
    (n.type === 'rebalance_consent' && isPending(n))
    || (n.type === 'gap_alert' && !!n.data?.reserve_choice)
    || (n.type !== 'gap_alert' && n.type !== 'seat_change' && n.type !== 'shortage_alert'
      && n.type !== 'request_result' && n.type !== 'rebalance_consent' && isPending(n));
  const decisionQueue = convo.filter(isDecisionCard);
  const activeDecisionId = decisionQueue.length ? decisionQueue[0].id : null;

  return (
    <ScrollView
      ref={scrollRef}
      style={{ flex: 1 }}
      contentContainerStyle={{ padding: scale(12), paddingBottom: scale(16) }}
    >
      {decisionQueue.length > 1 && (
        <Text style={styles.queueNote}>يُعرَض قرارٌ واحدٌ في كلّ مرّة — بقي {decisionQueue.length - 1} في الطابور.</Text>
      )}
      {convo.map((n) => {
        // طابور: أخفِ بطاقاتِ القرار غيرَ النشطة حتّى يُحسَم دورُها (تظهر تلقائيًّا بعده).
        if (isDecisionCard(n) && n.id !== activeDecisionId) return null;
        if (n.type === 'gap_alert') {
          if (n.data?.v !== 2) return null;
          if (coverageDays(n.data).length === 0 && !n.data?.placement && !n.data?.reserve_choice) return null;
          return (
            <CoverageCard key={n.id} notif={n} user={user} clinicId={clinicId ?? user.clinicId} onSeen={loadConvo} />
          );
        }
        if (n.type === 'seat_change') {
          return <SeatChangeCard key={n.id} notif={n} onSeen={loadConvo} />;
        }
        if (n.type === 'shortage_alert') {
          return <ShortageCard key={n.id} notif={n} onSeen={loadConvo} />;
        }
        if (n.type === 'rebalance_consent') {
          return <RebalanceConsentCard key={n.id} notif={n} clinicId={clinicId ?? user.clinicId} onSeen={loadConvo} />;
        }
        if (isPending(n)) {
          const busy = busyId === n.id;
          return (
            <GlassCard key={n.id} kind="decision" glow style={styles.feedCard}>
              <View style={cardStyles.head}>
                <CardBadge kind="decision" live />
                <View style={cardStyles.headTxt}>
                  <Text style={cardStyles.cardTitle}>بانتظار قرارك</Text>
                  <Text style={styles.cardBody}>{n.body}</Text>
                </View>
              </View>
              <View style={styles.reqActions}>
                {busy ? (
                  <ActivityIndicator color="#7C3AED" />
                ) : (
                  <>
                    <TouchableOpacity style={[styles.actBtn, styles.accept]} activeOpacity={0.85} onPress={() => handleDecision(n, 'accept')}>
                      <Text style={styles.actTxt}>موافق</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.actBtn, styles.reject]} activeOpacity={0.85} onPress={() => handleDecision(n, 'reject')}>
                      <Text style={styles.rejectTxt}>رفض</Text>
                    </TouchableOpacity>
                  </>
                )}
              </View>
            </GlassCard>
          );
        }
        return (
          <View key={n.id} style={styles.infoCard}>
            <View style={[styles.infoDot]}>
              <Ionicons name="information-circle" size={scale(15)} color="#A99FD0" />
            </View>
            <Text style={styles.infoTxt}>{n.body}</Text>
          </View>
        );
      })}

      {convo.length === 0 && (
        <Text style={styles.empty}>No notifications</Text>
      )}
      {!!note && (
        <View style={[styles.msg, styles.msgAI]}>
          <Text style={styles.msgTxt}>{note}</Text>
        </View>
      )}
    </ScrollView>
  );
}

// ═══════════════════════════════════════════════════════════════
// AIChatModal — محادثةُ الذكاء (الضغطةُ المطوّلة) — تصميمٌ مطابقٌ لصفحةِ الذكاء
// ═══════════════════════════════════════════════════════════════
// نفسُ خلفيّةِ صفحةِ الذكاء (ماءٌ حبريٌّ + إضاءاتٌ دخانيّة)، ونفسُ الرأس («DCM AI» + ترحيب)،
// ونفسُ خانةِ الإدخالِ وزرِّ الإرسالِ والجرس — كلُّها مكوّناتٌ مشتركةٌ من ChatChrome، فلا
// انحرافَ بين السطحين. التبويب (محادثة | كروت الإبلاغ) كما في صفحةِ الذكاء عبر زرِّ الجرس.
export default function AIChatModal({ visible, onClose, user, clinicId, messages, onSend, onClearConversation, onPatchMessage, onAfterAction, isLoading }: Props) {
  const [tab, setTab] = useState<'chat' | 'cards'>('chat'); // محادثة | كروت الإبلاغ
  const [unread, setUnread] = useState(0);                  // عددُ الكروت غير المقروءة/غير المحلولة (بادجُ الجرس)
  const waterProg = useSharedValue(1);                      // ماءٌ مستقرٌّ هادئ — نفسُ خلفيّةِ صفحةِ الذكاء عند الراحة
  const slide = useRef(new Animated.Value(0)).current;      // 0 = محادثة، 1 = كروت — إزاحةٌ أفقيّةٌ كصفحةِ الذكاء

  // أبعادُ البطاقة (ثابتةٌ من مقاسِ الشاشة) — لحسابِ الإزاحةِ الأفقيّةِ وتصحيحِ مسافةِ الكيبورد
  const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');
  const CARD_H_FRAC = 0.80;
  const CARD_W = Math.min(SCREEN_W - scale(30), scale(440));
  const CARD_H = SCREEN_H * CARD_H_FRAC;                    // ارتفاعُ البطاقةِ بالبكسل — لهالاتِ الضبابِ المحيطة
  const topGap = (SCREEN_H * (1 - CARD_H_FRAC)) / 2;        // فراغُ أعلى/أسفلَ البطاقةِ الموسَّطة
  const kbInset = -topGap;                                  // تصحيح: تستقرُّ الخانةُ فوقَ الكيبورد لا فوقَ حافّةِ البطاقة

  // بادجُ الجرس: نفسُ منطقِ صفحةِ الذكاء (countUnreadAIChat) — عند الفتح/التبويب وفوريًّا (Realtime)
  const refreshUnread = useCallback(async () => {
    if (!user?.id) { setUnread(0); return; }
    try { setUnread(await countUnreadAIChat(user.id)); } catch { /* تجاهل */ }
  }, [user?.id]);
  useEffect(() => { if (visible) refreshUnread(); }, [visible, tab, refreshUnread]);
  useEffect(() => {
    if (!visible || !user?.id) return;
    const unsub = subscribeToNotifications(user.id, refreshUnread);
    return unsub;
  }, [visible, user?.id, refreshUnread]);

  // عند فتحِ المنبثقة: ابدأ دائمًا على المحادثة (المسارُ عند 0)
  useEffect(() => { if (visible) { setTab('chat'); slide.setValue(0); } }, [visible, slide]);

  // التبديلُ بين المحادثةِ والكروت — إزاحةٌ أفقيّةٌ ناعمةٌ (نفسُ انيميشنِ صفحةِ الذكاء)
  const goTab = useCallback((next: 'chat' | 'cards') => {
    setTab(next);
    Keyboard.dismiss();
    Animated.timing(slide, { toValue: next === 'cards' ? 1 : 0, duration: 380, easing: Easing.bezier(0.22, 1, 0.36, 1), useNativeDriver: true }).start();
  }, [slide]);

  // مسحُ المحادثة — يكشفُه السحبُ للأسفل أعلى المحادثة (داخلَ ChatBody)
  async function handleClear() {
    try { await onClearConversation?.(); } catch { /* تجاهل */ }
    refreshUnread();
  }

  const welcome = (() => {
    const n = (user?.name || '').trim();
    const drName = n ? (/^د\s*\./.test(n) ? n : `د. ${n}`) : '';
    return drName ? `مرحبًا ${drName}` : 'مرحبًا بك';
  })();

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      {/* تعتيمٌ خفيفٌ تظهرُ الصفحةُ خلفَه — النقرُ خارجَ البطاقةِ يُغلق */}
      <View style={{ flex: 1, backgroundColor: 'rgba(6,4,16,0.62)', justifyContent: 'center', alignItems: 'center' }}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />

        {/* ضبابٌ أبيضُ كثيفٌ حولَ حدودِ النافذة (Skia — مطابقٌ على iOS وأندرويد): طبقتان مركزيّتان خلفَ
            البطاقة — واسعةٌ ناعمةٌ + كثيفةٌ تعانقُ الحدودَ مباشرة — فيبدو المتنُ خارجًا من ضبابٍ أبيض. */}
        {visible && (
          <>
            {/* الضبابُ (خلفيّةُ النافذة) يملأُ الصفحةَ كاملةً */}
            <View pointerEvents="none" style={StyleSheet.absoluteFill}>
              <FogHalo sigma={scale(58)} inset={scale(18)} color="rgba(210,185,255,0.50)" radius={scale(90)} />
            </View>
            {/* تكثيفُ الضبابِ حولَ حدودِ النافذةِ مباشرة — طبقتانِ متراكمتانِ أعمقُ لونًا وأكثفُ */}
            <View pointerEvents="none" style={{ position: 'absolute', width: CARD_W + scale(120), height: CARD_H + scale(120) }}>
              <FogHalo sigma={scale(30)} inset={scale(58)} color="rgba(188,150,252,0.95)" radius={scale(50)} />
            </View>
            <View pointerEvents="none" style={{ position: 'absolute', width: CARD_W + scale(88), height: CARD_H + scale(88) }}>
              <FogHalo sigma={scale(20)} inset={scale(40)} color="rgba(170,130,248,0.98)" radius={scale(46)} />
            </View>
          </>
        )}

        {/* البطاقةُ المنبثقةُ — بلا حدودٍ إطلاقًا؛ أطرافُ الماءِ نفسُها تتلاشى (تمويهُ Skia) وتذوبُ في الضبابِ المحيط */}
        <View style={{ width: CARD_W, height: `${CARD_H_FRAC * 100}%`, borderRadius: scale(30), overflow: 'hidden' }}>
          {/* خلفيّةُ المحادثة: ماءٌ حبريٌّ غامقٌ صلبُ المتن — **الحوافُّ الأربعُ** تتلاشى تدريجيًّا (feather)
              بشريطٍ ضيّقٍ الآن فتذوبُ حدودُ النافذةِ في ضبابِ الصفحة */}
          {visible && <ChatInkWater prog={waterProg} feather={scale(6)} />}

          {/* المسارُ الأفقيّ [محادثة | كروت] — ينزلقُ بزرِّ الجرس (نفسُ إزاحةِ صفحةِ الذكاء) */}
          <Animated.View
            style={{
              position: 'absolute', top: scale(78), left: 0, bottom: 0,
              width: CARD_W * 2, flexDirection: 'row',
              transform: [{ translateX: slide.interpolate({ inputRange: [0, 1], outputRange: [0, -CARD_W] }) }],
            }}
          >
            {/* صفحةُ المحادثة */}
            <View style={{ width: CARD_W, height: '100%' }}>
              <ChatBody
                messages={messages}
                isLoading={isLoading}
                onSend={onSend}
                user={user}
                clinicId={clinicId ?? user.clinicId}
                onPatchMessage={onPatchMessage}
                onAfterAction={onAfterAction}
                bottomInset={kbInset}
                sideInset={scale(14)}
                style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: scale(86) }}
              />
              <ChatInputBar onSend={onSend} bottomInset={kbInset} sideInset={scale(14)} />
            </View>
            {/* صفحةُ كروت الإبلاغ — نفسُ الخلفيّة */}
            <View style={{ width: CARD_W, height: '100%' }}>
              <AICardsView user={user} clinicId={clinicId ?? user.clinicId} />
            </View>
          </Animated.View>

          {/* أعلى اليسار: X (إغلاق) في المحادثة ↔ Clear Chat في الكروت — عنصران مستقلّان (كي لا
              يُقيَّدَ عرضُ Clear Chat بعرضِ X فيُلَفَّ نصُّه)، تلاشٍ متبادلٌ مع الإزاحة */}
          <Animated.View
            pointerEvents={tab === 'chat' ? 'auto' : 'none'}
            style={{ position: 'absolute', top: scale(23), left: scale(21), zIndex: 9, opacity: slide.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }) }}
          >
            <GlassNavButton icon="close" idPrefix="navCloseModal" onPress={onClose} size={scale(38)} iconSize={scale(22)} />
          </Animated.View>
          <Animated.View
            pointerEvents={tab === 'cards' ? 'auto' : 'none'}
            style={{ position: 'absolute', top: scale(30), left: scale(21), zIndex: 9, opacity: slide.interpolate({ inputRange: [0, 1], outputRange: [0, 1] }) }}
          >
            <TouchableOpacity onPress={handleClear} activeOpacity={0.85} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
              <View style={{ alignItems: 'center', justifyContent: 'center', height: scale(26), paddingHorizontal: scale(12), borderRadius: scale(13), backgroundColor: 'rgba(255,255,255,0.10)', borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.30)' }}>
                <Text numberOfLines={1} style={{ color: '#FFE4E6', fontSize: scale(11), fontWeight: '600', letterSpacing: scale(0.3) }}>Clear Chat</Text>
              </View>
            </TouchableOpacity>
          </Animated.View>

          {/* زرُّ الجرس (يمين): جرسٌ للكروت / فقاعةٌ للمحادثة — نقرُه يُزيحُ المسارَ أفقيًّا، ببادجٍ كهرمانيّ */}
          <TouchableOpacity
            onPress={() => goTab(tab === 'chat' ? 'cards' : 'chat')}
            activeOpacity={0.8}
            style={{ position: 'absolute', top: scale(25), right: scale(23), zIndex: 9, width: scale(38), height: scale(38), borderRadius: scale(19), alignItems: 'center', justifyContent: 'center' }}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons name={tab === 'chat' ? 'notifications' : 'chatbubble'} size={scale(24)} color="#EBDBFF" style={{ textShadowColor: 'rgba(168,85,247,0.95)', textShadowOffset: { width: 0, height: 0 }, textShadowRadius: scale(11) }} />
            {tab === 'chat' && unread > 0 && (
              <View style={{ position: 'absolute', top: -scale(3), right: -scale(3), minWidth: scale(18), height: scale(18), borderRadius: scale(9), backgroundColor: '#F59E0B', alignItems: 'center', justifyContent: 'center', paddingHorizontal: scale(4), borderWidth: scale(1.5), borderColor: '#fff' }}>
                <Text style={{ color: '#fff', fontSize: scale(10.5), fontWeight: '800' }}>{unread}</Text>
              </View>
            )}
          </TouchableOpacity>

          {/* رأسُ البطاقة: «DCM AI» + الترحيب — مطابقٌ لصفحةِ الذكاء */}
          <View pointerEvents="none" style={{ position: 'absolute', top: scale(18), left: 0, right: 0, alignItems: 'center', zIndex: 8 }}>
            <OutlinedText text="DCM AI" size={scale(20)} spacing={scale(1.2)} color="#F4ECFF" outline="rgba(138,99,230,0.85)" glow="rgba(168,85,247,0.95)" />
            <Text style={{ marginTop: scale(2), color: 'rgba(222,208,255,0.92)', fontSize: scale(12), fontWeight: '800' }}>{welcome}</Text>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  // ── المودال القديم (الضغط المطوّل) — يُطابَق لاحقًا ──
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: scale(16) },
  card: { width: '100%', maxWidth: scale(440), height: '74%', backgroundColor: '#FFFFFF', borderRadius: scale(20), overflow: 'hidden' },
  header: {
    flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: scale(16), paddingVertical: scale(12), borderBottomWidth: 1, borderBottomColor: '#ECEFF0',
  },
  headerTitle: { fontSize: scale(17), fontWeight: '800', color: '#1A2B2B' },
  closeBtn: { paddingVertical: scale(4), paddingHorizontal: scale(8) },
  closeTxt: { fontSize: scale(14), fontWeight: '700', color: '#2D8C8C' },
  body: { flex: 1, backgroundColor: '#F7F9FA' },
  inputRow: {
    flexDirection: 'row-reverse', alignItems: 'flex-end', gap: scale(8),
    paddingHorizontal: scale(12), paddingVertical: scale(10), borderTopWidth: 1, borderTopColor: '#ECEFF0', backgroundColor: '#FFFFFF',
  },
  input: {
    flex: 1, maxHeight: scale(110), minHeight: scale(42), backgroundColor: '#F2F4F5', borderRadius: scale(12),
    paddingHorizontal: scale(12), paddingVertical: scale(10), fontSize: scale(14), color: '#1A2B2B',
  },

  empty: { textAlign: 'center', color: 'rgba(244,241,255,0.5)', marginTop: scale(46), fontSize: scale(13.5), fontWeight: '600', letterSpacing: scale(0.3) },
  queueNote: { textAlign: 'right', color: 'rgba(214,196,255,0.75)', fontSize: scale(12), fontWeight: '700', marginBottom: scale(8), paddingHorizontal: scale(4) },

  // ════════ Aurora (داكن) — لغة الكروت المشتركة في AICard.tsx ════════
  feedCard: { marginBottom: scale(14) },
  cardBody: { fontSize: scale(13), color: 'rgba(244,241,255,0.66)', textAlign: 'right', lineHeight: scale(20), fontWeight: '500', marginTop: scale(3) },

  // ── كرت معلوماتيّ (خافت، داكن) ──
  infoCard: {
    flexDirection: 'row-reverse', alignItems: 'flex-start', gap: scale(10),
    alignSelf: 'stretch', backgroundColor: 'rgba(45,38,92,0.55)', borderRadius: scale(16),
    paddingVertical: scale(12), paddingHorizontal: scale(13), marginBottom: scale(10),
    borderWidth: scale(1), borderColor: 'rgba(255,255,255,0.10)',
    borderRightWidth: scale(3), borderRightColor: 'rgba(148,163,184,0.55)',
  },
  infoDot: { width: scale(26), height: scale(26), borderRadius: scale(8), alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(169,159,208,0.14)', borderWidth: scale(1), borderColor: 'rgba(169,159,208,0.26)' },
  infoTxt: { flex: 1, fontSize: scale(13), color: 'rgba(244,241,255,0.6)', textAlign: 'right', lineHeight: scale(20), fontWeight: '500' },

  // ── جسم التغطية: نصٌّ + حلولٌ زجاجيّة + إدخال ──
  msg: { maxWidth: '88%', borderRadius: scale(15), paddingHorizontal: scale(12), paddingVertical: scale(10), marginBottom: scale(8) },
  msgUser: { alignSelf: 'flex-start', backgroundColor: '#7C3AED' },
  msgAI: { alignSelf: 'flex-end', backgroundColor: 'rgba(255,255,255,0.08)', borderWidth: scale(1), borderColor: 'rgba(255,255,255,0.14)' },
  msgTxt: { fontSize: scale(13.5), color: '#F4F1FF', textAlign: 'right', lineHeight: scale(20) },
  msgTxtUser: { color: '#FFFFFF' },
  // كرت سؤال الذكاء (decision) — نصّ السؤال + أزرار مكدّسة، بنفس لغة كرت الإبلاغ
  qWrap: { alignSelf: 'stretch', marginTop: scale(8), marginBottom: scale(2) },
  qBody: { fontSize: scale(13.5), color: '#F4F1FF', textAlign: 'right', lineHeight: scale(21), fontWeight: '500', marginBottom: scale(2) },
  qOpt: {
    alignSelf: 'stretch', marginTop: scale(7), paddingVertical: scale(9), paddingHorizontal: scale(12),
    borderRadius: scale(10), backgroundColor: 'rgba(255,255,255,0.08)', borderWidth: scale(1), borderColor: 'rgba(167,139,250,0.30)',
  },
  qOptTxt: { fontSize: scale(13.5), color: '#F1EAFF', fontWeight: '800', textAlign: 'center' },
  // زرّ إعادة طلب التبديل (كرت النقص) — زرٌّ مفرد
  chipRow: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: scale(8), marginTop: scale(8) },
  chip: {
    paddingVertical: scale(9), paddingHorizontal: scale(13), borderRadius: scale(13),
    backgroundColor: 'rgba(255,255,255,0.06)', borderWidth: scale(1), borderColor: 'rgba(255,255,255,0.12)',
  },
  chipTxt: { color: '#E9DEFF', fontSize: scale(13), fontWeight: '700' },
  covBtnGroup: { alignSelf: 'flex-end', maxWidth: '92%', marginBottom: scale(6) },
  covBtnDay: { fontSize: scale(12), color: '#C4B5FD', textAlign: 'right', fontWeight: '800', marginBottom: scale(2) },
  // نصّ الذكاء كفقرة (كالنموذج)
  bodyPara: { fontSize: scale(13.5), color: 'rgba(244,241,255,0.66)', textAlign: 'right', lineHeight: scale(21), fontWeight: '500', marginBottom: scale(11) },
  // سطر فرق تعويض النقص: المقعد + الشاغل الجديد + (كان القديم)
  // كرت تعويض النقص — مسوّدة الشفت المصغّرة
  fillHint: { fontSize: scale(11), color: 'rgba(214,196,255,0.7)', textAlign: 'right', marginTop: scale(10) },
  gridWrap: { marginTop: scale(10), backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: scale(12), padding: scale(10), borderWidth: scale(1), borderColor: 'rgba(255,255,255,0.18)' },
  gridHeadRow: { flexDirection: 'row-reverse', gap: scale(4), marginBottom: scale(6) },
  gridCellHead: { flex: 1, alignItems: 'center' },
  gridHeadTxt: { fontSize: scale(10), fontWeight: '800', color: 'rgba(255,255,255,0.7)', textAlign: 'center' },
  gridRow: { flexDirection: 'row-reverse', gap: scale(4), marginBottom: scale(4) },
  gridLabel: { width: scale(46), justifyContent: 'center' },
  gridLabelTxt: { fontSize: scale(10), fontWeight: '800', color: 'rgba(255,255,255,0.6)', textAlign: 'center' },
  gridCell: { flex: 1, minHeight: scale(30), borderWidth: scale(1), borderColor: 'rgba(255,255,255,0.22)', borderRadius: scale(7), paddingVertical: scale(3), paddingHorizontal: scale(3), justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.04)' },
  cellDoc: { borderRadius: scale(5), paddingVertical: scale(2) },
  cellActive: { backgroundColor: 'rgba(139,92,246,0.6)' },
  cellDocTxt: { fontSize: scale(10.5), fontWeight: '700', color: '#fff', textAlign: 'center' },
  cellEmpty: { fontSize: scale(10), color: 'rgba(255,255,255,0.3)', textAlign: 'center' },
  exWrap: { marginTop: scale(10), paddingTop: scale(8), borderTopWidth: scale(1), borderTopColor: 'rgba(255,255,255,0.14)' },
  exHead: { fontSize: scale(10), fontWeight: '800', color: 'rgba(255,255,255,0.55)', textAlign: 'right', marginBottom: scale(6) },
  exRow: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: scale(6) },
  exChip: { borderWidth: scale(1), borderColor: 'rgba(255,255,255,0.3)', borderRadius: scale(7), paddingVertical: scale(4), paddingHorizontal: scale(8), backgroundColor: 'rgba(255,255,255,0.05)' },
  exChipTxt: { fontSize: scale(10.5), fontWeight: '700', color: '#fff' },
  // الحلول كخيارات عريضة زجاجيّة
  optGroup: { alignSelf: 'stretch', marginBottom: scale(4) },
  optDay: { fontSize: scale(12), color: '#C4B5FD', textAlign: 'right', fontWeight: '800', marginBottom: scale(6), marginTop: scale(2) },
  opt: {
    alignSelf: 'stretch', marginBottom: scale(8), paddingVertical: scale(12), paddingHorizontal: scale(14),
    borderRadius: scale(14), backgroundColor: 'rgba(255,255,255,0.06)', borderWidth: scale(1), borderColor: 'rgba(255,255,255,0.12)',
  },
  optTxt: { fontSize: scale(13.5), color: '#F4F1FF', textAlign: 'right', fontWeight: '700', lineHeight: scale(20) },
  // كرت «تغطية نقص — قرارك»: أزرار المرشّحين + «لا أحد» (بالكود، لا ذكاء)
  rcErr: { fontSize: scale(12.5), color: '#FCA5A5', textAlign: 'right', fontWeight: '700', marginTop: scale(6) },
  rcSeat: { fontSize: scale(11.5), color: '#C4B5FD', textAlign: 'right', fontWeight: '800', marginBottom: scale(4) },
  rcOpt: {
    alignSelf: 'stretch', marginTop: scale(7), paddingVertical: scale(9), paddingHorizontal: scale(12),
    borderRadius: scale(10), backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: scale(1), borderColor: 'rgba(255,255,255,0.16)',
  },
  rcOptMuted: { backgroundColor: 'rgba(255,255,255,0.04)', marginTop: scale(10) },
  rcOptTxt: { fontSize: scale(13), color: '#F4F1FF', textAlign: 'right', fontWeight: '700' },
  covInputRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: scale(8), marginTop: scale(10) },
  covInput: {
    flex: 1, minHeight: scale(44), maxHeight: scale(90), borderRadius: scale(999),
    backgroundColor: 'rgba(255,255,255,0.05)', borderWidth: scale(1), borderColor: 'rgba(255,255,255,0.12)',
    paddingHorizontal: scale(16), paddingVertical: scale(9), fontSize: scale(13.5), color: '#F4F1FF',
  },
  sendBtn: { width: scale(44), height: scale(44), borderRadius: scale(22), alignItems: 'center', justifyContent: 'center' },
  sendTxt: { color: '#FFFFFF', fontSize: scale(12.5), fontWeight: '800' },

  annAsk: { fontSize: scale(12.5), color: 'rgba(244,241,255,0.6)', textAlign: 'right', marginTop: scale(8), fontWeight: '700' },
  annNote: { fontSize: scale(12.5), color: '#C4B5FD', textAlign: 'right', marginTop: scale(10), fontWeight: '700' },

  // ── أزرار: قرار (موافق/رفض) + زرّ أساسيّ ──
  reqActions: { flexDirection: 'row-reverse', gap: scale(10), marginTop: scale(13) },
  actBtn: { flex: 1, paddingVertical: scale(11), borderRadius: scale(14), alignItems: 'center' },
  accept: { backgroundColor: '#7C3AED' },
  reject: { backgroundColor: 'rgba(255,255,255,0.06)', borderWidth: scale(1), borderColor: 'rgba(255,255,255,0.16)' },
  actTxt: { color: '#FFFFFF', fontSize: scale(14), fontWeight: '800' },
  rejectTxt: { color: '#C4B5FD', fontSize: scale(14), fontWeight: '800' },
  primaryBtn: { marginTop: scale(13), paddingVertical: scale(12), borderRadius: scale(14), backgroundColor: '#7C3AED', alignItems: 'center' },
  primaryBtnTxt: { color: '#FFFFFF', fontSize: scale(14), fontWeight: '800' },

  // ── السحب: درج Done / Dismiss امتدادٌ زجاجيٌّ داكن بنفس مادّة الكرت ──
  swWrap: { position: 'relative', marginBottom: scale(14) },
  // الدرج خلف الكرت بكامل عرضه ونفس استدارته (22) وتدرّجه — حوافه متّصلةٌ بحواف الكرت
  swTray: {
    position: 'absolute', top: 0, bottom: 0, left: 0, right: 0,
    borderRadius: scale(22), overflow: 'hidden',
  },
  // الخياران في يسار الدرج (يُكشفان بالسحب)، والباقي يبقى تحت الكرت
  swActs: { position: 'absolute', top: 0, bottom: 0, left: 0, width: scale(140), flexDirection: 'row' },
  swAct: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: scale(5) },
  swTxt: { fontSize: scale(11.5), fontWeight: '800' },
});
