// ═══════════════════════════════════════════════════════════════
// بوّابةُ النسخة — القراءةُ من الخادم
// ═══════════════════════════════════════════════════════════════
// القاعدةُ الصافيةُ في lib/versionRules.ts (تُختبَرُ في node)، والرسمُ في
// components/UpdateGate.tsx. وهذا وسطٌ بينهما: يقرأُ الصفَّ الحاكمَ ويُطبّقُ القاعدة.
import { useEffect, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import Constants from 'expo-constants';
import { supabase } from './supabase';
import { gateFor, type GateState } from './versionRules';

export { cmpVersion, gateFor, type GateState } from './versionRules';

// نسختُنا كما هي في app.json. وسياستُنا في التحديثِ الجوّيِّ `appVersion`، أي أنّ التحديثَ
// لا يصلُ إلّا جسدًا يحملُ رقمَه — فرقمُ البيانِ هنا هو رقمُ الملفِّ المثبَّتِ نفسُه دائمًا.
export const currentVersion = (): string =>
  (Constants.expoConfig?.version as string | undefined) ?? '';

const STORE_FALLBACK = 'https://apps.apple.com/app/id6755978696';

export type GateInfo = { state: GateState; current: string; required: string; storeUrl: string };

// الجدارُ يسقطُ في حينِه لا في الإقلاعِ التالي. فلا تكفي قراءةٌ واحدةٌ عندَ الفتح:
// نتفقّدُ عندَ كلِّ عودةٍ إلى التطبيق (فورًا)، ونكنسُ كلَّ عشرِ دقائقَ لمن أبقاهُ مفتوحًا
// أمامَه طولَ اليوم — وهي عينُ نبضةِ التحديثِ الجوّيّ (lib/otaUpdate.ts) عن قصد،
// كي يبقى في الرأسِ إيقاعٌ واحدٌ لا إيقاعان.
const EVERY_MS = 10 * 60 * 1000;

/** يقرأُ الصفَّ الحاكمَ ويقرّرُ. صامتٌ عندَ أيِّ عطل: لا شبكةَ ولا جدولَ ⇒ لا حاجز. */
export function useVersionGate(): GateInfo {
  const current = currentVersion();
  const [info, setInfo] = useState<GateInfo>({ state: 'ok', current, required: '', storeUrl: STORE_FALLBACK });

  useEffect(() => {
    let alive = true;

    const read = async () => {
      try {
        const { data, error } = await supabase
          .from('app_config')
          .select('required_version,suggested_version,store_url')
          .eq('id', 1)
          .single();
        if (error || !data || !alive) return;
        const row = data as { required_version: string | null; suggested_version: string | null; store_url: string | null };
        const next: GateInfo = {
          state: gateFor(current, row.required_version, row.suggested_version),
          current,
          required: row.required_version || row.suggested_version || '',
          storeUrl: row.store_url || STORE_FALLBACK,
        };
        // نُبقي الكائنَ نفسَه إن لم يتغيّرْ شيء، فلا يُعيدُ الكنسُ رسمَ التطبيقِ كلَّ عشرِ دقائق.
        setInfo(prev =>
          prev.state === next.state && prev.required === next.required && prev.storeUrl === next.storeUrl
            ? prev
            : next
        );
      } catch {
        // الجدولُ غيرُ مُهاجَرٍ بعد، أو الشبكةُ منقطعة — والبوّابةُ **تفشلُ مفتوحةً** عمدًا:
        // أن يعملَ طبيبٌ بنسخةٍ قديمةٍ أهونُ ألفَ مرّةٍ من أن يُحجَبَ الجميعُ لعطلِ شبكة.
        // وإن سبقَ أن قرأنا «امنعْ» ثمّ انقطعتِ الشبكة، **يبقى المنع**: وإلّا كانَ إطفاءُ
        // الإنترنتِ بابًا خلفيًّا حولَ الجدار. ولا يخسرُ شيئًا، فالتطبيقُ بلا شبكةٍ لا يعمل.
      }
    };

    const onState = (s: AppStateStatus) => { if (s === 'active') read(); };
    const sub = AppState.addEventListener('change', onState);
    const timer = setInterval(read, EVERY_MS);
    read();

    return () => { alive = false; sub.remove(); clearInterval(timer); };
  }, [current]);

  return info;
}
