// ═══════════════════════════════════════════════════════════════
// بوّابةُ النسخة — الوجهُ الظاهر
// ═══════════════════════════════════════════════════════════════
// حاجزانِ من رقمَين ([[sql/add_app_config.sql]]):
//   • suggested_version → شريطٌ يعلو الشاشةَ ويُغلَق. تنبيهٌ لا يقطعُ عملًا.
//   • required_version  → صفحةٌ تملأُ الشاشةَ ولا تُغلَق. لا عملَ حتّى يُحدِّث.
// والقاعدةُ في lib/versionGate.ts؛ هذا رسمٌ فوقَها لا منطقٌ فيه.
import React, { useState } from 'react';
import { View, Text, TouchableOpacity, Linking, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { scale, scaledStyleSheet } from '../lib/scale';
import { useVersionGate } from '../lib/versionGate';

const open = (url: string) => { Linking.openURL(url).catch(() => {}); };

export function UpdateGate({ children }: { children: React.ReactNode }) {
  const { state, current, required, storeUrl } = useVersionGate();
  // الاقتراحُ يُغلَقُ لهذه الجلسةِ فقط: لا نحفظُ إغلاقَه، فيعودُ في الفتحةِ التالية
  // تذكيرًا لطيفًا. ولو حفظناهُ لَنسيَه صاحبُه إلى الأبد.
  const [hushed, setHushed] = useState(false);

  if (state === 'block') {
    return (
      <LinearGradient colors={['#0E3B33', '#0B2A2A', '#08201F']} style={s.wall}>
        <View style={s.badge}>
          <Ionicons name="arrow-up-circle" size={scale(46)} color="#7DD3C0" />
        </View>

        <Text style={s.title}>يوجدُ إصدارٌ جديد</Text>
        <Text style={s.body}>
          حمِّلْه لتُكمِلَ العمل. التحديثُ سريعٌ ولا تفقدُ معه شيئًا —
          كلُّ بياناتِك محفوظةٌ في حسابِك.
        </Text>

        <View style={s.vers}>
          <View style={s.verCol}>
            <Text style={s.verLbl}>نسختُك</Text>
            <Text style={s.verOld}>{current || '—'}</Text>
          </View>
          <Ionicons name="arrow-back" size={scale(15)} color="rgba(255,255,255,0.35)" />
          <View style={s.verCol}>
            <Text style={s.verLbl}>المطلوبة</Text>
            <Text style={s.verNew}>{required || '—'}</Text>
          </View>
        </View>

        <TouchableOpacity activeOpacity={0.85} onPress={() => open(storeUrl)} style={s.cta}>
          <LinearGradient colors={['#12B39D', '#0B7F71']} start={{ x: 0.2, y: 0 }} end={{ x: 0.8, y: 1 }} style={s.ctaFill}>
            <Ionicons name="cloud-download" size={scale(17)} color="#FFFFFF" />
            <Text style={s.ctaTxt}>تحديثُ الآن</Text>
          </LinearGradient>
        </TouchableOpacity>

        <Text style={s.foot}>يفتحُ صفحةَ التطبيقِ في المتجرِ مباشرة</Text>
      </LinearGradient>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      {children}
      {state === 'suggest' && !hushed ? (
        <View style={s.stripWrap} pointerEvents="box-none">
          <TouchableOpacity activeOpacity={0.9} onPress={() => open(storeUrl)} style={s.strip}>
            <Ionicons name="arrow-up-circle" size={scale(17)} color="#0B7F71" />
            <Text style={s.stripTxt} numberOfLines={1}>يوجدُ تحديثٌ جديدٌ للتطبيق</Text>
            <View style={s.stripGo}><Text style={s.stripGoTxt}>تحديث</Text></View>
            <TouchableOpacity hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} onPress={() => setHushed(true)}>
              <Ionicons name="close" size={scale(15)} color="#7C949C" />
            </TouchableOpacity>
          </TouchableOpacity>
        </View>
      ) : null}
    </View>
  );
}

// الأنواعُ المضيَّقةُ صراحةً (`as const`): scaledStyleSheet يُمرّرُ النوعَ كما استنتجَه،
// فيتوسّعُ '800' إلى string ويرفضُه RN. فنُثبّتُ الحرفَ في موضعِه ولا نُورِّثُ الخطأ.
const s = scaledStyleSheet({
  // ── الحاجزُ المانع ──
  wall: { flex: 1, alignItems: 'center' as const, justifyContent: 'center' as const, paddingHorizontal: 34 },
  badge: {
    width: 84, height: 84, borderRadius: 42, alignItems: 'center' as const, justifyContent: 'center' as const,
    backgroundColor: 'rgba(125,211,192,0.10)', borderWidth: 1.5, borderColor: 'rgba(125,211,192,0.30)',
  },
  title: { marginTop: 22, fontSize: 22, fontWeight: '800' as const, color: '#FFFFFF', textAlign: 'center' as const, letterSpacing: -0.3 },
  body: { marginTop: 10, fontSize: 13.5, lineHeight: 22, color: 'rgba(255,255,255,0.62)', textAlign: 'center' as const },

  // شريطُ الرقمَين: القديمُ باهتٌ والجديدُ مضيء — الفرقُ يُقرأُ بلا كلمة
  vers: {
    marginTop: 26, flexDirection: 'row-reverse' as const, alignItems: 'center' as const, gap: 16,
    paddingVertical: 12, paddingHorizontal: 22, borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.05)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
  },
  verCol: { alignItems: 'center' as const, minWidth: 62 },
  verLbl: { fontSize: 9, fontWeight: '700' as const, letterSpacing: 0.6, color: 'rgba(255,255,255,0.38)' },
  verOld: { marginTop: 3, fontSize: 15, fontWeight: '800' as const, color: 'rgba(255,255,255,0.42)' },
  verNew: { marginTop: 3, fontSize: 15, fontWeight: '800' as const, color: '#7DD3C0' },

  cta: { marginTop: 30, borderRadius: 15, overflow: 'hidden' as const, shadowColor: '#0B7F71', shadowOpacity: 0.5, shadowRadius: 16, shadowOffset: { width: 0, height: 8 }, elevation: 8 },
  ctaFill: { flexDirection: 'row-reverse' as const, alignItems: 'center' as const, justifyContent: 'center' as const, gap: 9, paddingVertical: 15, paddingHorizontal: 46 },
  ctaTxt: { fontSize: 15, fontWeight: '800' as const, color: '#FFFFFF' },
  foot: { marginTop: 14, fontSize: 10.5, fontWeight: '600' as const, color: 'rgba(255,255,255,0.30)' },

  // ── الشريطُ المقترِح ──
  stripWrap: { position: 'absolute' as const, top: 0, left: 0, right: 0, alignItems: 'center' as const, paddingTop: 52, paddingHorizontal: 14 },
  strip: {
    flexDirection: 'row-reverse' as const, alignItems: 'center' as const, gap: 9, width: '100%' as const,
    paddingVertical: 9, paddingHorizontal: 13, borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.94)', borderWidth: 1, borderColor: 'rgba(11,40,48,0.10)',
    shadowColor: '#08202A', shadowOpacity: 0.16, shadowRadius: 14, shadowOffset: { width: 0, height: 6 }, elevation: 6,
  },
  stripTxt: { flex: 1, fontSize: 12.5, fontWeight: '700' as const, color: '#12232A', textAlign: 'right' as const },
  stripGo: { paddingVertical: 4, paddingHorizontal: 11, borderRadius: 9, backgroundColor: 'rgba(14,124,102,0.10)' },
  stripGoTxt: { fontSize: 11, fontWeight: '800' as const, color: '#0B7F71' },
});
