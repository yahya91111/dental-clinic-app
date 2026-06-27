import React, { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StatusBar, Animated, Modal, TextInput, Keyboard, TouchableWithoutFeedback, Alert, ActivityIndicator } from 'react-native';
import { scale } from '../../lib/scale';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { DayOfWeek, ScheduleSlot } from './types';
import { ScheduleGrid } from './ScheduleGrid';
import { CellDetailModal } from './CellDetailModal';
import { WeekStrip } from './WeekStrip';
import { DoctorsTab } from './DoctorsTab';
import { getWeeklySchedule, getScheduleSettings, updateScheduleSettings } from '../../lib/database';
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
}

type ScheduleTab = 'daily_duty' | 'doctors' | 'vacation' | 'weekend_duty';

const TABS: { key: ScheduleTab; label: string; icon: string }[] = [
  { key: 'daily_duty', label: 'Daily Duty', icon: 'calendar-outline' },
  { key: 'doctors', label: 'Doctors', icon: 'people-outline' },
  { key: 'vacation', label: 'Vacation', icon: 'airplane-outline' },
  { key: 'weekend_duty', label: 'Weekend', icon: 'time-outline' },
];

export default function ScheduleScreen({ onBack, clinicId, userId }: ScheduleScreenProps) {
  const { user } = useAuth();

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

  // Settings
  const [showMenu, setShowMenu] = useState(false);
  const [showClinicInput, setShowClinicInput] = useState(false);
  const [clinicCount, setClinicCount] = useState(2);
  const [clinicInputValue, setClinicInputValue] = useState('');
  const [settingsLoaded, setSettingsLoaded] = useState(false);

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
        // غيابٌ/إلغاءٌ ذاتيّ سُجّل هذه الرسالة؟ → أزرار الإبلاغ تظهر تحت الردّ وتنفَّذ بالكود
        announceOffer: response.announceOffer,
        // حسم استئذانٍ مبهم؟ → أزرار [بداية]/[نهاية] تحت الردّ تُنفَّذ بالكود
        swapOffer: response.swapOffer,
        // طلب مسح الجدول؟ → أزرار تأكيد [نعم، امسح][تراجع] تُنفَّذ بالكود
        confirmOffer: response.confirmOffer,
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

  // حفظ معاينة الشات كما هي (بعد أيّ تبديل يدويّ) — يكتب الخانات + علامات الغياب/الاستئذان
  const handleSaveAiPreview = async (finalSlots: AssignedSlot[]) => {
    if (!aiPreview || !clinicId) return;
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

  // Schedule slots from Supabase
  const [slots, setSlots] = useState<ScheduleSlot[]>([]);

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

  return (
    <View style={{ flex: 1 }}>
      <StatusBar translucent={true} backgroundColor="transparent" barStyle="dark-content" />
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
            <Text style={{
              fontSize: scale(34),
              fontWeight: '700',
              color: '#4A5568',
              letterSpacing: -0.5,
              flex: 1,
              textAlign: 'center',
            }}>Schedule</Text>
            <TouchableOpacity
              onPress={() => setShowMenu(!showMenu)}
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

            {/* Side Menu */}
            {showMenu && (
              <TouchableOpacity
                activeOpacity={1}
                onPress={() => setShowMenu(false)}
                style={{
                  position: 'absolute',
                  top: 0,
                  right: 0,
                  bottom: 0,
                  left: 0,
                  zIndex: 100,
                }}
              >
                <View style={{
                  position: 'absolute',
                  top: scale(50),
                  right: scale(20),
                  backgroundColor: 'rgba(30, 30, 40, 0.85)',
                  borderRadius: scale(16),
                  padding: scale(8),
                  minWidth: scale(180),
                  borderWidth: scale(1),
                  borderColor: 'rgba(255,255,255,0.15)',
                  shadowColor: '#000',
                  shadowOffset: { width: 0, height: scale(8) },
                  shadowOpacity: 0.3,
                  shadowRadius: scale(12),
                  elevation: 10,
                  zIndex: 101,
                }}>
                  {/* Clinics Count Option */}
                  <TouchableOpacity
                    activeOpacity={0.7}
                    onPress={() => {
                      setShowMenu(false);
                      setClinicInputValue(String(clinicCount));
                      setShowClinicInput(true);
                    }}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: scale(10),
                      paddingVertical: scale(12),
                      paddingHorizontal: scale(14),
                      borderRadius: scale(10),
                    }}
                  >
                    <Ionicons name="business-outline" size={scale(18)} color="#A5B4FC" />
                    <Text style={{ fontSize: scale(14), fontWeight: '600', color: '#FFFFFF', flex: 1 }}>
                      Number of Clinics
                    </Text>
                    <View style={{
                      backgroundColor: 'rgba(165, 180, 252, 0.2)',
                      borderRadius: scale(8),
                      paddingHorizontal: scale(8),
                      paddingVertical: scale(3),
                    }}>
                      <Text style={{ fontSize: scale(13), fontWeight: '700', color: '#A5B4FC' }}>{clinicCount}</Text>
                    </View>
                  </TouchableOpacity>
                </View>
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
            contentContainerStyle={{ paddingHorizontal: scale(10), paddingTop: scale(12), paddingBottom: scale(80) }}
            showsVerticalScrollIndicator={false}
            onScroll={handleContentScroll}
            scrollEventThrottle={16}
          >
            {activeTab === 'daily_duty' && settingsLoaded && (
              <ScheduleGrid
                slots={slots}
                clinicCount={clinicCount}
                onCellPress={(day, period) => setSelectedCell({ day, period })}
                userId={userId}
              />
            )}
            {activeTab === 'doctors' && <DoctorsTab clinicId={clinicId || null} />}
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

          {/* Bottom Tab Bar */}
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
        </View>
      </SafeAreaView>

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
      {user && (
        <AIButton
          orbState={aiState}
          onPress={() => setShowAIPanel(true)}
          user={{ id: user.id, name: user.name, role: user.role, clinicId: user.clinicId, clinicName: user.clinicName }}
          clinicId={clinicId}
          messages={aiMessages}
          onSend={handleAISend}
          onClearConversation={handleClearConversation}
          onPatchMessage={patchAiMessage}
          onAfterAction={loadSchedule}
          isLoading={aiLoading}
        />
      )}

      {/* AI hub: cinematic reveal + orbiting quick actions + in-page chat */}
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
          // TODO: تمرير result إلى بناء الجدول لاحقًا
          console.log('[Wizard] result:', JSON.stringify(result));
        }}
        chatPreview={aiPreview}
        chatPreviewSaving={aiPreviewSaving}
        chatPreviewError={aiPreviewError}
        onSaveChatPreview={handleSaveAiPreview}
        onDiscardChatPreview={() => setAiPreview(null)}
      />

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
