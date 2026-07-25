import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, Animated, Easing, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { scale } from '../../lib/scale';
import { Patient } from './constants';

// ─────────────────────────────────────────────────────────────────────────────
// QueueStatsStrip — what the two stat cards become once you swipe them away.
// A single glass rail carrying the same numbers on a slow drift, so the space
// they used to occupy goes to the patient cards instead.
// ─────────────────────────────────────────────────────────────────────────────

const TEAL = '#0E9F8C';
const INK = '#12232A';
const MUTED = '#5A7079';

type Item = { key: string; label: string; value: string; tone: string };

export const QueueStatsStrip = React.memo(function QueueStatsStrip({
  total,
  waiting,
  patients,
  active,
}: {
  total: number;
  waiting: number;
  patients: Patient[];
  active: boolean;
}) {
  const items = useMemo<Item[]>(() => {
    const live = patients.filter((p) => p.status !== 'complete' && p.status !== 'na');
    const inChair = live.filter((p) => !!p.clinic && p.clinic !== 'Clinic');
    const queued = live
      .filter((p) => p.clinic === 'Clinic' || !p.clinic)
      .sort((a, b) => (a.queue_number || 0) - (b.queue_number || 0));
    const done = patients.filter((p) => p.status === 'complete').length;
    const away = patients.filter((p) => p.status === 'na').length;

    const out: Item[] = [
      { key: 'total', label: 'TOTAL', value: String(total), tone: INK },
      { key: 'waiting', label: 'WAITING', value: String(waiting), tone: TEAL },
    ];
    if (queued[0]) {
      out.push({ key: 'next', label: 'NEXT', value: `${queued[0].queue_number} · ${queued[0].name}`, tone: INK });
    }
    if (inChair.length) {
      out.push({
        key: 'chair',
        label: 'IN CHAIR',
        value: inChair.length === 1 ? inChair[0].name : `${inChair.length} patients`,
        tone: TEAL,
      });
    }
    out.push({ key: 'done', label: 'DONE', value: String(done), tone: MUTED });
    if (away) out.push({ key: 'away', label: 'AWAY', value: String(away), tone: MUTED });
    return out;
  }, [patients, total, waiting]);

  // the drift: one run of the items measured, then two copies chase each other
  const [runW, setRunW] = useState(0);
  const x = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!runW || !active) {
      x.stopAnimation();
      return;
    }
    x.setValue(0);
    const loop = Animated.loop(
      Animated.timing(x, {
        toValue: -runW,
        duration: Math.max(7000, Math.round(runW * 26)),
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [runW, active, items.length]);

  const run = (copy: string) => (
    <View
      style={s.run}
      onLayout={copy === 'a' ? (e) => setRunW(Math.round(e.nativeEvent.layout.width)) : undefined}
    >
      {items.map((it) => (
        <View key={copy + it.key} style={s.chip}>
          <View style={[s.dot, { backgroundColor: it.tone }]} />
          <Text style={s.chipLbl}>{it.label}</Text>
          <Text style={[s.chipVal, { color: it.tone }]} numberOfLines={1}>{it.value}</Text>
        </View>
      ))}
    </View>
  );

  return (
    <View style={s.rail}>
      <View style={s.track}>
        <Animated.View style={[s.belt, { transform: [{ translateX: x }] }]}>
          {run('a')}
          {run('b')}
        </Animated.View>
      </View>

      {/* the rail's own light, so items slide in and out of the glass */}
      <LinearGradient
        colors={['rgba(255,255,255,0.95)', 'rgba(255,255,255,0)']}
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
        style={[s.fade, s.fadeL]}
        pointerEvents="none"
      />
      <LinearGradient
        colors={['rgba(255,255,255,0)', 'rgba(255,255,255,0.95)']}
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
        style={[s.fade, s.fadeR]}
        pointerEvents="none"
      />
    </View>
  );
})

const s = StyleSheet.create({
  rail: {
    marginHorizontal: scale(24),
    height: scale(46),
    borderRadius: scale(16),
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.8)',
    backgroundColor: 'rgba(255,255,255,0.42)',
    overflow: 'hidden',
    justifyContent: 'center',
  },
  track: { flex: 1, justifyContent: 'center', overflow: 'hidden' },
  belt: { flexDirection: 'row' },
  run: { flexDirection: 'row', alignItems: 'center' },

  chip: { flexDirection: 'row', alignItems: 'center', gap: scale(7), paddingHorizontal: scale(14) },
  dot: { width: scale(6), height: scale(6), borderRadius: scale(3) },
  chipLbl: { fontSize: scale(9), fontWeight: '800', letterSpacing: 1.3, color: MUTED },
  chipVal: { fontSize: scale(13.5), fontWeight: '800', letterSpacing: -0.2 },

  fade: { position: 'absolute', top: 0, bottom: 0, width: scale(26) },
  fadeL: { left: 0 },
  fadeR: { right: 0 },
});
