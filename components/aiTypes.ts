// ═══════════════════════════════════════════════════════════════
// Shared AI chat types
// ═══════════════════════════════════════════════════════════════
// نوع رسالة الدردشة المشترك بين الشاشة (الأب) ولوحة الذكاء
// (AISchedulePanel). موضوع في ملفّ محايد حتى لا يملكه أيّ مكوّن.
// ═══════════════════════════════════════════════════════════════

import type { AnnounceOffer, SwapOffer, ConfirmOffer } from '../lib/ai_v2';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  /** عرض إبلاغ بعد غيابٍ ذاتيّ — الواجهة تعرض أزراره وتنفّذها بالكود لا بالنموذج */
  announceOffer?: AnnounceOffer;
  /** أزرار حسم الاستئذان المبهم (بداية/نهاية) — تُنفَّذ بالكود */
  swapOffer?: SwapOffer;
  /** تأكيد إجراءٍ خطير (مسح الجدول) — [نعم، امسح][تراجع] تُنفَّذ بالكود */
  confirmOffer?: ConfirmOffer;
  /** نتيجة الخيار بعد تنفيذه — تُخزَّن في الرسالة المشتركة فتتزامن بين المحادثتين */
  offerResolved?: { text: string; done: boolean };
}
