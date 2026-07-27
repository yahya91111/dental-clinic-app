/**
 * DayChartCard — مدخلُ مخطّطِ اليومِ في صفحةِ الأرشيف.
 *
 * مدخلٌ لا لوحة: سطرٌ واحدٌ يقولُ إنَّ لهذا اليومِ مخطّطًا محفوظًا، والمخطّطُ نفسُه يُرى
 * حينَ يُفتَح. لا يظهرُ إلّا إن وُجِدت اللقطة.
 */
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { scale } from '../../lib/scale';
import type { DayChart } from './queueLanes';

const INK = '#3B2E63';
const TONE = '#6D53C6';

export function DayChartCard({ chart, dateLabel, onPress }: {
  chart: DayChart;
  dateLabel?: string;
  onPress: () => void;
}) {
  const n = chart.lanes.reduce((t, l) => t + l.blocks.filter((b) => b.kind !== 'break').length, 0);

  return (
    <TouchableOpacity activeOpacity={0.88} onPress={onPress} style={d.card}>
      <LinearGradient
        colors={['rgba(255,255,255,0.72)', 'rgba(244,241,252,0.60)']}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />

      <View style={d.icWrap}>
        <LinearGradient colors={['#A78BFA', '#7DD3FC']} start={{ x: 0.15, y: 0 }} end={{ x: 0.85, y: 1 }} style={d.icFill}>
          <Ionicons name="stats-chart" size={scale(17)} color="#FFFFFF" />
        </LinearGradient>
      </View>

      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={d.title} numberOfLines={1}>Day chart</Text>
        <Text style={d.sub} numberOfLines={1}>
          {dateLabel ? `${dateLabel} · ` : ''}{n} patient{n === 1 ? '' : 's'}
        </Text>
      </View>

      <Ionicons name="chevron-forward" size={scale(17)} color={TONE} />
    </TouchableOpacity>
  );
}

const d = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: scale(11),
    borderRadius: scale(18),
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.9)',
    paddingHorizontal: scale(14),
    paddingVertical: scale(13),
    marginBottom: scale(16),
    shadowColor: '#2A2150',
    shadowOffset: { width: 0, height: scale(6) },
    shadowOpacity: 0.10,
    shadowRadius: scale(13),
    elevation: 3,
  },
  icWrap: {
    width: scale(38), height: scale(38), borderRadius: scale(13),
    shadowColor: '#7C4DC4', shadowOffset: { width: 0, height: scale(5) },
    shadowOpacity: 0.35, shadowRadius: scale(8), elevation: 5,
  },
  icFill: { flex: 1, borderRadius: scale(13), alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: scale(15), fontWeight: '800', color: INK },
  sub: { marginTop: scale(2), fontSize: scale(11.5), fontWeight: '600', color: TONE },
});
