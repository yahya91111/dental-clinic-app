import React, { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StatusBar, Animated, Modal, TextInput, Keyboard, TouchableWithoutFeedback, Alert, ActivityIndicator, Dimensions, Easing, Pressable, StyleSheet, RefreshControl } from 'react-native';
import { scale } from '../../lib/scale';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { DayOfWeek, ScheduleSlot, DAYS } from './types';
import { ScheduleGrid } from './ScheduleGrid';
import { CellDetailModal } from './CellDetailModal';
import { WeekStrip } from './WeekStrip';
import { DoctorsTab } from './DoctorsTab';
import { getWeeklySchedule, getScheduleSettings, updateScheduleSettings, getAllGroupMembers, replaceDayClinicSlots } from '../../lib/database';
import { supabase } from '../../lib/supabase';
import { swapDoctorsInDaySlots, supervisorOfSlots, isShadowOnDay, affectedDays, type SupMap } from './swap';
import { AIOrb, AIState } from '../../components/AIOrb';
import AIButton from '../../components/AIButton';
import { ChatMessage } from '../../components/aiTypes';
import { AISchedulePanel, PanelAction } from '../../components/AISchedulePanel';
import { WizardResult } from '../../components/ScheduleWizard';
import { sendMessageV2, type V2Message, type V2User, type SchedulePreview } from '../../lib/ai_v2';
import type { AnnounceOffer, V2ToolContext } from '../../lib/ai_v2/tools';
import { schedule, type AssignedSlot } from '../../lib/algorithms/schedule';
import { useAuth } from '../../AuthContext';
import AsyncStorage from '@react-native-async-storage/async-storage';

// ─── محادثة الذكاء: حفظٌ محليّ + سقف سياق ──────────────────────────────
const AI_CTX_TOKENS = 1500;   // سقف ما يُرسَل للذكاء (~١٠ تبادلات، يتكيّف مع الطول) — ضبط الكلفة
const AI_HISTORY_MAX = 50;    // أقصى رسائل تُحفَظ محليّاً للعرض (تتدحرج، تبقى بعد الخروج)
const aiStoreKey = (uid: string) => `ai_chat_v1_${uid}`;
// تقدير توكنز تقريبيّ (العربيّة ~٣ أحرف/توكن) — قصٌّ آمن من نهاية المحادثة.
const estTokens = (s: string) => Math.ceil((s?.length || 0) / 3);
function trimToTokenBudget(msgs: V2Message[], maxTokens: number): V2Message[] {
  const out: V2Message[] = [];
  let total = 0;
  for (let i = msgs.length - 1; i >= 0; i--) {
    const t = estTokens(String(msgs[i].content ?? '')) + 8; // +هامش لكلّ رسالة
    if (out.length && total + t > maxTokens) break;
    out.unshift(msgs[i]);
    total += t;
  }
  // واجهة الذكاء تشترط أن يبدأ السياق برسالة مستخدم
  while (out.length && out[0].role !== 'user') out.shift();
  return out.length ? out : msgs.slice(-1);
}

interface ScheduleScreenProps {
  onBack: () => void;
  clinicId?: string | null;
  userId?: string;
  /** معاينةُ مركزٍ آخر (المديرُ العام/المنسّق): اطّلاعٌ فقط — لا تعديلَ ولا ذكاءَ ولا إعدادات */
  viewOnly?: boolean;
  /** عنوانُ الترويسة (اسمُ المركزِ عند المعاينة) — الافتراضيّ "Schedule" */
  headerTitle?: string;
}

type ScheduleTab = 'daily_duty' | 'doctors' | 'vacation' | 'weekend_duty';

const TABS: { key: ScheduleTab; label: string; icon: string }[] = [
  { key: 'daily_duty', label: 'Daily Duty', icon: 'calendar-outline' },
  { key: 'doctors', label: 'Doctors', icon: 'people-outline' },
  { key: 'vacation', label: 'Vacation', icon: 'airplane-outline' },
  { key: 'weekend_duty', label: 'Weekend', icon: 'time-outline' },
];

export default function ScheduleScreen({ onBack, clinicId, userId, viewOnly, headerTitle }: ScheduleScreenProps) {
  const { user } = useAuth();
  const { width: SCREEN_W } = Dimensions.get('window');

  // Blob animations (matching DoctorProfileScreen)
  const blob1Anim = useRef(new Animated.Value(0)).current;
  const blob2Anim = useRef(new Animated.Value(0)).current;
  const blob3Anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const createBlobLoop = (anim: Animated.Value, duration: number) => {
      Animated.loop(
        Animated.sequence([
          Animated.timing(anim, { toValue: 1, duration, useNativeDriver: true }),
          Animated.timing(anim, { toValue: 0, duration, useNativeDriver: true }),
        ])
      ).start();
    };
    createBlobLoop(blob1Anim, 8000);
    createBlobLoop(blob2Anim, 10000);
    createBlobLoop(blob3Anim, 12000);
  }, []);

  // Week navigation - selected week start (Sunday)
  const getCurrentSunday = () => {
    const now = new Date();
    const d = new Date(now);
    d.setDate(d.getDate() - d.getDay());
    d.setHours(0, 0, 0, 0);
    return d;
  };
  const [selectedWeekStart, setSelectedWeekStart] = useState(getCurrentSunday());

  // Cell detail modal
  const [selectedCell, setSelectedCell] = useState<{ day: DayOfWeek; period: number } | null>(null);

  // Settings — درجٌ جانبيّ (تصميم القائمة الجانبية المحفوظ): الصفحة تنكمش إلى بطاقة يسارًا
  const [menuMounted, setMenuMounted] = useState(false);
  const menuAnim = useRef(new Animated.Value(0)).current;
  const openMenu = () => {
    setMenuMounted(true);
    requestAnimationFrame(() =>
      Animated.timing(menuAnim, { toValue: 1, duration: 340, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start()
    );
  };
  const closeMenu = () => {
    Animated.timing(menuAnim, { toValue: 0, duration: 300, easing: Easing.in(Easing.cubic), useNativeDriver: true })
      .start(({ finished }) => { if (finished) setMenuMounted(false); });
  };
  const [showClinicInput, setShowClinicInput] = useState(false);
  const [clinicCount, setClinicCount] = useState(2);
  const [clinicInputValue, setClinicInputValue] = useState('');
  const [settingsLoaded, setSettingsLoaded] = useState(false);

  // تغييرٌ سريعٌ لعددِ العيادات من الدرج مباشرةً (بلا نافذةِ كتابة) — يُحفَظ فورًا
  const changeClinics = async (delta: number) => {
    const next = Math.min(10, Math.max(1, clinicCount + delta));
    if (next === clinicCount) return;
    setClinicCount(next);
    if (clinicId) { try { await updateScheduleSettings(clinicId, next); } catch { /* تجاهل */ } }
  };

  // Schedule slots from Supabase (مُعرّفٌ مبكرًا كي يراه حسابُ swapDirty في وضعِ التبديل)
  const [slots, setSlots] = useState<ScheduleSlot[]>([]);

  // ─── وضعُ التبديل (سواب) — نفسُ تبديلِ جدولِ المعاينة، لكنْ على الجدولِ الحيّ ─────
  // نقرُ طبيبٍ ثُمّ آخرَ في نفسِ اليوم → تبديلُ كاملِ خاناتِهما، والمتدرّبُ يتبعُ مدرّبه.
  // القائدُ يبدّلُ أيَّ اثنين مباشرةً؛ الطبيبُ العاديُّ يبدّلُ نفسَه فقط عبر **طلبِ تبديل** (كالذكاء).
  const isLeader = !!user && ['team_leader', 'coordinator', 'super_admin', 'manager'].includes(user.role);
  const myDoctorId = userId ?? user?.id;
  const [swapMode, setSwapMode] = useState(false);
  const [swapEdit, setSwapEdit] = useState<ScheduleSlot[]>([]);
  const [swapSel, setSwapSel] = useState<{ day: string; id: string } | null>(null);
  const [swapSup, setSwapSup] = useState<SupMap>(new Map());
  const [swapSaving, setSwapSaving] = useState(false);
  const [swapError, setSwapError] = useState<string | null>(null);
  // الطبيبُ العاديّ: الزميلُ المختارُ للتبديلِ معه (طلبٌ يُرسَل، لا تعديلٌ محلّيّ).
  const [swapPartner, setSwapPartner] = useState<{ day: string; id: string; name: string } | null>(null);
  const dayLabelOf = (d?: string) => DAYS.find((x) => x.key === d)?.label || '';

  const enterSwap = () => {
    setSwapEdit(slots);
    setSwapSel(null);
    setSwapError(null);
    setSwapSup(new Map());
    closeMenu();
    setSwapMode(true);
    // خريطةُ المدرّبِ (supervisor_doctor_id) لكشفِ ظلِّ المتدرّبِ المبتدئ — تُحمَّلُ بالخلفيّة
    // (لا نُؤخّرُ دخولَ الوضع)؛ تجهزُ قبلَ أن يختارَ القائدُ طبيبَيه غالبًا.
    if (clinicId) {
      getAllGroupMembers(clinicId)
        .then(({ data }) => {
          const m: SupMap = new Map();
          (data || []).forEach((r: any) => m.set(r.doctor_id, r.supervisor_doctor_id ?? null));
          setSwapSup(m);
        })
        .catch(() => setSwapSup(new Map()));
    }
  };

  const cancelSwap = () => { setSwapMode(false); setSwapSel(null); setSwapPartner(null); setSwapError(null); };

  const onSwapDocTap = (day: DayOfWeek, rawId: string) => {
    const id = supervisorOfSlots(swapEdit, day, rawId, swapSup);
    if (isLeader) {
      // القائد: يختارُ أيَّ اثنين → تبديلٌ محلّيٌّ مباشرٌ ثمّ حفظٌ موضعيّ.
      if (!swapSel || swapSel.day !== day) { setSwapSel({ day, id }); return; }
      if (swapSel.id === id) { setSwapSel(null); return; }
      setSwapEdit((s) => swapDoctorsInDaySlots(s, day, swapSel.id, id, swapSup));
      setSwapSel(null);
      return;
    }
    // الطبيبُ العاديّ: يختارُ نفسَه أوّلًا (الظلُّ عليه)، ثمّ يختارُ الزميلَ → طلبُ تبديل.
    if (!swapSel || swapSel.day !== day) {
      if (id !== myDoctorId) { setSwapError('Select your own slot first, then choose who to swap with.'); return; }
      setSwapError(null); setSwapPartner(null); setSwapSel({ day, id: myDoctorId });
      return;
    }
    if (id === myDoctorId) { setSwapSel(null); setSwapPartner(null); return; }   // نقرُ نفسه ثانيةً = إلغاءُ الاختيار
    const name = swapEdit.find((s) => s.day === day && s.doctorId === id)?.doctorName || '';
    setSwapPartner({ day, id, name });
    setSwapSel({ day, id });   // أبرِز الزميلَ المختار
  };

  // سؤالُ تأكيدٍ قبلَ الإرسال (بالإنقليزي) — «هل تريد إرسال طلب التبديل؟»
  const sendSwapRequest = () => {
    if (!swapPartner || swapSaving) return;
    Alert.alert(
      'Send swap request?',
      `Send a swap request to ${swapPartner.name} for ${dayLabelOf(swapPartner.day)}? It completes as soon as they accept.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Send', onPress: () => { doSendSwapRequest(); } },
      ],
    );
  };

  // الطبيبُ العاديّ يُرسِلُ طلبَ تبديلٍ للزميل — نفسُ ما يفعله الذكاء (request_swap):
  // listSwapTargets ثمّ openSwapGroup؛ يتمُّ التبديلُ فورَ موافقةِ الزميل.
  const doSendSwapRequest = async () => {
    if (!swapPartner || !clinicId || !user?.id || swapSaving) return;
    setSwapSaving(true);
    setSwapError(null);
    const weekStr = formatWeekStart(selectedWeekStart);
    try {
      const { requestsV2 } = await import('../../lib/algorithms/requests_v2');
      const { notifications } = await import('../../lib/algorithms/notifications');
      const listed = await requestsV2.listSwapTargets({
        clinicId, weekStart: weekStr, day: swapPartner.day as any,
        requesterId: user.id, mode: { kind: 'doctor', doctorId: swapPartner.id },
      });
      if (!listed.success || !listed.targets) throw new Error(listed.error || 'تعذّر إرسال الطلب.');
      const opened = await notifications.openSwapGroup({
        clinicId, weekStart: weekStr, day: swapPartner.day as any,
        requesterId: user.id, requesterName: user.name || '', targets: listed.targets,
      });
      if (!opened.success) throw new Error(opened.error || 'تعذّر إرسال الطلب.');
      setSwapMode(false); setSwapSel(null); setSwapPartner(null);
      Alert.alert('Swap request sent', `Sent to ${swapPartner.name} for ${dayLabelOf(swapPartner.day)}. It completes as soon as they accept.`);
    } catch (e) {
      setSwapError(e instanceof Error ? e.message : "Couldn't send the request.");
    } finally {
      setSwapSaving(false);
    }
  };

  const swapDirty = affectedDays(slots, swapEdit).length > 0;
  // نصُّ التعليماتِ وزرُّ الإجراءِ حسبَ الدور.
  const swapInstruction = isLeader
    ? (swapSel ? 'Pick another doctor on the same day to swap — or tap the same one to cancel' : 'To swap: tap a doctor, then another on the same day')
    : (swapPartner
        ? `Request a swap with ${swapPartner.name} — ${dayLabelOf(swapPartner.day)}`
        : swapSel ? 'Now tap the colleague you want to swap with (same day)' : 'Tap your own slot on a day, then choose who to swap with');
  const swapPrimaryLabel = isLeader ? 'Save Swap' : 'Send Request';
  const swapPrimaryDisabled = swapSaving || (isLeader ? !swapDirty : !swapPartner);
  const onSwapPrimary = () => { if (isLeader) saveSwap(); else sendSwapRequest(); };

  // حفظٌ موضعيّ: فقط أيّامُ التبديل، وفقط خاناتُ العيادة/الدليقيتر النشطة (بلا لمسِ الغياب/الاحتياط/الداخليّ).
  const saveSwap = async () => {
    if (!clinicId || swapSaving) return;
    const days = affectedDays(slots, swapEdit);
    if (days.length === 0) { setSwapMode(false); return; }
    setSwapSaving(true);
    setSwapError(null);
    const weekStr = formatWeekStart(selectedWeekStart);
    try {
      for (const day of days) {
        const rows = swapEdit
          .filter((s) => s.day === day && s.status === 'active' && (s.role === 'clinic' || s.role === 'delegator'))
          .map((s) => ({
            period: s.period,
            clinic_number: s.clinicNumber,
            doctor_id: s.doctorId,
            doctor_name: s.doctorName,
            role: s.role,
            // المتدرّبُ المبتدئ يُكتَبُ source='shadow' كي لا تعدَّه التغطيةُ طبيبًا (قاعدةُ عدمِ تغطيةِ المتدرّب).
            source: isShadowOnDay(swapEdit, day, s.doctorId, swapSup) ? 'shadow' : 'ai',
          }));
        const { error } = await replaceDayClinicSlots(clinicId, weekStr, day, rows);
        if (error) throw error;
      }
      setSwapMode(false);
      setSwapSel(null);
      loadSchedule();
    } catch (e) {
      setSwapError(e instanceof Error ? e.message : "Couldn't save the swap.");
    } finally {
      setSwapSaving(false);
    }
  };

  // Active tab
  const [activeTab, setActiveTab] = useState<ScheduleTab>('daily_duty');

  // AI Assistant
  const [showAIPanel, setShowAIPanel] = useState(false);
  const [aiState, setAiState] = useState<AIState>('idle');
  const [aiMessages, setAiMessages] = useState<ChatMessage[]>([]);
  const [aiLoading, setAiLoading] = useState(false);
  // تغييرٌ يدويّ (طبيّة/تفرّغ/استئذان/إلغاء) يُعالَج في الخلفيّة بعد إغلاق النافذة فورًا —
  // هذا الوسمُ يُظهر شريط «جارٍ التطبيق…» كي يَعلم القائدُ أنّ العمل جارٍ (لا تجمُّد).
  const [statusBusy, setStatusBusy] = useState(false);
  const aiHistoryRef = useRef<V2Message[]>([]);
  // معاينة جدول بناها الذكاء في الشات — تُعرَض فوق صفحة الذكاء، والحفظ من هناك
  const [aiPreview, setAiPreview] = useState<SchedulePreview | null>(null);
  const [aiPreviewSaving, setAiPreviewSaving] = useState(false);
  const [aiPreviewError, setAiPreviewError] = useState<string | null>(null);
  const [openChatSignal, setOpenChatSignal] = useState(0); // bump → اللوحة تفتح المحادثة (لعرض سؤال الإبلاغ بعد حفظ الجدول)
  const aiLoadedRef = useRef(false);

  // استرجاع محادثة الذكاء المحفوظة محليّاً عند الدخول — تبقى بعد التنقّل/إعادة التشغيل
  // (لا تُمسح من نفسها). نُعيد بناء سياق الذكاء من الرسائل المعروضة.
  useEffect(() => {
    if (!user?.id) return;
    let alive = true;
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(aiStoreKey(user.id));
        if (!alive) return;
        const saved = raw ? (JSON.parse(raw) as ChatMessage[]) : [];
        if (Array.isArray(saved) && saved.length) {
          setAiMessages(saved);
          // نُعيد بناء سياق الذكاء من المحفوظ (ليفهم آخر ~٢٠ تبادلاً) — آمنٌ الآن لأنّ
          // «سياسة المحادثة» في sendMessageV2 تؤطّره ماضيًا منفَّذًا، فلا يُعيد تنفيذ أو خلط.
          aiHistoryRef.current = saved.map((m) => ({ role: m.role, content: m.content }));
        }
      } catch { /* لا سجلّ محفوظ */ }
      finally { if (alive) aiLoadedRef.current = true; }
    })();
    return () => { alive = false; };
  }, [user?.id]);

  // حفظٌ متدحرج لآخر ٥٠ رسالة بعد كلّ تغيير (بعد اكتمال الاسترجاع كي لا نمسح المحفوظ).
  useEffect(() => {
    if (!user?.id || !aiLoadedRef.current || aiMessages.length === 0) return;
    AsyncStorage.setItem(aiStoreKey(user.id), JSON.stringify(aiMessages.slice(-AI_HISTORY_MAX))).catch(() => {});
  }, [aiMessages, user?.id]);

  const handleAISend = async (text: string, opts?: { task?: 'schedule' | 'requests'; contextData?: string; hidden?: boolean; freshConversation?: boolean }) => {
    if (!user) return;

    // رسالة المستخدم: المخفيّة (تشغيل تلقائيّ) تدخل سياق الذكاء فقط ولا تُعرَض
    // كأنّ المستخدم كتبها — فيظهر ردّ الذكاء وكأنّه هو من بدأ.
    if (!opts?.hidden) {
      const userMsg: ChatMessage = { id: `u${Date.now()}`, role: 'user', content: text, timestamp: Date.now() };
      setAiMessages(prev => [...prev, userMsg]);
    }
    aiHistoryRef.current.push({ role: 'user', content: text });

    setAiLoading(true);
    setAiState('thinking');

    // Context block helps the AI without forcing it to ask basics
    const tabLabel = activeTab === 'daily_duty'
      ? 'Daily Duty'
      : activeTab === 'doctors' ? 'Doctors' : activeTab === 'vacation' ? 'Vacation' : 'Weekend';
    const contextData =
      `Selected week start (Sunday): ${formatWeekStart(selectedWeekStart)}\n` +
      `Clinic count: ${clinicCount}\n` +
      `Currently viewing: ${tabLabel}` +
      (opts?.contextData ? `\n${opts.contextData}` : '');

    const v2User: V2User = {
      id: user.id,
      name: user.name,
      role: user.role,
      clinicId: user.clinicId || undefined,
      clinicName: user.clinicName,
    };

    const response = await sendMessageV2({
      // نُرسل آخر المحادثة ضمن سقف توكنز فقط (ضبط الكلفة) — العرض يحتفظ بالكامل.
      messages: trimToTokenBudget(aiHistoryRef.current, AI_CTX_TOKENS),
      user: v2User,
      clinicId: clinicId || undefined,
      contextData,
      task: opts?.task,
    });

    setAiLoading(false);

    if (response.success) {
      setAiState('success');
      const assistantMsg: ChatMessage = {
        id: `a${Date.now()}`, role: 'assistant', content: response.message, timestamp: Date.now(),
        // غيابٌ/إلغاءٌ ذاتيّ سُجّل هذه الرسالة؟ → أزرار الإبلاغ تظهر تحت الردّ وتنفَّذ بالكود.
        // طلبٌ مركّب → طابورٌ من العروض يُعرَض واحدًا واحدًا (announceOffers)؛ المفرد للتوافق.
        announceOffer: response.announceOffer,
        announceOffers: response.announceOffers,
        // حسم استئذانٍ مبهم؟ → أزرار [بداية]/[نهاية] تحت الردّ تُنفَّذ بالكود
        swapOffer: response.swapOffer,
        // طلب مسح الجدول؟ → أزرار تأكيد [نعم، امسح][تراجع] تُنفَّذ بالكود
        confirmOffer: response.confirmOffer,
        // طلب إنشاء جدول (للقائد) → كرت معالج تفاعليّ خطوة خطوة
        scheduleWizard: response.scheduleWizard,
      };
      setAiMessages(prev => [...prev, assistantMsg]);
      aiHistoryRef.current.push({ role: 'assistant', content: response.message });
      // إن بنى الذكاء معاينة جدول هذه الرسالة → اعرضها (يحفظها المستخدم من صفحة المعاينة)
      if (response.preview) setAiPreview(response.preview);
      // Reload schedule in case AI made changes
      loadSchedule();
    } else {
      setAiState('error');
      const errorMsg: ChatMessage = { id: `e${Date.now()}`, role: 'assistant', content: response.error || 'Something went wrong.', timestamp: Date.now() };
      setAiMessages(prev => [...prev, errorMsg]);
    }

    // Reset state after delay
    setTimeout(() => setAiState('idle'), 2000);
  };

  // تعديل رسالةٍ في المحادثة المشتركة (نتيجة خيارٍ نُفِّذ) — تتزامن بين المحادثتين
  const patchAiMessage = (id: string, patch: Partial<ChatMessage>) =>
    setAiMessages((prev) => prev.map((m) => (m.id === id ? { ...m, ...patch } : m)));

  // غيابٌ يدويّ من الجدول (طبيّة/تفرّغ/استئذان) → نُمرّره عبر **نفس** أداة الذكاء
  // (set_schedule_status) فيجري التعويض والموازنة عبر الأيّام تمامًا كطلبٍ من الذكاء،
  // ثمّ نعرض سؤال الإبلاغ في المحادثة. الفاعل = المستخدم الحاليّ.
  const handleManualStatusRequest = async (req: {
    doctorId: string; doctorName: string; day: string; status: string; shift: 'morning' | 'evening';
  }): Promise<{ ok: boolean; error?: string }> => {
    if (!clinicId || !user?.id) return { ok: false, error: 'لا مستخدم أو عيادة.' };
    const ws = formatWeekStart(selectedWeekStart);
    setStatusBusy(true);
    try {
      const { dispatchRequestToolV2, FINAL_MARK } = await import('../../lib/ai_v2/tools_requests_v2');
      // عرضُ الإبلاغ يقرّره المحرّكُ (يكتمه للظلّ/المُغطّى/المكرّر) — نلتقطه ولا نُعيد بناءه نصيًّا.
      let announce: AnnounceOffer | undefined;
      const ctx: V2ToolContext = {
        clinicId,
        user: { id: user.id, name: user.name, role: user.role, clinicId, clinicName: user.clinicName },
        roster: [{ id: req.doctorId, name: req.doctorName }],
        onAnnounceOffer: (o) => { announce = o; },
      };
      const out = await dispatchRequestToolV2('set_schedule_status', {
        weekStart: ws, day: req.day, doctorIndex: 1, status: req.status, shift: req.shift,
      }, ctx);
      if (out.startsWith('Tool error')) {
        const err = out.replace(/^Tool error:\s*/, '');
        Alert.alert('تعذّر', err);
        return { ok: false, error: err };
      }
      const content = out.split(FINAL_MARK).join('');
      const msg: ChatMessage = {
        id: `m${Date.now()}`, role: 'assistant', content,
        ...(announce ? { announceOffer: announce } : {}),
        timestamp: Date.now(),
      };
      setAiMessages((prev) => [...prev, msg]);
      aiHistoryRef.current.push({ role: 'assistant', content });
      loadSchedule(); // النافذة أُغلقت فورًا؛ ننعش الجدولَ هنا عند انتهاء الخلفيّة.
      return { ok: true };
    } catch (e) {
      const err = e instanceof Error ? e.message : 'خطأ غير متوقّع.';
      Alert.alert('تعذّر', err);
      return { ok: false, error: err };
    } finally {
      setStatusBusy(false);
    }
  };

  // إلغاءُ غيابٍ يدويًّا من الجدول (X على كرت EX) → نفس خطّ إلغاء الذكاء
  // (cancel_schedule_status): استردادٌ جراحيّ + رفع تغطية + موازنة + إشعار علمٍ للقادة.
  const handleManualStatusCancel = async (req: {
    doctorId: string; doctorName: string; day: string; status: string;
  }): Promise<{ ok: boolean; error?: string }> => {
    if (!clinicId || !user?.id) return { ok: false, error: 'لا مستخدم أو عيادة.' };
    const ws = formatWeekStart(selectedWeekStart);
    setStatusBusy(true);
    try {
      const { dispatchRequestToolV2, FINAL_MARK } = await import('../../lib/ai_v2/tools_requests_v2');
      const ctx: V2ToolContext = {
        clinicId,
        user: { id: user.id, name: user.name, role: user.role, clinicId, clinicName: user.clinicName },
        roster: [{ id: req.doctorId, name: req.doctorName }],
      };
      const out = await dispatchRequestToolV2('cancel_schedule_status', {
        weekStart: ws, day: req.day, doctorIndex: 1,
      }, ctx);
      if (out.startsWith('Tool error')) {
        const err = out.replace(/^Tool error:\s*/, '');
        Alert.alert('تعذّر', err);
        return { ok: false, error: err };
      }
      const content = out.split(FINAL_MARK).join('');
      const msg: ChatMessage = { id: `m${Date.now()}`, role: 'assistant', content, timestamp: Date.now() };
      setAiMessages((prev) => [...prev, msg]);
      aiHistoryRef.current.push({ role: 'assistant', content });
      loadSchedule(); // النافذة أُغلقت فورًا؛ ننعش الجدولَ هنا عند انتهاء الخلفيّة.
      return { ok: true };
    } catch (e) {
      const err = e instanceof Error ? e.message : 'خطأ غير متوقّع.';
      Alert.alert('تعذّر', err);
      return { ok: false, error: err };
    } finally {
      setStatusBusy(false);
    }
  };

  // مسح محادثة الذكاء: فقاعات الذاكرة + كروت محادثة الذكاء من قاعدة البيانات
  const handleClearConversation = async () => {
    setAiMessages([]);
    aiHistoryRef.current = [];
    if (!user?.id) return;
    AsyncStorage.removeItem(aiStoreKey(user.id)).catch(() => {}); // امسح المحفوظ محليًّا أيضًا
    try {
      const { getNotifications, deleteNotification } = await import('../../lib/database');
      const { data } = await getNotifications(user.id, 50);
      const types = ['swap_request', 'gap_alert', 'request_result'];
      const ids = ((data || []) as { id: string; type: string }[])
        .filter((n) => types.includes(n.type)).map((n) => n.id);
      for (const id of ids) await deleteNotification(id);
    } catch { /* المسح تنظيفٌ لا حرج في فشله */ }
  };

  // بعد حفظ الجدول (المعالج أو معاينة الشات): يسأل القائدَ عن الإبلاغ **بنفس آليّة إبلاغ الغياب** —
  // رسالةٌ تحمل announceOffer فتظهر بطاقةُ [الشفت][المركز][لا داعي] في المحادثة (AssistantOffers)،
  // والاختيارُ يستدعي announceAbsence (broadcast الموجود). الإبلاغُ فعلُ قائد، وقروبُ «الشفت» = قروبُ القائد.
  const offerScheduleAnnounce = (weekStart: string) => {
    if (!user?.id || !clinicId) return;
    if (!['team_leader', 'coordinator', 'super_admin', 'manager'].includes(user.role)) return;
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(weekStart || '');
    const pretty = m ? ` ${Number(m[3])}/${Number(m[2])}` : '';
    const announce: AnnounceOffer = {
      weekStart, day: '',
      message: `نُشِر جدولُ الأسبوع${pretty}.`,
      subjectId: user.id, subjectName: user.name,   // قروبُ القائد للشفت، ويُستثنى هو من المستلمين
    };
    const msg: ChatMessage = {
      id: `schedann${Date.now()}`, role: 'assistant',
      content: `حُفِظ جدولُ الأسبوع${pretty}.`,
      announceOffer: announce, timestamp: Date.now(),
    };
    setAiMessages((prev) => [...prev, msg]);
    aiHistoryRef.current.push({ role: 'assistant', content: msg.content });
    setOpenChatSignal((n) => n + 1);   // افتح المحادثةَ ليرى القائدُ سؤالَ الإبلاغ
  };

  // حفظ معاينة الشات كما هي (بعد أيّ تبديل يدويّ) — يكتب الخانات + علامات الغياب/الاستئذان
  const handleSaveAiPreview = async (finalSlots: AssignedSlot[]) => {
    if (!aiPreview || !clinicId) return;
    const ws = aiPreview.weekStart;
    setAiPreviewSaving(true);
    setAiPreviewError(null);
    try {
      const res = await schedule.saveSlots(
        clinicId,
        aiPreview.weekStart,
        finalSlots,
        aiPreview.permissions,
        aiPreview.absenceMarkers,
        aiPreview.buildInput?.aShiftPlan,
        aiPreview.buildInput?.boardConfig,
      );
      if (res.success) {
        // احفظ وصفة البناء (كي تعمل التغطية لاحقًا) — كالويزرد تمامًا
        if (aiPreview.buildInput) {
          try { await schedule.saveBuildConfig(aiPreview.buildInput); }
          catch { /* الحفظ تحسينٌ لا يُفشِل حفظ الجدول */ }
        }
        setAiPreview(null);
        loadSchedule();
        offerScheduleAnnounce(ws);   // اسأل القائدَ عن الإبلاغ (نفس آليّة الغياب)
      } else {
        setAiPreviewError(res.error || 'تعذّر حفظ الجدول.');
      }
    } catch (e) {
      setAiPreviewError(e instanceof Error ? e.message : 'خطأ غير متوقّع.');
    } finally {
      setAiPreviewSaving(false);
    }
  };

  // Bottom bar hide/show on scroll
  const tabBarAnim = useRef(new Animated.Value(0)).current;
  const lastScrollY = useRef(0);
  const tabBarVisible = useRef(true);

  const handleContentScroll = (event: any) => {
    const currentY = event.nativeEvent.contentOffset.y;
    const diff = currentY - lastScrollY.current;
    if (diff > 8 && tabBarVisible.current && currentY > 30) {
      tabBarVisible.current = false;
      Animated.spring(tabBarAnim, { toValue: 1, useNativeDriver: true, tension: 80, friction: 12 }).start();
    } else if (diff < -8 && !tabBarVisible.current) {
      tabBarVisible.current = true;
      Animated.spring(tabBarAnim, { toValue: 0, useNativeDriver: true, tension: 80, friction: 12 }).start();
    }
    lastScrollY.current = currentY;
  };

  // Format date to YYYY-MM-DD for Supabase
  const formatWeekStart = (date: Date) => {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  };

  // Load settings from Supabase
  const loadSettings = useCallback(async () => {
    if (!clinicId) return;
    const { data } = await getScheduleSettings(clinicId);
    if (data?.clinic_count) {
      setClinicCount(data.clinic_count);
    }
    setSettingsLoaded(true);
  }, [clinicId]);

  // Load weekly schedule from Supabase
  const loadSchedule = useCallback(async () => {
    if (!clinicId) return;
    const weekStr = formatWeekStart(selectedWeekStart);
    const { data } = await getWeeklySchedule(clinicId, weekStr);
    if (data) {
      const mapped: ScheduleSlot[] = data
        // صفوفٌ داخليّةٌ للبكنينغ (مكانٌ محفوظ + يوميّات الأثر البعيد) لا تُعرَض إطلاقًا:
        // يُنشئها القلبُ الجديد للتغطية/الإلغاء. تسرُّبها يُربك الشبكة وكرت EX (دور/حالة مجهولة).
        .filter((s: any) => { const role = String(s.role || ''); return role !== 'prev_placement' && !role.startsWith('xday'); })
        .map((s: any) => ({
          id: s.id,
          day: s.day_of_week as DayOfWeek,
          period: s.period,
          clinicNumber: s.clinic_number,
          doctorId: s.doctor_id,
          doctorName: s.doctor_name,
          role: s.role,
          status: s.status,
        }));
      setSlots(mapped);
    } else {
      setSlots([]);
    }
  }, [clinicId, selectedWeekStart]);

  // Load on mount and when week changes
  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  useEffect(() => {
    loadSchedule();
  }, [loadSchedule]);

  // ── تحديثٌ فوريّ تلقائيّ (Realtime): أيُّ تغييرٍ في خانات هذا المركز يُنعش الجدولَ فورًا ──
  // نُبقي القناةَ ثابتةً على المركز، ونستدعي أحدثَ loadSchedule عبر ref (كي لا نُعيدَ
  // الاشتراكَ عند كلِّ تغييرِ أسبوع)، مع تجميعِ دفعةِ الكتابةِ الواحدة (debounce) لتفادي إنعاشاتٍ متعدّدة.
  const loadScheduleRef = useRef(loadSchedule);
  useEffect(() => { loadScheduleRef.current = loadSchedule; }, [loadSchedule]);
  const rtTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!clinicId) return;
    const channel = supabase
      .channel(`schedule_rt_${clinicId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'schedule_slots', filter: `clinic_id=eq.${clinicId}` },
        () => {
          if (rtTimer.current) clearTimeout(rtTimer.current);
          rtTimer.current = setTimeout(() => loadScheduleRef.current(), 250);
        },
      )
      .subscribe((status) => {
        // SUBSCRIBED يُطلَق عند الاتّصالِ الأوّلِ وبعدَ كلِّ إعادةِ اتّصال → مزامنةٌ تلتقطُ ما فات أثناءَ الانقطاع.
        if (status === 'SUBSCRIBED') {
          if (rtTimer.current) clearTimeout(rtTimer.current);
          rtTimer.current = setTimeout(() => loadScheduleRef.current(), 250);
        }
      });
    return () => {
      if (rtTimer.current) clearTimeout(rtTimer.current);
      supabase.removeChannel(channel);
    };
  }, [clinicId]);

  // ── سحبٌ للأسفل = تحديثٌ يدويّ (Pull-to-refresh) ──
  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try { await Promise.all([loadSchedule(), loadSettings()]); }
    finally { setRefreshing(false); }
  }, [loadSchedule, loadSettings]);

  return (
    <View style={{ flex: 1 }}>
      <StatusBar translucent={true} backgroundColor="transparent" barStyle="dark-content" />

      {/* درجُ الإعدادات (خلفَ الصفحة) — خلفيّةٌ فاتحةٌ تعكسُ صفحةَ الجدول (تدرّج + بُقَعٌ ملوّنةٌ ناعمة) */}
      {menuMounted && (
        <Animated.View style={[StyleSheet.absoluteFill, { opacity: menuAnim }]}>
          <LinearGradient colors={['#F0F4F8', '#E8EDF3', '#F5F0F8']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
          {/* بُقَعٌ ملوّنةٌ ناعمةٌ كصفحةِ الجدول */}
          <View pointerEvents="none" style={{ position: 'absolute', width: scale(240), height: scale(240), borderRadius: scale(120), top: scale(-50), right: scale(-40), backgroundColor: 'rgba(167,139,250,0.20)' }} />
          <View pointerEvents="none" style={{ position: 'absolute', width: scale(210), height: scale(210), borderRadius: scale(105), bottom: scale(60), right: scale(24), backgroundColor: 'rgba(125,211,252,0.16)' }} />
          <View pointerEvents="none" style={{ position: 'absolute', width: scale(170), height: scale(170), borderRadius: scale(85), top: '46%', left: '34%', backgroundColor: 'rgba(240,98,146,0.10)' }} />
          {/* النقرُ على أيِّ فراغٍ (وعلى بطاقةِ الصفحةِ عبرها) يُغلق الدرج ويعودُ للجدول */}
          <Pressable style={StyleSheet.absoluteFill} onPress={closeMenu} />
          <SafeAreaView style={{ flex: 1 }} edges={['top']} pointerEvents="box-none">
            {/* العنوان: أعلى الصفحة بالمنتصف */}
            <Text style={{ textAlign: 'center', fontSize: scale(26), fontWeight: '800', color: '#3E4A63', letterSpacing: -0.5, marginTop: scale(14) }}>Settings</Text>
            {/* الأزرار — أنزلُ أكثر، كروتٌ أنحفُ بلونٍ ناعمٍ بلا أيقونات */}
            <View pointerEvents="box-none" style={{ paddingLeft: SCREEN_W * 0.34, paddingRight: scale(22), marginTop: scale(90), gap: scale(28), alignItems: 'center' }}>
              {/* عددُ العيادات — النصُّ فوقُ والعدّادُ تحتَه، كلاهما بالوسط */}
              <View style={{ alignItems: 'center', gap: scale(12) }}>
                <Text style={{ color: '#3E4A63', fontSize: scale(14), fontWeight: '700', textAlign: 'center' }}>Number of Clinics</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: scale(10) }}>
                  <TouchableOpacity onPress={() => changeClinics(-1)} activeOpacity={0.7} style={{ width: scale(28), height: scale(28), borderRadius: scale(14), backgroundColor: 'rgba(255,255,255,0.35)', borderWidth: scale(1), borderColor: 'rgba(255,255,255,0.65)', alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ color: '#6B4C9A', fontSize: scale(19), fontWeight: '700', marginTop: -scale(2) }}>−</Text>
                  </TouchableOpacity>
                  <View style={{ minWidth: scale(34), height: scale(28), borderRadius: scale(9), backgroundColor: 'rgba(255,255,255,0.35)', borderWidth: scale(1), borderColor: 'rgba(255,255,255,0.65)', alignItems: 'center', justifyContent: 'center', paddingHorizontal: scale(6) }}>
                    <Text style={{ color: '#2D3748', fontSize: scale(15), fontWeight: '800' }}>{clinicCount}</Text>
                  </View>
                  <TouchableOpacity onPress={() => changeClinics(1)} activeOpacity={0.7} style={{ width: scale(28), height: scale(28), borderRadius: scale(14), backgroundColor: 'rgba(255,255,255,0.35)', borderWidth: scale(1), borderColor: 'rgba(255,255,255,0.65)', alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ color: '#6B4C9A', fontSize: scale(18), fontWeight: '700', marginTop: -scale(1) }}>+</Text>
                  </TouchableOpacity>
                </View>
              </View>
              {/* خطٌّ خفيفٌ فاصلٌ بين الزرّين */}
              <View pointerEvents="none" style={{ width: scale(150), height: scale(1), backgroundColor: 'rgba(70,80,110,0.16)' }} />
              {/* زرُّ Swap — يفتحُ وضعَ التبديلِ على الجدول (كتبديلِ جدولِ المعاينة) */}
              <TouchableOpacity onPress={enterSwap} activeOpacity={0.6} style={{ justifyContent: 'center', alignItems: 'center' }}>
                <Text style={{ color: '#3E4A63', fontSize: scale(14), fontWeight: '700', textAlign: 'center' }}>Swap</Text>
              </TouchableOpacity>
            </View>
          </SafeAreaView>
        </Animated.View>
      )}

      {/* الصفحةُ تنكمشُ إلى بطاقةٍ يسارًا عند فتحِ الدرج (تصميمُ القائمةِ الجانبيّةِ المحفوظ).
          أثناءَ فتحِ الدرج: pointerEvents=none فتتجاهلُ البطاقةُ اللمسَ، ويمرُّ إلى مُغلِقِ الدرجِ خلفَها. */}
      <Animated.View
        pointerEvents={menuMounted ? 'none' : 'auto'}
        style={[
          { flex: 1 },
          { transform: [
            { translateX: menuAnim.interpolate({ inputRange: [0, 1], outputRange: [0, -SCREEN_W * 0.5] }) },
            { scale: menuAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 0.62] }) },
          ] },
        ]}
      >
      {/* «طبقةُ الطيران»: ٣ طبقاتٍ متدرّجةٌ أسفلَ البطاقةِ وخلفَها — لونٌ كحليٌّ باردٌ يظهرُ كالظلِّ
          (لا رماديٌّ بحت)، كلّما بعُدتْ خفّتْ وازدادَ إزاحتُها = تدرّجُ ظلٍّ ناعم (يعملُ بنفسِه على iOS و Android). */}
      {menuMounted && (
        <>
          <View pointerEvents="none" style={[StyleSheet.absoluteFill, { borderRadius: scale(26), backgroundColor: 'rgba(40,50,78,0.10)', transform: [{ translateY: scale(26) }, { translateX: scale(8) }] }]} />
          <View pointerEvents="none" style={[StyleSheet.absoluteFill, { borderRadius: scale(26), backgroundColor: 'rgba(40,50,78,0.14)', transform: [{ translateY: scale(16) }, { translateX: scale(5) }] }]} />
          <View pointerEvents="none" style={[StyleSheet.absoluteFill, { borderRadius: scale(26), backgroundColor: 'rgba(40,50,78,0.20)', transform: [{ translateY: scale(8) }, { translateX: scale(3) }] }]} />
        </>
      )}
      {/* بطاقةُ الصفحة: تقصُّ المحتوى للزوايا المستديرة — بلا borderWidth (كي لا يُزاحَ المحتوى عند العودة = لا لاق) */}
      <View style={[{ flex: 1 }, menuMounted && { borderRadius: scale(26), overflow: 'hidden' }]}>
      {/* Gradient Mesh Background - matching DoctorProfileScreen */}
      <LinearGradient
        colors={['#F0F4F8', '#E8EDF3', '#F5F0F8']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
      />
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        <View style={{ flex: 1 }}>

          {/* Animated Blobs - matching DoctorProfileScreen */}
          <Animated.View
            style={{
              position: 'absolute',
              width: scale(300),
              height: scale(300),
              borderRadius: scale(150),
              top: scale(100),
              right: scale(-50),
              backgroundColor: 'rgba(167, 139, 250, 0.15)',
              transform: [
                { translateX: blob1Anim.interpolate({ inputRange: [0, 1], outputRange: [0, scale(30)] }) },
                { translateY: blob1Anim.interpolate({ inputRange: [0, 1], outputRange: [0, scale(-40)] }) },
              ],
            }}
          />
          <Animated.View
            style={{
              position: 'absolute',
              width: scale(300),
              height: scale(300),
              borderRadius: scale(150),
              bottom: scale(150),
              left: scale(-80),
              backgroundColor: 'rgba(125, 211, 252, 0.12)',
              transform: [
                { translateX: blob2Anim.interpolate({ inputRange: [0, 1], outputRange: [0, scale(-50)] }) },
                { translateY: blob2Anim.interpolate({ inputRange: [0, 1], outputRange: [0, scale(30)] }) },
              ],
            }}
          />
          <Animated.View
            style={{
              position: 'absolute',
              width: scale(300),
              height: scale(300),
              borderRadius: scale(150),
              top: '50%',
              right: '20%',
              backgroundColor: 'rgba(240, 98, 146, 0.1)',
              transform: [
                { translateX: blob3Anim.interpolate({ inputRange: [0, 1], outputRange: [0, scale(40)] }) },
                { translateY: blob3Anim.interpolate({ inputRange: [0, 1], outputRange: [0, scale(-50)] }) },
              ],
            }}
          />

          {/* Header - matching DoctorsScreen style */}
          <View style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingHorizontal: scale(20),
            paddingVertical: scale(16),
          }}>
            <TouchableOpacity
              onPress={onBack}
              style={{
                width: scale(40),
                height: scale(40),
                borderRadius: scale(20),
                backgroundColor: 'rgba(255,255,255,0.25)',
                alignItems: 'center',
                justifyContent: 'center',
                borderWidth: scale(2),
                borderColor: 'rgba(255,255,255,0.4)',
              }}
            >
              <Ionicons name="arrow-back" size={scale(24)} color="#2D3748" />
            </TouchableOpacity>
            <Text
              numberOfLines={1}
              style={{
                fontSize: scale(headerTitle ? 24 : 34),
                fontWeight: '700',
                color: '#4A5568',
                letterSpacing: -0.5,
                flex: 1,
                textAlign: 'center',
              }}
            >{headerTitle || 'Schedule'}</Text>
            {/* الإعداداتُ (والتبديلُ من داخلها) مخفيّةٌ في وضعِ المعاينة — نُبقي فراغًا لتوسيطِ العنوان */}
            {viewOnly ? (
              <View style={{ width: scale(40) }} />
            ) : (
              <TouchableOpacity
                onPress={openMenu}
                style={{
                  width: scale(40),
                  height: scale(40),
                  borderRadius: scale(20),
                  backgroundColor: 'rgba(255,255,255,0.25)',
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderWidth: scale(2),
                  borderColor: 'rgba(255,255,255,0.4)',
                }}
              >
                <Ionicons name="menu" size={scale(22)} color="#2D3748" />
              </TouchableOpacity>
            )}
          </View>

          {/* Week Strip - only for Daily Duty */}
          {activeTab === 'daily_duty' && (
            <WeekStrip
              selectedWeekStart={selectedWeekStart}
              onSelectWeek={setSelectedWeekStart}
            />
          )}

          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{ paddingHorizontal: scale(10), paddingTop: scale(12), paddingBottom: scale(swapMode ? 190 : 80) }}
            showsVerticalScrollIndicator={false}
            onScroll={handleContentScroll}
            scrollEventThrottle={16}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                enabled={!swapMode}
                tintColor="#6B4C9A"
                colors={['#6B4C9A']}
              />
            }
          >
            {activeTab === 'daily_duty' && settingsLoaded && (
              <ScheduleGrid
                slots={swapMode ? swapEdit : slots}
                clinicCount={clinicCount}
                onCellPress={(swapMode || viewOnly) ? () => {} : (day, period) => setSelectedCell({ day, period })}
                userId={swapMode ? undefined : userId}
                onDoctorPress={swapMode ? onSwapDocTap : undefined}
                selSwap={swapMode ? swapSel : null}
                weekStartDate={selectedWeekStart}
              />
            )}
            {activeTab === 'doctors' && <DoctorsTab clinicId={clinicId || null} viewOnly={viewOnly} />}
            {activeTab === 'vacation' && (
              <View style={{ alignItems: 'center', justifyContent: 'center', paddingTop: scale(80) }}>
                <Ionicons name="airplane-outline" size={scale(60)} color="rgba(107,114,128,0.3)" />
                <Text style={{ fontSize: scale(16), fontWeight: '600', color: '#9CA3AF', marginTop: scale(12) }}>Vacation</Text>
                <Text style={{ fontSize: scale(13), color: '#CBD5E0', marginTop: scale(4) }}>Coming Soon</Text>
              </View>
            )}
            {activeTab === 'weekend_duty' && (
              <View style={{ alignItems: 'center', justifyContent: 'center', paddingTop: scale(80) }}>
                <Ionicons name="time-outline" size={scale(60)} color="rgba(107,114,128,0.3)" />
                <Text style={{ fontSize: scale(16), fontWeight: '600', color: '#9CA3AF', marginTop: scale(12) }}>Weekend Duty</Text>
                <Text style={{ fontSize: scale(13), color: '#CBD5E0', marginTop: scale(4) }}>Coming Soon</Text>
              </View>
            )}
          </ScrollView>

          {/* Bottom Tab Bar — مخفيٌّ في وضع التبديل (يظهرُ شريطُ الحفظ/الإلغاء بدلًا منه) */}
          {!swapMode && (
          <Animated.View style={{
            flexDirection: 'row',
            alignItems: 'center',
            backgroundColor: 'transparent',
            paddingTop: scale(4),
            paddingBottom: scale(14),
            transform: [{
              translateY: tabBarAnim.interpolate({
                inputRange: [0, 1],
                outputRange: [0, scale(80)],
              }),
            }],
            opacity: tabBarAnim.interpolate({
              inputRange: [0, 1],
              outputRange: [1, 0],
            }),
          }}>
            {TABS.map(tab => {
              const isActive = activeTab === tab.key;
              return (
                <TouchableOpacity
                  key={tab.key}
                  onPress={() => setActiveTab(tab.key)}
                  activeOpacity={0.7}
                  style={{
                    flex: 1,
                    alignItems: 'center',
                    justifyContent: 'center',
                    paddingVertical: scale(2),
                  }}
                >
                  {isActive ? (
                    <LinearGradient
                      colors={['rgba(124,108,180,0.5)', 'rgba(167,155,203,0.3)']}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={{
                        width: scale(36),
                        height: scale(36),
                        borderRadius: scale(12),
                        alignItems: 'center',
                        justifyContent: 'center',
                        borderWidth: scale(1.5),
                        borderColor: 'rgba(124,108,180,0.3)',
                      }}
                    >
                      <Ionicons name={tab.icon as any} size={scale(18)} color="#FFFFFF" />
                    </LinearGradient>
                  ) : (
                    <View style={{
                      width: scale(36),
                      height: scale(36),
                      borderRadius: scale(12),
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}>
                      <Ionicons name={tab.icon as any} size={scale(18)} color="#9CA3AF" />
                    </View>
                  )}
                  <Text style={{
                    fontSize: scale(8),
                    fontWeight: isActive ? '700' : '500',
                    color: isActive ? '#6B4C9A' : '#9CA3AF',
                    marginTop: scale(1),
                  }}>{tab.label}</Text>
                </TouchableOpacity>
              );
            })}
          </Animated.View>
          )}
        </View>
      </SafeAreaView>
        {/* حدُّ البطاقة (طبقةٌ مطلقةٌ لا تُزيحُ المحتوى فلا لاقَ عند العودة) — حافّةٌ زجاجيّةٌ فاتحة */}
        {menuMounted && <View pointerEvents="none" style={[StyleSheet.absoluteFill, { borderRadius: scale(26), borderWidth: scale(1.5), borderColor: 'rgba(255,255,255,0.85)' }]} />}
      </View>

      </Animated.View>

      {/* Clinic Count Input Modal */}
      <Modal transparent visible={showClinicInput} animationType="fade" onRequestClose={() => setShowClinicInput(false)}>
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center' }}>
            <View style={{
              width: '75%',
              backgroundColor: 'rgba(255,255,255,0.95)',
              borderRadius: scale(20),
              padding: scale(24),
              borderWidth: scale(2),
              borderColor: 'rgba(255,255,255,0.8)',
            }}>
              <Text style={{ fontSize: scale(16), fontWeight: '700', color: '#1E3A8A', textAlign: 'center', marginBottom: scale(16) }}>
                Number of Clinics
              </Text>
              <TextInput
                value={clinicInputValue}
                onChangeText={(text) => {
                  const num = text.replace(/[^0-9]/g, '');
                  if (num === '' || (parseInt(num) >= 1 && parseInt(num) <= 10)) {
                    setClinicInputValue(num);
                  }
                }}
                keyboardType="number-pad"
                maxLength={2}
                placeholder="1-10"
                placeholderTextColor="#A0AEC0"
                style={{
                  fontSize: scale(24),
                  fontWeight: '700',
                  color: '#2D3748',
                  textAlign: 'center',
                  backgroundColor: 'rgba(0,0,0,0.04)',
                  borderRadius: scale(14),
                  paddingVertical: scale(14),
                  borderWidth: scale(2),
                  borderColor: 'rgba(102,126,234,0.3)',
                  marginBottom: scale(16),
                }}
                autoFocus
              />
              <View style={{ flexDirection: 'row', gap: scale(10) }}>
                <TouchableOpacity
                  onPress={() => setShowClinicInput(false)}
                  style={{
                    flex: 1,
                    paddingVertical: scale(12),
                    borderRadius: scale(12),
                    backgroundColor: 'rgba(0,0,0,0.06)',
                    alignItems: 'center',
                  }}
                >
                  <Text style={{ fontSize: scale(14), fontWeight: '600', color: '#6B7280' }}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={async () => {
                    const num = parseInt(clinicInputValue);
                    if (num >= 1 && num <= 10) {
                      setClinicCount(num);
                      setShowClinicInput(false);
                      if (clinicId) {
                        await updateScheduleSettings(clinicId, num);
                      }
                    } else {
                      Alert.alert('Invalid', 'Please enter a number between 1 and 10');
                    }
                  }}
                  style={{
                    flex: 1,
                    paddingVertical: scale(12),
                    borderRadius: scale(12),
                    backgroundColor: '#667EEA',
                    alignItems: 'center',
                  }}
                >
                  <Text style={{ fontSize: scale(14), fontWeight: '700', color: '#FFFFFF' }}>Confirm</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      {/* AI Orb — زرّ الذكاء الموحّد: نقرة تفتح لوحة الجدول، ضغطة مطوّلة تفتح المحادثة.
          يبقى ظاهرًا دائمًا (حتّى أثناء فتح/إغلاق صفحة الذكاء) فلا فجوةٌ تُشعر باللاق:
          القطرة تنبثق من فوقه وتغطّيه، وعند الإغلاق تنكشف عنه مباشرةً. */}
      {user && !swapMode && !viewOnly && (
        <Animated.View
          pointerEvents={menuMounted ? 'none' : 'box-none'}
          style={[StyleSheet.absoluteFill, { opacity: menuAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }) }]}
        >
          <AIButton
            orbState={aiState}
            onPress={() => setShowAIPanel(true)}
            orbBottom={scale(152)}
            orbGlass
            user={{ id: user.id, name: user.name, role: user.role, clinicId: user.clinicId, clinicName: user.clinicName }}
            clinicId={clinicId}
            messages={aiMessages}
            onSend={handleAISend}
            onClearConversation={handleClearConversation}
            onPatchMessage={patchAiMessage}
            onAfterAction={loadSchedule}
            isLoading={aiLoading}
          />
        </Animated.View>
      )}

      {/* شريطُ التبديل (سواب): تعليماتٌ + حفظ/إلغاء — يظهرُ أسفلَ الشاشةِ فوقَ الجدول.
          box-none كي تبقى خاناتُ الجدولِ قابلةً للنقرِ (اختيارُ الطبيبِ ثُمّ الآخر). */}
      {swapMode && (
        <View pointerEvents="box-none" style={{ position: 'absolute', left: 0, right: 0, bottom: 0 }}>
          <View style={{
            backgroundColor: 'rgba(255,255,255,0.94)',
            borderTopLeftRadius: scale(22), borderTopRightRadius: scale(22),
            paddingHorizontal: scale(18), paddingTop: scale(12), paddingBottom: scale(26),
            borderTopWidth: scale(1), borderColor: 'rgba(124,108,180,0.22)',
            shadowColor: '#28324A', shadowOpacity: 0.14, shadowRadius: scale(16), shadowOffset: { width: 0, height: -scale(3) }, elevation: 16,
          }}>
            <Text style={{ textAlign: 'center', fontSize: scale(12), fontWeight: '700', color: (swapSel || swapPartner) ? '#5B6575' : '#94A0B3', marginBottom: scale(10) }}>
              {swapInstruction}
            </Text>
            {swapError && (
              <Text style={{ textAlign: 'center', color: '#DC2626', fontSize: scale(11), fontWeight: '700', marginBottom: scale(8) }}>{swapError}</Text>
            )}
            <View style={{ flexDirection: 'row', gap: scale(11) }}>
              <TouchableOpacity
                onPress={onSwapPrimary}
                disabled={swapPrimaryDisabled}
                activeOpacity={0.85}
                style={{ flex: 1, paddingVertical: scale(13), borderRadius: scale(14), alignItems: 'center', justifyContent: 'center', backgroundColor: swapPrimaryDisabled ? 'rgba(124,108,180,0.35)' : '#6D4FB8' }}
              >
                {swapSaving
                  ? <ActivityIndicator color="#FFFFFF" />
                  : <Text style={{ fontSize: scale(14), fontWeight: '800', color: '#FFFFFF' }}>{swapPrimaryLabel}</Text>}
              </TouchableOpacity>
              <TouchableOpacity
                onPress={cancelSwap}
                disabled={swapSaving}
                activeOpacity={0.85}
                style={{ flex: 1, paddingVertical: scale(13), borderRadius: scale(14), alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.05)', borderWidth: scale(1), borderColor: 'rgba(124,108,180,0.2)' }}
              >
                <Text style={{ fontSize: scale(14), fontWeight: '700', color: '#6B7280' }}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}

      {/* AI hub: cinematic reveal + orbiting quick actions + in-page chat — لا يُركَّبُ في وضعِ المعاينة */}
      {!viewOnly && (
      <AISchedulePanel
        visible={showAIPanel}
        onClose={() => setShowAIPanel(false)}
        onAction={(_action: PanelAction) => {
          // "إنشاء جدول" يُدار داخل اللوحة (استبيان داخل الصفحة).
          // هنا فقط الإجراءات الأخرى (حفظ/تبديل) — لاحقًا.
        }}
        messages={aiMessages}
        onSend={handleAISend}
        onPatchMessage={patchAiMessage}
        onAfterAction={loadSchedule}
        isLoading={aiLoading}
        contextLabel={`Schedule — ${activeTab === 'daily_duty' ? 'Daily Duty' : activeTab === 'doctors' ? 'Doctors' : activeTab === 'vacation' ? 'Vacation' : 'Weekend'}`}
        userName={user?.name}
        user={user ? { id: user.id, name: user.name, role: user.role, clinicId: user.clinicId, clinicName: user.clinicName } : undefined}
        clinicId={clinicId}
        onCreateSchedule={(result: WizardResult) => {
          // المعالجُ يحفظ الجدولَ بنفسه (saveSlots داخله)؛ هنا نسألُ القائدَ عن الإبلاغ بعد الحفظ.
          offerScheduleAnnounce(result.weekStart);
        }}
        openChatSignal={openChatSignal}
        chatPreview={aiPreview}
        chatPreviewSaving={aiPreviewSaving}
        chatPreviewError={aiPreviewError}
        onSaveChatPreview={handleSaveAiPreview}
        onDiscardChatPreview={() => setAiPreview(null)}
      />
      )}

      {/* Cell Detail Modal */}
      <CellDetailModal
        visible={selectedCell !== null}
        day={selectedCell?.day || null}
        period={selectedCell?.period ?? null}
        slots={slots}
        clinicCount={clinicCount}
        clinicId={clinicId || null}
        weekStart={formatWeekStart(selectedWeekStart)}
        userId={userId}
        isLeader={isLeader}
        userName={user?.name}
        onClose={() => setSelectedCell(null)}
        onSaved={() => {
          loadSchedule();
        }}
        onStatusRequest={handleManualStatusRequest}
        onStatusCancel={handleManualStatusCancel}
        onChangePeriod={(p) => {
          if (selectedCell) {
            setSelectedCell({ ...selectedCell, period: p });
          }
        }}
      />

      {/* شريط «جارٍ التطبيق…» — تعديلٌ يدويّ يُعالَج في الخلفيّة (تغطية/موازنة/استرداد) بعد إغلاق النافذة */}
      {statusBusy && (
        <View pointerEvents="none" style={{
          position: 'absolute', top: scale(54), alignSelf: 'center',
          flexDirection: 'row-reverse', alignItems: 'center', gap: scale(8),
          paddingVertical: scale(8), paddingHorizontal: scale(14), borderRadius: scale(20),
          backgroundColor: 'rgba(20,16,40,0.92)', borderWidth: scale(1), borderColor: 'rgba(150,120,255,0.35)',
        }}>
          <ActivityIndicator size="small" color="#B9A7FF" />
          <Text style={{ color: '#EDE8FF', fontSize: scale(12.5), fontWeight: '700' }}>جارٍ تطبيق التغيير على الجدول…</Text>
        </View>
      )}
    </View>
  );
}
