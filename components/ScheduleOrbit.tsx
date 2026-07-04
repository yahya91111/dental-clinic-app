import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform } from 'react-native';
import { Canvas, Picture, createPicture, Skia, BlendMode, TileMode, PaintStyle, type SkCanvas } from '@shopify/react-native-skia';
import { Ionicons } from '@expo/vector-icons';
import { useSharedValue, useDerivedValue, useFrameCallback } from 'react-native-reanimated';
import { scale } from '../lib/scale';

// ════════════════════════════════════════════════════════════════════
// ScheduleOrbit — "مُكوِّن المدار" (Orbit Composer), ported from
// design/concept-create-orbit.html. ONE ink-water tank with a central AI
// orb (the schedule being composed) ringed by a green progress arc, and N
// facet-motes orbiting it. Tapping a facet opens its sheet (handled by the
// parent); completing it lights the facet + brightens its ink thread to the
// centre. When enough facets are done the centre turns "ready" → tap it to
// build. The Skia layer draws water + orb + threads + halos + ring; RN
// touchables (icons/labels/centre) sit on top.
// ════════════════════════════════════════════════════════════════════

export type OrbitFacet = { key: string; label: string; sub: string; color: [number, number, number]; icon: keyof typeof Ionicons.glyphMap; done: boolean };

const TAU = Math.PI * 2;
const KB = 0.5523;
const PET = 12;
const LEN = [1.14, 0.70, 1.06, 0.64, 1.20, 0.82, 0.70, 1.12, 0.76, 1.16, 0.66, 0.96];

function rnd(i: number) { const x = Math.sin(i * 127.1) * 43758.5453; return x - Math.floor(x); }

function rgba(r: number, g: number, b: number, a: number) {
  'worklet';
  return Skia.Color(`rgba(${Math.round(r)},${Math.round(g)},${Math.round(b)},${a})`);
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

type FacetGeo = { x: number; y: number; r: number; g: number; b: number; done: number };

export function ScheduleOrbit({ facets, progress, ready, onFacet, onCenter, building, embedded = false }: {
  facets: OrbitFacet[];
  progress: number;        // 0..1 completion
  ready: boolean;          // centre is tappable-to-build
  onFacet: (key: string) => void;
  onCenter: () => void;
  building: boolean;
  embedded?: boolean;      // true ⇒ لا ترسم ماءَها الخاصّ (تُركَّبُ فوقَ ماءِ InkHub المتّصلِ نفسِه)
}) {
  const [size, setSize] = useState({ w: 0, h: 0 });
  const W = useSharedValue(0), H = useSharedValue(0), time = useSharedValue(0);
  const prog = useSharedValue(0), readySV = useSharedValue(0), buildSV = useSharedValue(0), rdyE = useSharedValue(0);
  const embeddedSV = useSharedValue(embedded ? 1 : 0);
  useEffect(() => { embeddedSV.value = embedded ? 1 : 0; }, [embedded, embeddedSV]);
  const geo = useSharedValue<FacetGeo[]>([]);

  const silt = useMemo(() => {
    const a: { x: number; y: number; s: number; v: number; ph: number }[] = [];
    for (let i = 0; i < 42; i++) a.push({ x: rnd(i), y: rnd(i + 9), s: 0.4 + rnd(i + 3) * 1.3, v: 0.0000036 + rnd(i + 5) * 0.0000100, ph: rnd(i + 7) * 6.28 });
    return a;
  }, []);
  const smoke = useMemo(() => {
    const a: { ph: number; r: number; sp: number }[] = [];
    for (let i = 0; i < 4; i++) a.push({ ph: rnd(i * 5 + 1) * 6.28, r: 0.34 + rnd(i * 5 + 3) * 0.18, sp: 0.6 + rnd(i * 5 + 4) * 0.8 });
    return a;
  }, []);

  // geometry: centre + facets on a circle
  const layout = useMemo(() => {
    const { w, h } = size;
    const cx = w * 0.5, cy = h * 0.44, R = Math.min(w, h) * 0.30;
    const pts = facets.map((f, i) => {
      const ang = -Math.PI / 2 + i * (TAU / facets.length);
      return { x: cx + Math.cos(ang) * R, y: cy + Math.sin(ang) * R };
    });
    return { cx, cy, R, pts };
  }, [size, facets]);

  useEffect(() => {
    geo.value = facets.map((f, i) => ({ x: layout.pts[i]?.x ?? 0, y: layout.pts[i]?.y ?? 0, r: f.color[0], g: f.color[1], b: f.color[2], done: f.done ? 1 : 0 }));
  }, [facets, layout, geo]);
  useEffect(() => { readySV.value = ready ? 1 : 0; }, [ready, readySV]);
  useEffect(() => { buildSV.value = building ? 1 : 0; }, [building, buildSV]);

  const fc = useFrameCallback((info) => {
    'worklet';
    const w = W.value, h = H.value;
    if (w === 0 || h === 0) return;
    const dt = Math.min(40, info.timeSincePreviousFrame ?? 16);
    time.value += dt;
    prog.value += (progress - prog.value) * Math.min(1, dt * 0.006);
    rdyE.value += (readySV.value - rdyE.value) * Math.min(1, dt * 0.008);
  }, true);

  const picture = useDerivedValue(() => {
    'worklet';
    const w = W.value, h = H.value, t = time.value;
    const arr = geo.value, p = prog.value, rEase = rdyE.value, bld = buildSV.value;
    const emb = embeddedSV.value;
    return createPicture((canvas: SkCanvas) => {
      'worklet';
      if (w === 0 || h === 0) return;
      const mx = Math.max(w, h);
      const cx = w * 0.5, cy = h * 0.44;

      // الماء (قاعدة + دخان + ذرّات) — يُرسَمُ فقط حين تكونُ مستقلّةً؛ في الوضعِ المُضمَّن (embedded)
      // يأتي الماءُ من InkHub الموجودِ تحتها، فلا نرسمُ ماءً ثانيًا (نفسُ الخلفيّةِ المتّصلة).
      if (emb === 0) {
        // 1) deep dark-purple water
        const bg = Skia.Paint();
        bg.setShader(Skia.Shader.MakeRadialGradient({ x: w * 0.5, y: h * 0.16 }, h * 1.1, [Skia.Color('#15103a'), Skia.Color('#0a0720'), Skia.Color('#050314')], [0, 0.58, 1], TileMode.Clamp));
        canvas.drawRect(Skia.XYWHRect(0, 0, w, h), bg);
        const tg = Skia.Paint();
        tg.setShader(Skia.Shader.MakeRadialGradient({ x: w * 0.5, y: h * 0.18 }, h * 0.95, [rgba(70, 45, 135, 0.32), rgba(4, 3, 14, 0)], [0, 1], TileMode.Clamp));
        canvas.drawRect(Skia.XYWHRect(0, 0, w, h), tg);

        // 2) smoke clouds
        for (let i = 0; i < smoke.length; i++) {
          const sm = smoke[i];
          const sx = w * (0.5 + Math.sin(t * 0.000045 * sm.sp + sm.ph) * 0.30);
          const sy = h * (0.45 + Math.cos(t * 0.00004 * sm.sp + sm.ph * 1.3) * 0.26);
          const rr = mx * sm.r;
          const pnt = Skia.Paint(); pnt.setBlendMode(BlendMode.Plus);
          pnt.setShader(Skia.Shader.MakeRadialGradient({ x: sx, y: sy }, rr, [rgba(120, 85, 205, 0.045), rgba(120, 85, 205, 0)], [0, 1], TileMode.Clamp));
          canvas.drawCircle(sx, sy, rr, pnt);
        }

        // 3) silt
        const sp = Skia.Paint(); sp.setBlendMode(BlendMode.Plus);
        for (let i = 0; i < silt.length; i++) {
          const sg = silt[i];
          const yy = (((sg.y - t * sg.v) % 1) + 1) % 1;
          const xx = (sg.x + Math.sin(t * 0.0002 + sg.ph) * 0.01) * w;
          sp.setColor(rgba(206, 190, 250, 0.12 + 0.05 * Math.sin(t * 0.001 + sg.ph)));
          canvas.drawCircle(xx, yy * h, sg.s, sp);
        }
      }

      // 4) facet halos (soft glow; brighter when done) — no connecting lines
      for (let i = 0; i < arr.length; i++) {
        const f = arr[i];
        const on = f.done;
        const hr = on ? 36 : 28;
        const hp = Skia.Paint(); hp.setBlendMode(BlendMode.Plus);
        hp.setShader(Skia.Shader.MakeRadialGradient({ x: f.x, y: f.y }, hr, [rgba(f.r, f.g, f.b, on ? 0.34 : 0.20), rgba(f.r, f.g, f.b, 0)], [0, 1], TileMode.Clamp));
        canvas.drawCircle(f.x, f.y, hr, hp);
      }

      // 5) centre — petal-burst orb that FADES OUT as the hub becomes ready, leaving a violet
      // glow behind the RN "CREATE" word (the word replaces the icon). The halo stays as backing.
      const cr = [170, 120, 255];
      const orbA = 1 - rEase;                 // icon (petals + core) fades as ready
      const sz = Math.min(w, h) * 0.075 * (1 + 0.05 * Math.sin(t * 0.0012)) * (1 + p * 0.18) * (1 + bld * 0.15 * Math.sin(t * 0.01));
      const halo = sz * 2.3;
      const hg = Skia.Paint(); hg.setBlendMode(BlendMode.Plus);
      hg.setShader(Skia.Shader.MakeRadialGradient({ x: cx, y: cy }, halo, [rgba(cr[0], cr[1], cr[2], 0.40 + bld * 0.2 + rEase * 0.16), rgba(cr[0], cr[1], cr[2], 0.12), rgba(0, 0, 0, 0)], [0, 0.5, 1], TileMode.Clamp));
      canvas.drawCircle(cx, cy, halo, hg);
      if (orbA > 0.02) {
        const path = burstPath(cx, cy, sz, sz * 0.14, t * 0.0004);
        const pg = Skia.Paint(); pg.setBlendMode(BlendMode.Plus);
        pg.setShader(Skia.Shader.MakeRadialGradient({ x: cx - sz * 0.25, y: cy - sz * 0.3 }, sz * 1.25, [rgba(230, 210, 255, 0.95 * orbA), rgba(cr[0], cr[1], cr[2], 0.9 * orbA), rgba(90, 50, 160, 0.55 * orbA)], [0, 0.55, 1], TileMode.Clamp));
        canvas.drawPath(path, pg);
        const co = Skia.Paint(); co.setBlendMode(BlendMode.Plus);
        co.setShader(Skia.Shader.MakeRadialGradient({ x: cx, y: cy }, sz * 0.42, [rgba(255, 255, 255, 0.95 * orbA), rgba(180, 140, 255, 0)], [0, 1], TileMode.Clamp));
        canvas.drawCircle(cx, cy, sz * 0.42, co);
      }

      // 6) progress ring
      const ringR = sz * 1.7;
      const track = Skia.Paint(); track.setStyle(PaintStyle.Stroke); track.setStrokeWidth(3); track.setColor(rgba(255, 255, 255, 0.08));
      const tr = Skia.Path.Make(); tr.addArc(Skia.XYWHRect(cx - ringR, cy - ringR, ringR * 2, ringR * 2), 0, 360);
      canvas.drawPath(tr, track);
      if (p > 0.001) {
        const ring = Skia.Paint(); ring.setStyle(PaintStyle.Stroke); ring.setStrokeWidth(3); ring.setBlendMode(BlendMode.Plus); ring.setColor(rgba(120, 230, 170, 0.9));
        const ap = Skia.Path.Make(); ap.addArc(Skia.XYWHRect(cx - ringR, cy - ringR, ringR * 2, ringR * 2), -90, 360 * p);
        canvas.drawPath(ap, ring);
      }
    }, Skia.XYWHRect(0, 0, w, h));
  });

  const labelFont = Platform.select({ ios: 'Avenir Next', android: 'sans-serif-medium', default: undefined });
  const doneCount = facets.filter((f) => f.done).length;

  return (
    <View
      style={StyleSheet.absoluteFill}
      onLayout={(e) => { const { width, height } = e.nativeEvent.layout; W.value = width; H.value = height; setSize({ w: width, h: height }); }}
    >
      <Canvas style={{ flex: 1 }}>
        <Picture picture={picture} />
      </Canvas>

      {/* facet touchables (icon + label + check) */}
      {facets.map((f, i) => {
        const pt = layout.pts[i]; if (!pt) return null;
        return (
          <TouchableOpacity
            key={f.key}
            activeOpacity={0.8}
            onPress={() => onFacet(f.key)}
            style={{ position: 'absolute', left: pt.x - scale(48), top: pt.y - scale(48), width: scale(96), height: scale(96), alignItems: 'center', justifyContent: 'center' }}
          >
            <View style={{ width: scale(44), height: scale(44), borderRadius: scale(22), alignItems: 'center', justifyContent: 'center', backgroundColor: f.done ? 'rgba(111,207,151,0.14)' : 'rgba(255,255,255,0.04)', borderWidth: scale(1), borderColor: f.done ? 'rgba(111,207,151,0.5)' : 'rgba(255,255,255,0.14)' }}>
              <Ionicons name={f.icon} size={scale(21)} color={`rgb(${f.color[0]},${f.color[1]},${f.color[2]})`} />
            </View>
            <Text style={{ marginTop: scale(9), fontSize: scale(11), fontWeight: '300', fontFamily: labelFont, letterSpacing: 2.5, color: 'rgba(255,255,255,0.9)', textShadowColor: 'rgba(0,0,0,0.7)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 6 }}>{f.sub.toUpperCase()}</Text>
            {f.done && (
              <View style={{ position: 'absolute', top: scale(2), right: scale(22), width: scale(18), height: scale(18), borderRadius: scale(9), backgroundColor: '#6fcf97', alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name="checkmark" size={scale(12)} color="#06160e" />
              </View>
            )}
          </TouchableOpacity>
        );
      })}

      {/* centre orb hit-area + label */}
      <TouchableOpacity
        activeOpacity={0.85}
        onPress={onCenter}
        style={{ position: 'absolute', left: layout.cx - scale(64), top: layout.cy - scale(64), width: scale(128), height: scale(128), alignItems: 'center', justifyContent: 'center' }}
      >
        {ready ? (
          <Text style={{ fontSize: scale(21), fontWeight: '900', fontFamily: labelFont, letterSpacing: 3, color: '#C9A6FF', textShadowColor: 'rgba(150,90,235,0.95)', textShadowOffset: { width: 0, height: 0 }, textShadowRadius: 18 }}>CREATE</Text>
        ) : (
          <Text style={{ fontSize: scale(14), fontWeight: '800', fontFamily: labelFont, letterSpacing: 1, color: 'rgba(255,255,255,0.6)' }}>
            {`${doneCount} / ${facets.length}`}
          </Text>
        )}
      </TouchableOpacity>
    </View>
  );
}
