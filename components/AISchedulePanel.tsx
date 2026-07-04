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
import { InkHub, type InkOption } from './InkHub';
import { ChatInkWater, DissolveSmoke } from './ChatDissolve';
import { GlassNavButton } from './GlassNavButton';
import { Smoke, OutlinedText, ChatInputBar, ChatBody } from './ChatChrome';
import { useSharedValue, withTiming, Easing as REasing } from 'react-native-reanimated';
import { AICardsView, countUnreadAIChat } from './AIChatModal';
import { subscribeToNotifications } from '../lib/database';
import AssistantOffers from './AssistantOffers';
import { GlassCard, CardBadge, Pill, cardStyles } from './AICard';
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
  /** تعديل رسالةٍ مشتركة (نتيجة خيار) — للتزامن مع محادثة الضغطة المطوّلة */
  onPatchMessage?: (id: string, patch: Partial<ChatMessage>) => void;
  /** بعد إجراءٍ غيّر الجدول (مسح) — لإنعاش الشبكة */
  onAfterAction?: () => void;
  isLoading?: boolean;            // shows a "typing…" bubble
  contextLabel?: string;          // small line under the header (optional)
  userName?: string;              // اسم المستخدم — للترحيب في رأس المحادثة
  user?: { id: string; name: string; role: string; clinicId?: string | null; clinicName?: string }; // لكروت الإبلاغ المشتركة
  clinicId?: string | null;       // for the create-schedule questionnaire (group names)
  onCreateSchedule?: (result: WizardResult) => void; // questionnaire finished
  openChatSignal?: number;        // bump من الأب (بعد حفظ الجدول) → افتح المحادثةَ لعرض سؤال الإبلاغ
  // معاينة جدول قادمة من الشات (الذكاء بنى معاينة) — تُعرَض فوق الصفحة، والحفظ من هنا
  chatPreview?: SchedulePreview | null;
  chatPreviewSaving?: boolean;
  chatPreviewError?: string | null;
  onSaveChatPreview?: (slots: AssignedSlot[]) => void;
  onDiscardChatPreview?: () => void;
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
// "ink in water" hub motes — colour per section (matches design/concept-ink-merged.html)
const INK_OPTIONS: InkOption[] = [
  { key: 'schedule', label: 'SCHEDULE', color: [92, 210, 205] },
  { key: 'requests', label: 'REQUESTS', color: [178, 120, 255] },
];
// schedule sub-hub — same ink-water style; حاليًّا «إنشاء» فقط (أُزيل Save/Swap)
const INK_SCHEDULE_OPTIONS: InkOption[] = [
  { key: 'create', label: 'CREATE', color: [120, 200, 150] },
];
// صفحةُ الإنشاء (3): لا موتات — نفسُ الماءِ فقط؛ موتةُ CREATE تذوبُ عند الدخولِ وتعودُ عند الخروج (كـ 1→2)
const INK_EMPTY: InkOption[] = [];
// (both home & schedule use <InkHub>)
// prototype's section easing — cubic-bezier(.22,1,.36,1) — the source of the smooth crystallize
const HUB_EASE = Easing.bezier(0.22, 1, 0.36, 1);

// بطاقات تأكيد الأسماء الغامضة — الذكاء يسأل: «من تقصد بفلان؟» ويعرض المرشّحين للنقر
type DayKey = 'sunday' | 'monday' | 'tuesday' | 'wednesday' | 'thursday';
const DAY_KEYS: DayKey[] = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday'];

// بطاقةُ توضيحٍ واحدة: تسألُ «أيّ فلان؟» (اسمٌ مكرّر) و/أو «أيّ يوم؟» (يومٌ ناقص)، وتُحَلُّ
// حين يُختارُ الطبيبُ (إن لزم) واليومُ (إن لزم). بنفسِ لغةِ كروتِ الإبلاغ (AssistantOffers):
// سطحٌ زجاجيٌّ داكن + شارةُ نوعٍ (قرار) + عنوانٌ + حبّةُ حالة، فيندمجُ في ماءِ المحادثة.
function ClarifyCard({ c, onResolve }: { c: Clarification; onResolve: (c: Clarification, doctorId: string, day: DayKey) => void }) {
  const ambiguous = c.candidates.length > 1;
  const needsDay = !!c.needsDay;
  const [docId, setDocId] = useState<string | null>(ambiguous ? null : (c.candidates[0]?.id ?? null));
  const [day, setDay] = useState<DayKey | null>(needsDay ? null : ((c.day as DayKey) ?? null));
  const done = useRef(false);
  const kindLabel = c.kind === 'permission' ? 'استئذان' : 'غياب';
  const tryResolve = (d: string | null, dy: DayKey | null) => {
    if (d && dy && !done.current) { done.current = true; onResolve(c, d, dy); }
  };
  // رقاقةٌ داكنةٌ زجاجيّة — مختارةٌ ببنفسجٍ زاهٍ، وإلّا سطحٌ شفّافٌ فاتحُ النصّ (كأزرارِ كرتِ الإبلاغ)
  const chip = (sel: boolean) => ({
    backgroundColor: sel ? 'rgba(167,139,250,0.92)' : 'rgba(255,255,255,0.08)',
    borderWidth: scale(1), borderColor: sel ? '#C4B0FF' : 'rgba(255,255,255,0.16)',
    borderRadius: scale(12), paddingHorizontal: scale(13), paddingVertical: scale(8),
  });
  return (
    <View style={{ alignSelf: 'stretch', marginTop: scale(8) }}>
      <GlassCard kind="decision" glow>
        <View style={cardStyles.head}>
          <CardBadge kind="decision" live />
          <View style={cardStyles.headTxt}>
            <Text style={cardStyles.cardTitle} numberOfLines={1}>توضيحٌ مطلوب</Text>
            <Pill kind="decision" text="يحتاج قرارك" />
          </View>
        </View>

        <View style={cardStyles.covBody}>
          <Text style={{ fontSize: scale(13.5), color: '#F4F1FF', textAlign: 'right', lineHeight: scale(21), fontWeight: '600' }}>
            «{c.mention}» — {kindLabel}
          </Text>

          {ambiguous && (
            <>
              <Text style={{ fontSize: scale(11.5), color: 'rgba(214,196,255,0.72)', textAlign: 'right', marginTop: scale(10), marginBottom: scale(6), fontWeight: '700' }}>من تقصد؟ اختر الطبيب:</Text>
              <View style={{ flexDirection: 'row-reverse', flexWrap: 'wrap', gap: scale(8) }}>
                {c.candidates.map((cand) => (
                  <TouchableOpacity key={cand.id} activeOpacity={0.85} onPress={() => { setDocId(cand.id); tryResolve(cand.id, day); }} style={chip(docId === cand.id)}>
                    <Text style={{ color: docId === cand.id ? '#1B1340' : '#EDE7FF', fontSize: scale(13), fontWeight: '700' }}>{cand.name}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </>
          )}

          {needsDay && (
            <>
              <Text style={{ fontSize: scale(11.5), color: 'rgba(214,196,255,0.72)', textAlign: 'right', marginTop: scale(12), marginBottom: scale(6), fontWeight: '700' }}>أيّ يوم؟</Text>
              <View style={{ flexDirection: 'row-reverse', flexWrap: 'wrap', gap: scale(8) }}>
                {DAY_KEYS.map((dk) => (
                  <TouchableOpacity key={dk} activeOpacity={0.85} onPress={() => { setDay(dk); tryResolve(docId, dk); }} style={chip(day === dk)}>
                    <Text style={{ color: day === dk ? '#1B1340' : '#EDE7FF', fontSize: scale(13), fontWeight: '700' }}>{DAY_AR[dk]}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </>
          )}
        </View>
      </GlassCard>
    </View>
  );
}

function ClarifyCards({ clarifications, onResolve }: {
  clarifications: Clarification[]; onResolve: (c: Clarification, doctorId: string, day: DayKey) => void;
}) {
  if (clarifications.length === 0) return null;
  // بلا رأسٍ منفصل — كلُّ بطاقةٍ قائمةٌ بذاتها (شارة + عنوان + حبّة) كما في كروتِ الإبلاغ
  return (
    <View>
      {clarifications.map((c, i) => (
        <ClarifyCard key={`${c.mention}-${c.kind}-${i}`} c={c} onResolve={onResolve} />
      ))}
    </View>
  );
}

// بطاقاتُ «طلبٌ غير مدعوم» — إعلاميّةٌ لا خطأ: تصميمٌ ناعمٌ بنفسجيٌّ زجاجيٌّ يناسبُ خلفيّةَ الصفحة
// (بدلَ الصندوقِ الأحمرِ الحادّ). رأسٌ بأيقونةِ معلومة + بطاقاتٌ زجاجيّةٌ لكلِّ طلب.
function UnsupportedCards({ items }: { items: UnsupportedRequest[] }) {
  if (items.length === 0) return null;
  return (
    <View style={{ gap: scale(9), marginBottom: scale(6) }}>
      <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: scale(8), backgroundColor: 'rgba(167,139,250,0.16)', borderWidth: scale(1), borderColor: 'rgba(167,139,250,0.42)', borderRadius: scale(14), paddingHorizontal: scale(12), paddingVertical: scale(10) }}>
        <Ionicons name="information-circle-outline" size={scale(18)} color="#C9B6FF" />
        <Text style={{ flex: 1, color: '#E7DEFF', fontSize: scale(12.5), fontWeight: '700', textAlign: 'right', lineHeight: scale(19) }}>
          هذه الطلبات خارج قدرات بناء الجدول حاليًّا — لم تُطبَّق:
        </Text>
      </View>
      {items.map((u, i) => (
        <View key={`${i}-${u.request}`} style={{ backgroundColor: 'rgba(255,255,255,0.94)', borderWidth: scale(1), borderColor: 'rgba(124,108,180,0.22)', borderRadius: scale(16), paddingHorizontal: scale(14), paddingVertical: scale(11) }}>
          <Text style={{ color: '#3A2E66', fontSize: scale(13.5), fontWeight: '700', textAlign: 'right', lineHeight: scale(21) }}>«{u.request}»</Text>
          <Text style={{ color: '#6E6592', fontSize: scale(12), fontWeight: '600', textAlign: 'right', lineHeight: scale(18), marginTop: scale(3) }}>{u.reason}</Text>
        </View>
      ))}
    </View>
  );
}

// ─── أورب المحادثة في رأس الصفحة ──────────────────────────────
// نفس شكل الأورب السابق + تأثيرات أزرار الصفحة الأخرى (توهّجٌ من الوسط + هالة +
// وميضٌ عند النقر)، لكن باللون الأبيض دائمًا (كهرمانيّ فقط متى وُجد إشعار).
function HeaderChatOrb({ alert, badge, onPress, onLight }: { alert: boolean; badge: number; onPress: () => void; onLight?: boolean }) {
  const flash = useRef(new Animated.Value(0)).current;     // 0 ساكن .. 1 ذروةُ الوميض عند النقر
  const breathe = useRef(new Animated.Value(0)).current;   // توهّجٌ حيٌّ هادئ
  useEffect(() => {
    const l = Animated.loop(Animated.sequence([
      Animated.timing(breathe, { toValue: 1, duration: 2400, easing: Easing.inOut(Easing.sin), useNativeDriver: true, isInteraction: false }),
      Animated.timing(breathe, { toValue: 0, duration: 2400, easing: Easing.inOut(Easing.sin), useNativeDriver: true, isInteraction: false }),
    ]));
    l.start();
    return () => l.stop();
  }, [breathe]);
  const onTap = () => {
    flash.stopAnimation();
    flash.setValue(0);
    Animated.sequence([
      Animated.timing(flash, { toValue: 1, duration: 150, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      Animated.timing(flash, { toValue: 0, duration: 480, easing: Easing.in(Easing.quad), useNativeDriver: true }),
    ]).start();
    onPress();
  };
  const ORB = scale(40), HALO = scale(66);
  const lightMode = !!onLight && !alert;   // فوقَ خلفيّةٍ فاتحةٍ (المعاينة): أورب/نصّ بنفسجيّ ليظهر
  const tone = alert ? '#FBBF24' : lightMode ? '#7C5CE0' : '#FFFFFF';   // لون الهالة
  const orbScale = Animated.add(
    breathe.interpolate({ inputRange: [0, 1], outputRange: [0.97, 1.04] }),
    flash.interpolate({ inputRange: [0, 1], outputRange: [0, 0.18] }),
  );
  const haloOpacity = Animated.add(
    breathe.interpolate({ inputRange: [0, 1], outputRange: [0.32, 0.48] }),
    flash.interpolate({ inputRange: [0, 1], outputRange: [0, 0.5] }),
  );
  const haloScale = Animated.add(
    breathe.interpolate({ inputRange: [0, 1], outputRange: [1, 1.05] }),
    flash.interpolate({ inputRange: [0, 1], outputRange: [0, 0.55] }),
  );
  return (
    <TouchableOpacity onPress={onTap} activeOpacity={0.85} style={{ position: 'absolute', top: scale(73), right: scale(24), zIndex: 12, alignItems: 'center' }} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
      <View style={{ width: ORB, height: ORB, alignItems: 'center', justifyContent: 'center' }}>
        {/* هالةٌ ناعمةٌ تتنفّس وتومضُ عند النقر (تتجاوز حدود الأورب) */}
        <Animated.View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', opacity: haloOpacity, transform: [{ scale: haloScale }] }}>
          <Svg width={HALO} height={HALO} viewBox="0 0 100 100">
            <Defs>
              <RadialGradient id="hdrChatHalo" cx="50%" cy="50%" r="50%">
                <Stop offset="0%" stopColor={tone} stopOpacity={0.85} />
                <Stop offset="45%" stopColor={tone} stopOpacity={0.32} />
                <Stop offset="100%" stopColor={tone} stopOpacity={0} />
              </RadialGradient>
            </Defs>
            <Circle cx={50} cy={50} r={50} fill="url(#hdrChatHalo)" />
          </Svg>
        </Animated.View>
        {/* الأورب نفسه (نفس الشكل السابق) — يكبر قليلًا لحظةَ النقر */}
        <Animated.View style={{ transform: [{ scale: orbScale }] }}>
          <OrbGlyph size={ORB} tone={lightMode ? 'purple' : 'white'} alert={alert} idPrefix="hdrChat" />
        </Animated.View>
        {/* بادج الأسماء الغامضة/الطلبات غير المدعومة */}
        {badge > 0 && (
          <View style={{ position: 'absolute', top: -scale(2), right: -scale(2), minWidth: scale(20), height: scale(20), borderRadius: scale(10), backgroundColor: '#EF4444', alignItems: 'center', justifyContent: 'center', paddingHorizontal: scale(5), borderWidth: scale(1.5), borderColor: '#fff' }}>
            <Text style={{ color: '#fff', fontSize: scale(11), fontWeight: '800' }}>{badge}</Text>
          </View>
        )}
      </View>
      <Text style={{ marginTop: scale(9), fontSize: scale(11), fontWeight: lightMode ? '800' : '300', fontFamily: Platform.select({ ios: 'Avenir Next', android: 'sans-serif-medium', default: undefined }), letterSpacing: 2.5, color: alert ? '#FBBF24' : lightMode ? '#5E4FC4' : 'rgba(255,255,255,0.9)', textShadowColor: lightMode ? 'rgba(255,255,255,0.7)' : 'rgba(0,0,0,0.7)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 6 }}>CHAT</Text>
    </TouchableOpacity>
  );
}

export function AISchedulePanel({ visible, onClose, onAction, messages, onSend, onPatchMessage, onAfterAction, isLoading, contextLabel, userName, user, clinicId, onCreateSchedule, openChatSignal, chatPreview, chatPreviewSaving, chatPreviewError, onSaveChatPreview, onDiscardChatPreview }: AISchedulePanelProps) {
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
  const chatProg = useSharedValue(0);                        // تقدّمُ ذوبانِ المحادثة (Skia): 0 مغلق .. 1 مفتوح — يقودُ دخانَ الذوبان
  const hubOp = useRef(new Animated.Value(1)).current;       // ink hub visibility (1 in home/schedule, 0 in chat/create)
  const [chatOpen, setChatOpen] = useState(false);          // the summonable slide-in chat
  const [chatTab, setChatTab] = useState<'chat' | 'cards'>('chat'); // محادثة | كروت الإبلاغ
  // عدد عناصر الذكاء التي تُبقي الأورب كهرمانيّاً (كرتٌ لم يُحَلّ أو رسالة غير مقروءة) —
  // يُلوّن أورب رأس الصفحة (أبيض/كهرمانيّ) وبادج الجرس داخل المحادثة. مرآةٌ لزرّ الأورب العائم.
  const [unread, setUnread] = useState(0);
  useEffect(() => {
    if (!user?.id) return;
    const refresh = () => { countUnreadAIChat(user.id).then(setUnread).catch(() => {}); };
    refresh();
    const unsub = subscribeToNotifications(user.id, refresh); // فوريّ + مزامنةٌ عند إعادة الاتّصال
    return unsub;
    // يُحدَّث أيضًا عند فتح اللوحة وبعد كلّ رسالة (لا عند دخول/خروج المحادثة فقط)
  }, [user?.id, chatTab, chatOpen, visible, messages.length]);
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
  const handleClarifications = (list: Clarification[]) => {
    setClarifications(list); setResolvedClar([]);
    if (list.length > 0) openSlideChat();   // يسأل فورًا (كالتنبيه) بدل الاكتفاءِ بالبادج
  };
  const resolveClar = (c: Clarification, doctorId: string, day: DayKey) => {
    setResolvedClar((prev) => [...prev, { clar: c, doctorId, day }]);
    setClarifications((prev) => prev.filter((x) => x !== c));   // بالهُويّةِ لا بالحقول (قد يتكرّر الاسم/اليوم)
  };
  // طلبات غير مدعومة: يفتح الذكاء الجات ويشرحها (إعلاميّ، لا يمنع الحفظ)
  const [unsupported, setUnsupported] = useState<UnsupportedRequest[]>([]);
  const handleUnsupported = (list: UnsupportedRequest[]) => {
    setUnsupported(list);
    if (list.length > 0) openSlideChat();
  };
  const [view, setView] = useState<'home' | 'schedule' | 'chat' | 'create'>('home');
  const [hubPulse, setHubPulse] = useState(0);              // bump → InkHub plays a smoky dissolve (screen returns)
  const [createKey, setCreateKey] = useState(0);             // bump → remount WizardContent (fresh state)
  const [createMounted, setCreateMounted] = useState(false); // المعالج مُركَّبٌ؟ — يبقى أثناء تلاشي العودة (مفصولٌ عن view) فلا يتأخّرُ زرُّ العودة
  const [wizardInPreview, setWizardInPreview] = useState(false); // المعالجُ في طورِ المعاينة (خلفيّةٌ فاتحة) → زرُّ الجات بنفسجيٌّ ليظهر
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

  const transitioningRef = useRef(false);   // reset by playOpen

  // ONE persistent water tank: نفسُ الماءِ يبقى ظاهرًا عبر home⇄schedule⇄create (الموتات تتحوّلُ
  // مكانَها، وفي الإنشاءِ تُفرَّغُ الموتاتُ ويبقى الماءُ ومدارُ الإنشاءِ المُضمَّنُ فوقَه) — لا تبديلَ صفحة.
  // يتلاشى الماءُ فقط حين تُغطّيه المحادثةُ (chat).
  useEffect(() => {
    const inHub = view === 'home' || view === 'schedule' || view === 'create';
    Animated.timing(hubOp, { toValue: inHub ? 1 : 0, duration: 520, easing: HUB_EASE, useNativeDriver: true }).start();
  }, [view, hubOp]);

  // HOME ⇄ SCHEDULE — switch the mote-set; InkHub blooms→unfurls forward, dissolves→reforms back
  const goSchedule = () => { if (view === 'schedule') return; Keyboard.dismiss(); setView('schedule'); };
  const goHome = () => { if (view === 'home') return; Keyboard.dismiss(); setView('home'); };

  const revealChat = () => {
    setView('chat');
    Animated.timing(chatOp, { toValue: 1, duration: 520, easing: HUB_EASE, useNativeDriver: true }).start();
  };
  const goChat = () => { if (view === 'chat') return; Keyboard.dismiss(); revealChat(); };
  // SCHEDULE action (save/swap) → run it (parent seeds the message) then open chat
  const goChatFromAction = (key: PanelAction) => { Keyboard.dismiss(); onAction(key); revealChat(); };
  // CHAT → HOME (back button) — crossfade the hub IN as chat fades OUT (parallel, same easing) so
  // there's no bare two-stage handoff; the dark backdrop (hubOp) rises with it.
  const backFromChat = () => {
    if (view !== 'chat') return;
    Keyboard.dismiss();
    Animated.parallel([
      Animated.timing(hubOp, { toValue: 1, duration: 430, easing: HUB_EASE, useNativeDriver: true }),
      Animated.timing(chatOp, { toValue: 0, duration: 430, easing: HUB_EASE, useNativeDriver: true }),
    ]).start(() => { setView('home'); setHubPulse((p) => p + 1); });
  };

  // CREATE enter/return — SAME animation both ways (symmetric crossfade in the same dark water,
  // no scale/page-swap). hubOp & wizardOp cross at 520ms HUB_EASE; the dark backdrop stays opaque.
  // CREATE forward — مطابقٌ لانتقالِ 1→2 تمامًا: نفسُ ماءِ InkHub يبقى أرضيّةً (hubOp=1)، وتُفرَّغُ
  // الموتاتُ (CREATE→[]) فتذوبُ موتةُ CREATE بآليّةِ InkHub نفسِها (وميضُ النقر + ذوبان)، ثُمّ ينشأُ
  // مدارُ الإنشاءِ المُضمَّنُ (بلا ماءٍ خاصّ) فوقَ نفسِ الماءِ ببطءٍ وهدوء — لا صفحةٌ جديدةٌ ولا خلفيّةٌ تتغيّر.
  const revealCreate = () => {
    setCreateKey((k) => k + 1);   // fresh wizard state each open
    setCreateMounted(true);
    setView('create');            // InkHub: الموتاتُ → [] (تذوبُ CREATE) | hubOp يبقى 1 (نفسُ الماء)
    wizardOp.setValue(0);
    Animated.sequence([
      Animated.delay(180),        // دَعِ موتةَ CREATE تذوب أوّلًا
      Animated.timing(wizardOp, { toValue: 1, duration: 560, easing: HUB_EASE, useNativeDriver: true }),   // ثُمّ تنشأُ الفاسيتاتُ فوقَ نفسِ الماء
    ]).start();
  };
  // SCHEDULE "Create" → open the questionnaire
  const goCreate = () => { Keyboard.dismiss(); revealCreate(); };
  // CREATE → back = نفسُ عودةِ 2→1: مدارُ الإنشاءِ يذوبُ كاشفًا نفسَ الماء، وموتةُ CREATE تعودُ
  // بآليّةِ InkHub ([]→CREATE، إعادةُ تشكّل). والانتقالُ لـ schedule فورًا يُركِّبُ زرَّ العودةِ بلا تأخّر.
  const backFromCreate = () => {
    if (view !== 'create') return;
    Keyboard.dismiss();
    setView('schedule');          // InkHub: [] → CREATE (تعودُ الموتةُ متشكّلةً) | hubOp يبقى 1
    Animated.timing(wizardOp, { toValue: 0, duration: 460, easing: HUB_EASE, useNativeDriver: true })
      .start(({ finished }) => { if (finished) setCreateMounted(false); });
  };
  // CREATE finished → hand the result up, then return to the schedule hub (same continuous-water return)
  const finishCreate = (result: WizardResult) => {
    onCreateSchedule?.(result);
    setView('schedule');
    Animated.timing(wizardOp, { toValue: 0, duration: 460, easing: HUB_EASE, useNativeDriver: true })
      .start(({ finished }) => { if (finished) setCreateMounted(false); });
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
      Animated.timing(chatSlide, { toValue: 1, duration: 560, easing: Easing.inOut(Easing.cubic), useNativeDriver: true }).start();
      chatProg.value = withTiming(1, { duration: 560, easing: REasing.inOut(REasing.cubic) });   // دخانُ الذوبان (Skia)
    }));
  };
  const closeSlideChat = () => {
    Keyboard.dismiss();
    // «طلبات غير مدعومة» إعلاميّةٌ لمرّة واحدة: تختفي عند العودة (ولا تُبقي أثرًا على الزرّ).
    setUnsupported([]);
    // أعِد الصفحة الرئيسيّة لمكانها فورًا (مخفيٌّ خلف الدُّرج المنزلق) كي لا تبقى منزاحةً إن أُغلق من تبويب الكروت
    pageAnim.setValue(0); pageBase.current = 0; setChatTab('chat');
    chatProg.value = withTiming(0, { duration: 460, easing: REasing.inOut(REasing.cubic) });   // دخانُ الذوبان (Skia)
    Animated.timing(chatSlide, { toValue: 0, duration: 460, easing: Easing.inOut(Easing.cubic), useNativeDriver: true })
      .start(() => {
        setChatOpen(false);
        // إن فُتِحت المحادثة من المعاينة → أعِد المعاينة عند إغلاقها
        if (reopenPreviewRef.current && chatPreview) {
          reopenPreviewRef.current = false;
          setShowPreview(true);
        }
      });
  };

  // إشارةُ فتحِ المحادثةِ من الأب (بعد حفظ الجدول) → افتح المحادثةَ لعرضِ بطاقةِ سؤالِ الإبلاغ.
  // تأخيرٌ صغيرٌ كي يهدأَ انتقالُ العودةِ من الإنشاء (لئلّا تتصادمَ الحركتان)، ولا نفتحُ إن كانت مفتوحةً أصلًا.
  const prevOpenChatSig = useRef(openChatSignal ?? 0);
  useEffect(() => {
    const sig = openChatSignal ?? 0;
    if (sig === prevOpenChatSig.current) return;
    prevOpenChatSig.current = sig;
    if (sig <= 0) return;
    const wasOpen = chatOpen;
    const t = setTimeout(() => { if (!wasOpen) openSlideChat(); }, 650);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openChatSignal]);

  // OPEN — خروج المارد: الصفحة كلّها تنبثق من الأيقونة (أسفل-يمين)، تكبُر وتصعد كالدخان
  // حتّى تملأ الشاشة، ثمّ يظهر المحتوى. (العقدة/الخيوط القديمة مُعطَّلة.)
  const playOpen = () => {
    closingRef.current = false;
    transitioningRef.current = false;
    setView('home'); sub.setValue(0); chatOp.setValue(0); wizardOp.setValue(0);
    chatSlide.setValue(0); chatProg.value = 0; setChatOpen(false); setCreateMounted(false); setWizardInPreview(false); setClarifications([]); setResolvedClar([]); setUnsupported([]);
    hubOp.setValue(1);   // ink hub: shown
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
          {/* خلفيّةُ المحادثة: ماءٌ حبريٌّ غامقٌ (بنفسجيّ) عبر Skia — مطابقٌ للبروتوتايب (توهّجٌ علويّ + دخان + ذرّات).
              تُركَّب مع chatOpen (قبل بدء الحركة بإطارين) فتكون حاضرةً أثناء الذوبان.
              + الإضاءاتُ الدخانيّةُ الناعمةُ (Smoke) نفسُها التي في الصفحةِ الرئيسيّة، فوقَ الماءِ — لتظهرَ «الإضاءات» في الجات أيضًا. */}
          <View style={[StyleSheet.absoluteFill, { backgroundColor: '#130b30' }]} />
          {chatOpen && <ChatInkWater prog={chatProg} />}
          {chatOpen && <Smoke />}
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
            // الصفحةُ تذوبُ دخانيًّا: تخفُت + تكبُر قليلًا + تطفو لأعلى (لا بطاقةٌ جانبيّة)
            {
              opacity: chatSlide.interpolate({ inputRange: [0, 0.62, 1], outputRange: [1, 0, 0] }),
              transform: [
                { scale: chatSlide.interpolate({ inputRange: [0, 1], outputRange: [1, 1.08] }) },
                { translateY: chatSlide.interpolate({ inputRange: [0, 1], outputRange: [0, -scale(42)] }) },
              ],
            },
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

          {/* dark backdrop — stays opaque across home/schedule/create (the ink water world) so the
              old light page never flashes during transitions; only chat (its own light bg) lets it fade. */}
          <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: '#0a0720', opacity: Animated.add(hubOp, wizardOp).interpolate({ inputRange: [0, 1], outputRange: [0, 1], extrapolate: 'clamp' }) }]} />
          {/* ONE persistent ink-water hub — home & schedule share the SAME water; the mote-set
              transitions IN PLACE (no page swap). Forward = bloom→unfurl; back = smoky dissolve. */}
          <Animated.View
            style={[StyleSheet.absoluteFill, { opacity: hubOp }]}
            pointerEvents={view === 'home' || view === 'schedule' ? 'auto' : 'none'}
          >
            <InkHub
              options={view === 'schedule' ? INK_SCHEDULE_OPTIONS : view === 'create' ? INK_EMPTY : INK_OPTIONS}
              active={(view === 'home' || view === 'schedule' || view === 'create') && !chatOpen}
              pulse={hubPulse}
              onSelect={(k) => {
                if (k === 'schedule') goSchedule();
                else if (k === 'create') goCreate();
                // 'requests': الزرُّ موجودٌ لكنّه بلا فعلٍ عند النقر حاليًّا (قيدُ الإنجاز)
              }}
            />
          </Animated.View>

          {/* CHAT view: scrollable bubbles + answer chips (the input bar below is shared & always shown) */}
          <Animated.View style={[StyleSheet.absoluteFill, { opacity: chatOp, transform: [{ scale: chatOp.interpolate({ inputRange: [0, 1], outputRange: [0.62, 1] }) }] }]} pointerEvents={view === 'chat' ? 'auto' : 'none'}>
            {!!contextLabel && (
              <Text style={{ position: 'absolute', top: scale(56), left: 0, right: 0, textAlign: 'center', color: 'rgba(214,196,255,0.6)', fontSize: scale(12), fontWeight: '600' }}>
                {contextLabel}
              </Text>
            )}
            <ChatBody
              messages={messages}
              isLoading={isLoading}
              onSend={onSend}
              user={user}
              clinicId={clinicId}
              onPatchMessage={onPatchMessage}
              onAfterAction={onAfterAction}
              style={{ position: 'absolute', top: scale(84), left: 0, right: 0, bottom: scale(94) }}
            />

            {/* back to home */}
            <TouchableOpacity onPress={backFromChat} style={{ position: 'absolute', top: scale(46), left: scale(16), padding: scale(8), zIndex: 9 }} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Ionicons name="chevron-back" size={scale(30)} color="rgba(255,255,255,0.7)" />
            </TouchableOpacity>
          </Animated.View>

          {/* CREATE — مدارُ الإنشاءِ المُضمَّنُ فوقَ نفسِ ماءِ InkHub (بلا ماءٍ خاصّ): يكبُرُ قليلًا وهو
              يظهرُ (كتشكُّلِ الموتة) ويصغُرُ وهو يذوبُ — فتظهرُ أزرارُه «كظهورِ زرِّ CREATE» على نفسِ الخلفيّة. */}
          <Animated.View
            style={[StyleSheet.absoluteFill, {
              opacity: wizardOp,
              transform: [{ scale: wizardOp.interpolate({ inputRange: [0, 1], outputRange: [0.93, 1] }) }],
            }]}
            pointerEvents={view === 'create' ? 'auto' : 'none'}
          >
            {createMounted && (
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
                onPreviewChange={setWizardInPreview}
              />
            )}
          </Animated.View>

          {/* bottom chat input — only in the orbit chat view (home/schedule use the slide-in chat) */}
          {view === 'chat' && <ChatInputBar onSend={onSend} />}

          {/* close (×) on home only */}
          {view === 'home' && (
            <View style={{ position: 'absolute', top: scale(80), left: scale(20), zIndex: 9 }}>
              <GlassNavButton icon="close" idPrefix="navClose" onPress={beginClose} iconSize={scale(22)} />
            </View>
          )}
          {/* back (‹) on schedule */}
          {view === 'schedule' && (
            <View style={{ position: 'absolute', top: scale(80), left: scale(16), zIndex: 9 }}>
              <GlassNavButton icon="chevron-back" idPrefix="navBackSch" onPress={goHome} iconSize={scale(26)} nudge={-scale(2)} />
            </View>
          )}

          {/* top-right AI icon — summons the chat from any view (hidden only in orbit chat view).
              يبقى مُركَّبًا داخل طبقة الصفحة فيذوبُ معها فتحًا ويعودُ معها فورَ بدء الإغلاق
              (لا ينتظرُ نهايةَ الحركة كي لا يُحَسَّ تأخّرٌ/lag عند العودة من المحادثة).
              أورب صغير: أبيض عاديًّا، كهرمانيّ متى وُجد كرتٌ لم يُحَلّ أو رسالة غير مقروءة. */}
          {view !== 'chat' && (
            <HeaderChatOrb alert={unread > 0} badge={clarifications.length} onPress={openSlideChat} onLight={wizardInPreview} />
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
          style={[StyleSheet.absoluteFill, {
            opacity: chatSlide.interpolate({ inputRange: [0, 0.42, 1], outputRange: [0, 0, 1] }),
            transform: [{ scale: chatSlide.interpolate({ inputRange: [0, 1], outputRange: [0.965, 1] }) }],
          }]}
        >
          {/* المسار الأفقيّ [المحادثة | الكروت] — ينزلق بزرّ التبديل فقط (لا سحب) */}
          <View style={StyleSheet.absoluteFill}>
            <Animated.View style={{ flexDirection: 'row', width: W * 2, height: '100%', transform: [{ translateX: pageAnim }] }}>
              {/* صفحة المحادثة */}
              <View style={{ width: W, height: '100%' }}>
                {(unsupported.length > 0 || clarifications.length > 0) ? (
                  // استثناءُ التنبيه/التوضيح: يظهرُ وحدَه (بلا رسائلِ المحادثة) مُلتصقًا فوقَ خانةِ الإدخال.
                  <ScrollView
                    style={{ position: 'absolute', top: scale(132), left: 0, right: 0, bottom: scale(94) }}
                    contentContainerStyle={{ flexGrow: 1, justifyContent: 'flex-end', paddingHorizontal: scale(14), paddingBottom: scale(8) }}
                    showsVerticalScrollIndicator={false}
                  >
                    <UnsupportedCards items={unsupported} />
                    <ClarifyCards clarifications={clarifications} onResolve={resolveClar} />
                  </ScrollView>
                ) : (
                  <ChatBody
                    messages={messages}
                    isLoading={isLoading}
                    onSend={onSend}
                    user={user}
                    clinicId={clinicId}
                    onPatchMessage={onPatchMessage}
                    onAfterAction={onAfterAction}
                    style={{ position: 'absolute', top: scale(132), left: 0, right: 0, bottom: scale(94) }}
                  />
                )}
                {/* الكتابةُ تُزيلُ التنبيهَ وتُظهِرُ المحادثةَ (استثناءُ التنبيه مؤقّت) */}
                <ChatInputBar onSend={(t: string) => { if (unsupported.length) setUnsupported([]); onSend(t); }} />
              </View>
              {/* صفحة الكروت — نفس الخلفيّة */}
              <View style={{ width: W, height: '100%' }}>
                <View style={{ position: 'absolute', top: scale(132), left: 0, right: 0, bottom: 0 }}>
                  {user && <AICardsView user={user} clinicId={clinicId ?? user.clinicId} />}
                </View>
              </View>
            </Animated.View>
          </View>

          {/* سهم العودة (يسار) — فوق المسار — زرٌّ زجاجيٌّ مصقول */}
          <View style={{ position: 'absolute', top: scale(82), left: scale(16), zIndex: 9 }}>
            <GlassNavButton icon="chevron-back" idPrefix="navBackChat" onPress={closeSlideChat} iconSize={scale(26)} nudge={-scale(2)} />
          </View>

          {/* زرّ التبديل (يمين) — أيقونة: جرسٌ للإشعارات / فقاعةٌ للمحادثة */}
          <TouchableOpacity
            onPress={() => goToTab(chatTab === 'chat' ? 'cards' : 'chat')}
            activeOpacity={0.8}
            style={{ position: 'absolute', top: scale(82), right: scale(16), zIndex: 9, width: scale(40), height: scale(40), borderRadius: scale(20), backgroundColor: 'transparent', alignItems: 'center', justifyContent: 'center' }}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons name={chatTab === 'chat' ? 'notifications' : 'chatbubble'} size={scale(25)} color="#EBDBFF" style={{ textShadowColor: 'rgba(168,85,247,0.95)', textShadowOffset: { width: 0, height: 0 }, textShadowRadius: scale(11) }} />
            {/* بادج كهرمانيّ بعدد الكروت غير المقروءة/غير المحلولة — على الجرس داخل المحادثة فقط */}
            {chatTab === 'chat' && unread > 0 && (
              <View style={{ position: 'absolute', top: -scale(3), right: -scale(3), minWidth: scale(18), height: scale(18), borderRadius: scale(9), backgroundColor: '#F59E0B', alignItems: 'center', justifyContent: 'center', paddingHorizontal: scale(4), borderWidth: scale(1.5), borderColor: '#fff' }}>
                <Text style={{ color: '#fff', fontSize: scale(10.5), fontWeight: '800' }}>{unread}</Text>
              </View>
            )}
          </TouchableOpacity>

          {/* رأس الصفحة: عمودٌ متوسّط: «DCM AI» وتحته الترحيب مباشرةً (أُزيلت الأيقونةُ المجاورة) */}
          <View pointerEvents="none" style={{ position: 'absolute', top: scale(74), left: 0, right: 0, alignItems: 'center', zIndex: 8 }}>
            <OutlinedText text="DCM AI" size={scale(22)} spacing={scale(1.2)} color="#F4ECFF" outline="rgba(138,99,230,0.85)" glow="rgba(168,85,247,0.95)" />
            <Text style={{ marginTop: scale(3), color: 'rgba(222,208,255,0.92)', fontSize: scale(12.5), fontWeight: '800' }}>
              {(() => {
                const n = (userName || '').trim();
                const dr = n ? (/^د\s*\./.test(n) ? n : `د. ${n}`) : '';
                return dr ? `مرحبًا ${dr}` : 'مرحبًا بك';
              })()}
            </Text>
          </View>
        </Animated.View>

        {/* دخانُ الذوبان — طبقةٌ علويّةٌ تومضُ وسطَ الانتقال (فتحًا وإغلاقًا) فيبدو أنّ كلَّ شيءٍ يذوبُ دخانيًّا (Skia) */}
        {chatOpen && <DissolveSmoke prog={chatProg} />}

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
