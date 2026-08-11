// ═══════════════════════════════════════════════════════════════
// بوّابةُ النسخة — القاعدةُ الصافية
// ═══════════════════════════════════════════════════════════════
// لا React ولا expo ولا شبكة، فتُختبَرُ في node وحدَها (scripts/test-version-gate.ts).
// والقراءةُ والرسمُ فوقَها: lib/versionGate.ts و components/UpdateGate.tsx.

// ── مقارنةُ نسختَين ──
// «1.0.9» أحدثُ من «1.0.10»؟ نصًّا نعم، ورقمًا لا. فالمقارنةُ **جزءًا جزءًا كأعداد**
// لا حرفًا حرفًا — وإلّا لَحُجِبَ التطبيقُ عن حاملِ الأحدثِ يومَ يبلغُ رقمُ التصحيحِ العشرة.
// والأقصرُ يُكمَّلُ بأصفار، فـ«1.1» = «1.1.0».
export const cmpVersion = (a: string, b: string): number => {
  const pa = String(a ?? '').trim().split('.');
  const pb = String(b ?? '').trim().split('.');
  const n = Math.max(pa.length, pb.length);
  for (let i = 0; i < n; i++) {
    const x = parseInt(pa[i] ?? '0', 10) || 0;
    const y = parseInt(pb[i] ?? '0', 10) || 0;
    if (x !== y) return x < y ? -1 : 1;
  }
  return 0;
};

export type GateState = 'ok' | 'suggest' | 'block';

/** أيُّ حاجزٍ يستحقُّه هذا الجهاز؟ الإلزامُ يغلبُ الاقتراحَ دائمًا. */
export const gateFor = (current: string, required?: string | null, suggested?: string | null): GateState => {
  if (!current) return 'ok';                                   // لا نعرفُ نسختَنا → لا نمنعُ أحدًا
  if (required && cmpVersion(current, required) < 0) return 'block';
  if (suggested && cmpVersion(current, suggested) < 0) return 'suggest';
  return 'ok';
};
