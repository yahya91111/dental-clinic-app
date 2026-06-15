import React, { useEffect, useRef, useState, forwardRef, useImperativeHandle } from 'react';
import {
  Modal, View, Text, TextInput, TouchableOpacity, Animated, Dimensions, PanResponder, Easing, StyleSheet,
  KeyboardAvoidingView, Platform, Keyboard, ScrollView, ActivityIndicator,
} from 'react-native';
import Svg, { Path, Circle, Defs, LinearGradient as SvgGradient, RadialGradient, Stop } from 'react-native-svg';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { scale } from '../lib/scale';
import { OrbGlyph } from './AIOrb';
import { AICardsView } from './AIChatModal';
import { ChatMessage } from './aiTypes';
import { WizardContent, WizardResult, PreviewView } from './ScheduleWizard';
import type { Clarification, ResolvedClarification, UnsupportedRequest } from '../lib/ai_v2/parseExceptions';
import type { SchedulePreview } from '../lib/ai_v2/tools';
import type { AssignedSlot } from '../lib/algorithms/schedule';

const DAY_AR: Record<string, string> = {
  sunday: 'الأحد', monday: 'الاثنين', tuesday: 'الثلاثاء', wednesday: 'الأربعاء', thursday: 'الخميس',
};

export type PanelAction = 'create' | 'save' | 'swap';

interface AISchedulePanelProps {
  visible: boolean;
  onClose: () => void;
  onAction: (action: PanelAction) => void;
  messages: ChatMessage[];        // owned by the parent — we only render them
  onSend: (text: string) => void; // called on send / when a choice chip is tapped
  isLoading?: boolean;            // shows a "typing…" bubble
  contextLabel?: string;          // small line under the header (optional)
  userName?: string;              // اسم المستخدم — للترحيب في رأس المحادثة
  user?: { id: string; name: string; role: string; clinicId?: string | null; clinicName?: string }; // لكروت الإبلاغ المشتركة
  clinicId?: string | null;       // for the create-schedule questionnaire (group names)
  onCreateSchedule?: (result: WizardResult) => void; // questionnaire finished
  // معاينة جدول قادمة من الشات (الذكاء بنى معاينة) — تُعرَض فوق الصفحة، والحفظ من هنا
  chatPreview?: SchedulePreview | null;
  chatPreviewSaving?: boolean;
  chatPreviewError?: string | null;
  onSaveChatPreview?: (slots: AssignedSlot[]) => void;
  onDiscardChatPreview?: () => void;
}

// Detects a trailing block of [choice] [choice] tokens at the end of an assistant message
// and splits it off so we can render them as tappable chips.
function parseChoices(content: string): { text: string; choices: string[] } {
  const trimmed = content.trimEnd();
  const tailMatch = trimmed.match(/((?:\[[^\[\]\n]+\][ \t]*\n?[ \t]*)+)\s*$/);
  if (!tailMatch) return { text: content, choices: [] };
  const tail = tailMatch[1];
  const choices = Array.from(tail.matchAll(/\[([^\[\]\n]+)\]/g)).map((m) => m[1].trim());
  if (choices.length < 2) return { text: content, choices: [] };
  const text = trimmed.slice(0, trimmed.length - tailMatch[0].length).trimEnd();
  return { text, choices };
}

const AnimatedPath = Animated.createAnimatedComponent(Path);

const { width: W, height: H } = Dimensions.get('window');
const CX = W / 2, CY = H / 2;

// ---- Unravel reveal (ported 1:1 from design/ai-bubbles.html) ----
// A tangled knot at the button -> unravels into strands -> straightens -> gathers into the page.
const ORB_BOX = 64 + scale(24);                 // AIOrb's inner box (size 64 + scale(24))
const BX = W - scale(20) - ORB_BOX / 2;         // orb center x (knot origin)
const BY = H - scale(100) - ORB_BOX / 2;        // orb center y
const NTHREAD = 16;
const MARGIN = scale(22);
const THREAD_COLORS = ['#A855F7', '#7C3AED', '#C084FC', '#9333EA', '#8B5CF6', '#A78BFA', '#D8B4FE'];
const PAGE_STOPS = ['#1E1B4B', '#312E81', '#4C1D95'];
const FILL_W = W / NTHREAD + scale(5);          // stroke width that merges strands into a full surface
// خروج المارد: قطر الدائرة الأساس + تكبيرٌ يكفي لتغطية قُطر الشاشة
const BLOB = 120;
const COVER = Math.hypot(W, H) / BLOB + 1.6;

// morph value (0 = knot A .. 1 = straight C) -> the six keyframe shapes
const MORPH_IN = [0, 0.18, 0.4, 0.58, 0.74, 1];

function lerpHex(a: string, b: string, t: number) {
  const pa = [parseInt(a.slice(1, 3), 16), parseInt(a.slice(3, 5), 16), parseInt(a.slice(5, 7), 16)];
  const pb = [parseInt(b.slice(1, 3), 16), parseInt(b.slice(3, 5), 16), parseInt(b.slice(5, 7), 16)];
  const h = (v: number) => Math.round(v).toString(16).padStart(2, '0');
  return `#${h(pa[0] + (pb[0] - pa[0]) * t)}${h(pa[1] + (pb[1] - pa[1]) * t)}${h(pa[2] + (pb[2] - pa[2]) * t)}`;
}
function pageGradAt(f: number) {
  return f < 0.4 ? lerpHex(PAGE_STOPS[0], PAGE_STOPS[1], f / 0.4) : lerpHex(PAGE_STOPS[1], PAGE_STOPS[2], (f - 0.4) / 0.6);
}

type Pt = [number, number];
// path "M .. C .. C .." through anchors, controls pushed perpendicular by off(k) -> curls/bulges
function buildPath(pts: Pt[], off: number | ((k: number) => number)) {
  let d = `M ${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)} `;
  for (let k = 0; k < pts.length - 1; k++) {
    const p0 = pts[k], p1 = pts[k + 1];
    const mx = p1[0] - p0[0], my = p1[1] - p0[1];
    const len = Math.hypot(mx, my) || 1;
    const nx = -my / len, ny = mx / len;
    const o = typeof off === 'function' ? off(k) : off;
    const c1x = p0[0] + mx / 3 + nx * o, c1y = p0[1] + my / 3 + ny * o;
    const c2x = p0[0] + 2 * mx / 3 - nx * o, c2y = p0[1] + 2 * my / 3 - ny * o;
    d += `C ${c1x.toFixed(1)} ${c1y.toFixed(1)}, ${c2x.toFixed(1)} ${c2y.toFixed(1)}, ${p1[0].toFixed(1)} ${p1[1].toFixed(1)} `;
  }
  return d.trim();
}

interface Strand { A: string; K1: string; K2: string; BOVER: string; B: string; C: string; baseColor: string; pageColor: string; }
const STRANDS: Strand[] = (() => {
  const ys = [0, H * 0.25, H * 0.5, H * 0.75, H];   // 5 anchors -> M + 4 C (same structure for every state)
  const arr: Strand[] = [];
  for (let i = 0; i < NTHREAD; i++) {
    const f = i / (NTHREAD - 1);
    const X = MARGIN + f * (W - 2 * MARGIN);
    const ph = i * 1.27;

    // A: tightly curled around the button (the tangled orb)
    const aPts: Pt[] = ys.map((_, k) => {
      const ang = ph + k * 1.7;
      const r = scale(7) + k * scale(3.5);
      return [BX + Math.cos(ang) * r + (i - NTHREAD / 2) * scale(1.4), BY + Math.sin(ang) * r * 0.7];
    });
    const A = buildPath(aPts, (k) => (k % 2 ? 1 : -1) * scale(32));

    // B: spread across the screen but still wavy/loose; BOVER springs PAST rest (elastic overshoot)
    const amp = scale(24 + ((i * 53) % 38));
    const bShape = (a: number): Pt[] => ys.map((y, k) => [X + Math.sin(ph + k * 1.1) * a * (1 - Math.abs(k - 2) / 3.2), y]);
    const bPts = bShape(amp);
    const B = buildPath(bPts, (k) => (k % 2 ? 1 : -1) * scale(16));
    const BOVER = buildPath(bShape(-amp * 0.55), (k) => (k % 2 ? 1 : -1) * scale(24));

    // C: perfectly straight vertical strand
    const C = buildPath(ys.map((y) => [X, y] as Pt), 0);

    // intermediate "unravel" states (knot bursts -> writhes with bulges)
    const lerpPts = (p: Pt[], q: Pt[], t: number): Pt[] => p.map((pt, k) => [pt[0] + (q[k][0] - pt[0]) * t, pt[1] + (q[k][1] - pt[1]) * t]);
    const jitter = (pts: Pt[], ampx: number, seed: number): Pt[] => pts.map((pt, k) => {
      const a = seed + k * 2.3;
      return [pt[0] + Math.sin(a) * ampx, pt[1] + Math.cos(a * 1.3) * ampx * 0.35];
    });
    const K1 = buildPath(jitter(lerpPts(aPts, bPts, 0.38), scale(24), ph + 1), (k) => (k % 2 ? 1 : -1) * scale(40 + (i * 7) % 18));
    const K2 = buildPath(jitter(lerpPts(aPts, bPts, 0.72), scale(13), ph + 2.5), (k) => (k % 2 ? 1 : -1) * scale(26));

    arr.push({ A, K1, K2, BOVER, B, C, baseColor: THREAD_COLORS[i % THREAD_COLORS.length], pageColor: pageGradAt(f) });
  }
  return arr;
})();

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

// Soft drifting "smoke" — kept CHEAP: all puffs of a layer live in ONE rasterized Svg that drifts
// as a single unit. Two counter-drifting layers => organic motion at only ~2 composited layers.
const SMOKE_LAYERS = [
  {
    dx: scale(36), dy: scale(26), dur: 12000, op: [0.30, 0.5] as [number, number],
    blobs: [
      { x: W * 0.24, y: H * 0.30, r: scale(230), c: '#7C4DDB' },
      { x: W * 0.80, y: H * 0.64, r: scale(250), c: '#9333EA' },
    ],
  },
  {
    dx: -scale(42), dy: scale(30), dur: 15000, op: [0.26, 0.46] as [number, number],
    blobs: [
      { x: W * 0.74, y: H * 0.26, r: scale(220), c: '#A78BFA' },
      { x: W * 0.30, y: H * 0.74, r: scale(210), c: '#6D28D9' },
    ],
  },
];
function Smoke() {
  const vals = useRef(SMOKE_LAYERS.map(() => new Animated.Value(0))).current;
  useEffect(() => {
    const ls = SMOKE_LAYERS.map((L, i) => Animated.loop(Animated.sequence([
      Animated.timing(vals[i], { toValue: 1, duration: L.dur, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      Animated.timing(vals[i], { toValue: 0, duration: L.dur, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
    ])));
    ls.forEach((l) => l.start());
    return () => ls.forEach((l) => l.stop());
  }, []);
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {SMOKE_LAYERS.map((L, i) => {
        const tx = vals[i].interpolate({ inputRange: [0, 1], outputRange: [0, L.dx] });
        const ty = vals[i].interpolate({ inputRange: [0, 1], outputRange: [0, L.dy] });
        const sc = vals[i].interpolate({ inputRange: [0, 1], outputRange: [1, 1.16] });
        const op = vals[i].interpolate({ inputRange: [0, 1], outputRange: L.op });
        return (
          <Animated.View
            key={i}
            renderToHardwareTextureAndroid
            shouldRasterizeIOS
            style={[StyleSheet.absoluteFill, { opacity: op, transform: [{ translateX: tx }, { translateY: ty }, { scale: sc }] }]}
          >
            <Svg width={W} height={H}>
              <Defs>
                {L.blobs.map((b, j) => (
                  <RadialGradient key={j} id={`sm${i}_${j}`} cx="50%" cy="50%" r="50%">
                    <Stop offset="0" stopColor={b.c} stopOpacity="0.55" />
                    <Stop offset="0.6" stopColor={b.c} stopOpacity="0.2" />
                    <Stop offset="1" stopColor={b.c} stopOpacity="0" />
                  </RadialGradient>
                ))}
              </Defs>
              {L.blobs.map((b, j) => (
                <Circle key={j} cx={b.x} cy={b.y} r={b.r} fill={`url(#sm${i}_${j})`} />
              ))}
            </Svg>
          </Animated.View>
        );
      })}
    </View>
  );
}

// Flowing purple ribbons that slowly rotate & cross behind the options
function Ribbons() {
  const a1 = useRef(new Animated.Value(0)).current;
  const a2 = useRef(new Animated.Value(0)).current;
  const a3 = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const mk = (v: Animated.Value, dur: number, rev: boolean) =>
      Animated.loop(Animated.timing(v, { toValue: rev ? -1 : 1, duration: dur, easing: Easing.linear, useNativeDriver: true }));
    const loops = [mk(a1, 42000, false), mk(a2, 56000, true), mk(a3, 48000, false)];
    loops.forEach((l) => l.start());
    return () => loops.forEach((l) => l.stop());
  }, []);

  const rot = (v: Animated.Value) => v.interpolate({ inputRange: [-1, 1], outputRange: ['-360deg', '360deg'] });
  // a closed-loop ribbon centred inside its own box (centre R,R) so it can rotate about its own point
  const loop = (R: number, sx: number, ey: number) =>
    `M ${R - sx} ${R} C ${R - sx * 0.55} ${R - ey}, ${R + sx * 0.55} ${R - ey}, ${R + sx} ${R} ` +
    `C ${R + sx * 0.55} ${R + ey}, ${R - sx * 0.55} ${R + ey}, ${R - sx} ${R} Z`;

  // each ribbon has its OWN centre spread across the screen (not all stacked in the middle)
  const ribbons = [
    { v: a1, id: 'rg1', cx: W * 0.50, cy: H * 0.50, sx: W * 0.50, ey: H * 0.26, w: scale(36) },
    { v: a2, id: 'rg2', cx: W * 0.24, cy: H * 0.20, sx: W * 0.40, ey: H * 0.20, w: scale(30) },
    { v: a3, id: 'rg3', cx: W * 0.80, cy: H * 0.26, sx: W * 0.44, ey: H * 0.18, w: scale(28) },
    { v: a2, id: 'rg4', cx: W * 0.22, cy: H * 0.80, sx: W * 0.40, ey: H * 0.22, w: scale(30) },
    { v: a3, id: 'rg5', cx: W * 0.80, cy: H * 0.82, sx: W * 0.46, ey: H * 0.20, w: scale(26) },
  ];

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {ribbons.map((r) => {
        const R = Math.hypot(r.sx, r.ey) + r.w;   // box radius that fully contains the loop when rotated
        const D = R * 2;
        return (
          <Animated.View
            key={r.id}
            renderToHardwareTextureAndroid
            shouldRasterizeIOS
            style={{ position: 'absolute', left: r.cx - R, top: r.cy - R, width: D, height: D, transform: [{ rotate: rot(r.v) }] }}
          >
            <Svg width={D} height={D}>
              <Defs>
                <SvgGradient id={r.id} x1="0" y1="0" x2="1" y2="0">
                  <Stop offset="0" stopColor="#A78BFA" stopOpacity="0" />
                  <Stop offset="0.5" stopColor="#B89BFF" stopOpacity="0.55" />
                  <Stop offset="1" stopColor="#7C4DDB" stopOpacity="0" />
                </SvgGradient>
              </Defs>
              <Path d={loop(R, r.sx, r.ey)} stroke={`url(#${r.id})`} strokeWidth={r.w} strokeLinecap="round" fill="none" opacity={0.5} />
            </Svg>
          </Animated.View>
        );
      })}
    </View>
  );
}

// ---- Shared orbit carousel (home + schedule) with a fly-in/out transition ----
const HR = scale(122);     // horizontal radius
const HRY = scale(30);     // vertical radius (flat ellipse)
const HBACK = 3.2;         // back arc rises further (tucks behind the floating ball)

type OrbitOpt = { key: string; label: string; icon: keyof typeof Ionicons.glyphMap };
type FlySpecial = (i: number, c: { x: number; y: number; s: number }) => { x: number; y: number; s: number } | null;
export type OrbitHandle = {
  startFly: (mode: 'in' | 'out', edge: number, dur: number, special?: FlySpecial) => void;
  selectLeave: (idx: number, onDone?: () => void) => void;   // STEP 1+2: selected chip grows then leaves right; others chase it
  enterLeft: (onDone?: () => void) => void;                   // STEP 3: chips arrive from the left into their orbit, then drift
  show: () => void;
  hide: () => void;
};

// Idle drift uses light per-frame state; the in/out FLY is driven by ONE native-driver value
// (flyProg) interpolating each chip between its (frozen) orbit slot and an off-screen edge — so
// the transition is buttery, with zero per-frame JS work.
function useOrbit(N: number, active: boolean, initialHidden: boolean) {
  const [, setTick] = useState(0);
  const [flying, setFlying] = useState(false);
  const rotRef = useRef(0);
  const velRef = useRef(0);
  const draggingRef = useRef(false);
  const lastXRef = useRef(0);
  const pausedRef = useRef(initialHidden);
  const flyingRef = useRef(false);
  const activeRef = useRef(active);
  const flyProg = useRef(new Animated.Value(1)).current;
  const flyDataRef = useRef<{ orb: { x: number; y: number; s: number; z: number }; off: { x: number; y: number; s: number }; fade: boolean }[]>([]);
  // STEP 1 — the selected chip grows then recedes into the background. Driven by one native value;
  // the interpolation nodes are built once (in recede) and kept stable so per-frame re-renders of
  // the drifting siblings don't rebuild them.
  const selProg = useRef(new Animated.Value(0)).current;
  const selIdxRef = useRef(-1);
  const selectingRef = useRef(false);
  const selNodesRef = useRef<{ tx: any; ty: any; sc: any; op: any }[] | null>(null);
  const [selecting, setSelecting] = useState(false);
  useEffect(() => { activeRef.current = active; }, [active]);

  useEffect(() => {
    let raf: number;
    const loop = () => {
      if (activeRef.current && !flyingRef.current && !pausedRef.current && !selectingRef.current) {  // idle drift only
        if (!draggingRef.current) {
          rotRef.current += velRef.current; velRef.current *= 0.94;
          if (Math.abs(velRef.current) < 0.0009) { velRef.current = 0; rotRef.current += 0.0016; }
        }
        setTick((t) => (t + 1) & 0xffff);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_e, g) => Math.abs(g.dx) > 3,
      onPanResponderGrant: (e) => { Keyboard.dismiss(); if (flyingRef.current) return; draggingRef.current = true; lastXRef.current = e.nativeEvent.pageX; velRef.current = 0; },
      onPanResponderMove: (e) => { if (flyingRef.current) return; const x = e.nativeEvent.pageX; const d = (x - lastXRef.current) * 0.009; lastXRef.current = x; rotRef.current += d; velRef.current = d; },
      onPanResponderRelease: () => { draggingRef.current = false; },
      onPanResponderTerminate: () => { draggingRef.current = false; },
    })
  ).current;

  const orbit = (i: number) => {
    const a = rotRef.current + (i * Math.PI * 2) / N;
    const x = Math.sin(a) * HR;
    const depth = Math.cos(a);
    let y = depth * HRY; if (y < 0) y *= HBACK;
    const s = 0.72 + 0.28 * ((depth + 1) / 2);
    return { x, y, s, z: depth > 0 ? 6 : 1 };
  };

  const api: OrbitHandle = {
    startFly: (mode, edge, dur, special) => {
      pausedRef.current = false;
      const data = [];
      for (let i = 0; i < N; i++) {
        const o = orbit(i);
        const sp = special ? special(i, { x: o.x, y: o.y, s: o.s }) : null;
        // outgoing -> RIGHT, incoming -> from LEFT (uniform, conveyor-like)
        const off = sp ? sp : { x: o.x + (mode === 'out' ? edge : -edge), y: o.y, s: 0.55 };
        // special (title) chip stays on-screen, so it fades gradually; regular chips slide off
        // and only fade right at the edge — so the move reads as a slide, not an in-place blink.
        data.push({ orb: o, off, fade: !!sp });
      }
      flyDataRef.current = data;
      flyingRef.current = true; setFlying(true);
      flyProg.setValue(mode === 'in' ? 0 : 1);      // 0 = off, 1 = orbit
      // JS driver (NOT native): the idle drift controls these same transform/opacity props
      // statically, so the fly must leave them JS-owned — otherwise the native side keeps the
      // prop after the fly (frozen rotation) and resets it for one frame on hand-off (flash).
      Animated.timing(flyProg, { toValue: mode === 'in' ? 1 : 0, duration: dur, easing: Easing.inOut(Easing.ease), useNativeDriver: false }).start(({ finished }) => {
        if (!finished) return;
        flyingRef.current = false;
        if (mode === 'out') pausedRef.current = true;
        // settle the JS-owned values onto the exact post-fly slot before React swaps to static
        // numbers, so the hand-off frame is identical (no blink, no jump).
        flyProg.setValue(mode === 'in' ? 1 : 0);
        setFlying(false);
      });
    },
    selectLeave: (idx, onDone) => {
      const EDGE = scale(420);   // far enough to fully clear the right of the screen
      const hasLeader = idx >= 0;   // forward: the tapped chip leads & grows. return: no leader.
      selIdxRef.current = idx;
      selProg.setValue(0);
      // the non-selected chips, ordered so they trail (chase) the leader off-screen
      const followers: number[] = [];
      for (let i = 0; i < N; i++) if (i !== idx) followers.push(i);
      const nodes: { tx: any; ty: any; sc: any; op: any }[] = [];
      for (let i = 0; i < N; i++) {
        const o = orbit(i);
        if (i === idx) {
          // leader: grows a little (phase 1, selProg 0→0.3), then leads the exit right (0.3→0.85)
          nodes[i] = {
            sc: selProg.interpolate({ inputRange: [0, 0.3, 1], outputRange: [o.s, o.s * 1.2, o.s * 1.2] }),
            tx: selProg.interpolate({ inputRange: [0, 0.3, 0.85, 1], outputRange: [o.x, o.x, o.x + EDGE, o.x + EDGE] }),
            ty: o.y, op: 1,
          };
        } else {
          // follower: waits, then slides off the right (staggered so they trail one another)
          const order = followers.indexOf(i);
          const start = hasLeader ? 0.42 + order * 0.14 : 0.08 + order * 0.16;
          nodes[i] = {
            sc: o.s,
            tx: selProg.interpolate({ inputRange: [0, start, 1], outputRange: [o.x, o.x, o.x + EDGE], extrapolate: 'clamp' }),
            ty: o.y, op: 1,
          };
        }
      }
      selNodesRef.current = nodes;
      selectingRef.current = true;
      setSelecting(true);
      // on finish, park the carousel cleanly HIDDEN (paused, no stale nodes) so a later enterLeft
      // starts from nothing — no flash from old leave-nodes snapping back on screen.
      const done = ({ finished }: { finished: boolean }) => {
        if (!finished) return;
        selectingRef.current = false; pausedRef.current = true; selNodesRef.current = null; selIdxRef.current = -1;
        setSelecting(false); setTick((t) => (t + 1) & 0xffff);
        onDone?.();
      };
      if (hasLeader) {
        Animated.sequence([
          Animated.timing(selProg, { toValue: 0.3, duration: 240, easing: Easing.out(Easing.cubic), useNativeDriver: false }),  // leader grows
          Animated.timing(selProg, { toValue: 1, duration: 620, easing: Easing.in(Easing.cubic), useNativeDriver: false }),      // leader leaves, others chase
        ]).start(done);
      } else {
        // return: no grow — everyone just slides off the right, staggered, from the start
        Animated.timing(selProg, { toValue: 1, duration: 600, easing: Easing.in(Easing.cubic), useNativeDriver: false }).start(done);
      }
    },
    enterLeft: (onDone) => {
      const EDGE = scale(420);
      pausedRef.current = false;     // will resume idle drift once arrived
      selIdxRef.current = -1;        // no leader on arrival
      selProg.setValue(0);
      const nodes: { tx: any; ty: any; sc: any; op: any }[] = [];
      for (let i = 0; i < N; i++) {
        const o = orbit(i);          // target orbit slot (rot is frozen while hidden)
        const start = i * 0.12;      // staggered so they file in one after another
        nodes[i] = {
          sc: o.s,
          // sit off-screen to the LEFT, then slide into the orbit slot
          tx: selProg.interpolate({ inputRange: [0, start, 1], outputRange: [o.x - EDGE, o.x - EDGE, o.x], extrapolate: 'clamp' }),
          ty: o.y, op: 1,
        };
      }
      selNodesRef.current = nodes;
      selectingRef.current = true;
      setSelecting(true);
      Animated.timing(selProg, { toValue: 1, duration: 640, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start(({ finished }) => {
        if (!finished) return;
        // hand back to idle drift at the exact orbit slot — JS-owned, so no flash/jump
        selectingRef.current = false;
        setSelecting(false);
        setTick((t) => (t + 1) & 0xffff);
        onDone?.();
      });
    },
    show: () => { flyingRef.current = false; pausedRef.current = false; selectingRef.current = false; selIdxRef.current = -1; selNodesRef.current = null; selProg.setValue(0); setSelecting(false); setFlying(false); setTick((t) => (t + 1) & 0xffff); },
    hide: () => { flyingRef.current = false; pausedRef.current = true; selectingRef.current = false; selIdxRef.current = -1; selNodesRef.current = null; selProg.setValue(0); setSelecting(false); setFlying(false); setTick((t) => (t + 1) & 0xffff); },
  };

  return { panHandlers: pan.panHandlers, orbit, flying, flyProg, flyDataRef, pausedRef, velRef, selecting, selIdxRef, selNodesRef, api };
}

const AnimatedTouchable = Animated.createAnimatedComponent(TouchableOpacity);

const OrbitCarousel = forwardRef<OrbitHandle, { options: OrbitOpt[]; active: boolean; hidden?: boolean; onOptionPress: (key: string) => void }>(
  function OrbitCarousel({ options, active, hidden, onOptionPress }, ref) {
    const { panHandlers, orbit, flying, flyProg, flyDataRef, pausedRef, velRef, selecting, selIdxRef, selNodesRef, api } = useOrbit(options.length, active, !!hidden);
    useImperativeHandle(ref, () => api, []);
    return (
      <View style={StyleSheet.absoluteFill} pointerEvents={active ? 'auto' : 'none'} {...panHandlers}>
        <View style={{ position: 'absolute', left: CX, top: H * 0.55 }}>
          {options.map((o, i) => {
            const fd = flying ? flyDataRef.current[i] : null;
            const sel = !fd && selecting && selNodesRef.current ? selNodesRef.current[i] : null;
            let tx: any, ty: any, sc: any, op: any, z: number;
            if (sel) {
              // STEP 1+2: selected chip grows then leaves right; the others chase it off the right
              tx = sel.tx; ty = sel.ty; sc = sel.sc; op = sel.op; z = i === selIdxRef.current ? 6 : 5;
            } else if (fd) {
              tx = flyProg.interpolate({ inputRange: [0, 1], outputRange: [fd.off.x, fd.orb.x] });
              ty = flyProg.interpolate({ inputRange: [0, 1], outputRange: [fd.off.y, fd.orb.y] });
              sc = flyProg.interpolate({ inputRange: [0, 1], outputRange: [fd.off.s, fd.orb.s] });
              // receding (selected) chip: gradual fade as it sinks back. regular chips: stay opaque
              // while sliding, fade only in the last quarter (at the off-screen edge) so it reads as
              // a slide, not an in-place blink.
              op = fd.fade ? flyProg : flyProg.interpolate({ inputRange: [0, 0.25, 1], outputRange: [0, 1, 1] });
              z = fd.fade ? 0 : fd.orb.z;  // the receding chip drops behind the others (into the background)
            } else {
              const c = orbit(i);
              tx = c.x; ty = c.y; sc = c.s; z = c.z;
              op = pausedRef.current ? 0 : 1;
            }
            return (
              <AnimatedTouchable
                key={o.key}
                activeOpacity={0.85}
                onPress={() => { if (Math.abs(velRef.current) < 0.012) onOptionPress(o.key); }}
                style={{
                  position: 'absolute',
                  transform: [{ translateX: tx }, { translateY: ty }, { scale: sc }],
                  opacity: op,
                  zIndex: z,
                  flexDirection: 'row', alignItems: 'center', gap: scale(8),
                  paddingVertical: scale(9), paddingHorizontal: scale(15), borderRadius: scale(14),
                  backgroundColor: 'rgba(255,255,255,0.16)', borderWidth: scale(1), borderColor: 'rgba(255,255,255,0.32)',
                  marginLeft: -scale(54), marginTop: -scale(20),
                }}
              >
                <Ionicons name={o.icon} size={scale(17)} color="#fff" style={{ textShadowColor: 'rgba(196,176,255,0.95)', textShadowOffset: { width: 0, height: 0 }, textShadowRadius: scale(9) }} />
                <Text style={{ color: '#fff', fontSize: scale(13), fontWeight: '700', textShadowColor: 'rgba(196,176,255,0.95)', textShadowOffset: { width: 0, height: 0 }, textShadowRadius: scale(9) }}>{o.label}</Text>
              </AnimatedTouchable>
            );
          })}
        </View>
      </View>
    );
  }
);

// ---- HOME view: centered white thread-ball (floats) + horizontal orbit of section options ----
const WHITE_PAL = [
  'rgba(255,255,255,0.62)', 'rgba(255,255,255,0.42)', 'rgba(255,255,255,0.28)', 'rgba(244,236,255,0.5)',
  'rgba(255,255,255,0.18)', 'rgba(255,255,255,0.38)', 'rgba(230,222,255,0.26)',
];

// the same woven strands as the prototype center ball — each spins on its own (rot / dur / dir)
const BALL_THREADS: { d: string; rot: number; dur: number; w: number; dir: number }[] = [
  { d: 'M20 60 C 30 20, 90 20, 100 60 C 90 100, 30 100, 20 60 Z', rot: 0, dur: 22, w: 2, dir: 1 },
  { d: 'M60 20 C 100 30, 100 90, 60 100 C 20 90, 20 30, 60 20 Z', rot: 30, dur: 24, w: 2, dir: -1 },
  { d: 'M22 40 C 50 14, 90 28, 98 60 C 86 96, 40 102, 22 80 C 12 64, 14 50, 22 40 Z', rot: 60, dur: 26, w: 2, dir: 1 },
  { d: 'M30 32 C 60 12, 96 38, 96 64 C 92 92, 50 102, 28 88 C 14 76, 16 46, 30 32 Z', rot: 100, dur: 28, w: 2, dir: -1 },
  { d: 'M18 30 C 50 50, 70 50, 102 30 C 90 70, 70 70, 60 90 C 50 70, 30 70, 18 30 Z', rot: 0, dur: 20, w: 1.6, dir: 1 },
  { d: 'M20 90 C 50 60, 70 60, 100 90 C 90 50, 70 50, 60 30 C 50 50, 30 50, 20 90 Z', rot: 45, dur: 23, w: 1.6, dir: -1 },
  { d: 'M30 28 C 60 56, 60 64, 90 92 C 60 64, 60 56, 30 28 Z M30 92 C 60 64, 60 56, 90 28', rot: 90, dur: 21, w: 1.5, dir: 1 },
  { d: 'M16 60 C 40 56, 80 64, 104 60 M28 36 C 50 56, 70 64, 92 84 M28 84 C 50 64, 70 56, 92 36', rot: 20, dur: 25, w: 1.4, dir: -1 },
  { d: 'M14 60 Q 32 30, 60 60 T 106 60', rot: 0, dur: 27, w: 1.5, dir: 1 },
  { d: 'M14 60 Q 32 90, 60 60 T 106 60', rot: 30, dur: 24, w: 1.5, dir: -1 },
  { d: 'M14 60 Q 32 40, 60 60 T 106 60', rot: 60, dur: 26, w: 1.4, dir: 1 },
  { d: 'M14 60 Q 32 80, 60 60 T 106 60', rot: 90, dur: 22, w: 1.4, dir: -1 },
  { d: 'M14 60 Q 32 35, 60 60 T 106 60', rot: 120, dur: 28, w: 1.3, dir: 1 },
  { d: 'M14 60 Q 32 85, 60 60 T 106 60', rot: 150, dur: 23, w: 1.4, dir: -1 },
  { d: 'M22 22 C 50 50, 70 70, 98 98', rot: 0, dur: 21, w: 1.4, dir: 1 },
  { d: 'M98 22 C 70 50, 50 70, 22 98', rot: 0, dur: 22, w: 1.4, dir: -1 },
  { d: 'M22 22 C 50 50, 70 70, 98 98', rot: 45, dur: 24, w: 1.3, dir: 1 },
  { d: 'M98 22 C 70 50, 50 70, 22 98', rot: 45, dur: 26, w: 1.3, dir: -1 },
  { d: 'M14 60 C 14 38, 106 38, 106 60 C 106 82, 14 82, 14 60 Z', rot: 25, dur: 25, w: 1.2, dir: 1 },
  { d: 'M60 14 C 38 14, 38 106, 60 106 C 82 106, 82 14, 60 14 Z', rot: 70, dur: 27, w: 1.2, dir: -1 },
  { d: 'M14 60 C 14 40, 106 40, 106 60 C 106 80, 14 80, 14 60 Z', rot: 115, dur: 23, w: 1.2, dir: 1 },
  { d: 'M22 36 C 60 60, 60 60, 98 84 M22 84 C 60 60, 60 60, 98 36', rot: 0, dur: 22, w: 1.4, dir: -1 },
  { d: 'M22 36 C 60 60, 60 60, 98 84 M22 84 C 60 60, 60 60, 98 36', rot: 60, dur: 24, w: 1.3, dir: 1 },
  { d: 'M22 36 C 60 60, 60 60, 98 84 M22 84 C 60 60, 60 60, 98 36', rot: 120, dur: 26, w: 1.3, dir: -1 },
];
const BALL_FLECKS = [{ cx: 60, cy: 18 }, { cx: 100, cy: 60 }, { cx: 60, cy: 102 }, { cx: 18, cy: 60 }];

// Split the strands into a few layers that counter-rotate at different speeds. This keeps the
// woven "churn" of the prototype while running entirely on the native driver (whole-View rotation)
// — no per-frame SVG work on the JS thread, so the background stays smooth.
const BALL_LAYERS = [
  { dur: 26000, dir: 1 },
  { dur: 31000, dir: -1 },
  { dur: 22000, dir: 1 },
];
const BALL_GROUPS = BALL_LAYERS.map((_, gi) =>
  BALL_THREADS.map((t, i) => ({ t, color: WHITE_PAL[i % WHITE_PAL.length] })).filter((_, i) => i % BALL_LAYERS.length === gi)
);

function CenterBall({ size = scale(184), onPress }: { size?: number; onPress?: () => void }) {
  const spins = useRef(BALL_LAYERS.map(() => new Animated.Value(0))).current;
  const fleck = useRef(new Animated.Value(0)).current;
  const floatA = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    BALL_LAYERS.forEach((l, gi) => {
      Animated.loop(Animated.timing(spins[gi], { toValue: l.dir, duration: l.dur, easing: Easing.linear, useNativeDriver: true })).start();
    });
    Animated.loop(Animated.timing(fleck, { toValue: 1, duration: 12000, easing: Easing.linear, useNativeDriver: true })).start();
    Animated.loop(Animated.sequence([
      Animated.timing(floatA, { toValue: 1, duration: 2000, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      Animated.timing(floatA, { toValue: 0, duration: 2000, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
    ])).start();
  }, []);
  const floatY = floatA.interpolate({ inputRange: [0, 1], outputRange: [0, -scale(9)] });
  const fleckRot = fleck.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  return (
    <Animated.View
      pointerEvents={onPress ? 'auto' : 'none'}
      style={{ position: 'absolute', left: CX - size / 2, top: H * 0.8 - size / 2, width: size, height: size, zIndex: 7, transform: [{ translateY: floatY }] }}
    >
      {BALL_GROUPS.map((group, gi) => {
        const rotate = spins[gi].interpolate({ inputRange: [-1, 1], outputRange: ['-360deg', '360deg'] });
        return (
          <Animated.View key={gi} style={[StyleSheet.absoluteFill, { transform: [{ rotate }] }]}>
            <Svg width={size} height={size} viewBox="0 0 120 120">
              {group.map((g, i) => (
                <Path key={i} d={g.t.d} stroke={g.color} strokeWidth={g.t.w} strokeLinecap="round" fill="none" opacity={0.7} />
              ))}
            </Svg>
          </Animated.View>
        );
      })}
      <Animated.View style={[StyleSheet.absoluteFill, { transform: [{ rotate: fleckRot }] }]}>
        <Svg width={size} height={size} viewBox="0 0 120 120">
          {BALL_FLECKS.map((f, i) => (
            <Circle key={i} cx={f.cx} cy={f.cy} r={2.2} fill={WHITE_PAL[i % WHITE_PAL.length]} />
          ))}
        </Svg>
      </Animated.View>
      {onPress && (
        <TouchableOpacity activeOpacity={0.75} onPress={onPress} style={StyleSheet.absoluteFill} />
      )}
    </Animated.View>
  );
}

const HOME_OPTIONS: { key: string; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: 'chat', label: 'Chat', icon: 'chatbubble-ellipses-outline' },
  { key: 'schedule', label: 'Schedule', icon: 'calendar-outline' },
  { key: 'requests', label: 'Requests', icon: 'document-text-outline' },
];
// (home & schedule both use the shared <OrbitCarousel> defined above)

// نصٌّ بحدودٍ بيضاء حول لونٍ بنفسجيّ — تُحاكى الحدود بنُسخٍ بيضاء مزاحةٍ خلف النصّ (٨ اتّجاهات).
function OutlinedText({ text, color = '#7C3AED', outline = '#FFFFFF', size, weight = '900', spacing = 0 }:
  { text: string; color?: string; outline?: string; size: number; weight?: any; spacing?: number }) {
  const d = scale(1.4);
  const offs: [number, number][] = [[-d, -d], [d, -d], [-d, d], [d, d], [0, -d], [0, d], [-d, 0], [d, 0]];
  const base = { fontSize: size, fontWeight: weight, letterSpacing: spacing } as const;
  return (
    <View>
      {offs.map(([x, y], i) => (
        <Text key={i} style={{ position: 'absolute', left: x, top: y, color: outline, ...base }}>{text}</Text>
      ))}
      <Text style={{ color, ...base }}>{text}</Text>
    </View>
  );
}

// ارتفاع لوحة المفاتيح — داخل Modal لا تتقلّص الشاشة تلقائيًّا، فنرفع المحادثة/الإدخال يدويًّا فوقها
function useKeyboardHeight(): number {
  const [h, setH] = useState(0);
  useEffect(() => {
    const showEvt = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvt = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const s = Keyboard.addListener(showEvt, (e) => setH(e.endCoordinates?.height ?? 0));
    const hd = Keyboard.addListener(hideEvt, () => setH(0));
    return () => { s.remove(); hd.remove(); };
  }, []);
  return h;
}

// ---- bottom chat input bar (WhatsApp-style glass pill + circular ">" send button) ----
function ChatInputBar({ onSend, light }: { onSend?: (text: string) => void; light?: boolean }) {
  const kb = useKeyboardHeight();
  const [text, setText] = useState('');
  const canSend = text.trim().length > 0;
  const send = () => {
    const t = text.trim();
    if (!t) return;
    onSend?.(t);
    setText('');
  };
  const pillBg = light ? 'rgba(255,255,255,0.95)' : 'rgba(255,255,255,0.10)';
  const pillBorder = light ? 'rgba(124,58,237,0.20)' : 'rgba(255,255,255,0.22)';
  const inputColor = light ? '#2A2350' : '#fff';
  const placeholderColor = light ? 'rgba(60,46,102,0.45)' : 'rgba(255,255,255,0.45)';
  return (
    <View
      style={{ position: 'absolute', left: 0, right: 0, bottom: kb, zIndex: 8 }}
      pointerEvents="box-none"
    >
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: scale(10), paddingHorizontal: scale(14), paddingBottom: kb > 0 ? scale(10) : scale(26) }}>
        {/* the glass pill */}
        <View
          style={{
            flex: 1, minHeight: scale(50), maxHeight: scale(120), justifyContent: 'center',
            borderRadius: scale(26), paddingHorizontal: scale(18), paddingVertical: scale(5),
            backgroundColor: pillBg, borderWidth: scale(1), borderColor: pillBorder,
          }}
        >
          <TextInput
            value={text}
            onChangeText={setText}
            placeholder="اكتب رسالتك..."
            placeholderTextColor={placeholderColor}
            multiline
            textAlign="right"
            style={{ color: inputColor, fontSize: scale(15), maxHeight: scale(110), paddingTop: scale(7), paddingBottom: scale(7), textAlignVertical: 'center' }}
            onSubmitEditing={send}
          />
        </View>
        {/* circular ">" send button */}
        <TouchableOpacity activeOpacity={0.85} onPress={send} disabled={!canSend}>
          <LinearGradient
            colors={canSend ? ['#A78BFA', '#7C3AED'] : ['rgba(255,255,255,0.18)', 'rgba(255,255,255,0.10)']}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
            style={{ width: scale(50), height: scale(50), borderRadius: scale(25), alignItems: 'center', justifyContent: 'center', borderWidth: scale(1), borderColor: 'rgba(255,255,255,0.28)' }}
          >
            <Ionicons
              name="chevron-forward"
              size={scale(24)}
              color="#fff"
              style={{ marginLeft: scale(2), textShadowColor: 'rgba(196,176,255,0.9)', textShadowOffset: { width: 0, height: 0 }, textShadowRadius: scale(8) }}
            />
          </LinearGradient>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// Scrollable chat transcript (bubbles + answer chips). Shared by the orbit chat
// view and the slide-in chat panel so both render the same conversation.
function ChatBody({ messages, isLoading, onSend, style, light, header }: {
  messages: ChatMessage[]; isLoading?: boolean; onSend: (text: string) => void; style?: any; light?: boolean; header?: React.ReactNode;
}) {
  const scrollRef = useRef<ScrollView>(null);
  const kb = useKeyboardHeight();
  // ترفع المنطقة فوق لوحة المفاتيح، وتُنزل آخر رسالةٍ لتبقى ظاهرةً
  useEffect(() => {
    if (kb > 0) setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 60);
  }, [kb]);
  const t = light
    ? { userBg: '#7C3AED', userBorder: 'rgba(255,255,255,0.32)', userText: '#fff',
        botBg: '#FFFFFF', botBorder: 'rgba(124,58,237,0.12)', botText: '#352B5C',
        chipBg: 'rgba(255,255,255,0.95)', chipBorder: 'rgba(124,58,237,0.4)', chipText: '#6D4FB8',
        loadBg: '#FFFFFF', loadText: '#6B6486', spinner: '#7C3AED' }
    : { userBg: 'rgba(124,58,237,0.85)', userBorder: 'rgba(167,139,250,0.6)', userText: '#fff',
        botBg: 'rgba(255,255,255,0.12)', botBorder: 'rgba(255,255,255,0.18)', botText: '#fff',
        chipBg: 'rgba(255,255,255,0.10)', chipBorder: 'rgba(167,139,250,0.5)', chipText: '#E9DEFF',
        loadBg: 'rgba(255,255,255,0.12)', loadText: 'rgba(255,255,255,0.7)', spinner: '#C4B0FF' };
  return (
    <ScrollView
      ref={scrollRef}
      style={[style, { bottom: kb }]}
      contentContainerStyle={{ paddingHorizontal: scale(14), paddingBottom: kb > 0 ? scale(64) : scale(90), gap: scale(10) }}
      onContentSizeChange={() => { if (!header) scrollRef.current?.scrollToEnd({ animated: true }); }}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      {header}
      {messages.map((m, mi) => {
        const isUser = m.role === 'user';
        const isLastAssistant = !isUser && mi === messages.length - 1;
        const { text, choices } = isLastAssistant && !isLoading ? parseChoices(m.content) : { text: m.content, choices: [] as string[] };
        return (
          <View key={m.id}>
            <View style={{
              alignSelf: isUser ? 'flex-end' : 'flex-start', maxWidth: '80%',
              backgroundColor: isUser ? t.userBg : t.botBg,
              borderWidth: scale(1), borderColor: isUser ? t.userBorder : t.botBorder,
              borderRadius: scale(20),
              // ذيلٌ خفيف: الزاوية السفليّة القريبة من المُرسِل أحدّ
              borderBottomRightRadius: isUser ? scale(6) : scale(20),
              borderBottomLeftRadius: isUser ? scale(20) : scale(6),
              paddingHorizontal: scale(15), paddingVertical: scale(11),
              shadowColor: '#2A1A52', shadowOpacity: 0.13, shadowRadius: scale(6), shadowOffset: { width: 0, height: scale(2) },
              elevation: 2,
            }}>
              <Text style={{ color: isUser ? t.userText : t.botText, fontSize: scale(14.5), lineHeight: scale(21) }}>{text}</Text>
            </View>
            {choices.length > 0 && (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: scale(8), marginTop: scale(8), alignSelf: 'flex-start', maxWidth: '92%' }}>
                {choices.map((c, ci) => (
                  <TouchableOpacity
                    key={ci}
                    activeOpacity={0.8}
                    onPress={() => onSend(c)}
                    style={{ backgroundColor: t.chipBg, borderWidth: scale(1), borderColor: t.chipBorder, borderRadius: scale(16), paddingHorizontal: scale(14), paddingVertical: scale(8) }}
                  >
                    <Text style={{ color: t.chipText, fontSize: scale(13), fontWeight: '600' }}>{c}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>
        );
      })}
      {isLoading && (
        <View style={{ alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: scale(8), backgroundColor: t.loadBg, borderRadius: scale(18), paddingHorizontal: scale(14), paddingVertical: scale(10) }}>
          <ActivityIndicator size="small" color={t.spinner} />
          <Text style={{ color: t.loadText, fontSize: scale(13) }}>…</Text>
        </View>
      )}
    </ScrollView>
  );
}

// بطاقات تأكيد الأسماء الغامضة — الذكاء يسأل: «من تقصد بفلان؟» ويعرض المرشّحين للنقر
function ClarifyCards({ clarifications, onResolve }: {
  clarifications: Clarification[]; onResolve: (c: Clarification, doctorId: string) => void;
}) {
  if (clarifications.length === 0) return null;
  return (
    <View style={{ gap: scale(10), marginBottom: scale(6) }}>
      <View style={{ backgroundColor: 'rgba(245,158,11,0.14)', borderWidth: scale(1), borderColor: 'rgba(245,158,11,0.4)', borderRadius: scale(14), paddingHorizontal: scale(12), paddingVertical: scale(9) }}>
        <Text style={{ color: '#7A4B00', fontSize: scale(12.5), fontWeight: '700', textAlign: 'right', lineHeight: scale(19) }}>
          ⚠️ لن يكون الجدول كما تريد قبل توضيح الأسماء التالية:
        </Text>
      </View>
      {clarifications.map((c, i) => {
        const kindLabel = c.kind === 'permission' ? 'استئذان' : 'غياب';
        return (
          <View key={`${c.mention}-${c.day}-${i}`} style={{ backgroundColor: 'rgba(255,255,255,0.92)', borderWidth: scale(1), borderColor: 'rgba(124,58,237,0.18)', borderRadius: scale(16), paddingHorizontal: scale(14), paddingVertical: scale(11) }}>
            <Text style={{ color: '#3A2E66', fontSize: scale(14), fontWeight: '700', textAlign: 'right', lineHeight: scale(21) }}>
              من تقصد بـ«{c.mention}»؟ ({kindLabel} يوم {DAY_AR[c.day] ?? c.day})
            </Text>
            <View style={{ flexDirection: 'row-reverse', flexWrap: 'wrap', gap: scale(8), marginTop: scale(9) }}>
              {c.candidates.map((cand) => (
                <TouchableOpacity
                  key={cand.id}
                  activeOpacity={0.8}
                  onPress={() => onResolve(c, cand.id)}
                  style={{ backgroundColor: '#F3EFFC', borderWidth: scale(1), borderColor: 'rgba(124,58,237,0.45)', borderRadius: scale(16), paddingHorizontal: scale(14), paddingVertical: scale(8) }}
                >
                  <Text style={{ color: '#6D4FB8', fontSize: scale(13), fontWeight: '700' }}>{cand.name}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        );
      })}
    </View>
  );
}

function UnsupportedCards({ items }: { items: UnsupportedRequest[] }) {
  if (items.length === 0) return null;
  return (
    <View style={{ gap: scale(8), marginBottom: scale(6) }}>
      <View style={{ backgroundColor: 'rgba(239,68,68,0.12)', borderWidth: scale(1), borderColor: 'rgba(239,68,68,0.4)', borderRadius: scale(14), paddingHorizontal: scale(12), paddingVertical: scale(9) }}>
        <Text style={{ color: '#7A1212', fontSize: scale(12.5), fontWeight: '700', textAlign: 'right', lineHeight: scale(19) }}>
          ⚠️ تعذّر تنفيذ الطلبات التالية (غير مدعومة في بناء الجدول حاليّاً):
        </Text>
      </View>
      {items.map((u, i) => (
        <View key={`${i}-${u.request}`} style={{ backgroundColor: 'rgba(255,255,255,0.92)', borderWidth: scale(1), borderColor: 'rgba(239,68,68,0.18)', borderRadius: scale(16), paddingHorizontal: scale(14), paddingVertical: scale(11) }}>
          <Text style={{ color: '#3A2E66', fontSize: scale(13.5), fontWeight: '700', textAlign: 'right', lineHeight: scale(21) }}>«{u.request}»</Text>
          <Text style={{ color: '#8A4B4B', fontSize: scale(12), fontWeight: '600', textAlign: 'right', lineHeight: scale(18), marginTop: scale(3) }}>{u.reason}</Text>
        </View>
      ))}
    </View>
  );
}

export function AISchedulePanel({ visible, onClose, onAction, messages, onSend, isLoading, contextLabel, userName, user, clinicId, onCreateSchedule, chatPreview, chatPreviewSaving, chatPreviewError, onSaveChatPreview, onDiscardChatPreview }: AISchedulePanelProps) {
  const morph = useRef(new Animated.Value(0)).current;       // 0 = knot A .. 1 = straight C
  const gather = useRef(new Animated.Value(0)).current;      // 0 = thin colored threads .. 1 = thick page surface
  const surfaceOp = useRef(new Animated.Value(0)).current;   // real page surface
  const content = useRef(new Animated.Value(0)).current;
  const threadsOp = useRef(new Animated.Value(1)).current;   // the strands layer (مُعطَّل في وضع المارد)
  const emerge = useRef(new Animated.Value(0)).current;      // 0 = داخل الأيقونة .. 1 = يملأ الشاشة (خروج المارد)
  const sub = useRef(new Animated.Value(0)).current;         // 0 = home view .. 1 = schedule sub-view
  const chatOp = useRef(new Animated.Value(0)).current;      // 0 = hidden .. 1 = chat view shown
  const wizardOp = useRef(new Animated.Value(0)).current;    // 0 = hidden .. 1 = create-questionnaire shown
  const chatSlide = useRef(new Animated.Value(0)).current;   // 0 = slide-chat off-screen right .. 1 = fully in
  const [chatOpen, setChatOpen] = useState(false);          // the summonable slide-in chat
  const [chatTab, setChatTab] = useState<'chat' | 'cards'>('chat'); // محادثة | كروت الإبلاغ
  // مسارٌ أفقيٌّ متزامنٌ مع السحب: 0 = المحادثة، ‎-W‎ = الكروت
  const pageAnim = useRef(new Animated.Value(0)).current;
  const pageBase = useRef(0);
  const goToTab = (tab: 'chat' | 'cards') => {
    const target = tab === 'cards' ? -W : 0;
    pageBase.current = target;
    Animated.spring(pageAnim, { toValue: target, useNativeDriver: false, bounciness: 0, speed: 14 }).start();
    setChatTab(tab);
  };
  // (السحب أُلغي — التنقّل بين المحادثة والكروت يتمّ بزرّ التبديل فقط عبر goToTab)
  // تأكيد الأسماء الغامضة: clarifications = المعلَّقة، resolvedClar = المحلولة (تُمرَّر للويزرد)
  const [clarifications, setClarifications] = useState<Clarification[]>([]);
  const [resolvedClar, setResolvedClar] = useState<ResolvedClarification[]>([]);
  const handleClarifications = (list: Clarification[]) => { setClarifications(list); setResolvedClar([]); };
  const resolveClar = (c: Clarification, doctorId: string) => {
    setResolvedClar((prev) => [...prev, { clar: c, doctorId }]);
    setClarifications((prev) => prev.filter((x) => !(x.mention === c.mention && x.day === c.day && x.kind === c.kind)));
  };
  // طلبات غير مدعومة: يفتح الذكاء الجات ويشرحها (إعلاميّ، لا يمنع الحفظ)
  const [unsupported, setUnsupported] = useState<UnsupportedRequest[]>([]);
  const handleUnsupported = (list: UnsupportedRequest[]) => {
    setUnsupported(list);
    if (list.length > 0) openSlideChat();
  };
  const [view, setView] = useState<'home' | 'schedule' | 'chat' | 'create'>('home');
  const [createKey, setCreateKey] = useState(0);             // bump → remount WizardContent (fresh state)
  const [mounted, setMounted] = useState(visible);
  const closingRef = useRef(false);

  // معاينة الشات: تُخفى/تُعرَض دون حذف بياناتها (الرجوع للتعديل يُخفي فقط، وزرّ
  // "عرض المعاينة" يعيدها). تظهر تلقائيًّا كلّما بنى الذكاء معاينة جديدة.
  const [showPreview, setShowPreview] = useState(false);
  const prevPreviewRef = useRef<SchedulePreview | null>(null);
  // عند فتح المحادثة من المعاينة: نُخفي المعاينة ونعيدها تلقائيًّا حين تُغلَق المحادثة
  const reopenPreviewRef = useRef(false);
  useEffect(() => {
    if (chatPreview && chatPreview !== prevPreviewRef.current) setShowPreview(true);
    prevPreviewRef.current = chatPreview ?? null;
  }, [chatPreview]);
  const openChatFromPreview = () => {
    reopenPreviewRef.current = true;
    setShowPreview(false);
    openSlideChat();
  };

  const homeRef = useRef<OrbitHandle>(null);
  const schedRef = useRef<OrbitHandle>(null);
  const transitioningRef = useRef(false);   // locked while a leave→enter sequence is in flight

  // The click transition, built step by step:
  // STEP 1+2: tapping Schedule — that chip grows then leaves right, the others chase it off.
  // STEP 3: the moment they're gone, the schedule chips file in from the LEFT.
  const goSchedule = () => {
    if (view === 'schedule' || transitioningRef.current) return;
    Keyboard.dismiss();
    transitioningRef.current = true;
    const idx = HOME_OPTIONS.findIndex((o) => o.key === 'schedule');
    setView('schedule');   // schedule orbit becomes active (still hidden until it enters)
    homeRef.current?.selectLeave(idx, () => schedRef.current?.enterLeft(() => { transitioningRef.current = false; }));
  };
  // RETURN: same choreography, no leader — the schedule chips leave off the right, then the home
  // chips file back in from the left.
  const goHome = () => {
    if (view === 'home' || transitioningRef.current) return;
    Keyboard.dismiss();
    transitioningRef.current = true;
    setView('home');
    schedRef.current?.selectLeave(-1, () => homeRef.current?.enterLeft(() => { transitioningRef.current = false; }));
  };

  // reveal the chat view once the current orbit has left (reuses the same leave choreography)
  const revealChat = () => {
    setView('chat');
    Animated.timing(chatOp, { toValue: 1, duration: 300, useNativeDriver: true }).start(() => { transitioningRef.current = false; });
  };
  // HOME → CHAT: the Chat chip leads its orbit off, then chat fades in
  const goChat = () => {
    if (view === 'chat' || transitioningRef.current) return;
    Keyboard.dismiss();
    transitioningRef.current = true;
    const idx = HOME_OPTIONS.findIndex((o) => o.key === 'chat');
    homeRef.current?.selectLeave(idx, revealChat);
  };
  // SCHEDULE action → run the action (parent seeds the message) then open chat
  const goChatFromAction = (key: PanelAction) => {
    if (transitioningRef.current) return;
    Keyboard.dismiss();
    transitioningRef.current = true;
    onAction(key);
    const idx = OPTIONS.findIndex((o) => o.key === key);
    schedRef.current?.selectLeave(idx, revealChat);
  };
  // CHAT → HOME (back button)
  const backFromChat = () => {
    if (view !== 'chat' || transitioningRef.current) return;
    Keyboard.dismiss();
    transitioningRef.current = true;
    Animated.timing(chatOp, { toValue: 0, duration: 260, useNativeDriver: true }).start(() => {
      setView('home');
      homeRef.current?.enterLeft(() => { transitioningRef.current = false; });
    });
  };

  // reveal the create-questionnaire once the schedule orbit has flown right
  const revealCreate = () => {
    setCreateKey((k) => k + 1);   // fresh wizard state each open
    setView('create');
    Animated.timing(wizardOp, { toValue: 1, duration: 300, useNativeDriver: true }).start(() => { transitioningRef.current = false; });
  };
  // SCHEDULE "Create" → the Create chip leads its orbit off to the RIGHT, then the question appears
  const goCreate = () => {
    if (transitioningRef.current) return;
    Keyboard.dismiss();
    transitioningRef.current = true;
    const idx = OPTIONS.findIndex((o) => o.key === 'create');
    schedRef.current?.selectLeave(idx, revealCreate);
  };
  // CREATE → back to the Schedule orbit (from the questionnaire's first step)
  const backFromCreate = () => {
    if (view !== 'create' || transitioningRef.current) return;
    Keyboard.dismiss();
    transitioningRef.current = true;
    Animated.timing(wizardOp, { toValue: 0, duration: 260, useNativeDriver: true }).start(() => {
      setView('schedule');
      schedRef.current?.enterLeft(() => { transitioningRef.current = false; });
    });
  };
  // CREATE finished → hand the result up, then return to the Schedule orbit
  const finishCreate = (result: WizardResult) => {
    onCreateSchedule?.(result);
    Animated.timing(wizardOp, { toValue: 0, duration: 260, useNativeDriver: true }).start(() => {
      setView('schedule');
      schedRef.current?.show();
    });
  };

  // SLIDE-IN CHAT: summoned by the top-right AI icon from any view, slides in from the
  // right; the page behind shrinks slightly (drawer feel). Dismisses the same way.
  const openSlideChat = () => {
    Keyboard.dismiss();
    // ابدأ دائمًا على المحادثة (المسار عند 0)
    pageAnim.setValue(0); pageBase.current = 0; setChatTab('chat');
    setChatOpen(true);   // رَكِّب محتوى/خلفيّة الجات أولاً (تبقى ثابتة)
    // اترك إطارين كي يُلتزَم التركيب قبل بدء الحركة → الخلفيّات حاضرة والحركة سلسة بلا lag
    requestAnimationFrame(() => requestAnimationFrame(() => {
      Animated.timing(chatSlide, { toValue: 1, duration: 340, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
    }));
  };
  const closeSlideChat = () => {
    Keyboard.dismiss();
    // أعِد الصفحة الرئيسيّة لمكانها فورًا (مخفيٌّ خلف الدُّرج المنزلق) كي لا تبقى منزاحةً إن أُغلق من تبويب الكروت
    pageAnim.setValue(0); pageBase.current = 0; setChatTab('chat');
    Animated.timing(chatSlide, { toValue: 0, duration: 300, easing: Easing.in(Easing.cubic), useNativeDriver: true })
      .start(() => {
        setChatOpen(false);
        // إن فُتِحت المحادثة من المعاينة → أعِد المعاينة عند إغلاقها
        if (reopenPreviewRef.current && chatPreview) {
          reopenPreviewRef.current = false;
          setShowPreview(true);
        }
      });
  };

  // OPEN — خروج المارد: الصفحة كلّها تنبثق من الأيقونة (أسفل-يمين)، تكبُر وتصعد كالدخان
  // حتّى تملأ الشاشة، ثمّ يظهر المحتوى. (العقدة/الخيوط القديمة مُعطَّلة.)
  const playOpen = () => {
    closingRef.current = false;
    transitioningRef.current = false;
    setView('home'); sub.setValue(0); chatOp.setValue(0); wizardOp.setValue(0);
    chatSlide.setValue(0); setChatOpen(false); setClarifications([]); setResolvedClar([]); setUnsupported([]);
    homeRef.current?.show(); schedRef.current?.hide();   // reset orbits to the home state
    // السطح حاضرٌ كاملًا، والخيوط مخفيّة — الحركة كلّها على انبثاق الحاوية
    threadsOp.setValue(0); morph.setValue(1); gather.setValue(1); surfaceOp.setValue(1);
    content.setValue(0); emerge.setValue(0);
    requestAnimationFrame(() => requestAnimationFrame(() => {
      Animated.parallel([
        // الانبثاق من الأيقونة حتّى ملء الشاشة — سلسٌ جدًّا (تباطؤٌ ناعمٌ في النهاية)
        Animated.timing(emerge, { toValue: 1, duration: 560, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        // المحتوى يظهر بعد أن تتّسع القطرة وتغطّي الشاشة
        Animated.sequence([
          Animated.delay(400),
          Animated.timing(content, { toValue: 1, duration: 320, easing: Easing.out(Easing.ease), useNativeDriver: false }),
        ]),
      ]).start();
    }));
  };

  // CLOSE — عكس المارد: المحتوى يتلاشى ثمّ الصفحة تنكمش عائدةً إلى الأيقونة، فيحلّ
  // الأوربّ الحقيقيّ مكانها فورًا (لا فجوة).
  const beginClose = () => {
    if (closingRef.current) return;
    closingRef.current = true;
    Animated.parallel([
      Animated.timing(content, { toValue: 0, duration: 200, useNativeDriver: false }),
      // الانكماش عائدًا إلى الأيقونة — سلسٌ جدًّا (تسارعٌ ناعمٌ من البداية)
      Animated.sequence([
        Animated.delay(80),
        Animated.timing(emerge, { toValue: 0, duration: 460, easing: Easing.in(Easing.cubic), useNativeDriver: true }),
      ]),
    ]).start(() => {
      closingRef.current = false;
      setMounted(false);
      onClose();
    });
  };

  useEffect(() => {
    if (visible) setMounted(true);
    else if (mounted && !closingRef.current) setMounted(false);
  }, [visible]);

  useEffect(() => {
    if (mounted && visible) playOpen();
  }, [mounted]);

  if (!mounted) return null;

  const strokeWidth = gather.interpolate({ inputRange: [0, 1], outputRange: [scale(2.4), FILL_W] });
  // ═══ خروج المارد: قطرةٌ مستديرة تكبُر من مركز الأيقونة (BX,BY) حتّى تغطّي الشاشة ═══
  // (translate قبل scale → بوحدات الشاشة) القطرة تبدأ عند الأيقونة ثمّ تكبُر وتنزلق للمركز.
  const blobScale = emerge.interpolate({ inputRange: [0, 1], outputRange: [0.18, COVER] });
  const blobTX = emerge.interpolate({ inputRange: [0, 1], outputRange: [0, CX - BX] });
  const blobTY = emerge.interpolate({ inputRange: [0, 1], outputRange: [0, CY - BY] });
  // تذوب القطرة في آخر ٨٪ من الحركة (وتظهر في أوّلها) فلا قفزةٌ عند التفكيك/التركيب
  const blobOpacity = emerge.interpolate({ inputRange: [0, 0.08, 1], outputRange: [0, 1, 1] });
  // سطح الصفحة المستطيل يملأ الزوايا بعد أن تتّسع القطرة (نفس اللون → انتقالٌ خفيّ)
  const surfaceShow = emerge.interpolate({ inputRange: [0, 0.6, 1], outputRange: [0, 0, 1] });
  // the floating ball fades out in BOTH chat and the create-questionnaire
  const decorOp = Animated.multiply(
    chatOp.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }),
    wizardOp.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }),
  );
  const decorHidden = view === 'chat' || view === 'create';

  return (
    <Modal transparent visible={mounted} animationType="none" onRequestClose={() => (chatOpen ? closeSlideChat() : beginClose())}>
      <View style={{ flex: 1 }}>
        {/* قطرة المارد: دائرةٌ تكبُر بسلاسةٍ من مركز الأيقونة حتّى تغطّي الشاشة (بلون الصفحة) */}
        <Animated.View
          pointerEvents="none"
          style={{
            position: 'absolute',
            left: BX - BLOB / 2, top: BY - BLOB / 2,
            width: BLOB, height: BLOB, borderRadius: BLOB / 2, overflow: 'hidden',
            opacity: blobOpacity,
            transform: [{ translateX: blobTX }, { translateY: blobTY }, { scale: blobScale }],
          }}
        >
          <LinearGradient colors={['#1E1B4B', '#312E81', '#4C1D95']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
        </Animated.View>
        {/* CHAT BACKGROUND — sits BEHIND the main card (light purple + same effects). The chat
            CONTENT (messages/input/close) is rendered ON TOP of the main card, lower in the tree. */}
        <Animated.View
          pointerEvents="none"
          style={[StyleSheet.absoluteFill, { opacity: chatSlide.interpolate({ inputRange: [0, 1], outputRange: [0, 1] }) }]}
        >
          {/* خلفيّة بنفسجيّة فاتحة (كما كانت) + نفس تأثيرات الصفحة الرئيسيّة (دخان + شرائط).
              تُركَّب مع chatOpen (قبل بدء الحركة بإطارين) فتكون ثابتة وحاضرة أثناء الحركة. */}
          <LinearGradient colors={['#ECE5FA', '#E2D6F4', '#D8C9F0']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
          {chatOpen && <Smoke />}
          {chatOpen && <Ribbons />}
          {/* ظلّ مُحاكى واقعيّ (لا خاصيّة shadow) — يخرج من خلف البطاقة. يتلاشى وينزلق يسارًا
              مع السحب للكروت تمامًا كالصفحة الرئيسيّة (pageAnim)، فلا يبقى ظلٌّ بلا بطاقة. */}
          {chatOpen && (
            <Animated.View
              pointerEvents="none"
              style={[StyleSheet.absoluteFill, {
                opacity: pageAnim.interpolate({ inputRange: [-W, 0], outputRange: [0, 1] }),
                transform: [{ translateX: pageAnim.interpolate({ inputRange: [-W, 0], outputRange: [-W * 0.6, 0] }) }],
              }]}
            >
              {[{ o: scale(22), a: 0.14 }, { o: scale(14), a: 0.24 }, { o: scale(7), a: 0.34 }].map((s, i) => (
                <View
                  key={i}
                  pointerEvents="none"
                  style={{
                    position: 'absolute',
                    left: -W * 0.31 + s.o * 0.6,
                    top: H * 0.19 + s.o,
                    width: W * 0.62,
                    height: H * 0.62,
                    borderRadius: scale(16),
                    backgroundColor: `rgba(74,48,128,${s.a})`,
                  }}
                />
              ))}
            </Animated.View>
          )}
        </Animated.View>

        {/* حاوية السحب: مع الانتقال للكروت (pageAnim ‎0→-W‎) تنزلق الصفحة الرئيسيّة المصغّرة
            أكثرَ يسارًا وتتلاشى — متزامنةً مع الإصبع، وتعود مع العودة. */}
        <Animated.View
          pointerEvents="box-none"
          style={[StyleSheet.absoluteFill, {
            opacity: pageAnim.interpolate({ inputRange: [-W, 0], outputRange: [0, 1] }),
            transform: [{ translateX: pageAnim.interpolate({ inputRange: [-W, 0], outputRange: [-W * 0.6, 0] }) }],
          }]}
        >
        {/* MAIN PAGE — ON TOP of the chat; full-screen when closed, shrinks to a left card (~70%,
            shorter) when the chat opens so the chat shows behind/around it. */}
        <Animated.View
          pointerEvents={chatOpen ? 'none' : 'auto'}
          style={[
            StyleSheet.absoluteFill,
            // حافّة بطاقة نظيفة (زوايا مستديرة + حدّ فاتح رفيع) تفصلها عن صفحة الجات — بلا ظلّ
            chatOpen && { borderRadius: scale(26), overflow: 'hidden', borderWidth: scale(2), borderColor: 'rgba(255,255,255,0.55)' },
            { transform: [
              // translateX قبل scale → بوحدات الشاشة الحقيقيّة، فـ -W/2 ينقل المركز لحافة الشاشة = 50% ظاهرة
              { translateX: chatSlide.interpolate({ inputRange: [0, 1], outputRange: [0, -W * 0.5] }) },
              { scale: chatSlide.interpolate({ inputRange: [0, 1], outputRange: [1, 0.62] }) },   // أقصر
            ] },
          ]}
        >
        {/* سطح الصفحة المستطيل — يظهر ليملأ الزوايا بعد اتّساع القطرة */}
        <Animated.View style={[StyleSheet.absoluteFill, { opacity: surfaceShow }]}>
          <LinearGradient colors={['#1E1B4B', '#312E81', '#4C1D95']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
        </Animated.View>

        {/* page content (fades in as the strands dissolve) */}
        <Animated.View
          style={[StyleSheet.absoluteFill, { opacity: content }]}
          pointerEvents={visible && !closingRef.current ? 'auto' : 'none'}
        >
          {/* تأثيرات الصفحة الرئيسيّة — ثابتة دائمًا (لا تختفي عند التصغير) فتكون الحركة سلسة */}
          <Smoke />
          <Ribbons />

          {/* schedule title word — fades in/out with the transition (the Schedule chip "becomes" it) */}
          <Animated.Text
            pointerEvents="none"
            style={{
              position: 'absolute', left: 0, right: 0, top: H * 0.4 - scale(34),
              textAlign: 'center', fontSize: scale(58), fontWeight: '800', letterSpacing: 1,
              color: 'rgba(214,196,255,0.34)', opacity: sub,
            }}
          >
            Schedule
          </Animated.Text>

          {/* home + schedule orbits — each flies its own chips in/out on navigation */}
          <OrbitCarousel ref={homeRef} options={HOME_OPTIONS} active={view === 'home'} onOptionPress={(k) => { if (k === 'schedule') goSchedule(); else if (k === 'chat') goChat(); }} />
          <OrbitCarousel ref={schedRef} options={OPTIONS} active={view === 'schedule'} hidden onOptionPress={(k) => (k === 'create' ? goCreate() : goChatFromAction(k as PanelAction))} />

          {/* shared floating icon — fades out in chat & create; tap returns home from the schedule view */}
          <Animated.View style={[StyleSheet.absoluteFill, { opacity: decorOp }]} pointerEvents={decorHidden ? 'none' : 'box-none'}>
            <CenterBall onPress={() => { if (view === 'schedule') goHome(); }} />
          </Animated.View>

          {/* CHAT view: scrollable bubbles + answer chips (the input bar below is shared & always shown) */}
          <Animated.View style={[StyleSheet.absoluteFill, { opacity: chatOp }]} pointerEvents={view === 'chat' ? 'auto' : 'none'}>
            {!!contextLabel && (
              <Text style={{ position: 'absolute', top: scale(56), left: 0, right: 0, textAlign: 'center', color: 'rgba(214,196,255,0.6)', fontSize: scale(12), fontWeight: '600' }}>
                {contextLabel}
              </Text>
            )}
            <ChatBody
              messages={messages}
              isLoading={isLoading}
              onSend={onSend}
              style={{ position: 'absolute', top: scale(84), left: 0, right: 0, bottom: scale(94) }}
            />

            {/* back to home */}
            <TouchableOpacity onPress={backFromChat} style={{ position: 'absolute', top: scale(46), left: scale(16), padding: scale(8), zIndex: 9 }} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Ionicons name="chevron-back" size={scale(30)} color="rgba(255,255,255,0.7)" />
            </TouchableOpacity>
          </Animated.View>

          {/* CREATE questionnaire — in-page (question at top + controls), not a separate page */}
          <Animated.View style={[StyleSheet.absoluteFill, { opacity: wizardOp }]} pointerEvents={view === 'create' ? 'auto' : 'none'}>
            {view === 'create' && (
              <WizardContent
                key={createKey}
                clinicId={clinicId ?? null}
                onComplete={finishCreate}
                onBack={backFromCreate}
                resolved={resolvedClar}
                pendingClarifyCount={clarifications.length}
                onClarifications={handleClarifications}
                onNeedClarify={openSlideChat}
                onUnsupported={handleUnsupported}
              />
            )}
          </Animated.View>

          {/* bottom chat input — only in the orbit chat view (home/schedule use the slide-in chat) */}
          {view === 'chat' && <ChatInputBar onSend={onSend} />}

          {/* close (×) on home only */}
          {view === 'home' && (
            <View style={{ position: 'absolute', top: scale(50), left: scale(20), zIndex: 9 }}>
              <TouchableOpacity onPress={beginClose} style={{ padding: scale(8) }} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Ionicons name="close" size={scale(26)} color="rgba(255,255,255,0.7)" />
              </TouchableOpacity>
            </View>
          )}
          {/* back (‹) on schedule */}
          {view === 'schedule' && (
            <View style={{ position: 'absolute', top: scale(46), left: scale(16), zIndex: 9 }}>
              <TouchableOpacity onPress={goHome} style={{ padding: scale(8) }} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Ionicons name="chevron-back" size={scale(30)} color="rgba(255,255,255,0.7)" />
              </TouchableOpacity>
            </View>
          )}

          {/* top-right AI icon — summons the chat from any view (hidden in orbit chat & while chat open) */}
          {view !== 'chat' && !chatOpen && (
            <TouchableOpacity
              onPress={openSlideChat}
              activeOpacity={0.85}
              style={{ position: 'absolute', top: scale(48), right: scale(16), zIndex: 12 }}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <LinearGradient
                colors={['#A78BFA', '#7C3AED']}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                style={{ width: scale(42), height: scale(42), borderRadius: scale(21), alignItems: 'center', justifyContent: 'center', borderWidth: scale(1), borderColor: 'rgba(255,255,255,0.3)' }}
              >
                <Ionicons name="chatbubbles" size={scale(20)} color="#fff" />
              </LinearGradient>
              {/* بادج عدد الأسماء الغامضة + الطلبات غير المدعومة */}
              {clarifications.length + unsupported.length > 0 && (
                <View style={{ position: 'absolute', top: -scale(4), left: -scale(4), minWidth: scale(20), height: scale(20), borderRadius: scale(10), backgroundColor: '#EF4444', alignItems: 'center', justifyContent: 'center', paddingHorizontal: scale(5), borderWidth: scale(1.5), borderColor: '#fff' }}>
                  <Text style={{ color: '#fff', fontSize: scale(11), fontWeight: '800' }}>{clarifications.length + unsupported.length}</Text>
                </View>
              )}
            </TouchableOpacity>
          )}
        </Animated.View>

        </Animated.View>
        </Animated.View>

        {/* the strands: tangled knot at the button that unravels / re-knots, and gathers into the page color */}
        <Animated.View style={[StyleSheet.absoluteFill, { opacity: threadsOp }]} pointerEvents="none">
          <Svg width={W} height={H}>
            {STRANDS.map((s, i) => {
              const d = morph.interpolate({ inputRange: MORPH_IN, outputRange: [s.A, s.K1, s.K2, s.BOVER, s.B, s.C] });
              const stroke = gather.interpolate({ inputRange: [0, 1], outputRange: [s.baseColor, s.pageColor] });
              return (
                <AnimatedPath
                  key={i}
                  d={d as unknown as string}
                  stroke={stroke as unknown as string}
                  strokeWidth={strokeWidth as unknown as number}
                  strokeLinecap="round"
                  fill="none"
                />
              );
            })}
          </Svg>
        </Animated.View>

        {/* CHAT CONTENT — messages + input + close, rendered ON TOP of the receded main card so the
            conversation always floats above it. */}
        <Animated.View
          pointerEvents={chatOpen ? 'box-none' : 'none'}
          style={[StyleSheet.absoluteFill, { opacity: chatSlide.interpolate({ inputRange: [0, 1], outputRange: [0, 1] }) }]}
        >
          {/* المسار الأفقيّ [المحادثة | الكروت] — ينزلق بزرّ التبديل فقط (لا سحب) */}
          <View style={StyleSheet.absoluteFill}>
            <Animated.View style={{ flexDirection: 'row', width: W * 2, height: '100%', transform: [{ translateX: pageAnim }] }}>
              {/* صفحة المحادثة */}
              <View style={{ width: W, height: '100%' }}>
                <ChatBody
                  light
                  messages={messages}
                  isLoading={isLoading}
                  onSend={onSend}
                  header={<><UnsupportedCards items={unsupported} /><ClarifyCards clarifications={clarifications} onResolve={resolveClar} /></>}
                  style={{ position: 'absolute', top: scale(132), left: 0, right: 0, bottom: scale(94) }}
                />
                <ChatInputBar light onSend={onSend} />
              </View>
              {/* صفحة الكروت — نفس الخلفيّة */}
              <View style={{ width: W, height: '100%' }}>
                <View style={{ position: 'absolute', top: scale(132), left: 0, right: 0, bottom: 0 }}>
                  {user && <AICardsView user={user} clinicId={clinicId ?? user.clinicId} />}
                </View>
              </View>
            </Animated.View>
          </View>

          {/* سهم العودة (يسار) — فوق المسار */}
          <TouchableOpacity onPress={closeSlideChat} activeOpacity={0.8} style={{ position: 'absolute', top: scale(82), left: scale(16), zIndex: 9 }} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <View style={{
              width: scale(40), height: scale(40), borderRadius: scale(20),
              backgroundColor: 'transparent',
              alignItems: 'center', justifyContent: 'center',
            }}>
              <Ionicons name="chevron-back" size={scale(28)} color="#6D4FB8" />
            </View>
          </TouchableOpacity>

          {/* زرّ التبديل (يمين) — أيقونة: جرسٌ للإشعارات / فقاعةٌ للمحادثة */}
          <TouchableOpacity
            onPress={() => goToTab(chatTab === 'chat' ? 'cards' : 'chat')}
            activeOpacity={0.8}
            style={{ position: 'absolute', top: scale(82), right: scale(16), zIndex: 9, width: scale(40), height: scale(40), borderRadius: scale(20), backgroundColor: 'transparent', alignItems: 'center', justifyContent: 'center' }}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons name={chatTab === 'chat' ? 'notifications' : 'chatbubble'} size={scale(24)} color="#6D4FB8" />
          </TouchableOpacity>

          {/* رأس الصفحة: الأيقونة يسارًا (مستقلّة)، وإلى يمينها عمودٌ: «DCM AI» وتحته الترحيب مباشرةً */}
          <View pointerEvents="none" style={{ position: 'absolute', top: scale(74), left: 0, right: 0, alignItems: 'center', zIndex: 8 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: scale(9), transform: [{ translateX: -scale(23.5) }] }}>
              <OrbGlyph size={scale(38)} idPrefix="hdr" />
              <View style={{ alignItems: 'center' }}>
                <OutlinedText text="DCM AI" size={scale(22)} spacing={scale(1.2)} />
                <Text style={{ marginTop: scale(3), color: 'rgba(108,79,184,0.92)', fontSize: scale(12.5), fontWeight: '800' }}>
                  {(() => {
                    const n = (userName || '').trim();
                    const dr = n ? (/^د\s*\./.test(n) ? n : `د. ${n}`) : '';
                    return dr ? `مرحبًا ${dr}` : 'مرحبًا بك';
                  })()}
                </Text>
              </View>
            </View>
          </View>
        </Animated.View>

        {/* معاينة جدول من الشات — تُعرَض فوق كلّ شيء؛ يحفظ المستخدم منها مباشرةً
            (نفس صفحة معاينة المعالج Wizard). أيقونة المحادثة (أعلى يمين) تعيده
            للمحادثة للتعديل مع بقاء المعاينة، وتعود تلقائيًّا عند إغلاق المحادثة. */}
        {chatPreview && showPreview && (
          <View style={[StyleSheet.absoluteFill, { zIndex: 20 }]}>
            <LinearGradient colors={['#1E1B4B', '#312E81', '#4C1D95']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
            <PreviewView
              preview={{
                slots: chatPreview.slots,
                absences: chatPreview.absences,
                clinicCount: chatPreview.clinicCount,
                summary: chatPreview.summary,
                warnings: chatPreview.warnings,
              }}
              building={!!chatPreviewSaving}
              error={chatPreviewError ?? null}
              onSave={(slots) => onSaveChatPreview?.(slots)}
              onEdit={openChatFromPreview}
              hideEdit
            />
            {/* أيقونة المحادثة — تفتح المحادثة للتعديل (المعاينة تبقى وتعود عند الإغلاق) */}
            <TouchableOpacity
              onPress={openChatFromPreview}
              activeOpacity={0.85}
              style={{ position: 'absolute', top: scale(48), right: scale(16), zIndex: 21 }}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <LinearGradient
                colors={['#A78BFA', '#7C3AED']}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                style={{ width: scale(42), height: scale(42), borderRadius: scale(21), alignItems: 'center', justifyContent: 'center', borderWidth: scale(1), borderColor: 'rgba(255,255,255,0.3)' }}
              >
                <Ionicons name="chatbubbles" size={scale(20)} color="#fff" />
              </LinearGradient>
            </TouchableOpacity>
          </View>
        )}

      </View>
    </Modal>
  );
}
