/**
 * DayChartCard — مدخلُ مخطّطِ اليومِ في صفحةِ الأرشيف.
 *
 * ليس زرًّا مكتوبًا عليه «Day chart»، بل **صورةٌ مصغَّرةٌ من المخطّطِ نفسِه**: لكلِّ كرسيٍّ
 * شريطُه، وفي الشريطِ كتلُ ذلك اليومِ بألوانِها كما كانت. فالطبيبُ يعرفُ ما وراءَ النقرةِ
 * قبلَ أن ينقر — امتلأَ اليومُ أم تخلّلته فجوات، وأين وقعَ تبديلُ الشفت.
 *
 * والنافذةُ المعروضةُ ليست اليومَ التقويميَّ كلَّه: أربعٌ وعشرون ساعةً تسحقُ العملَ في
 * شريطٍ لا يُقرأ. فنؤطّرُ ما جرى فعلًا، ونكتبُ طرفَيِ الإطارِ تحتَه كي لا يُقاسَ بالوهم.
 */
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { scale } from '../../lib/scale';
import type { DayChart, Kind } from './queueLanes';

// ألوانُ المصغَّر: نسخةٌ مصمتةٌ من ألوانِ كروتِ المخطّطِ الكبير، كي يُعرَفَ الحالُ بلمحة
const SEG: Record<Kind, string> = {
  done: '#8FA6B1',
  lateDone: '#E0524A',
  cur: '#3BB79E',
  over: '#E13A30',
  fut: '#9BC0D2',
  eld: '#F0A81A',
  na: '#B4B7D8',
  break: 'rgba(59,46,99,0.13)',
};

const INK = '#3B2E63';
const TONE = '#6D53C6';

const fmtHM = (min: number): string => {
  const h = Math.floor(min / 60) % 24;
  const m = Math.round(min) % 60;
  return `${h < 10 ? '0' : ''}${h}:${m < 10 ? '0' : ''}${m}`;
};

function Pill({ icon, text, tone }: { icon: keyof typeof Ionicons.glyphMap; text: string; tone: string }) {
  return (
    <View style={d.pill}>
      <Ionicons name={icon} size={scale(11)} color={tone} />
      <Text style={[d.pillTxt, { color: tone }]}>{text}</Text>
    </View>
  );
}

export function DayChartCard({ chart, dateLabel, onPress }: {
  chart: DayChart;
  dateLabel?: string;
  onPress: () => void;
}) {
  const all = chart.lanes.flatMap((l) => l.blocks);
  const cards = all.filter((b) => b.kind !== 'break');
  const done = cards.filter((b) => b.kind === 'done' || b.kind === 'lateDone').length;
  const away = cards.filter((b) => b.kind === 'na').length;
  const left = chart.lanes.reduce((n, l) => n + l.beyond.length, 0);

  // إطارُ ما جرى — لا اليومُ كلُّه
  const lo = all.length ? Math.min(...all.map((b) => b.start)) : 8 * 60;
  const hi = all.length ? Math.max(...all.map((b) => b.end)) : 14 * 60;
  const pad = Math.max(10, (hi - lo) * 0.04);
  const w0 = Math.max(chart.dayStart, lo - pad);
  const w1 = Math.min(chart.dayEnd, hi + pad);
  const span = Math.max(1, w1 - w0);
  const at = (v: number) => ((Math.max(w0, Math.min(w1, v)) - w0) / span) * 100;

  return (
    <TouchableOpacity activeOpacity={0.88} onPress={onPress} style={d.card}>
      <LinearGradient
        colors={['rgba(255,255,255,0.72)', 'rgba(244,241,252,0.60)']}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />

      {/* الرأس */}
      <View style={d.head}>
        <View style={d.icWrap}>
          <LinearGradient colors={['#A78BFA', '#7DD3FC']} start={{ x: 0.15, y: 0 }} end={{ x: 0.85, y: 1 }} style={d.icFill}>
            <Ionicons name="stats-chart" size={scale(17)} color="#FFFFFF" />
          </LinearGradient>
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={d.kicker}>DAY CHART</Text>
          <Text style={d.title} numberOfLines={1}>
            {dateLabel || chart.day}
          </Text>
        </View>
        <View style={d.chev}>
          <Ionicons name="chevron-forward" size={scale(16)} color={TONE} />
        </View>
      </View>

      {/* المصغَّر — الكراسي كما رُسِمت */}
      {cards.length || all.length ? (
        <View style={d.mini}>
          {chart.lanes.map((l, i) => (
            <View key={i} style={d.track}>
              {/* البريكُ أوّلًا فتمرُّ الكروتُ فوقَه، كما هو الحالُ في المخطّط */}
              {l.blocks.filter((b) => b.kind === 'break').map((b, k) => (
                <View key={`b${k}`} style={[d.seg, {
                  left: `${at(b.start)}%`,
                  width: `${Math.max(0.6, at(b.end) - at(b.start))}%`,
                  backgroundColor: SEG.break,
                  borderRadius: 0,
                }]} />
              ))}
              {l.blocks.filter((b) => b.kind !== 'break').map((b, k) => (
                <View key={`c${k}`} style={[d.seg, {
                  left: `${at(b.start)}%`,
                  width: `${Math.max(1.2, at(b.end) - at(b.start))}%`,
                  backgroundColor: SEG[b.kind],
                }]} />
              ))}
            </View>
          ))}
          <View style={d.axis}>
            <Text style={d.axisTxt}>{fmtHM(w0)}</Text>
            <Text style={d.axisTxt}>{fmtHM(w1)}</Text>
          </View>
        </View>
      ) : (
        <Text style={d.empty}>No cards were drawn on this day</Text>
      )}

      <View style={d.hr} />

      <View style={d.pills}>
        <Pill icon="people-outline" text={`${cards.length} patient${cards.length === 1 ? '' : 's'}`} tone={INK} />
        <Pill icon="checkmark-circle-outline" text={`${done} done`} tone="#0B8F63" />
        {away ? <Pill icon="person-remove-outline" text={`${away} away`} tone="#5B5F8C" /> : null}
        {left ? <Pill icon="exit-outline" text={`${left} left`} tone="#B96C05" /> : null}
        <Pill icon="grid-outline" text={`${chart.chairCount} chair${chart.chairCount === 1 ? '' : 's'}`} tone={TONE} />
      </View>
    </TouchableOpacity>
  );
}

const d = StyleSheet.create({
  card: {
    borderRadius: scale(20),
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.9)',
    paddingHorizontal: scale(14),
    paddingTop: scale(13),
    paddingBottom: scale(12),
    marginBottom: scale(16),
    shadowColor: '#2A2150',
    shadowOffset: { width: 0, height: scale(8) },
    shadowOpacity: 0.13,
    shadowRadius: scale(16),
    elevation: 4,
  },

  head: { flexDirection: 'row', alignItems: 'center', gap: scale(11) },
  icWrap: {
    width: scale(38), height: scale(38), borderRadius: scale(13),
    shadowColor: '#7C4DC4', shadowOffset: { width: 0, height: scale(5) },
    shadowOpacity: 0.38, shadowRadius: scale(8), elevation: 5,
  },
  icFill: { flex: 1, borderRadius: scale(13), alignItems: 'center', justifyContent: 'center' },
  kicker: { fontSize: scale(9.5), fontWeight: '800', letterSpacing: 1.4, color: TONE },
  title: { marginTop: scale(2), fontSize: scale(15), fontWeight: '800', color: INK },
  chev: {
    width: scale(28), height: scale(28), borderRadius: scale(10),
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(109,83,198,0.10)',
  },

  mini: { marginTop: scale(13), gap: scale(6) },
  track: {
    height: scale(11), borderRadius: scale(5), overflow: 'hidden',
    backgroundColor: 'rgba(59,46,99,0.05)',
  },
  seg: { position: 'absolute', top: 0, bottom: 0, borderRadius: scale(3) },
  axis: { flexDirection: 'row', justifyContent: 'space-between', marginTop: scale(4) },
  axisTxt: { fontSize: scale(9.5), fontWeight: '700', color: 'rgba(59,46,99,0.45)' },
  empty: { marginTop: scale(13), fontSize: scale(12), fontWeight: '600', color: 'rgba(59,46,99,0.5)' },

  hr: { height: 1, backgroundColor: 'rgba(59,46,99,0.09)', marginTop: scale(12), marginBottom: scale(11) },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: scale(6) },
  pill: {
    flexDirection: 'row', alignItems: 'center', gap: scale(4),
    paddingHorizontal: scale(9), paddingVertical: scale(5),
    borderRadius: scale(9), backgroundColor: 'rgba(255,255,255,0.66)',
    borderWidth: 1, borderColor: 'rgba(59,46,99,0.08)',
  },
  pillTxt: { fontSize: scale(11), fontWeight: '800' },
});
