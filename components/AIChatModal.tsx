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
  Modal, View, Text, ScrollView, TextInput, TouchableOpacity,
  ActivityIndicator, KeyboardAvoidingView, Platform, StyleSheet, PanResponder, Animated,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { getNotifications, markAsRead, subscribeToNotifications } from '../lib/database';
import { notifications as notifEngine } from '../lib/algorithms/notifications';
import { sendMessageV2, type V2Message, type V2User } from '../lib/ai_v2';
import AssistantOffers from './AssistantOffers';
import { CardBadge, Pill, GlassCard, cardStyles, type CardKind } from './AICard';
import { ChatMessage } from './aiTypes';
import { scale } from '../lib/scale';

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
const AI_CHAT_TYPES = ['coverage_request', 'gap_alert', 'request_result'];
const inAIChat = (n: { type: string; data?: any }) =>
  AI_CHAT_TYPES.includes(n.type) && !(n.type === 'request_result' && n.data?.swap_v2);
const isActionType = (t: string) => t === 'coverage_request' || t === 'gap_alert';
const isPending = (n: { type: string; action_type?: string | null; action_status?: string | null }) =>
  isActionType(n.type) && n.action_type === 'accept_reject' && (!n.action_status || n.action_status === 'pending');

/** يفصل خيارات [نعم] [لا] من نصّ رسالة الذكاء لعرضها كأزرار قابلة للنقر */
function parseChoices(content: string): { text: string; choices: string[] } {
  const choices: string[] = [];
  const re = /\[([^\]\n]{1,30})\]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(content)) !== null) choices.push(m[1].trim());
  const text = content.replace(re, '').replace(/[ \t]+\n/g, '\n').trim();
  return { text, choices };
}

/** عدد عناصر محادثة الذكاء غير المقروءة (طلب معلّق أو نتيجة جديدة) — للون الزرّ الأحمر */
export async function countUnreadAIChat(userId: string): Promise<number> {
  if (!userId) return 0;
  const { data } = await getNotifications(userId, 50);
  return (data || []).filter((n: ConvoNotif) => {
    // gap_alert: تغطية v2 (data.v===2) تُحمّر الزرّ ما دامت معلّقةً وغير مقروءة. بمجرّد
    // فتح القائد للكرت تُعلَّم مقروءةً فيهدأ الأوربّ، ويبقى الكرت للمرجع. القديمة بلا v2 تُستثنى.
    if (n.type === 'gap_alert') return n.data?.v === 2 && isPending(n) && !n.is_read;
    // coverage_fill: كرت تعويض النقص يُحمّر الزرّ ما دام معلّقًا (لا دفع — لون الزرّ فقط)
    if (n.type === 'coverage_fill') return !n.action_status || n.action_status === 'pending';
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
  // كرت «استئذان يحتاج ترتيبًا»: طبيبٌ استأذن وهو يستلم خانةً في فترةٍ يحجبها
  // استئذانه — الذكاء يعرض الحال على القائد وينفّذ ما يأمر به (تبديل/نقل).
  // يُغلَق الكرت تلقائيًّا متى زال التعارض.
  if (d.perm_conflict) {
    const p = d.perm_conflict as { day?: string; doctor_id?: string; doctor_name?: string; status_ar?: string };
    const dayAr = DAY_AR_SEED[p.day || ''] || p.day || '';
    const self = !!selfId && p.doctor_id === selfId;
    return [
      'حدثٌ داخليّ (لا تذكر أنّه مُعطى لك): طبيبٌ سجّل استئذانًا وهو يستلم خانةً في',
      'الفترة التي يحجبها استئذانه — اسمه باقٍ في الجدول لكن يلزم تبديل فترة عمله',
      '(أو نقله) كي لا تبقى عيادته معلّقةً وقت الاستئذان. ابدأ أنت الحديث مع القائد',
      self
        ? 'كأنّك لاحظتَ ذلك بنفسك — وهو نفسه صاحب الاستئذان فخاطبه مباشرةً: أخبره'
        : `كأنّك لاحظتَ ذلك بنفسك: أخبره أنّ ${dr(p.doctor_name)} (${p.status_ar || 'استئذان'})`,
      self
        ? `أنّ استئذانه (${p.status_ar || 'استئذان'}) يوم ${dayAr} يتعارض مع استلامه، واسأله`
        : `يوم ${dayAr} يستلم وقتَ استئذانه، واسأله **سطرًا واحدًا** كيف يرتّبه —`,
      self
        ? '**سطرًا واحدًا** كيف يرتّب فترته — **بلا اقتراحات ولا خيارات**.'
        : '**بلا اقتراحات ولا خيارات**.',
      'ثمّ نفّذ ما يطلبه كما هو بأدواتك (تبديل طبيبين → swap_doctors بهذا اليوم',
      'والأسبوع أدناه). أكّد بسطرٍ بعد التنفيذ.',
      '',
      `الأسبوع: ${d.week_start || ''}`,
      `اليوم: ${p.day || ''} (${dayAr})`,
      `الطبيب المستأذن: ${dr(p.doctor_name)}${self ? ' (هو القائد المخاطَب نفسه)' : ''}`,
    ].join('\n');
  }
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
  // التغطية انتقلت إلى بناء الجدول (كرت coverage_fill) — هذا الكرت لم يعد يُنشأ للنقص.
  return '';
}

/** عنوان الكرت الثابت: الطبيب الغائب + أيّام النقص (بلا حلول وبلا فترات). */
function coverageTitle(n: ConvoNotif): string {
  const d = n.data || {};
  if (d.perm_conflict) {
    const p = d.perm_conflict as { day?: string; doctor_name?: string };
    const dayAr = DAY_AR_SEED[p.day || ''] || p.day || '';
    return `استئذان يحتاج ترتيبًا — ${dr(p.doctor_name)}${dayAr ? `: ${dayAr}` : ''}`;
  }
  if (d.placement) {
    const p = d.placement as { day?: string; doctor_name?: string };
    const dayAr = DAY_AR_SEED[p.day || ''] || p.day || '';
    return `عودة تحتاج مكانًا — ${dr(p.doctor_name)}${dayAr ? `: ${dayAr}` : ''}`;
  }
  return 'نقص';
}

const SEED_TRIGGER = 'ابدأ'; // أوّل رسالة خفيّة تُشغّل صياغة الذكاء داخل الكرت (لا تُعرَض)

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
      // خيطٌ محفوظ سابقًا؟ حمّله بلا نداء للذكاء (توفير توكن). وإلّا ابدأ التوليد.
      const saved = Array.isArray(notif.data?.thread) ? (notif.data!.thread as V2Message[]) : null;
      if (saved && saved.length) setHistory(saved);
      else runTurn([{ role: 'user', content: SEED_TRIGGER }]);
    }
  }, [expanded, notif.id, notif.data, onSeen, runTurn, closeSwipe]);

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
      {/* درج Done / Dismiss — امتدادٌ زجاجيٌّ يُكشَف بالسحب يمينًا (لكلّ الحالات) */}
      {/* الدرج خلف الكرت بكامل عرضه ونفس استدارته وتدرّجه — فزوايا الكرت المستديرة
          تكشفه (لا الخلفيّة)، فيبدوان قطعةً واحدة متّصلة الحواف */}
      <Animated.View style={[styles.swTray, { opacity: tx.interpolate({ inputRange: [0, scale(16), SW_OPEN], outputRange: [0, 1, 1] }) }]}>
        <LinearGradient
          colors={['rgba(86,78,150,0.92)', 'rgba(58,52,108,0.93)']}
          start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        <View style={styles.swActs}>
          <TouchableOpacity style={styles.swAct} activeOpacity={0.7} onPress={() => { closeSwipe(); mark('done'); }}>
            <Ionicons name="checkmark" size={scale(21)} color="#34D399" />
            <Text style={[styles.swTxt, { color: '#34D399' }]}>Done</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.swAct} activeOpacity={0.7} onPress={() => { closeSwipe(); mark('ignored'); }}>
            <Ionicons name="close" size={scale(21)} color="#FB7185" />
            <Text style={[styles.swTxt, { color: '#FB7185' }]}>Dismiss</Text>
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

      {expanded && (
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
      )}
        </GlassCard>
      </Animated.View>
    </View>
  );
}

// ───────────── كرت تعويض النقص: مسوّدة شفتٍ مصغّرة، يُعاينها القائد ويبدّل بالنقر ─────────────
type FillSlot = { clinicNumber: number; period: number; role: string; doctorId: string; doctorName: string };

/** يبدّل طبيبين بكامل خاناتهما في الشفت (الفترتان معًا — لا يكسر التزاوج) */
// يبدّل **مجموعتين** لا فردين: المتدرّب الظلّ يشغل نفس مقاعد مدرّبه تمامًا، فيُحسَب
// معه (كلّ مَن يشغل نفس مقاعد المختار = مجموعته)، وينتقل معه عند التبديل لا وحده.
function swapFillDocs(slots: FillSlot[], idA: string, idB: string): FillSlot[] {
  if (idA === idB) return slots;
  const key = (c: number, p: number) => `${c}|${p}`;
  const seatsOf = (id: string) => {
    const m = new Map<string, { c: number; p: number; role: string }>();
    for (const s of slots) if (s.doctorId === id) m.set(key(s.clinicNumber, s.period), { c: s.clinicNumber, p: s.period, role: s.role });
    return [...m.values()];
  };
  const aSeats = seatsOf(idA);
  const bSeats = seatsOf(idB);
  if (aSeats.length === 0 || bSeats.length === 0) return slots;
  const aKeys = new Set(aSeats.map((x) => key(x.c, x.p)));
  const bKeys = new Set(bSeats.map((x) => key(x.c, x.p)));
  // نفس المقاعد (مشرف ↔ ظلّه) → لا تبديل (تجنّب التكرار)
  if (aKeys.size === bKeys.size && [...aKeys].every((k) => bKeys.has(k))) return slots;
  // المجموعة = كلّ طبيبٍ يشغل **نفس** مقاعد المختار تمامًا (المشرف + ظلاله)
  const sameSeats = (id: string, keys: Set<string>) => {
    const ks = new Set(slots.filter((s) => s.doctorId === id).map((s) => key(s.clinicNumber, s.period)));
    return ks.size === keys.size && [...ks].every((k) => keys.has(k));
  };
  const groupOf = (keys: Set<string>) =>
    [...new Set(slots.filter((s) => keys.has(key(s.clinicNumber, s.period))).map((s) => s.doctorId))].filter((id) => sameSeats(id, keys));
  const groupA = groupOf(aKeys);
  const groupB = groupOf(bKeys);
  const nameOf = (id: string) => slots.find((s) => s.doctorId === id)?.doctorName ?? '';
  // أزِل مقاعد المجموعتين، ثمّ أعِد: مقاعد A ← أطباء B، ومقاعد B ← أطباء A (مع الحفاظ على دور كلّ مقعد)
  const out = slots.filter((s) => !aKeys.has(key(s.clinicNumber, s.period)) && !bKeys.has(key(s.clinicNumber, s.period)));
  const fill = (seats: { c: number; p: number; role: string }[], group: string[]) => {
    for (const seat of seats) for (const id of group) out.push({ clinicNumber: seat.c, period: seat.p, role: seat.role, doctorId: id, doctorName: nameOf(id) });
  };
  fill(aSeats, groupB);
  fill(bSeats, groupA);
  return out;
}

function FillCell({ docs, sel, onTap }: { docs: { id: string; name: string }[]; sel: string | null; onTap: (id: string) => void }) {
  return (
    <View style={styles.gridCell}>
      {docs.length > 0 ? docs.map((d, i) => (
        <TouchableOpacity
          key={`${d.id}-${i}`}
          activeOpacity={0.7}
          hitSlop={{ top: scale(4), bottom: scale(4), left: scale(2), right: scale(2) }}
          onPress={() => onTap(d.id)}
          style={[styles.cellDoc, sel === d.id && styles.cellActive]}
        >
          <Text numberOfLines={1} style={styles.cellDocTxt}>{d.name}</Text>
        </TouchableOpacity>
      )) : <Text style={styles.cellEmpty}>—</Text>}
    </View>
  );
}

// نفس الأطباء في الفترتين = منفرد (يستلم العيادة كاملةً) → حاوية واحدة
function sameDocs(a: { id: string }[], b: { id: string }[]): boolean {
  if (a.length === 0 || a.length !== b.length) return false;
  const sa = new Set(a.map((d) => d.id));
  return b.every((d) => sa.has(d.id));
}

function FillRow({ label, left, right, sel, onTap }: {
  label: string; left: { id: string; name: string }[]; right: { id: string; name: string }[];
  sel: string | null; onTap: (id: string) => void;
}) {
  const merged = sameDocs(left, right);   // منفرد → خانةٌ واحدةٌ تمتدّ على الفترتين
  return (
    <View style={styles.gridRow}>
      <View style={styles.gridLabel}><Text style={styles.gridLabelTxt}>{label}</Text></View>
      {merged ? (
        <FillCell docs={left} sel={sel} onTap={onTap} />
      ) : (
        <>
          <FillCell docs={left} sel={sel} onTap={onTap} />
          <FillCell docs={right} sel={sel} onTap={onTap} />
        </>
      )}
    </View>
  );
}

function CoverageFillCard({ notif, clinicId, onDone, setNote }: {
  notif: ConvoNotif; clinicId?: string; onDone: () => void | Promise<void>; setNote: (s: string) => void;
}) {
  const d = notif.data || {};
  const shift: 'morning' | 'evening' = d.shift === 'evening' ? 'evening' : 'morning';
  const [pa, pb] = shift === 'morning' ? [1, 2] : [3, 4];
  const [slots, setSlots] = useState<FillSlot[]>(() => ((d.slots as FillSlot[]) || []).map((s) => ({ ...s })));
  const [sel, setSel] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [expanded, setExpanded] = useState(false);

  // حالة الكرت: معلّق (أحمر) / متجاهَل (دسمس) / تمّ (أخضر — نُفّذ أو دن). يبقى خلال أسبوعه.
  const status: 'pending' | 'ignored' | 'done' =
    !notif.action_status || notif.action_status === 'pending' ? 'pending'
      : notif.action_status === 'ignored' ? 'ignored' : 'done';
  const resolved = status !== 'pending';

  // درج Done/Dismiss بالسحب يمينًا — يعمل والكرت مغلق فقط (كبقيّة الكروت)
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
    onPanResponderTerminationRequest: () => false,
  })).current;

  const mark = useCallback(async (s: 'ignored' | 'done') => {
    try {
      const { updateNotificationAction } = await import('../lib/database');
      await updateNotificationAction(notif.id, s);
      await onDone();
    } catch { /* يُعاد بسحبٍ آخر */ }
  }, [notif.id, onDone]);

  const onToggle = useCallback(() => {
    if (swBase.current > 0) { closeSwipe(); return; }   // السحب مفتوح؟ النقرة تُغلقه فقط
    const next = !expanded;
    expandedRef.current = next;
    setExpanded(next);
  }, [expanded, closeSwipe]);

  const onTap = (id: string) => {
    if (resolved) return;                        // بعد الحلّ: عرضٌ فقط
    if (!sel) { setSel(id); return; }            // تحديد
    if (sel === id) { setSel(null); return; }    // نفسه → إلغاء
    setSlots((s) => swapFillDocs(s, sel, id));    // تبديل ثمّ إلغاء
    setSel(null);
  };

  const clinics = [...new Set(slots.filter((s) => s.role === 'clinic').map((s) => s.clinicNumber))].sort((a, b) => a - b);
  const hasDlg = slots.some((s) => s.role === 'delegator');
  const exDocs = (() => {
    const seen = new Set<string>(); const out: { id: string; name: string }[] = [];
    for (const s of slots) { if (s.role !== 'ex' || seen.has(s.doctorId)) continue; seen.add(s.doctorId); out.push({ id: s.doctorId, name: s.doctorName }); }
    return out;
  })();
  const pick = (role: string, period: number, clinicNum?: number) =>
    slots.filter((s) => s.role === role && s.period === period && (clinicNum == null || s.clinicNumber === clinicNum))
      .map((s) => ({ id: s.doctorId, name: s.doctorName }));

  const apply = async () => {
    if (busy) return;
    setBusy(true);
    try {
      if (!clinicId) throw new Error('لا توجد عيادة مرتبطة.');
      const payload = slots.map((s) => ({ day: d.day, period: s.period, clinicNumber: s.clinicNumber, role: s.role, doctor: { id: s.doctorId, name: s.doctorName } }));
      const { schedule } = await import('../lib/algorithms/schedule');
      const res = await schedule.applyShiftRedistribution({ clinicId, weekStart: String(d.week_start || ''), day: d.day, shift, slots: payload as never });
      if (res.success) {
        const { updateNotificationAction } = await import('../lib/database');
        await updateNotificationAction(notif.id, 'accepted');   // → أخضر، يبقى ظاهرًا
        setNote('تمّ ترتيب التعويض.');
        // موازنةٌ صامتة لبقيّة الأسبوع (والأسابيع المبنيّة بعده) حفاظًا على العدالة:
        // نكتب ما تغيّر فقط، **بلا إشعار** — إشعار مرضيّة الطبيب وحده يكفي للانطباع بأنّ الجدول تغيّر.
        try {
          await schedule.rebalanceForward({
            clinicId, weekStart: String(d.week_start || ''), fromDay: d.day, fromShift: shift,
          });
        } catch { /* الموازنة تحسينٌ — لا تُفشِل التغطية المنفَّذة */ }
      } else setNote(`تعذّر: ${res.error || ''}`);
      await onDone();
    } catch (e) {
      setNote(e instanceof Error ? e.message : 'خطأ غير متوقّع.');
    } finally { setBusy(false); }
  };

  const kind: CardKind = status === 'done' ? 'done' : status === 'ignored' ? 'ignored' : 'coverage';
  const pillText = status === 'done' ? 'تمّ' : status === 'ignored' ? 'أُهمل' : 'يحتاج تنفيذك';

  return (
    <View style={styles.swWrap}>
      {/* درج Done / Dismiss — يُكشَف بالسحب يمينًا */}
      <Animated.View style={[styles.swTray, { opacity: tx.interpolate({ inputRange: [0, scale(16), SW_OPEN], outputRange: [0, 1, 1] }) }]}>
        <LinearGradient colors={['rgba(86,78,150,0.92)', 'rgba(58,52,108,0.93)']} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }} style={StyleSheet.absoluteFill} />
        <View style={styles.swActs}>
          <TouchableOpacity style={styles.swAct} activeOpacity={0.7} onPress={() => { closeSwipe(); mark('done'); }}>
            <Ionicons name="checkmark" size={scale(21)} color="#34D399" />
            <Text style={[styles.swTxt, { color: '#34D399' }]}>Done</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.swAct} activeOpacity={0.7} onPress={() => { closeSwipe(); mark('ignored'); }}>
            <Ionicons name="close" size={scale(21)} color="#FB7185" />
            <Text style={[styles.swTxt, { color: '#FB7185' }]}>Dismiss</Text>
          </TouchableOpacity>
        </View>
      </Animated.View>

      <Animated.View style={{ transform: [{ translateX: tx }] }} {...swipePan.panHandlers}>
        <GlassCard kind={kind} glow={status === 'pending'} style={status === 'ignored' && cardStyles.glassDim}>
          <TouchableOpacity style={cardStyles.head} onPress={onToggle} activeOpacity={0.8}>
            <CardBadge kind={kind} live={status === 'pending'} />
            <View style={cardStyles.headTxt}>
              <Text style={cardStyles.cardTitle} numberOfLines={2}>{notif.body}</Text>
              <Pill kind={kind} text={pillText} />
            </View>
            <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={scale(18)} color="#8B83A8" />
          </TouchableOpacity>

          {expanded && (
            <View style={cardStyles.covBody}>
              {!resolved && (
                <Text style={styles.fillHint}>
                  {sel ? 'انقر طبيبًا آخر للتبديل — أو انقر نفسه للإلغاء' : 'راجِع الترتيب — للتبديل انقر طبيبًا ثمّ آخر'}
                </Text>
              )}
              <View style={styles.gridWrap}>
                <View style={styles.gridHeadRow}>
                  <View style={styles.gridLabel} />
                  <View style={styles.gridCellHead}><Text style={styles.gridHeadTxt}>{`P${pa}`}</Text></View>
                  <View style={styles.gridCellHead}><Text style={styles.gridHeadTxt}>{`P${pb}`}</Text></View>
                </View>
                {clinics.map((cn) => (
                  <FillRow key={`c${cn}`} label={`CL${cn}`} sel={sel} onTap={onTap} left={pick('clinic', pa, cn)} right={pick('clinic', pb, cn)} />
                ))}
                {hasDlg && <FillRow label="DLG" sel={sel} onTap={onTap} left={pick('delegator', pa)} right={pick('delegator', pb)} />}
              </View>
              {exDocs.length > 0 && (
                <View style={styles.exWrap}>
                  <Text style={styles.exHead}>EX</Text>
                  <View style={styles.exRow}>
                    {exDocs.map((dd) => (
                      <TouchableOpacity key={dd.id} activeOpacity={0.7} onPress={() => onTap(dd.id)} style={[styles.exChip, sel === dd.id && styles.cellActive]}>
                        <Text style={styles.exChipTxt}>{dd.name}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              )}
              {!resolved && (busy ? (
                <ActivityIndicator color="#7C3AED" style={{ marginTop: scale(12) }} />
              ) : (
                <TouchableOpacity style={styles.primaryBtn} activeOpacity={0.85} onPress={apply}>
                  <Text style={styles.primaryBtnTxt}>موافق</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </GlassCard>
      </Animated.View>
    </View>
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
  const [swapBusyId, setSwapBusyId] = useState<string | null>(null);
  const [swapResults, setSwapResults] = useState<Record<string, { text: string; ok: boolean }>>({});
  const [note, setNote] = useState('');
  const scrollRef = useRef<ScrollView>(null);

  const loadConvo = useCallback(async () => {
    if (!user?.id) return;
    const { data } = await getNotifications(user.id, 50);
    const sunday = currentSunday();
    const items = ((data || []) as ConvoNotif[])
      .filter((n) =>
        isPending(n)
        || (n.type === 'coverage_fill' && (!n.action_status || n.action_status === 'pending'))
        || (n.type === 'request_result' && !n.data?.swap_v2 && !n.is_read)
        || (n.type === 'gap_alert' && n.data?.v === 2 && String(n.data?.week_start || '') >= sunday));
    // getNotifications يُرجِع الأحدث أوّلًا — فالطلب الجديد يظهر بالأعلى (بلا reverse)
    setConvo(items);
    items.filter((n) => n.type === 'request_result').forEach((n) => markAsRead(n.id));
  }, [user?.id]);

  const handlePermRetry = useCallback(async (n: ConvoNotif) => {
    const pr = n.data?.perm_retry as
      | { day: string; side: 'same' | 'other'; blocked: number[]; target_period?: number; status_ar?: string; leader_ids?: string[] }
      | undefined;
    if (!pr || swapBusyId) return;
    setSwapBusyId(n.id);
    try {
      const cid = clinicId || user.clinicId;
      if (!cid) throw new Error('لا توجد عيادة مرتبطة.');
      const mod = await import('../lib/ai_v2/tools_requests_v2');
      const perm = { blocked: pr.blocked, targetPeriod: pr.target_period, statusAr: pr.status_ar || 'استئذان', leaderIds: pr.leader_ids || [] };
      const mode = pr.side === 'other'
        ? { kind: 'other_shift' as const }
        : { kind: 'period' as const, period: pr.target_period ?? 0 };
      const res = await mod.sendSwapRequestModeByCode({
        clinicId: cid, requester: { id: user.id, name: user.name },
        weekStart: String(n.data?.week_start || ''), day: pr.day,
        mode, excludePeriods: pr.blocked, perm,
      });
      setSwapResults((p) => ({ ...p, [n.id]: { text: res.success ? (res.info || 'تمّ.') : `تعذّر: ${res.error || ''}`, ok: res.success } }));
      if (res.success) {
        const { updateNotificationAction } = await import('../lib/database');
        await updateNotificationAction(n.id, 'accepted');
      }
      loadConvo();
    } catch (e) {
      setSwapResults((p) => ({ ...p, [n.id]: { text: e instanceof Error ? e.message : 'خطأ غير متوقّع.', ok: false } }));
    } finally {
      setSwapBusyId(null);
    }
  }, [swapBusyId, clinicId, user, loadConvo]);

  async function handleDecision(n: ConvoNotif, decision: 'accept' | 'reject') {
    if (!user?.id) return;
    setBusyId(n.id);
    try {
      let msg = '';
      if (n.type === 'coverage_request') {
        const res = decision === 'accept'
          ? await notifEngine.acceptCoverage({ notificationId: n.id, accepterId: user.id, accepterRole: user.role, accepterName: user.name })
          : await notifEngine.rejectCoverage({ notificationId: n.id });
        msg = res.success ? (decision === 'accept' ? 'تمّت الموافقة وطُبّق التبديل.' : 'رفضتَ الطلب.') : `تعذّر: ${res.error || ''}`;
      } else {
        const { updateNotificationAction } = await import('../lib/database');
        await updateNotificationAction(n.id, decision === 'accept' ? 'accepted' : 'rejected');
        msg = decision === 'accept' ? 'تمّ.' : 'رُفض.';
      }
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

  return (
    <ScrollView
      ref={scrollRef}
      style={{ flex: 1 }}
      contentContainerStyle={{ padding: scale(12), paddingBottom: scale(16) }}
    >
      {convo.map((n) => {
        if (n.type === 'gap_alert') {
          if (n.data?.v !== 2) return null;
          if (n.data?.perm_retry) {
            const pr = n.data.perm_retry as { side: 'same' | 'other' };
            const label = pr.side === 'other' ? 'اطلب من الشفت الآخر' : 'اطلب من فترتك';
            return (
              <GlassCard key={n.id} kind="swap" glow style={styles.feedCard}>
                <View style={cardStyles.head}>
                  <CardBadge kind="swap" live />
                  <View style={cardStyles.headTxt}>
                    <Text style={cardStyles.cardTitle}>تنبيه استئذان</Text>
                    <Text style={styles.cardBody}>{n.body}</Text>
                  </View>
                </View>
                {swapResults[n.id]?.ok ? (
                  <Text style={styles.annNote}>{swapResults[n.id].text}</Text>
                ) : swapBusyId === n.id ? (
                  <ActivityIndicator color="#7C3AED" style={{ marginTop: scale(10) }} />
                ) : (
                  <>
                    {!!swapResults[n.id] && !swapResults[n.id].ok && (
                      <Text style={styles.annNote}>{swapResults[n.id].text}</Text>
                    )}
                    <TouchableOpacity style={styles.primaryBtn} activeOpacity={0.85} onPress={() => handlePermRetry(n)}>
                      <Text style={styles.primaryBtnTxt}>{label}</Text>
                    </TouchableOpacity>
                  </>
                )}
              </GlassCard>
            );
          }
          if (coverageDays(n.data).length === 0 && !n.data?.placement && !n.data?.perm_conflict) return null;
          return (
            <CoverageCard key={n.id} notif={n} user={user} clinicId={clinicId ?? user.clinicId} onSeen={loadConvo} />
          );
        }
        if (n.type === 'coverage_fill') {
          return <CoverageFillCard key={n.id} notif={n} clinicId={clinicId ?? user.clinicId ?? undefined} onDone={loadConvo} setNote={setNote} />;
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

export default function AIChatModal({ visible, onClose, user, clinicId, messages, onSend, onClearConversation, onPatchMessage, onAfterAction, isLoading }: Props) {
  const [convo, setConvo] = useState<ConvoNotif[]>([]);
  const [input, setInput] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [view, setView] = useState<'chat' | 'cards'>('chat'); // تبويبٌ مؤقّت: المحادثة / كروت الإبلاغ
  const scrollRef = useRef<ScrollView>(null);

  // أزرار التبديل للقائد: [أرسل طلبًا]/[بدّل مباشرة] حين يكون طرفًا، و[أبلغهما]/[لا داعي]
  // بعد تبديله اثنين، وأزرار اقتراحات الاستئذان المتعارض (زميل/فترة/شفت آخر) —
  // الضغط يُنفَّذ **بالكود مباشرةً**، لا نداء للنموذج.
  const [swapResults, setSwapResults] = useState<Record<string, { text: string; ok: boolean }>>({});
  const [swapBusyId, setSwapBusyId] = useState<string | null>(null);
  const loadConvo = useCallback(async () => {
    if (!user?.id) return;
    const { data } = await getNotifications(user.id, 50);
    // الطلبات المعلّقة + النتائج الجديدة (تختفي الموافقة/الرفض بعد قراءتها).
    // وكرت التغطية المُنهى (تمّ/متجاهَل/أغلقه المحرّك) يبقى ظاهرًا بلونه خلال أسبوعه
    // فقط — المعلّق يبقى دائمًا (أحمر، تذكير).
    const sunday = currentSunday();
    const items = ((data || []) as ConvoNotif[])
      .filter((n) =>
        isPending(n)
        || (n.type === 'coverage_fill' && (!n.action_status || n.action_status === 'pending'))
        || (n.type === 'request_result' && !n.data?.swap_v2 && !n.is_read)
        || (n.type === 'gap_alert' && n.data?.v === 2 && String(n.data?.week_start || '') >= sunday));
    // getNotifications يُرجِع الأحدث أوّلًا — فالطلب الجديد يظهر بالأعلى (بلا reverse)
    setConvo(items);
    // علّم النتائج المعروضة مقروءة (يُطفئ الأحمر وتختفي عند الفتح التالي)
    items.filter((n) => n.type === 'request_result').forEach((n) => markAsRead(n.id));
  }, [user?.id]);

  // كرت إعادة عرض تبديل الاستئذان: الطالب يضغط الجانب الآخر → يُرسَل الطلب ويُغلَق الكرت.
  const handlePermRetry = useCallback(async (n: ConvoNotif) => {
    const pr = n.data?.perm_retry as
      | { day: string; side: 'same' | 'other'; blocked: number[]; target_period?: number; status_ar?: string; leader_ids?: string[] }
      | undefined;
    if (!pr || swapBusyId) return;
    setSwapBusyId(n.id);
    try {
      const cid = clinicId || user.clinicId;
      if (!cid) throw new Error('لا توجد عيادة مرتبطة.');
      const mod = await import('../lib/ai_v2/tools_requests_v2');
      const perm = { blocked: pr.blocked, targetPeriod: pr.target_period, statusAr: pr.status_ar || 'استئذان', leaderIds: pr.leader_ids || [] };
      const mode = pr.side === 'other'
        ? { kind: 'other_shift' as const }
        : { kind: 'period' as const, period: pr.target_period ?? 0 };
      const res = await mod.sendSwapRequestModeByCode({
        clinicId: cid, requester: { id: user.id, name: user.name },
        weekStart: String(n.data?.week_start || ''), day: pr.day,
        mode, excludePeriods: pr.blocked, perm,
      });
      setSwapResults((p) => ({ ...p, [n.id]: { text: res.success ? (res.info || 'تمّ.') : `تعذّر: ${res.error || ''}`, ok: res.success } }));
      if (res.success) {
        const { updateNotificationAction } = await import('../lib/database');
        await updateNotificationAction(n.id, 'accepted'); // أُغلق كرت إعادة العرض بعد الإرسال
      }
      loadConvo();
    } catch (e) {
      setSwapResults((p) => ({ ...p, [n.id]: { text: e instanceof Error ? e.message : 'خطأ غير متوقّع.', ok: false } }));
    } finally {
      setSwapBusyId(null);
    }
  }, [swapBusyId, clinicId, user, loadConvo]);

  // كروت الإبلاغ (تغطية/موافقات/نتائج) انتقلت إلى لوحةٍ مشتركة (AICardsView) تُعرَض
  // في تبويب «الكروت» — فلا تُحمَّل ولا تُدمَج هنا (المحادثة صارت رسائلَ فقط).

  // إرسال إدخال المستخدم العاديّ (المحادثة المشتركة). كروت التغطية لها خيطها
  // المستقلّ داخل الكرت (CoverageCard) فلا تمرّ من هنا.
  const sendInput = useCallback((text: string) => {
    onSend(text);
  }, [onSend]);

  async function handleDecision(n: ConvoNotif, decision: 'accept' | 'reject') {
    if (!user?.id) return;
    setBusyId(n.id);
    try {
      let msg = '';
      if (n.type === 'coverage_request') {
        const res = decision === 'accept'
          ? await notifEngine.acceptCoverage({ notificationId: n.id, accepterId: user.id, accepterRole: user.role, accepterName: user.name })
          : await notifEngine.rejectCoverage({ notificationId: n.id });
        msg = res.success ? (decision === 'accept' ? 'تمّت الموافقة وطُبّق التبديل.' : 'رفضتَ الطلب.') : `تعذّر: ${res.error || ''}`;
      } else {
        const { updateNotificationAction } = await import('../lib/database');
        await updateNotificationAction(n.id, decision === 'accept' ? 'accepted' : 'rejected');
        msg = decision === 'accept' ? 'تمّ.' : 'رُفض.';
      }
      setNote(msg);
      await loadConvo();
    } catch (e) {
      setNote(e instanceof Error ? e.message : 'خطأ غير متوقّع.');
    } finally {
      setBusyId(null);
    }
  }

  function handleSend() {
    const text = input.trim();
    if (!text || isLoading) return;
    setInput('');
    sendInput(text);
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 60);
  }

  async function handleClear() {
    try { await onClearConversation?.(); } catch { /* تجاهل */ }
    setConvo([]); setNote('');
    await loadConvo();
  }

  // دمج الرسائل المشتركة مع طلبات/نتائج الذكاء وترتيبها زمنيًّا تصاعديًّا
  type Merged =
    | { kind: 'msg'; ts: number; m: ChatMessage }
    | { kind: 'notif'; ts: number; n: ConvoNotif };
  const mergedItems: Merged[] = [
    ...messages.map((m): Merged => ({ kind: 'msg', ts: m.timestamp || 0, m })),
  ].sort((a, b) => a.ts - b.ts);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.center}>
          <View style={styles.card}>
            <View style={styles.header}>
              {/* زرٌّ مؤقّت: تبديلٌ بين المحادثة وكروت الإبلاغ (التصميم/الآليّة لاحقًا) */}
              <TouchableOpacity
                onPress={() => setView((v) => (v === 'chat' ? 'cards' : 'chat'))}
                style={{ backgroundColor: '#EAF4F4', borderWidth: scale(1), borderColor: '#2D8C8C', borderRadius: scale(14), paddingHorizontal: scale(11), paddingVertical: scale(5) }}
              >
                <Text style={{ color: '#1F6B6B', fontSize: scale(13), fontWeight: '800' }}>{view === 'chat' ? 'الكروت' : 'المحادثة'}</Text>
              </TouchableOpacity>
              <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: scale(4) }}>
                {!!onClearConversation && view === 'chat' && (
                  <TouchableOpacity onPress={handleClear} style={styles.closeBtn}>
                    <Text style={[styles.closeTxt, { color: '#C0493B' }]}>مسح المحادثة</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
                  <Text style={styles.closeTxt}>إغلاق</Text>
                </TouchableOpacity>
              </View>
            </View>

            {view === 'cards' ? (
              <AICardsView user={user} clinicId={clinicId ?? user.clinicId} />
            ) : (
            <>
            <ScrollView
              ref={scrollRef}
              style={styles.body}
              contentContainerStyle={{ padding: scale(12), paddingBottom: scale(16) }}
              onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
            >
              {/* المحادثة المشتركة + طلبات الذكاء ونتائجها، مدموجة ومرتّبة زمنيًّا
                  (فالموافقة تظهر تحت الطلب لا فوقه) */}
              {mergedItems.map((it) => {
                if (it.kind === 'msg') {
                  const m = it.m;
                  // رسائل الذكاء قد تحمل خيارات [..] → اعرضها كأزرار للنقر السريع
                  const { text, choices } = m.role === 'assistant'
                    ? parseChoices(m.content)
                    : { text: m.content, choices: [] as string[] };
                  const isLast = it === mergedItems[mergedItems.length - 1];
                  // رسالةٌ تحمل عرضًا (إبلاغ/تبديل/تأكيد) → كرتٌ كامل يضمّ نصّها وأزرارها
                  // (لا فقاعة منفصلة)، وتتزامن نتيجته بين المحادثتين عبر onPatchMessage.
                  const hasOffer = m.role === 'assistant' && (!!m.announceOffer || !!m.swapOffer || !!m.confirmOffer);
                  if (hasOffer) {
                    return (
                      <AssistantOffers
                        key={m.id}
                        message={m}
                        user={user}
                        clinicId={clinicId ?? user.clinicId}
                        onResolved={(rtext, done) => onPatchMessage?.(m.id, { offerResolved: { text: rtext, done } })}
                        onDone={onAfterAction}
                      />
                    );
                  }
                  return (
                    <View key={m.id} style={[styles.msg, m.role === 'user' ? styles.msgUser : styles.msgAI]}>
                      {!!text && (
                        <Text style={[styles.msgTxt, m.role === 'user' && styles.msgTxtUser]}>{text}</Text>
                      )}
                      {choices.length > 0 && isLast && (
                        <View style={styles.chipRow}>
                          {choices.map((c, i) => (
                            <TouchableOpacity
                              key={`${m.id}-${i}`}
                              style={styles.chip}
                              disabled={isLoading}
                              onPress={() => sendInput(c)}
                            >
                              <Text style={styles.chipTxt}>{c}</Text>
                            </TouchableOpacity>
                          ))}
                        </View>
                      )}
                    </View>
                  );
                }
                const n = it.n;
                // كرت التغطية (gap_alert v2): كرتٌ بعنوان ثابت من المحرّك؛ نقره يفتح
                // خيطًا مستقلًّا يصوغ فيه الذكاء الحلول بسياق هذا النقص وحده. القديمة تُتجاهَل.
                if (n.type === 'gap_alert') {
                  if (n.data?.v !== 2) return null;
                  // كرت إعادة عرض تبديل الاستئذان للطالب — زرّ الجانب الآخر (تنفيذ بالكود).
                  if (n.data?.perm_retry) {
                    const pr = n.data.perm_retry as { side: 'same' | 'other' };
                    const label = pr.side === 'other' ? 'اطلب من الشفت الآخر' : 'اطلب من فترتك';
                    return (
                      <View key={n.id} style={[styles.msg, styles.msgAI]}>
                        <Text style={styles.msgTxt}>{n.body}</Text>
                        {swapResults[n.id]?.ok ? (
                          <Text style={styles.annNote}>{swapResults[n.id].text}</Text>
                        ) : swapBusyId === n.id ? (
                          <ActivityIndicator color="#2D8C8C" style={{ marginTop: scale(8) }} />
                        ) : (
                          <>
                            {!!swapResults[n.id] && !swapResults[n.id].ok && (
                              <Text style={styles.annNote}>{swapResults[n.id].text}</Text>
                            )}
                            <View style={styles.chipRow}>
                              <TouchableOpacity style={styles.chip} onPress={() => handlePermRetry(n)}>
                                <Text style={styles.chipTxt}>{label}</Text>
                              </TouchableOpacity>
                            </View>
                          </>
                        )}
                      </View>
                    );
                  }
                  if (coverageDays(n.data).length === 0 && !n.data?.placement && !n.data?.perm_conflict) return null;
                  return (
                    <CoverageCard
                      key={n.id}
                      notif={n}
                      user={user}
                      clinicId={clinicId ?? user.clinicId}
                      onSeen={loadConvo}
                    />
                  );
                }
                if (isPending(n)) {
                  const busy = busyId === n.id;
                  return (
                    <View key={n.id} style={[styles.msg, styles.msgAI]}>
                      <Text style={styles.msgTxt}>{n.body}</Text>
                      <View style={styles.reqActions}>
                        {busy ? (
                          <ActivityIndicator color="#2D8C8C" />
                        ) : (
                          <>
                            <TouchableOpacity style={[styles.actBtn, styles.accept]} onPress={() => handleDecision(n, 'accept')}>
                              <Text style={styles.actTxt}>موافق</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={[styles.actBtn, styles.reject]} onPress={() => handleDecision(n, 'reject')}>
                              <Text style={styles.actTxt}>رفض</Text>
                            </TouchableOpacity>
                          </>
                        )}
                      </View>
                    </View>
                  );
                }
                return (
                  <View key={n.id} style={[styles.msg, styles.msgAI]}>
                    <Text style={styles.msgTxt}>{n.body}</Text>
                  </View>
                );
              })}

              {mergedItems.length === 0 && (
                <Text style={styles.empty}>لا توجد طلبات. اكتب طلبك بالأسفل.</Text>
              )}

              {/* نتيجة آخر قبول/رفض (تغذية فوريّة للطرف الذي اتّخذ القرار) */}
              {!!note && (
                <View style={[styles.msg, styles.msgAI]}>
                  <Text style={styles.msgTxt}>{note}</Text>
                </View>
              )}
              {isLoading && <ActivityIndicator color="#2D8C8C" style={{ marginTop: scale(8) }} />}
            </ScrollView>

            <View style={styles.inputRow}>
              <TextInput
                style={styles.input}
                value={input}
                onChangeText={setInput}
                placeholder="اكتب طلبك…"
                placeholderTextColor="#9AA7A7"
                multiline
                textAlign="right"
                onSubmitEditing={handleSend}
              />
              <TouchableOpacity style={styles.sendBtn} onPress={handleSend} disabled={isLoading}>
                <Text style={styles.sendTxt}>إرسال</Text>
              </TouchableOpacity>
            </View>
            </>
            )}
          </View>
        </KeyboardAvoidingView>
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
