import React, { useEffect, useMemo, useRef } from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';
import {
  Canvas, Picture, createPicture, Skia, BlendMode, TileMode, PaintStyle,
  type SkCanvas,
} from '@shopify/react-native-skia';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useSharedValue, useDerivedValue, useFrameCallback, useAnimatedStyle, runOnJS, type SharedValue } from 'react-native-reanimated';

// ════════════════════════════════════════════════════════════════════
// InkHub — the "ink in water" AI hub, ported from design/concept-ink-merged.html
// using Skia's imperative createPicture. ONE persistent water tank: the mote-set
// transitions IN PLACE so the background never swaps (matches the prototype):
//   • forward (tap a mote)  → ink blooms toward it + a bright flash, then the new
//     mote-set UNFURLS in (no page swap).
//   • back / return         → a smoky ink DISSOLVE, then the mote-set reforms.
//   • `pulse` prop bump      → a smoky dissolve only (for returning from a screen).
// Motes are orb-style petal bursts placed by phyllotaxis; the finger is a
// pressure + focus field. Positions are stable.
// ════════════════════════════════════════════════════════════════════

export type InkOption = { key: string; label: string; color: [number, number, number] };

type Mote = {
  hx: number; hy: number; x: number; y: number; vx: number; vy: number;
  d: number; w: number; rotB: number; rotS: number; swph: number;
  r: number; g: number; b: number;
};
type Col = { r: number; g: number; b: number };
type Puff = { x: number; y: number; ang: number; sp: number; curl: number; life: number; sz: number; born: number; r: number; g: number; b: number };

const GA = Math.PI * (3 - Math.sqrt(5));
const TAU = Math.PI * 2;
const KB = 0.5523;
const PET = 12;
const LEN = [1.14, 0.70, 1.06, 0.64, 1.20, 0.82, 0.70, 1.12, 0.76, 1.16, 0.66, 0.96];
const BLOOM_MS = 650;         // tap-bloom (ink condenses on the mote) before nav
const DISSOLVE_MS = 480;      // smoky fade-out of the old set on return
const FORM_MS = 600;          // unfurl-in of the new set

function rnd(i: number) { const x = Math.sin(i * 127.1) * 43758.5453; return x - Math.floor(x); }

// build motes from just colours — a worklet so the UI thread can reform mid-transition
function buildMotesC(cols: Col[], W: number, H: number): Mote[] {
  'worklet';
  const n = cols.length;
  const cx = 0.5, cy = 0.46, ax = 0.34, ay = 0.34;
  const arr: Mote[] = [];
  for (let i = 0; i < n; i++) {
    // زرٌّ واحدٌ فقط ⇒ ضَعْه في وسطِ الحوضِ تمامًا (fr=0)، لا في الأعلى
    const fr = n === 1 ? 0 : Math.sqrt((i + 0.5) / n);
    const th = i * GA - Math.PI / 2;
    const hx = cx + Math.cos(th) * fr * ax;
    const hy = cy + Math.sin(th) * fr * ay * 1.18;
    let d = 0.18 + fr * 0.62 + (i % 2) * 0.05; if (d > 0.92) d = 0.92;
    const c = cols[i];
    arr.push({
      hx, hy, x: hx * W, y: hy * H, vx: 0, vy: 0, d, w: 0,
      rotB: (i * 1.37) % TAU, rotS: (0.00004 + (i % 3) * 0.00002) * (i % 2 ? -1 : 1),
      swph: (i * 2.4) % TAU, r: c.r, g: c.g, b: c.b,
    });
  }
  return arr;
}
// smoky burst spawned from the current motes (the "return"/dissolve cloud)
function spawnDissolve(arr: Mote[]): Puff[] {
  'worklet';
  const n = arr.length;
  if (n === 0) return [];
  const per = Math.max(5, Math.floor(58 / n));
  const ps: Puff[] = [];
  for (let i = 0; i < n; i++) {
    const m = arr[i];
    for (let k = 0; k < per; k++) {
      const a = Math.random() * TAU;
      ps.push({ x: m.x + (Math.random() - 0.5) * 44, y: m.y + (Math.random() - 0.5) * 44, ang: a, sp: 0.2 + Math.random() * 0.8, curl: (Math.random() - 0.5) * 2.2, life: 0, sz: 8 + Math.random() * 22, born: Math.random() * 0.3, r: m.r, g: m.g, b: m.b });
    }
  }
  return ps;
}

// ---- worklet draw helpers ----
function rgba(r: number, g: number, b: number, a: number) {
  'worklet';
  return Skia.Color(`rgba(${Math.round(r)},${Math.round(g)},${Math.round(b)},${a})`);
}
function lighten(r: number, g: number, b: number, t: number) {
  'worklet';
  return [r + (255 - r) * t, g + (255 - g) * t, b + (255 - b) * t];
}
function darken(r: number, g: number, b: number, t: number) {
  'worklet';
  return [r * (1 - t), g * (1 - t), b * (1 - t)];
}
function burstPath(cx: number, cy: number, ro: number, hw: number, rot: number) {
  'worklet';
  const path = Skia.Path.Make();
  for (let i = 0; i < PET; i++) {
    const aT = rot + (i / PET) * TAU, L = ro * LEN[i % LEN.length];
    const ax = Math.cos(aT), ay = Math.sin(aT), pxx = -Math.sin(aT), pyy = Math.cos(aT);
    path.moveTo(cx, cy);
    path.cubicTo(cx + ax * (L * 0.45) + pxx * (hw * 0.35), cy + ay * (L * 0.45) + pyy * (hw * 0.35), cx + ax * (L * 0.70) + pxx * hw, cy + ay * (L * 0.70) + pyy * hw, cx + ax * L + pxx * hw, cy + ay * L + pyy * hw);
    path.cubicTo(cx + ax * (L + hw * KB) + pxx * hw, cy + ay * (L + hw * KB) + pyy * hw, cx + ax * (L + hw) + pxx * (hw * KB), cy + ay * (L + hw) + pyy * (hw * KB), cx + ax * (L + hw), cy + ay * (L + hw));
    path.cubicTo(cx + ax * (L + hw) - pxx * (hw * KB), cy + ay * (L + hw) - pyy * (hw * KB), cx + ax * (L + hw * KB) - pxx * hw, cy + ay * (L + hw * KB) - pyy * hw, cx + ax * L - pxx * hw, cy + ay * L - pyy * hw);
    path.cubicTo(cx + ax * (L * 0.70) - pxx * hw, cy + ay * (L * 0.70) - pyy * hw, cx + ax * (L * 0.45) - pxx * (hw * 0.35), cy + ay * (L * 0.45) - pyy * (hw * 0.35), cx, cy);
    path.close();
  }
  return path;
}

// a single white label that FOLLOWS its mote (UI thread); fades with the transition
function InkLabel({ motes, bloomOn, moteFade, phase, index, label, font }: {
  motes: SharedValue<Mote[]>; bloomOn: SharedValue<number>; moteFade: SharedValue<number>; phase: SharedValue<number>;
  index: number; label: string; font: string | undefined;
}) {
  const style = useAnimatedStyle(() => {
    const m = motes.value[index];
    if (!m) return { opacity: 0, transform: [{ translateX: 0 }, { translateY: 0 }] };
    const off = 26 + (1 - m.d) * 14;
    const grp = phase.value === 1 ? 0 : moteFade.value;   // hidden while dissolving
    return { opacity: bloomOn.value === 1 ? 0 : grp * 0.92, transform: [{ translateX: m.x }, { translateY: m.y + off }] };
  });
  return (
    <Animated.View pointerEvents="none" style={[{ position: 'absolute', left: -70, top: -8, width: 140, alignItems: 'center' }, style]}>
      <Text style={{ color: 'rgba(255,255,255,0.92)', fontFamily: font, fontWeight: '300', fontSize: 12.5, letterSpacing: 3, textShadowColor: 'rgba(0,0,0,0.75)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 8 }}>
        {label.toUpperCase()}
      </Text>
    </Animated.View>
  );
}

export function InkHub({ options, active, onSelect, pulse }: {
  options: InkOption[];
  active: boolean;
  onSelect: (key: string) => void;
  pulse?: number;     // bump this to play a smoky dissolve only (returning from a screen)
}) {
  const W = useSharedValue(0), H = useSharedValue(0);
  const time = useSharedValue(0);
  const px = useSharedValue(0), py = useSharedValue(0), down = useSharedValue(0);
  const focusIdx = useSharedValue(-1), hold = useSharedValue(0);
  const activeSV = useSharedValue(active ? 1 : 0);
  const motes = useSharedValue<Mote[]>([]);
  // tap-bloom state
  const bloomOn = useSharedValue(0), bloomT = useSharedValue(0), bloomIdx = useSharedValue(-1), bloomNav = useSharedValue(0);
  const puffs = useSharedValue<Puff[]>([]);
  // transition state — phase 0 idle | 1 dissolving | 2 forming; moteFade 0..1 group alpha
  const optsSV = useSharedValue<Col[]>([]);
  const cmd = useSharedValue(0);          // 1 forward-reform | 2 back-dissolve | 3 pulse-smoke
  const phase = useSharedValue(0), phaseT = useSharedValue(0), moteFade = useSharedValue(1);

  const keysArr = useMemo(() => options.map((o) => o.key), [options]);
  const keys = useMemo(() => keysArr.join('|'), [keysArr]);
  const prevKeys = useRef<string | null>(null);
  const prevPulse = useRef(pulse ?? 0);

  const silt = useMemo(() => {
    const a: { x: number; y: number; s: number; v: number; ph: number }[] = [];
    // calm/slow drift — matches the prototype
    for (let i = 0; i < 46; i++) a.push({ x: rnd(i), y: rnd(i + 9), s: 0.4 + rnd(i + 3) * 1.3, v: 0.0000036 + rnd(i + 5) * 0.0000108, ph: rnd(i + 7) * 6.28 });
    return a;
  }, []);
  const smoke = useMemo(() => {
    const a: { ph: number; r: number; sp: number }[] = [];
    for (let i = 0; i < 4; i++) a.push({ ph: rnd(i * 5 + 1) * 6.28, r: 0.34 + rnd(i * 5 + 3) * 0.20, sp: 0.6 + rnd(i * 5 + 4) * 0.8 });
    return a;
  }, []);

  useEffect(() => { activeSV.value = active ? 1 : 0; }, [active, activeSV]);

  const cols = useMemo<Col[]>(() => options.map((o) => ({ r: o.color[0], g: o.color[1], b: o.color[2] })), [options]);

  // ---- option-set change → in-place transition (no page swap) ----
  useEffect(() => {
    optsSV.value = cols;
    const w = W.value, h = H.value;
    if (prevKeys.current === null) {
      prevKeys.current = keys;
      if (w > 0 && h > 0) { motes.value = buildMotesC(cols, w, h); phase.value = 0; moteFade.value = 1; }
      return;
    }
    if (prevKeys.current === keys) return;
    prevKeys.current = keys;
    // forward iff a bloom is in flight (the user tapped a mote here); else it's a return
    cmd.value = bloomOn.value === 1 ? 1 : 2;
  }, [keys, cols, optsSV, motes, phase, moteFade, cmd, bloomOn, W, H]);

  // ---- pulse → smoky dissolve only (screen return) ----
  useEffect(() => {
    const p = pulse ?? 0;
    if (p !== prevPulse.current) { prevPulse.current = p; if (p > 0) cmd.value = 3; }
  }, [pulse, cmd]);

  const rebuild = (w: number, h: number) => {
    if (w <= 0 || h <= 0) return;
    if (motes.value.length === 0) { motes.value = buildMotesC(cols, w, h); prevKeys.current = keys; }
    if (px.value === 0) { px.value = w / 2; py.value = h / 2; }
  };

  // ---- physics + focus + bloom + transitions (UI thread) ----
  const fc = useFrameCallback((info) => {
    'worklet';
    const w = W.value, h = H.value;
    if (w === 0 || h === 0) return;
    const dt = Math.min(40, info.timeSincePreviousFrame ?? 16);
    time.value += dt;
    let arr = motes.value;
    let n = arr.length;

    // ---- consume a command from JS ----
    const c = cmd.value;
    if (c !== 0) {
      if (c === 1) {                       // forward: condensed ink UNFURLS into the new set
        motes.value = buildMotesC(optsSV.value, w, h);
        arr = motes.value; n = arr.length;
        phase.value = 2; phaseT.value = 0; moteFade.value = 0; bloomOn.value = 0;
      } else if (c === 2) {                // back: smoky DISSOLVE, then reform at dissolve-end
        puffs.value = spawnDissolve(arr);
        phase.value = 1; phaseT.value = 0; bloomOn.value = 0;
      } else if (c === 3) {                // pulse: smoke only (returning from a screen)
        puffs.value = spawnDissolve(arr);
      }
      cmd.value = 0;
    }

    // ---- transition phase advance ----
    if (phase.value === 1) {              // dissolving (fade old out)
      phaseT.value += dt;
      const p = Math.min(1, phaseT.value / DISSOLVE_MS);
      moteFade.value = 1 - p;
      if (p >= 1) {
        motes.value = buildMotesC(optsSV.value, w, h);
        arr = motes.value; n = arr.length;
        phase.value = 2; phaseT.value = 0; moteFade.value = 0;
      }
    } else if (phase.value === 2) {       // forming (fade new in)
      phaseT.value += dt;
      const p = Math.min(1, phaseT.value / FORM_MS);
      moteFade.value = p;
      if (p >= 1) { phase.value = 0; moteFade.value = 1; }
    } else if (moteFade.value < 1) {
      moteFade.value = Math.min(1, moteFade.value + dt / 300);
    }

    // ---- bloom timer (forward tap) ----
    if (bloomOn.value === 1) {
      bloomT.value += dt;
      const prog = Math.min(1, bloomT.value / BLOOM_MS);
      if (prog >= 0.6 && bloomNav.value === 0 && bloomIdx.value >= 0 && bloomIdx.value < keysArr.length) {
        bloomNav.value = 1; runOnJS(onSelect)(keysArr[bloomIdx.value]);
      }
      if (prog >= 1) bloomOn.value = 0;
    }

    // ---- puff advance (bloom converge OR dissolve smoke) ----
    if (puffs.value.length) {
      const pulling = bloomOn.value === 1;
      const bi = bloomIdx.value;
      const tx = (pulling && bi >= 0 && bi < n) ? arr[bi].x : 0;
      const ty = (pulling && bi >= 0 && bi < n) ? arr[bi].y : 0;
      const prog = pulling ? Math.min(1, bloomT.value / BLOOM_MS) : 1;
      const ps = puffs.value; const out: Puff[] = [];
      for (let i = 0; i < ps.length; i++) {
        const p = ps[i];
        if (p.born > 0) { out.push({ x: p.x, y: p.y, ang: p.ang, sp: p.sp, curl: p.curl, life: p.life, sz: p.sz, born: p.born - dt * 0.001, r: p.r, g: p.g, b: p.b }); continue; }
        const life = p.life + dt * 0.0012;
        if (life >= 1) continue;
        const ang = p.ang + p.curl * dt * 0.0008;
        const spd = p.sp * dt * 0.03 * (1 - life * 0.4);
        let x = p.x + Math.cos(ang) * spd, y = p.y + Math.sin(ang) * spd - dt * 0.004;
        if (pulling) { const k = prog < 0.5 ? 0.012 : (0.06 + (prog - 0.5) * 0.24); x += (tx - x) * k; y += (ty - y) * k; }
        out.push({ x, y, ang, sp: p.sp, curl: p.curl, life, sz: p.sz, born: 0, r: p.r, g: p.g, b: p.b });
      }
      puffs.value = out;
    }

    // ---- focus + spring physics ----
    const act = down.value === 1 && bloomOn.value === 0 && phase.value === 0;
    const fx = px.value, fy = py.value;
    let fi = -1, fd = 1e9;
    if (act) {
      for (let i = 0; i < n; i++) { const m = arr[i]; const dx = fx - m.x, dy = fy - m.y; const d = dx * dx + dy * dy; if (d < fd) { fd = d; fi = i; } }
      if (fi !== focusIdx.value) hold.value = 0; else hold.value += dt;
      focusIdx.value = fi;
    } else { focusIdx.value = -1; }
    const R = Math.max(120, w * 0.42), R2 = R * R, wk = Math.min(1, dt * 0.014), s = dt / 16.67;
    const next: Mote[] = [];
    for (let i = 0; i < n; i++) {
      const m = arr[i];
      const homeX = m.hx * w, homeY = m.hy * h, kk = 0.018;
      let axx = (homeX - m.x) * kk, ayy = (homeY - m.y) * kk;
      if (act) {
        if (i === fi) { const pull = 0.06; axx += (fx - m.x) * pull; ayy += (fy - m.y) * pull; }
        else { const dx = m.x - fx, dy = m.y - fy, d2 = dx * dx + dy * dy; if (d2 < R2) { const d = Math.sqrt(d2) + 0.001; let fall = (1 - d / R); fall = fall * fall; const push = fall * 5.2; axx += (dx / d) * push; ayy += (dy / d) * push; } }
      }
      const vx = (m.vx + axx * s) * 0.86, vy = (m.vy + ayy * s) * 0.86;
      const wt = (act && i === fi) ? 1 : 0;
      const ww = m.w + (wt - m.w) * wk;
      next.push({ hx: m.hx, hy: m.hy, x: m.x + vx * s, y: m.y + vy * s, vx, vy, d: m.d, w: ww, rotB: m.rotB, rotS: m.rotS, swph: m.swph, r: m.r, g: m.g, b: m.b });
    }
    motes.value = next;
  }, false);

  // pause the frame loop when hidden; also CLEAR any in-flight bloom so a tap that navigated
  // away (e.g. schedule→create, which shares this hub's options so no cmd resets it) doesn't
  // leave bloomOn stuck at 1 — which on return would show dim (55%) motes + a stale flash blob.
  useEffect(() => {
    fc.setActive(active);
    if (!active) { bloomOn.value = 0; bloomNav.value = 0; bloomT.value = 0; puffs.value = []; }
  }, [active, fc, bloomOn, bloomNav, bloomT, puffs]);

  // ---- draw (UI thread, imperative) ----
  const picture = useDerivedValue(() => {
    'worklet';
    const w = W.value, h = H.value, t = time.value;
    const arr = motes.value;
    const pdown = down.value, ppx = px.value, ppy = py.value, fiRaw = focusIdx.value, hld = hold.value;
    const bOn = bloomOn.value, bT = bloomT.value, bIdx = bloomIdx.value, bPuffs = puffs.value;
    const mFade = moteFade.value, ph = phase.value;
    return createPicture((canvas: SkCanvas) => {
      'worklet';
      if (w === 0 || h === 0) return;
      const n = arr.length;
      const mx = Math.max(w, h);

      // 1) deep dark-purple water
      const bg = Skia.Paint();
      bg.setShader(Skia.Shader.MakeRadialGradient(
        { x: w * 0.5, y: h * 0.16 }, h * 1.1,
        [Skia.Color('#15103a'), Skia.Color('#0a0720'), Skia.Color('#050314')],
        [0, 0.58, 1], TileMode.Clamp,
      ));
      canvas.drawRect(Skia.XYWHRect(0, 0, w, h), bg);
      const tg = Skia.Paint();
      tg.setShader(Skia.Shader.MakeRadialGradient(
        { x: w * 0.5, y: h * 0.18 }, h * 0.95,
        [rgba(70, 45, 135, 0.34), rgba(4, 3, 14, 0)], [0, 1], TileMode.Clamp,
      ));
      canvas.drawRect(Skia.XYWHRect(0, 0, w, h), tg);

      // 2) smoky volumetric clouds (large, very soft, slow)
      for (let i = 0; i < smoke.length; i++) {
        const sm = smoke[i];
        const cx = w * (0.5 + Math.sin(t * 0.000045 * sm.sp + sm.ph) * 0.30);
        const cy = h * (0.45 + Math.cos(t * 0.00004 * sm.sp + sm.ph * 1.3) * 0.26);
        const rr = mx * sm.r;
        const p = Skia.Paint(); p.setBlendMode(BlendMode.Plus);
        p.setShader(Skia.Shader.MakeRadialGradient({ x: cx, y: cy }, rr, [rgba(120, 85, 205, 0.05), rgba(120, 85, 205, 0)], [0, 1], TileMode.Clamp));
        canvas.drawCircle(cx, cy, rr, p);
      }

      // 3) faint caustics
      for (let i = 0; i < 5; i++) {
        const cx = w * (0.2 + 0.6 * ((Math.sin(t * 0.00018 + i * 1.7) + 1) / 2));
        const cy = h * (0.15 + 0.7 * ((Math.cos(t * 0.00013 + i * 2.3) + 1) / 2));
        const rr = 70 + 40 * Math.sin(t * 0.0004 + i);
        const p = Skia.Paint(); p.setBlendMode(BlendMode.Plus);
        p.setShader(Skia.Shader.MakeRadialGradient({ x: cx, y: cy }, rr, [rgba(150, 110, 232, 0.06), rgba(150, 110, 232, 0)], [0, 1], TileMode.Clamp));
        canvas.drawCircle(cx, cy, rr, p);
      }

      // 4) drifting silt — calm
      const sp = Skia.Paint(); sp.setBlendMode(BlendMode.Plus);
      for (let i = 0; i < silt.length; i++) {
        const sgr = silt[i];
        const yy = (((sgr.y - t * sgr.v) % 1) + 1) % 1;
        const xx = (sgr.x + Math.sin(t * 0.0002 + sgr.ph) * 0.01) * w;
        sp.setColor(rgba(206, 190, 250, 0.13 + 0.06 * Math.sin(t * 0.001 + sgr.ph)));
        canvas.drawCircle(xx, yy * h, sgr.s, sp);
      }

      // 5) finger pressure glow
      if (pdown === 1 && bOn === 0 && ph === 0) {
        const rr = Math.max(120, w * 0.42);
        const p = Skia.Paint(); p.setBlendMode(BlendMode.Plus);
        p.setShader(Skia.Shader.MakeRadialGradient({ x: ppx, y: ppy }, rr, [rgba(180, 150, 240, 0.12), rgba(150, 110, 225, 0.05), rgba(0, 0, 0, 0)], [0, 0.5, 1], TileMode.Clamp));
        canvas.drawCircle(ppx, ppy, rr, p);
      }

      // 6) motes — orb-inspired petal bursts with depth-of-field focus, faded by the transition
      const fIdx = pdown === 1 && bOn === 0 && ph === 0 ? fiRaw : -1;
      const F = (fIdx >= 0 && fIdx < n) ? arr[fIdx].w : 0;
      const dim = (bOn === 1 ? 0.55 : 1) * mFade;          // recede during bloom; fade during transition
      if (dim > 0.001) {
        for (let i = 0; i < n; i++) {
          const m = arr[i];
          const isF = (i === fIdx);
          const x = m.x, y = m.y + Math.cos(t * 0.0005 + m.swph) * 2;
          const ww = m.w;
          let eff = isF ? (m.d - ww * (m.d - 0.05)) : (m.d + (1 - m.d) * 0.42 * F);
          if (eff < 0.03) eff = 0.03; else if (eff > 0.95) eff = 0.95;
          const br = (isF ? (0.85 + 0.5 * ww) : (1 - eff * 0.5)) * dim;
          let sz = (11 + (1 - eff) * 15) * (1 + 0.5 * ww) * (1 + 0.04 * Math.sin(t * 0.0009 + m.swph));
          if (ph === 2) sz *= (0.55 + 0.45 * mFade);        // unfurl scale-in
          const lc = lighten(m.r, m.g, m.b, 0.55), dc = darken(m.r, m.g, m.b, 0.45);
          // halo
          const halo = sz * 1.95;
          const hp = Skia.Paint(); hp.setBlendMode(BlendMode.Plus);
          hp.setShader(Skia.Shader.MakeRadialGradient({ x, y }, halo, [rgba(m.r, m.g, m.b, 0.40 * br), rgba(m.r, m.g, m.b, 0.13 * br), rgba(m.r, m.g, m.b, 0)], [0, 0.5, 1], TileMode.Clamp));
          canvas.drawCircle(x, y, halo, hp);
          // petals
          let petalA = (0.22 + 0.78 * ww) * (1.05 - eff * 0.5) * br; if (petalA > 1) petalA = 1; else if (petalA < 0) petalA = 0;
          const path = burstPath(x, y, sz, sz * 0.14, m.rotB + t * m.rotS);
          const pp = Skia.Paint(); pp.setBlendMode(BlendMode.Plus);
          pp.setShader(Skia.Shader.MakeRadialGradient({ x: x - sz * 0.25, y: y - sz * 0.3 }, sz * 1.25, [rgba(lc[0], lc[1], lc[2], petalA), rgba(m.r, m.g, m.b, petalA), rgba(dc[0], dc[1], dc[2], petalA * 0.85)], [0, 0.55, 1], TileMode.Clamp));
          canvas.drawPath(path, pp);
          // bright core
          const coreR = sz * 0.36 * (1 + 0.3 * ww);
          const cl = lighten(m.r, m.g, m.b, 0.7);
          const cp = Skia.Paint(); cp.setBlendMode(BlendMode.Plus);
          cp.setShader(Skia.Shader.MakeRadialGradient({ x, y }, coreR, [rgba(255, 255, 255, 0.95 * br), rgba(cl[0], cl[1], cl[2], 0.85 * br), rgba(m.r, m.g, m.b, 0)], [0, 0.55, 1], TileMode.Clamp));
          canvas.drawCircle(x, y, coreR, cp);
          // commit ring
          if (isF) {
            const pr = Math.min(1, hld / 420);
            const rp = Skia.Paint(); rp.setStyle(PaintStyle.Stroke); rp.setStrokeWidth(2); rp.setBlendMode(BlendMode.Plus);
            rp.setColor(rgba(m.r, m.g, m.b, 0.4 + 0.4 * pr));
            const ap = Skia.Path.Make(); ap.addArc(Skia.XYWHRect(x - sz * 1.5, y - sz * 1.5, sz * 3, sz * 3), -90, 360 * pr);
            canvas.drawPath(ap, rp);
          }
        }
      }

      // 7) ink puffs — bloom converge OR smoky dissolve cloud
      for (let i = 0; i < bPuffs.length; i++) {
        const p = bPuffs[i]; if (p.born > 0) continue;
        const a = Math.max(0, (1 - p.life)) * 0.5; const psz = p.sz * (1 + p.life * 1.4);
        const pp = Skia.Paint(); pp.setBlendMode(BlendMode.Plus);
        pp.setShader(Skia.Shader.MakeRadialGradient({ x: p.x, y: p.y }, psz, [rgba(p.r, p.g, p.b, a), rgba(p.r, p.g, p.b, 0)], [0, 1], TileMode.Clamp));
        canvas.drawCircle(p.x, p.y, psz, pp);
      }
      // bright forming flash (الوميض) at the tapped mote
      if (bOn === 1 && bIdx >= 0 && bIdx < n) {
        const prog = Math.min(1, bT / BLOOM_MS);
        const m = arr[bIdx];
        const k = Math.max(0, (prog - 0.35) / 0.65);
        const fr = 100 * k + 12;
        const fp = Skia.Paint(); fp.setBlendMode(BlendMode.Plus);
        fp.setShader(Skia.Shader.MakeRadialGradient({ x: m.x, y: m.y }, fr, [rgba(255, 255, 255, 0.55 * k), rgba(m.r, m.g, m.b, 0.32 * k), rgba(m.r, m.g, m.b, 0)], [0, 0.5, 1], TileMode.Clamp));
        canvas.drawCircle(m.x, m.y, fr, fp);
      }
    }, Skia.XYWHRect(0, 0, w, h));
  });

  // ---- bloom trigger (tap OR drag-release on a mote) ----
  const triggerBloom = (x: number, y: number) => {
    'worklet';
    if (!activeSV.value || bloomOn.value === 1 || phase.value !== 0) return;
    const arr = motes.value; const w = W.value;
    let bi = -1, bd = 1e9;
    for (let i = 0; i < arr.length; i++) { const m = arr[i]; const dx = x - m.x, dy = y - m.y; const d = dx * dx + dy * dy; if (d < bd) { bd = d; bi = i; } }
    if (bi >= 0 && Math.sqrt(bd) < Math.max(90, w * 0.26)) {
      const m = arr[bi]; const ps: Puff[] = [];
      for (let k = 0; k < 64; k++) {
        const a = Math.random() * TAU, rr = Math.random();
        ps.push({ x, y, ang: a, sp: (0.15 + Math.random() * 0.9) * (0.6 + rr), curl: (Math.random() - 0.5) * 2.4, life: 0, sz: 6 + Math.random() * 26, born: Math.random() * 0.25, r: m.r, g: m.g, b: m.b });
      }
      puffs.value = ps; bloomIdx.value = bi; bloomT.value = 0; bloomNav.value = 0; bloomOn.value = 1; down.value = 0;
    }
  };

  // ---- gestures: TAP opens immediately; DRAG shows the pressure field & opens on release ----
  const tap = Gesture.Tap()
    .maxDuration(450)
    .onEnd((e, success) => { 'worklet'; if (success) triggerBloom(e.x, e.y); });
  const pan = Gesture.Pan()
    .onBegin((e) => { 'worklet'; if (!activeSV.value || bloomOn.value === 1 || phase.value !== 0) return; px.value = e.x; py.value = e.y; down.value = 1; hold.value = 0; })
    .onUpdate((e) => { 'worklet'; if (!activeSV.value || bloomOn.value === 1 || phase.value !== 0) return; px.value = e.x; py.value = e.y; })
    .onEnd(() => { 'worklet'; if (!activeSV.value || bloomOn.value === 1 || phase.value !== 0) { down.value = 0; return; } down.value = 0; triggerBloom(px.value, py.value); })
    .onFinalize(() => { 'worklet'; down.value = 0; });
  const gesture = Gesture.Race(tap, pan);

  const labelFont = Platform.select({ ios: 'Avenir Next', android: 'sans-serif-light', default: undefined });

  return (
    <View
      style={StyleSheet.absoluteFill}
      pointerEvents={active ? 'auto' : 'none'}
      onLayout={(e) => {
        const { width, height } = e.nativeEvent.layout;
        W.value = width; H.value = height;
        rebuild(width, height);
      }}
    >
      <GestureDetector gesture={gesture}>
        <Canvas style={{ flex: 1 }}>
          <Picture picture={picture} />
        </Canvas>
      </GestureDetector>
      {/* white English labels that FOLLOW each mote */}
      {options.map((o, i) => (
        <InkLabel key={o.key} motes={motes} bloomOn={bloomOn} moteFade={moteFade} phase={phase} index={i} label={o.label} font={labelFont} />
      ))}
    </View>
  );
}
