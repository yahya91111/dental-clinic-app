// ═══════════════════════════════════════════════════════════════
// useAIChat — متحكّمُ محادثةِ الذكاء المشترك (مصدرٌ واحد لكلّ الصفحات)
// ───────────────────────────────────────────────────────────────
// يجمعُ حالةَ المحادثةِ ومنطقَ الإرسالِ (نفسَ سلوكِ صفحةِ الجدول تمامًا):
//   • رسائلُ العرض + سياقُ الذكاء (history) + حفظٌ محليّ متدحرج (نفسُ المفتاح
//     لكلّ الصفحات → محادثةٌ واحدةٌ متّسقة).
//   • send: يُرسِل، ويبني رسالةَ الردّ بكلّ عروضِها (إبلاغ/تبديل/تأكيد + معالج الجدول).
//   • patch/clear + دفعُ رسالةٍ جاهزة (لعرضِ إبلاغِ الجدول بعد الحفظ).
// الأجزاءُ الخاصّةُ بالصفحة تُحقَن: buildContextData / onPreview / onAfterResponse.
// فأيُّ صفحةٍ تُركِّبُ الأوربَّ تستدعي هذا الخُطّاف ثمّ تُمرِّر ناتجَه لـ <AIButton>.
// ═══════════════════════════════════════════════════════════════

import { useCallback, useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { sendMessageV2, type V2Message, type V2User, type SchedulePreview } from '../lib/ai_v2';
import { ChatMessage } from '../components/aiTypes';
import { AIState } from '../components/AIOrb';

const AI_CTX_TOKENS = 1500;   // سقف ما يُرسَل للذكاء (~١٠ تبادلات) — ضبط الكلفة
const AI_HISTORY_MAX = 50;    // أقصى رسائل تُحفَظ محليّاً للعرض (تتدحرج، تبقى بعد الخروج)
// نفسُ المفتاحِ في كلّ الصفحات → المحادثةُ متّسقةٌ أينما فُتِح الأوربّ
const aiStoreKey = (uid: string) => `ai_chat_v1_${uid}`;
const estTokens = (s: string) => Math.ceil((s?.length || 0) / 3);

function trimToTokenBudget(msgs: V2Message[], maxTokens: number): V2Message[] {
  const out: V2Message[] = [];
  let total = 0;
  for (let i = msgs.length - 1; i >= 0; i--) {
    const t = estTokens(String(msgs[i].content ?? '')) + 8;
    if (out.length && total + t > maxTokens) break;
    out.unshift(msgs[i]);
    total += t;
  }
  while (out.length && out[0].role !== 'user') out.shift();
  return out.length ? out : msgs.slice(-1);
}

type SendOpts = { task?: 'schedule' | 'requests'; contextData?: string; hidden?: boolean; freshConversation?: boolean };

export type AIChatUser = { id: string; name: string; role: string; clinicId?: string | null; clinicName?: string };

export type UseAIChatParams = {
  user: AIChatUser | null | undefined;
  clinicId?: string | null;
  /** سياقٌ خاصٌّ بالصفحة يُضاف لكلّ طلب (أسبوع/عدد عيادات/تبويب...) */
  buildContextData?: () => string;
  /** بنى الذكاءُ معاينةَ جدول (build_schedule dryRun) — الصفحةُ تعرضها إن دعمت ذلك */
  onPreview?: (preview: SchedulePreview) => void;
  /** بعد ردٍّ ناجح — لإنعاشِ ما قد يكون الذكاءُ غيّره (شبكة الجدول مثلًا) */
  onAfterResponse?: () => void;
};

export type UseAIChat = {
  messages: ChatMessage[];
  isLoading: boolean;
  aiState: AIState;
  send: (text: string, opts?: SendOpts) => Promise<void>;
  patchMessage: (id: string, patch: Partial<ChatMessage>) => void;
  clearConversation: () => Promise<void>;
  /** يدفعُ رسالةَ مساعدٍ جاهزة (مثل سؤالِ إبلاغِ الجدول بعد الحفظ) */
  pushAssistant: (msg: ChatMessage) => void;
};

export function useAIChat({ user, clinicId, buildContextData, onPreview, onAfterResponse }: UseAIChatParams): UseAIChat {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setLoading] = useState(false);
  const [aiState, setAiState] = useState<AIState>('idle');
  const historyRef = useRef<V2Message[]>([]);
  const loadedRef = useRef(false);

  // استرجاعُ المحفوظ عند الدخول — يُعادُ بناءُ سياقِ الذكاء من المعروض
  useEffect(() => {
    if (!user?.id) return;
    let alive = true;
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(aiStoreKey(user.id));
        if (!alive) return;
        const saved = raw ? (JSON.parse(raw) as ChatMessage[]) : [];
        if (Array.isArray(saved) && saved.length) {
          setMessages(saved);
          historyRef.current = saved.map((m) => ({ role: m.role, content: m.content }));
        }
      } catch { /* لا سجلّ محفوظ */ }
      finally { if (alive) loadedRef.current = true; }
    })();
    return () => { alive = false; };
  }, [user?.id]);

  // حفظٌ متدحرج بعد اكتمالِ الاسترجاع (كي لا نمسح المحفوظ)
  useEffect(() => {
    if (!user?.id || !loadedRef.current || messages.length === 0) return;
    AsyncStorage.setItem(aiStoreKey(user.id), JSON.stringify(messages.slice(-AI_HISTORY_MAX))).catch(() => {});
  }, [messages, user?.id]);

  const send = useCallback(async (text: string, opts?: SendOpts) => {
    if (!user) return;
    if (!opts?.hidden) {
      const userMsg: ChatMessage = { id: `u${Date.now()}`, role: 'user', content: text, timestamp: Date.now() };
      setMessages((prev) => [...prev, userMsg]);
    }
    historyRef.current.push({ role: 'user', content: text });

    setLoading(true);
    setAiState('thinking');

    const contextData = (buildContextData?.() ?? '') + (opts?.contextData ? `\n${opts.contextData}` : '');
    const v2User: V2User = {
      id: user.id, name: user.name, role: user.role,
      clinicId: user.clinicId || undefined, clinicName: user.clinicName,
    };

    const response = await sendMessageV2({
      messages: trimToTokenBudget(historyRef.current, AI_CTX_TOKENS),
      user: v2User,
      clinicId: clinicId || user.clinicId || undefined,
      contextData,
      task: opts?.task,
    });

    setLoading(false);

    if (response.success) {
      setAiState('success');
      const assistantMsg: ChatMessage = {
        id: `a${Date.now()}`, role: 'assistant', content: response.message, timestamp: Date.now(),
        announceOffer: response.announceOffer,
        announceOffers: response.announceOffers,
        swapOffer: response.swapOffer,
        confirmOffer: response.confirmOffer,
        scheduleWizard: response.scheduleWizard,
      };
      setMessages((prev) => [...prev, assistantMsg]);
      historyRef.current.push({ role: 'assistant', content: response.message });
      if (response.preview) onPreview?.(response.preview);
      onAfterResponse?.();
    } else {
      setAiState('error');
      const errorMsg: ChatMessage = { id: `e${Date.now()}`, role: 'assistant', content: response.error || 'Something went wrong.', timestamp: Date.now() };
      setMessages((prev) => [...prev, errorMsg]);
    }

    setTimeout(() => setAiState('idle'), 2000);
  }, [user, clinicId, buildContextData, onPreview, onAfterResponse]);

  const patchMessage = useCallback((id: string, patch: Partial<ChatMessage>) => {
    setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, ...patch } : m)));
  }, []);

  const pushAssistant = useCallback((msg: ChatMessage) => {
    setMessages((prev) => [...prev, msg]);
    historyRef.current.push({ role: 'assistant', content: msg.content });
  }, []);

  const clearConversation = useCallback(async () => {
    setMessages([]);
    historyRef.current = [];
    if (!user?.id) return;
    AsyncStorage.removeItem(aiStoreKey(user.id)).catch(() => {});
    try {
      const { getNotifications, deleteNotification } = await import('../lib/database');
      const { data } = await getNotifications(user.id, 50);
      const types = ['swap_request', 'gap_alert', 'request_result'];
      const ids = ((data || []) as { id: string; type: string }[])
        .filter((n) => types.includes(n.type)).map((n) => n.id);
      for (const id of ids) await deleteNotification(id);
    } catch { /* المسح تنظيفٌ لا حرج في فشله */ }
  }, [user?.id]);

  return { messages, isLoading, aiState, send, patchMessage, clearConversation, pushAssistant };
}
