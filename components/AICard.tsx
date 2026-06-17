// ═══════════════════════════════════════════════════════════════
// لغة كروت الذكاء (Aurora) — **مشتركة**: شارةُ نوعٍ + حبّةُ حالة + سطحٌ زجاجيّ
// بنفسجيّ مضيء + خطٌّ علويٌّ بلون النوع. يستعملها كرت النقص (AIChatModal) وكرت
// خيارات الذكاء (AssistantOffers) فيتطابقان تمامًا بلا تكرار.
// ═══════════════════════════════════════════════════════════════
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { scale } from '../lib/scale';

export type CardKind = 'coverage' | 'decision' | 'swap' | 'done' | 'ignored' | 'info';

// ألوانٌ أزهى للخلفيّة الداكنة (مطابِقة للنموذج)
export const KIND: Record<CardKind, { accent: string; soft: string; line: string; icon: keyof typeof Ionicons.glyphMap }> = {
  coverage: { accent: '#FBBF24', soft: 'rgba(251,191,36,0.18)',  line: 'rgba(251,191,36,0.40)',  icon: 'warning' },
  decision: { accent: '#A78BFA', soft: 'rgba(167,139,250,0.18)', line: 'rgba(167,139,250,0.40)', icon: 'help-circle' },
  swap:     { accent: '#A78BFA', soft: 'rgba(167,139,250,0.18)', line: 'rgba(167,139,250,0.40)', icon: 'swap-horizontal' },
  done:     { accent: '#34D399', soft: 'rgba(52,211,153,0.18)',  line: 'rgba(52,211,153,0.40)',  icon: 'checkmark-circle' },
  ignored:  { accent: '#94A3B8', soft: 'rgba(148,163,184,0.16)', line: 'rgba(148,163,184,0.32)', icon: 'help-circle' },
  info:     { accent: '#A99FD0', soft: 'rgba(169,159,208,0.14)', line: 'rgba(169,159,208,0.26)', icon: 'information-circle' },
};

export function CardBadge({ kind, live }: { kind: CardKind; live?: boolean }) {
  const k = KIND[kind];
  return (
    <View style={[cardStyles.badge, { backgroundColor: k.soft, borderColor: k.line }]}>
      <Ionicons name={k.icon} size={scale(20)} color={k.accent} />
      {live && <View style={[cardStyles.badgeDot, { backgroundColor: k.accent }]} />}
    </View>
  );
}

export function Pill({ kind, text }: { kind: CardKind; text: string }) {
  const k = KIND[kind];
  return (
    <View style={[cardStyles.pill, { backgroundColor: k.soft, borderColor: k.line }]}>
      <Text style={[cardStyles.pillTxt, { color: k.accent }]}>{text}</Text>
    </View>
  );
}

// السطح الزجاجيّ + خطٌّ علويٌّ متلاشٍ بلون النوع + توهّجٌ للكروت الحيّة
export function GlassCard({ kind, glow, children, style }: {
  kind: CardKind; glow?: boolean; children: React.ReactNode; style?: any;
}) {
  const k = KIND[kind];
  return (
    <View style={[cardStyles.glass, glow && { shadowColor: k.accent, shadowOpacity: 0.30, shadowRadius: scale(18) }, style]}>
      <LinearGradient
        colors={['rgba(86,78,150,0.92)', 'rgba(58,52,108,0.93)']}
        start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }}
        style={cardStyles.glassFill}
      />
      <LinearGradient
        colors={['transparent', k.accent, 'transparent']}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
        style={cardStyles.accentLine}
      />
      {children}
    </View>
  );
}

export const cardStyles = StyleSheet.create({
  glass: {
    alignSelf: 'stretch', borderRadius: scale(22),
    backgroundColor: 'rgba(38,33,82,0.94)', borderWidth: scale(1), borderColor: 'rgba(255,255,255,0.15)',
    paddingHorizontal: scale(15), paddingTop: scale(15), paddingBottom: scale(14),
    shadowColor: '#2A1A52', shadowOpacity: 0.35, shadowRadius: scale(16), shadowOffset: { width: 0, height: scale(8) }, elevation: 6,
  },
  glassFill: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderRadius: scale(22) },
  glassDim: { opacity: 0.6 },
  accentLine: { position: 'absolute', top: 0, left: 0, right: 0, height: scale(2.5) },
  head: { flexDirection: 'row-reverse', alignItems: 'center', gap: scale(11) },
  headTxt: { flex: 1, alignItems: 'flex-end' },
  badge: { width: scale(38), height: scale(38), borderRadius: scale(13), alignItems: 'center', justifyContent: 'center', borderWidth: scale(1) },
  badgeDot: {
    position: 'absolute', top: -scale(2), right: -scale(2), width: scale(9), height: scale(9), borderRadius: scale(5),
    borderWidth: scale(1.5), borderColor: 'rgba(30,27,75,0.9)',
  },
  pill: { alignSelf: 'flex-end', marginTop: scale(4), paddingHorizontal: scale(9), paddingVertical: scale(3), borderRadius: scale(999), borderWidth: scale(1) },
  pillTxt: { fontSize: scale(11), fontWeight: '800' },
  cardTitle: { fontSize: scale(15), fontWeight: '800', color: '#F4F1FF', textAlign: 'right', lineHeight: scale(22) },
  covBody: { marginTop: scale(12), paddingTop: scale(12), borderTopWidth: scale(1), borderTopColor: 'rgba(255,255,255,0.10)' },
});
