// ═══════════════════════════════════════════════════════════════
// وسيط الذكاء — proxy
// ═══════════════════════════════════════════════════════════════
// نداءات Anthropic تمرّ عبر Supabase Edge Function تحتفظ بالمفتاح على
// الخادم (سرّ Supabase: ANTHROPIC_API_KEY) فلا يُشحَن مفتاحُ الذكاء داخلَ
// التطبيق المنشور. المفتاحُ الوحيد في التطبيق هو مفتاح Supabase العامّ (anon)
// — وهو عامٌّ بطبيعته.
// ═══════════════════════════════════════════════════════════════
const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || '';
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';

/** رابط وظيفة الوسيط؛ فارغ إن لم تُضبَط بيئة Supabase. */
export const AI_PROXY_URL = SUPABASE_URL ? `${SUPABASE_URL}/functions/v1/anthropic-proxy` : '';

/** ترويسات نداء الوسيط: تفويض Supabase فقط؛ المفتاح السرّي يُحقَن على الخادم. */
export const aiProxyHeaders = (): Record<string, string> => ({
  'Content-Type': 'application/json',
  Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
  apikey: SUPABASE_ANON_KEY,
});
