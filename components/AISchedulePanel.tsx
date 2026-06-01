import React, { useEffect, useRef, useState } from 'react';
import {
  Modal, View, Text, TouchableOpacity, Animated, Dimensions, PanResponder, Easing, StyleSheet,
} from 'react-native';
import Svg, { Path, Rect, Circle, Defs, ClipPath, LinearGradient as SvgGradient, Stop } from 'react-native-svg';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { scale } from '../lib/scale';

const AnimatedPath = Animated.createAnimatedComponent(Path);
const AnimatedCircle = Animated.createAnimatedComponent(Circle);

export type PanelAction = 'create' | 'save' | 'swap';

interface AISchedulePanelProps {
  visible: boolean;
  onClose: () => void;
  onAction: (action: PanelAction) => void;
}

const { width: W, height: H } = Dimensions.get('window');
const CX = W / 2, CY = H / 2;
const MAX_R = Math.hypot(W, H) / 2 * 1.15;

// Threads that draw in from every edge/corner (full-screen coords)
const REVEAL = (() => {
  const cx = CX, cy = CY;
  const s: [number, number, number, number, number, number, number, number, string, number, number][] = [
    [-60, -60, cx - 80, 200, cx + 80, H - 200, W + 60, H + 60, '#A855F7', 2, 0],
    [W + 60, -60, cx + 80, 200, cx - 80, H - 200, -60, H + 60, '#C084FC', 1.8, 0.04],
    [-60, H + 60, cx - 80, H - 200, cx + 80, 200, W + 60, -60, '#7C3AED', 1.6, 0.08],
    [W + 60, H + 60, cx + 80, H - 200, cx - 80, 200, -60, -60, '#D8B4FE', 1.6, 0.12],
    [-80, cy - 100, cx, cy - 200, cx, cy + 200, W + 80, cy + 100, '#9333EA', 1.8, 0.16],
    [W + 80, cy + 100, cx, cy + 200, cx, cy - 200, -80, cy - 100, '#A78BFA', 1.6, 0.2],
    [cx - 100, -80, cx + 200, cy, cx - 200, cy, cx + 100, H + 80, '#8B5CF6', 1.6, 0.24],
    [cx + 100, H + 80, cx - 200, cy, cx + 200, cy, cx - 100, -80, '#C4B5FD', 1.4, 0.28],
    [-80, 100, cx + 50, 250, cx - 50, H - 250, W + 80, H - 100, '#A855F7', 1.4, 0.32],
    [W + 80, 100, cx - 50, 250, cx + 50, H - 250, -80, H - 100, '#C084FC', 1.4, 0.36],
    [cx, -80, cx - 250, cy - 50, cx + 250, cy + 50, cx, H + 80, '#E9D5FF', 1.3, 0.4],
    [cx, H + 80, cx + 250, cy + 50, cx - 250, cy - 50, cx, -80, '#7C3AED', 1.3, 0.44],
    [-40, cy, cx, cy - 150, cx, cy + 150, W + 40, cy, '#A78BFA', 1.2, 0.48],
    [cx, -40, cx + 150, cy, cx - 150, cy, cx, H + 40, '#D8B4FE', 1.2, 0.52],
    [-60, H * 0.3, cx, 200, cx, H - 200, W + 60, H * 0.7, '#9333EA', 1.2, 0.56],
    [W + 60, H * 0.3, cx, 200, cx, H - 200, -60, H * 0.7, '#C084FC', 1.2, 0.6],
  ];
  return s.map((v) => ({
    d: `M ${v[0]} ${v[1]} C ${v[2]} ${v[3]}, ${v[4]} ${v[5]}, ${v[6]} ${v[7]}`,
    color: v[8], width: v[9], delay: v[10],
  }));
})();

const DASH = Math.hypot(W, H) * 1.6; // long enough to fully hide any path

// ---- Orbiting options (drag to rotate; pass behind the center word) ----
const OPTIONS: { key: PanelAction; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: 'create', label: 'Create Schedule', icon: 'add' },
  { key: 'save', label: 'Save', icon: 'save-outline' },
  { key: 'swap', label: 'Swap', icon: 'swap-horizontal' },
];
const OR = W * 0.34;      // horizontal radius (options closer together)
const ORY = W * 0.11;     // vertical radius (flatter -> more horizontal)
const TILT = (-6 * Math.PI) / 180;
const COS_T = Math.cos(TILT), SIN_T = Math.sin(TILT);

// Flowing purple ribbons that slowly rotate & cross behind the options
function Ribbons() {
  const a1 = useRef(new Animated.Value(0)).current;
  const a2 = useRef(new Animated.Value(0)).current;
  const a3 = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const mk = (v: Animated.Value, dur: number, rev: boolean) =>
      Animated.loop(Animated.timing(v, { toValue: rev ? -1 : 1, duration: dur, easing: Easing.linear, useNativeDriver: true }));
    const loops = [mk(a1, 64000, false), mk(a2, 88000, true), mk(a3, 74000, false)];
    loops.forEach((l) => l.start());
    return () => loops.forEach((l) => l.stop());
  }, []);

  const rot = (v: Animated.Value) => v.interpolate({ inputRange: [-1, 1], outputRange: ['-360deg', '360deg'] });
  const loop = (sx: number, ey: number) =>
    `M ${CX - sx} ${CY} C ${CX - sx * 0.55} ${CY - ey}, ${CX + sx * 0.55} ${CY - ey}, ${CX + sx} ${CY} ` +
    `C ${CX + sx * 0.55} ${CY + ey}, ${CX - sx * 0.55} ${CY + ey}, ${CX - sx} ${CY} Z`;

  const ribbons = [
    { v: a1, id: 'rg1', d: loop(W * 0.55, H * 0.34), w: scale(38) },
    { v: a2, id: 'rg2', d: loop(W * 0.46, H * 0.44), w: scale(32) },
    { v: a3, id: 'rg3', d: loop(W * 0.60, H * 0.27), w: scale(30) },
    { v: a2, id: 'rg4', d: loop(W * 0.36, H * 0.40), w: scale(26) },
    { v: a3, id: 'rg5', d: loop(W * 0.66, H * 0.20), w: scale(28) },
  ];

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {ribbons.map((r) => (
        <Animated.View
          key={r.id}
          renderToHardwareTextureAndroid
          shouldRasterizeIOS
          style={[StyleSheet.absoluteFill, { transform: [{ rotate: rot(r.v) }] }]}
        >
          <Svg width={W} height={H}>
            <Defs>
              <SvgGradient id={r.id} x1="0" y1="0" x2="1" y2="0">
                <Stop offset="0" stopColor="#A78BFA" stopOpacity="0" />
                <Stop offset="0.5" stopColor="#B89BFF" stopOpacity="0.55" />
                <Stop offset="1" stopColor="#7C4DDB" stopOpacity="0" />
              </SvgGradient>
            </Defs>
            <Path d={r.d} stroke={`url(#${r.id})`} strokeWidth={r.w} strokeLinecap="round" fill="none" opacity={0.5} />
          </Svg>
        </Animated.View>
      ))}
    </View>
  );
}

function OrbitOptions({ onAction }: { onAction: (a: PanelAction) => void }) {
  const [rot, setRot] = useState(0);
  const rotRef = useRef(0);
  const velRef = useRef(0);
  const draggingRef = useRef(false);
  const lastXRef = useRef(0);

  useEffect(() => {
    let raf: number;
    const loop = () => {
      if (!draggingRef.current) {
        rotRef.current += velRef.current;
        velRef.current *= 0.94;
        if (Math.abs(velRef.current) < 0.0009) { velRef.current = 0; rotRef.current += 0.0016; }
      }
      setRot(rotRef.current);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_e, g) => Math.abs(g.dx) > 3,
      onPanResponderGrant: (e) => { draggingRef.current = true; lastXRef.current = e.nativeEvent.pageX; velRef.current = 0; },
      onPanResponderMove: (e) => {
        const x = e.nativeEvent.pageX;
        const d = (x - lastXRef.current) * 0.009;
        lastXRef.current = x;
        rotRef.current += d; velRef.current = d;
      },
      onPanResponderRelease: () => { draggingRef.current = false; },
      onPanResponderTerminate: () => { draggingRef.current = false; },
    })
  ).current;

  return (
    <View style={StyleSheet.absoluteFill} {...pan.panHandlers}>
      <View style={{ position: 'absolute', left: CX, top: H * 0.4 }}>
        {/* faint center word — the axis */}
        <Text
          style={{
            position: 'absolute',
            transform: [{ translateX: -scale(150) }, { translateY: -scale(34) }],
            width: scale(300),
            textAlign: 'center',
            fontSize: scale(58),
            fontWeight: '800',
            letterSpacing: 1,
            color: 'rgba(214,196,255,0.34)',
            zIndex: 3,
          }}
        >
          Schedule
        </Text>

        {OPTIONS.map((o, i) => {
          const a = rot + (i * Math.PI * 2) / OPTIONS.length;
          const x0 = Math.sin(a) * OR;
          const depth = Math.cos(a);
          const y0 = -depth * ORY;
          const x = x0 * COS_T - y0 * SIN_T;
          const y = x0 * SIN_T + y0 * COS_T;
          const sc = 0.74 + 0.26 * ((depth + 1) / 2);
          const op = 0.35 + 0.65 * ((depth + 1) / 2);
          return (
            <TouchableOpacity
              key={o.key}
              activeOpacity={0.85}
              onPress={() => { if (Math.abs(velRef.current) < 0.012) onAction(o.key); }}
              style={{
                position: 'absolute',
                transform: [{ translateX: x }, { translateY: y }, { scale: sc }],
                opacity: op,
                zIndex: depth > 0 ? 6 : 1,
                flexDirection: 'row',
                alignItems: 'center',
                gap: scale(8),
                paddingVertical: scale(9),
                paddingHorizontal: scale(15),
                borderRadius: scale(14),
                backgroundColor: 'rgba(255,255,255,0.16)',
                borderWidth: scale(1),
                borderColor: 'rgba(255,255,255,0.32)',
                // center the chip on its point
                marginLeft: -scale(64),
                marginTop: -scale(20),
              }}
            >
              <Ionicons name={o.icon} size={scale(17)} color="rgba(255,255,255,0.85)" />
              <Text style={{ color: '#fff', fontSize: scale(13), fontWeight: '700' }}>{o.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

export function AISchedulePanel({ visible, onClose, onAction }: AISchedulePanelProps) {
  const backdrop = useRef(new Animated.Value(0)).current;
  const prog = useRef(new Animated.Value(0)).current;        // threads draw 0..1
  const threadsOp = useRef(new Animated.Value(0)).current;
  const bloom = useRef(new Animated.Value(0)).current;        // circle radius
  const content = useRef(new Animated.Value(0)).current;
  const [mounted, setMounted] = useState(visible);

  useEffect(() => {
    if (visible) {
      setMounted(true);
      backdrop.setValue(0); prog.setValue(0); threadsOp.setValue(0); bloom.setValue(0); content.setValue(0);
      Animated.sequence([
        Animated.timing(backdrop, { toValue: 1, duration: 400, useNativeDriver: true }),
        Animated.parallel([
          Animated.timing(prog, { toValue: 1, duration: 2300, easing: Easing.bezier(0.5, 0, 0.2, 1), useNativeDriver: false }),
          Animated.timing(threadsOp, { toValue: 1, duration: 350, useNativeDriver: true }),
        ]),
        Animated.parallel([
          Animated.timing(bloom, { toValue: MAX_R, duration: 240, easing: Easing.bezier(0.7, 0, 0.3, 1), useNativeDriver: false }),
          Animated.timing(threadsOp, { toValue: 0, duration: 220, useNativeDriver: true }),
        ]),
        Animated.timing(content, { toValue: 1, duration: 200, useNativeDriver: true }),
      ]).start();
    } else if (mounted) {
      Animated.timing(backdrop, { toValue: 0, duration: 280, useNativeDriver: true }).start(() => setMounted(false));
      Animated.timing(content, { toValue: 0, duration: 200, useNativeDriver: true }).start();
    }
  }, [visible]);

  if (!mounted) return null;

  return (
    <Modal transparent visible={mounted} animationType="none" onRequestClose={onClose}>
      <View style={{ flex: 1 }}>
        {/* backdrop */}
        <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(15,10,40,0.45)', opacity: backdrop }]} />

        {/* page surface (gradient) revealed by an expanding circle */}
        <Svg style={StyleSheet.absoluteFill} width={W} height={H}>
          <Defs>
            <SvgGradient id="pageGrad" x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0" stopColor="#1E1B4B" />
              <Stop offset="0.5" stopColor="#312E81" />
              <Stop offset="1" stopColor="#4C1D95" />
            </SvgGradient>
            <ClipPath id="bloomClip">
              <AnimatedCircle cx={CX} cy={CY} r={bloom as any} />
            </ClipPath>
          </Defs>
          <Rect x={0} y={0} width={W} height={H} fill="url(#pageGrad)" clipPath="url(#bloomClip)" />
        </Svg>

        {/* page content (fades in after the bloom) */}
        <Animated.View style={[StyleSheet.absoluteFill, { opacity: content }]} pointerEvents={visible ? 'auto' : 'none'}>
          <Ribbons />
          <OrbitOptions onAction={onAction} />
          <TouchableOpacity
            onPress={onClose}
            style={{ position: 'absolute', top: scale(50), left: scale(20), padding: scale(8) }}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons name="close" size={scale(26)} color="rgba(255,255,255,0.7)" />
          </TouchableOpacity>
        </Animated.View>

        {/* drawing threads (on top during reveal, then fade) */}
        <Animated.View style={[StyleSheet.absoluteFill, { opacity: threadsOp }]} pointerEvents="none">
          <Svg width={W} height={H}>
            {REVEAL.map((t, i) => {
              const start = t.delay * 0.55;
              const end = Math.min(1, start + 0.5);
              const dashoffset = prog.interpolate({
                inputRange: [start, end, 1],
                outputRange: [DASH, 0, 0],
                extrapolate: 'clamp',
              });
              return (
                <AnimatedPath
                  key={i}
                  d={t.d}
                  stroke={t.color}
                  strokeWidth={t.width}
                  strokeLinecap="round"
                  fill="none"
                  strokeDasharray={DASH}
                  strokeDashoffset={dashoffset as any}
                />
              );
            })}
          </Svg>
        </Animated.View>
      </View>
    </Modal>
  );
}
