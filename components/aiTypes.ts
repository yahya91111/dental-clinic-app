// ═══════════════════════════════════════════════════════════════
// Shared AI chat types
// ═══════════════════════════════════════════════════════════════
// نوع رسالة الدردشة المشترك بين الشاشة (الأب) ولوحة الذكاء
// (AISchedulePanel). موضوع في ملفّ محايد حتى لا يملكه أيّ مكوّن.
// ═══════════════════════════════════════════════════════════════

import type { AnnounceOffer } from '../lib/ai_v2';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  /** عرض إبلاغ بعد غيابٍ ذاتيّ — الواجهة تعرض أزراره وتنفّذها بالكود لا بالنموذج */
  announceOffer?: AnnounceOffer;
}
