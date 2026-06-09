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
  ActivityIndicator, KeyboardAvoidingView, Platform, StyleSheet,
} from 'react-native';
import { getNotifications, markAsRead, subscribeToNotifications } from '../lib/database';
import { notifications as notifEngine } from '../lib/algorithms/notifications';
import { sendMessageV2, type V2Message, type V2User } from '../lib/ai_v2';
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
  isLoading?: boolean;
};

type ConvoNotif = {
  id: string; type: string; title: string; body: string;
  action_type?: string | null; action_status?: string | null; is_read?: boolean;
  created_at?: string; data?: any;
};

// أنواع «محادثة الذكاء» — مكانها الجات لا صفحة الإشعارات
const AI_CHAT_TYPES = ['swap_request', 'coverage_request', 'gap_alert', 'request_result'];
const isActionType = (t: string) => t === 'coverage_request' || t === 'swap_request' || t === 'gap_alert';
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
    return AI_CHAT_TYPES.includes(n.type) && (isPending(n) || !n.is_read);
  }).length;
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
type SeedDoc = { name: string };
type SeedGap = {
  kind: string;
  clinicNumber?: number;
  twoPeriodColleague?: SeedDoc | null;
  candidates?: SeedDoc[];
  clinicColleague?: SeedDoc | null;
  optionA?: { cover: SeedDoc; coverClinic: number; backfill: SeedDoc | null }[];
  optionB?: { clinicNumber: number; a: SeedDoc; b: SeedDoc }[];
};

type SeedDay = { day: string; absentName?: string; gaps?: SeedGap[]; reserves?: SeedDoc[] };

/** أيّام الكرت: data.days[] الجديد، أو coverage المفرد القديم (توافق رجعيّ). */
function coverageDays(d: Record<string, any>): SeedDay[] {
  if (Array.isArray(d.days)) return d.days as SeedDay[];
  if (d.coverage) return [d.coverage as SeedDay];
  return [];
}

/** حلول نقصٍ واحد — نصًّا، بلا أقواس. */
function gapSolution(g: SeedGap, reserveStr: string): string {
  if (g.kind === 'delegator_combo') {
    // عيادة الغائب + الدليقيتر معًا → **خياران منفصلان مُسمّيان** (الأول/الثاني)
    const A = g.optionA || [];
    const B = g.optionB || [];
    const lines: string[] = [`  نقص مركّب: عيادة ${g.clinicNumber} + الدليقيتر (يُغطّيان معًا). خياران منفصلان:`];
    if (A.length) {
      const a0 = A[0];
      const back0 = a0.backfill ? ` ويستلم ${dr(a0.backfill.name)} عيادة ${a0.coverClinic} كاملة` : '';
      lines.push(`  **الخيار الأول:** ${dr(a0.cover.name)} يحلّ محلّ الغائب (عيادته + الدليقيتر)،${back0}.`);
      const altA = A.slice(1).map((o) => dr(o.cover.name));
      if (altA.length) lines.push(`     (بدائل المُغطّي: ${altA.join('، ')})`);
    }
    if (B.length) {
      const b0 = B[0];
      const col = g.clinicColleague ? `${dr(g.clinicColleague.name)} يستلم عيادة ${g.clinicNumber} كاملة، و` : '';
      lines.push(`  **الخيار الثاني:** ${col}عيادة ${b0.clinicNumber} (${dr(b0.a.name)} و${dr(b0.b.name)}) تتولّى الدليقيتر بالتناوب.`);
      const altB = B.slice(1).map((o) => `عيادة ${o.clinicNumber}`);
      if (altB.length) lines.push(`     (بدائل عيادة الدليقيتر: ${altB.join('، ')})`);
    }
    if (reserveStr) lines.push(`  أو الاحتياطي: ${reserveStr}.`);
    return lines.join('\n');
  }
  if (g.kind === 'delegator') {
    const names = (g.candidates || []).map((x) => dr(x.name));
    const opts: string[] = [];
    if (names.length) opts.push(`${names.join(' أو ')} (متفرّغون في تلك الفترة)`);
    if (reserveStr) opts.push(`الاحتياطي: ${reserveStr}`);
    return `  - الدليقيتر: ${opts.length ? opts.join('، أو ') : 'لا حلّ متاح حاليًّا'}`;
  }
  const opts: string[] = [];
  if (g.twoPeriodColleague) opts.push(`${dr(g.twoPeriodColleague.name)} (زميله في العيادة) يستلم الفترتين`);
  if (reserveStr) opts.push(`الاحتياطي: ${reserveStr}`);
  return `  - عيادة ${g.clinicNumber}: ${opts.length ? opts.join('، أو ') : 'لا حلّ متاح حاليًّا'}`;
}

function buildCoverageSeed(n: ConvoNotif): string {
  const d = n.data || {};
  const days = coverageDays(d);
  const absentName = d.absent_doctor_name || days.find((x) => x.absentName)?.absentName || '';

  // كتلة لكلّ يوم: «يوم الأحد: …حلول» أو «يوم الثلاثاء: لا نقص — مغطّى».
  const dayBlocks = days.map((c) => {
    const dayAr = DAY_AR_SEED[c.day] || c.day || '';
    const gaps: SeedGap[] = c.gaps || [];
    const reserves: SeedDoc[] = c.reserves || [];
    const reserveStr = reserves.length ? reserves.map((x) => dr(x.name)).join(' أو ') : '';
    if (!gaps.length) return `• يوم ${dayAr}: لا نقص — اليوم مغطّى، لا حاجة لإجراء.`;
    return [`• يوم ${dayAr}:`, ...gaps.map((g) => gapSolution(g, reserveStr))].join('\n');
  });

  return [
    'حدثٌ داخليّ (لا تذكر أنّه مُعطى لك): غاب طبيبٌ في يومٍ أو أكثر، وقد ينشأ نقصٌ في بعض',
    'الأيّام. تكلّم مع القائد كأنّك لاحظتَ ذلك بنفسك.',
    '',
    `**القائمة أدناه فيها ${days.length} ${days.length === 2 ? 'يومان' : 'أيّام'}. يجب أن يحتوي ردّك على`,
    `${days.length} فقرات — فقرةٌ لكلّ يوم بالترتيب، تبدأ بـ«يوم …». لا تدمج يومين، ولا تُسقط أيّ`,
    'يوم، ولا تكتفِ بآخر يوم.** لليوم الذي فيه نقص اذكر مكانه (بلا فترات) ثمّ حلوله؛ ولليوم بلا',
    'نقص قل إنّه مغطّى ولا حاجة لإجراء. **اعرض الحلول كنصّ (نقاط)؛ لا أقواس [ ] ولا أزرار.** لا',
    'تذكر حلًّا غير موجود. عند ردّ القائد على يومٍ نفّذ بالأداة المناسبة **لذلك اليوم** (مرّر day',
    'الصحيح، لا تذكر فترةً، ولا تستعمل place_in_clinic): نقصٌ مركّب (عيادة+دليقيتر) →',
    '**apply_coverage_option**؛ نقصٌ بسيط (عيادة فقط أو دليقيتر فقط) → **cover_gap**.',
    '',
    `الأسبوع: ${d.week_start || ''}`,
    absentName ? `الطبيب الغائب: ${dr(absentName)}` : '',
    `الأيّام والحلول (${days.length}):`,
    ...dayBlocks,
  ].filter(Boolean).join('\n');
}

/** عنوان الكرت الثابت: الطبيب الغائب + أيّام النقص (بلا حلول وبلا فترات). */
function coverageTitle(n: ConvoNotif): string {
  const d = n.data || {};
  const days = coverageDays(d);
  const absentName = d.absent_doctor_name || days.find((x) => x.absentName)?.absentName || '';
  const gapDays = days.filter((c) => (c.gaps?.length || 0) > 0).map((c) => DAY_AR_SEED[c.day] || c.day);
  const list = gapDays.join('، ');
  return `نقص${absentName ? ` — ${dr(absentName)}` : ''}${list ? `: ${list}` : ''}`;
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
        contextData: buildCoverageSeed(notif), task: 'requests',
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
    const next = !expanded;
    setExpanded(next);
    if (next && !startedRef.current) {
      startedRef.current = true;
      try { await markAsRead(notif.id); onSeen(); } catch { /* يهدأ الأوربّ لاحقًا */ }
      // خيطٌ محفوظ سابقًا؟ حمّله بلا نداء للذكاء (توفير توكن). وإلّا ابدأ التوليد.
      const saved = Array.isArray(notif.data?.thread) ? (notif.data!.thread as V2Message[]) : null;
      if (saved && saved.length) setHistory(saved);
      else runTurn([{ role: 'user', content: SEED_TRIGGER }]);
    }
  }, [expanded, notif.id, notif.data, onSeen, runTurn]);

  const send = useCallback((text: string) => {
    const t = text.trim();
    if (!t || loading) return;
    setReply('');
    runTurn([...history, { role: 'user', content: t }]);
  }, [history, loading, runTurn]);

  // ما يُعرَض: تجاوز رسالة التشغيل الخفيّة (index 0)، وآخر ردّ يحمل خياراته كأزرار
  const shown = history.filter((m, i) => !(i === 0 && m.role === 'user' && m.content === SEED_TRIGGER));

  return (
    <View style={styles.covCard}>
      <TouchableOpacity style={styles.covHead} onPress={onToggle} activeOpacity={0.7}>
        <Text style={styles.covCaret}>{expanded ? '▾' : '▸'}</Text>
        <Text style={styles.covTitle}>{coverageTitle(notif)}</Text>
      </TouchableOpacity>

      {expanded && (
        <View style={styles.covBody}>
          {/* عرض نصّيّ فقط — الذكاء يقترح الحلول، بلا أزرار قابلة للنقر (القائد يردّ كتابةً) */}
          {shown.map((m, i) => {
            const isAI = m.role === 'assistant';
            return (
              <View key={i} style={[styles.msg, isAI ? styles.msgAI : styles.msgUser]}>
                <Text style={[styles.msgTxt, !isAI && styles.msgTxtUser]}>{m.content}</Text>
              </View>
            );
          })}
          {loading && <ActivityIndicator color="#2D8C8C" style={{ marginVertical: scale(6) }} />}

          <View style={styles.covInputRow}>
            <TextInput
              style={styles.covInput}
              value={reply}
              onChangeText={setReply}
              placeholder="ردّك…"
              placeholderTextColor="#9AA7A7"
              textAlign="right"
              onSubmitEditing={() => send(reply)}
            />
            <TouchableOpacity style={styles.sendBtn} onPress={() => send(reply)} disabled={loading}>
              <Text style={styles.sendTxt}>إرسال</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  );
}

export default function AIChatModal({ visible, onClose, user, clinicId, messages, onSend, onClearConversation, isLoading }: Props) {
  const [convo, setConvo] = useState<ConvoNotif[]>([]);
  const [input, setInput] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const scrollRef = useRef<ScrollView>(null);

  const loadConvo = useCallback(async () => {
    if (!user?.id) return;
    const { data } = await getNotifications(user.id, 50);
    // الطلبات المعلّقة + النتائج الجديدة فقط (تختفي الموافقة/الرفض بعد قراءتها)
    const items = ((data || []) as ConvoNotif[])
      .filter((n) => isPending(n) || (n.type === 'request_result' && !n.is_read))
      .reverse();
    setConvo(items);
    // علّم النتائج المعروضة مقروءة (يُطفئ الأحمر وتختفي عند الفتح التالي)
    items.filter((n) => n.type === 'request_result').forEach((n) => markAsRead(n.id));
  }, [user?.id]);

  // حمّل الطلبات عند الفتح، وأعد التحميل عند تغيّر المحادثة (قد ينشئ ردّ الذكاء طلبًا)
  useEffect(() => { if (visible) { setNote(''); loadConvo(); } }, [visible, messages.length, loadConvo]);

  // تحديث فوريّ (Realtime) والمحادثة مفتوحة: يصل الردّ (موافقة/رفض) فورًا دون
  // الحاجة للخروج والدخول.
  useEffect(() => {
    if (!visible || !user?.id) return;
    const unsub = subscribeToNotifications(user.id, loadConvo);
    return unsub;
  }, [visible, user?.id, loadConvo]);

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
      } else if (n.type === 'swap_request') {
        const res = decision === 'accept'
          ? await notifEngine.acceptSwap({ notificationId: n.id, targetId: user.id, targetRole: user.role, targetName: user.name })
          : await notifEngine.rejectSwap({ notificationId: n.id, targetName: user.name });
        msg = res.success ? (decision === 'accept' ? 'تمّت الموافقة وطُبّق التبديل.' : 'اعتذرتَ عن التبديل.') : `تعذّر: ${res.error || ''}`;
        // إن نجح الإجراء لكن تعذّر إبلاغ الطالب — أظهره بدل ابتلاعه بصمت
        if (res.success && res.resultSent === false) {
          msg += ` (لكن تعذّر إبلاغ الطالب: ${res.resultError || 'سبب غير معروف'})`;
        }
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
    ...convo.map((n): Merged => ({ kind: 'notif', ts: n.created_at ? new Date(n.created_at).getTime() : 0, n })),
  ].sort((a, b) => a.ts - b.ts);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.center}>
          <View style={styles.card}>
            <View style={styles.header}>
              <Text style={styles.headerTitle}>الذكاء</Text>
              <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: scale(4) }}>
                {!!onClearConversation && (
                  <TouchableOpacity onPress={handleClear} style={styles.closeBtn}>
                    <Text style={[styles.closeTxt, { color: '#C0493B' }]}>مسح المحادثة</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
                  <Text style={styles.closeTxt}>إغلاق</Text>
                </TouchableOpacity>
              </View>
            </View>

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
                  if (n.data?.v !== 2 || coverageDays(n.data).length === 0) return null;
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
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: scale(16) },
  card: {
    width: '100%', maxWidth: scale(440), height: '74%',
    backgroundColor: '#FFFFFF', borderRadius: scale(20), overflow: 'hidden',
  },
  header: {
    flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: scale(16), paddingVertical: scale(12),
    borderBottomWidth: 1, borderBottomColor: '#ECEFF0',
  },
  headerTitle: { fontSize: scale(17), fontWeight: '800', color: '#1A2B2B' },
  closeBtn: { paddingVertical: scale(4), paddingHorizontal: scale(8) },
  closeTxt: { fontSize: scale(14), fontWeight: '700', color: '#2D8C8C' },
  body: { flex: 1, backgroundColor: '#F7F9FA' },
  empty: { textAlign: 'center', color: '#8A9A9A', marginTop: scale(30), fontSize: scale(14) },
  chipRow: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: scale(8), marginTop: scale(10) },
  chip: {
    paddingVertical: scale(8), paddingHorizontal: scale(14),
    borderRadius: scale(20), backgroundColor: '#EAF4F4',
    borderWidth: 1, borderColor: '#2D8C8C',
  },
  chipTxt: { color: '#1F6B6B', fontSize: scale(13), fontWeight: '800' },
  reqActions: { flexDirection: 'row-reverse', gap: scale(10), marginTop: scale(11) },
  actBtn: { flex: 1, paddingVertical: scale(9), borderRadius: scale(10), alignItems: 'center' },
  accept: { backgroundColor: '#2D8C8C' },
  reject: { backgroundColor: '#C0493B' },
  actTxt: { color: '#FFFFFF', fontSize: scale(14), fontWeight: '800' },
  msg: { maxWidth: '85%', borderRadius: scale(14), padding: scale(10), marginBottom: scale(8) },
  msgUser: { alignSelf: 'flex-start', backgroundColor: '#2D8C8C' },
  msgAI: { alignSelf: 'flex-end', backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E3E7E8' },
  msgTxt: { fontSize: scale(14), color: '#1A2B2B', textAlign: 'right', lineHeight: scale(20) },
  msgTxtUser: { color: '#FFFFFF' },
  inputRow: {
    flexDirection: 'row-reverse', alignItems: 'flex-end', gap: scale(8),
    paddingHorizontal: scale(12), paddingVertical: scale(10),
    borderTopWidth: 1, borderTopColor: '#ECEFF0', backgroundColor: '#FFFFFF',
  },
  input: {
    flex: 1, maxHeight: scale(110), minHeight: scale(42),
    backgroundColor: '#F2F4F5', borderRadius: scale(12),
    paddingHorizontal: scale(12), paddingVertical: scale(10),
    fontSize: scale(14), color: '#1A2B2B',
  },
  sendBtn: { backgroundColor: '#2D8C8C', borderRadius: scale(12), paddingHorizontal: scale(16), justifyContent: 'center', minHeight: scale(42) },
  sendTxt: { color: '#FFFFFF', fontSize: scale(14), fontWeight: '800' },
  // كرت التغطية (gap_alert v2)
  covCard: {
    alignSelf: 'stretch', borderRadius: scale(14), marginBottom: scale(10),
    backgroundColor: '#FFF8EC', borderWidth: 1, borderColor: '#E6B566', overflow: 'hidden',
  },
  covHead: {
    flexDirection: 'row-reverse', alignItems: 'center', gap: scale(8),
    paddingHorizontal: scale(12), paddingVertical: scale(11),
  },
  covCaret: { fontSize: scale(14), color: '#B07A1E', fontWeight: '800' },
  covTitle: { flex: 1, fontSize: scale(14), fontWeight: '800', color: '#7A4E0A', textAlign: 'right' },
  covBody: {
    paddingHorizontal: scale(10), paddingBottom: scale(10),
    borderTopWidth: 1, borderTopColor: '#F0DDB8', backgroundColor: '#FFFCF5',
  },
  covInputRow: { flexDirection: 'row-reverse', alignItems: 'flex-end', gap: scale(8), marginTop: scale(6) },
  covInput: {
    flex: 1, maxHeight: scale(90), minHeight: scale(40),
    backgroundColor: '#FFFFFF', borderRadius: scale(10), borderWidth: 1, borderColor: '#E3E7E8',
    paddingHorizontal: scale(12), paddingVertical: scale(9), fontSize: scale(14), color: '#1A2B2B',
  },
});
