import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';

// React Native يحتاج polyfill لـ URL + AsyncStorage لحفظ الجلسة.
// Node (للاختبارات) يستعمل URL الأصلي ولا يحتاج storage.
//
// نحمّلها بـ require() داخل try/catch حتى يطلع Node بسلام
// حين لا تتوفر هذه الحزم وقت التشغيل.
let storage: unknown = undefined;
const isReactNative =
  typeof navigator !== 'undefined' &&
  (navigator as { product?: string }).product === 'ReactNative';

if (isReactNative) {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require('react-native-url-polyfill/auto');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    storage = require('@react-native-async-storage/async-storage').default;
  } catch {
    // Ignore — bundlers that strip these will hit the catch
  }
}

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('Supabase credentials not found!');
  console.error('SUPABASE_URL:', supabaseUrl ? 'Found' : 'Missing');
  console.error('SUPABASE_ANON_KEY:', supabaseAnonKey ? 'Found' : 'Missing');
} else if (isReactNative) {
  console.log('Supabase credentials loaded successfully');
  console.log('Supabase URL:', supabaseUrl);
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: storage as never,
    autoRefreshToken: isReactNative,
    persistSession: isReactNative,
    detectSessionInUrl: false,
  },
});
