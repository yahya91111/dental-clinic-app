import React, { useMemo } from 'react';
import { View, StyleSheet } from 'react-native';
import { Canvas, Picture, createPicture, Skia, BlendMode, BlurStyle, TileMode, type SkCanvas } from '@shopify/react-native-skia';
import { useSharedValue, useDerivedValue, useFrameCallback, type SharedValue } from 'react-native-reanimated';

// ════════════════════════════════════════════════════════════════════
// ChatDissolve — ماءُ المحادثة الحبريّ + دخانُ الذوبان (Skia)، مطابقٌ
// لبروتوتايب design/concept-chat-dissolve.html:
//  • ChatInkWater = خلفيّةُ الجات: ماءٌ حبريٌّ غامقٌ (بنفسجيّ) + توهّجٌ علويّ
//    + سُحُبُ دخانٍ متحرّكة (تشتدُّ وسطَ الانتقال) + ذرّاتٌ طافية.
//  • DissolveSmoke = طبقةٌ علويّة: حجابٌ ضبابيّ + نُفّاخاتُ دخانٍ تصعدُ وتتّسعُ،
//    شدّتُها = sin(prog·π) فتبلغُ ذروتَها وسطَ الانتقال ثمّ تخبو — «كلُّ شيءٍ يذوبُ دخانيًّا».
// ════════════════════════════════════════════════════════════════════

function rnd(i: number) { const x = Math.sin(i * 127.1) * 43758.5453; return x - Math.floor(x); }
function rgba(r: number, g: number, b: number, a: number) {
  'worklet';
  return Skia.Color(`rgba(${Math.round(r)},${Math.round(g)},${Math.round(b)},${a})`);
}
function envelope(p: number) { 'worklet'; return Math.sin(Math.max(0, Math.min(1, p)) * Math.PI); }

// خلفيّةُ المحادثة — ماءٌ حبريٌّ غامقٌ بنفسجيّ (يشتدُّ دخانُه وسطَ الذوبان عبر prog)
// feather (اختياريّ): نصفُ قطرِ تمويهِ الأطرافِ — إن مُرِّرَ >0 تتلاشى حوافُّ الماءِ إلى الشفافيّةِ
// (قناعُ Skia مموّه) فتُصبحُ حدودُ النافذةِ ضبابيّةً بلا خطّ، مطابقةً على iOS وأندرويد. 0 = بلا تمويه (صفحةُ الذكاء).
export function ChatInkWater({ prog, feather = 0, oval = false, cornerCut = 0 }: { prog: SharedValue<number>; feather?: number; oval?: boolean; cornerCut?: number }) {
  const W = useSharedValue(0), H = useSharedValue(0), time = useSharedValue(0);
  const silt = useMemo(() => {
    const a: { x: number; y: number; s: number; v: number; ph: number }[] = [];
    for (let i = 0; i < 48; i++) a.push({ x: rnd(i), y: rnd(i + 9), s: 0.4 + rnd(i + 3) * 1.4, v: 0.0000040 + rnd(i + 5) * 0.0000100, ph: rnd(i + 7) * 6.28 });
    return a;
  }, []);
  const smoke = useMemo(() => {
    const a: { ph: number; r: number; sp: number }[] = [];
    for (let i = 0; i < 4; i++) a.push({ ph: rnd(i * 5 + 1) * 6.28, r: 0.34 + rnd(i * 5 + 3) * 0.18, sp: 0.6 + rnd(i * 5 + 4) * 0.8 });
    return a;
  }, []);
  useFrameCallback((info) => { 'worklet'; const dt = Math.min(40, info.timeSincePreviousFrame ?? 16); time.value += dt; }, true);

  const picture = useDerivedValue(() => {
    'worklet';
    const w = W.value, h = H.value, t = time.value, surge = envelope(prog.value);
    return createPicture((canvas: SkCanvas) => {
      'worklet';
      if (w === 0 || h === 0) return;
      const mx = Math.max(w, h);
      // 1) قاعدةٌ بنفسجيّةٌ غامقة — إن فُعِّلَ feather تُرسَمُ كمستطيلٍ مستديرٍ **مموّهِ الحوافّ**
      //    (قناعُ تمويهٍ على الحشوِ نفسِه، BlurStyle.Normal) فتكونُ حافّةُ النافذةِ غامضةَ المعالمِ تمامًا،
      //    ومتنُها يبقى صلبًا معتمًا (المركزُ داخلَ المستطيلِ فيبقى مُعتِمًا 100%).
      const bg = Skia.Paint();
      bg.setShader(Skia.Shader.MakeRadialGradient({ x: w * 0.5, y: h * 0.16 }, h * 1.1, [Skia.Color('#321c66'), Skia.Color('#1f1247'), Skia.Color('#130b30')], [0, 0.55, 1], TileMode.Clamp));
      if (feather > 0) {
        bg.setMaskFilter(Skia.MaskFilter.MakeBlur(BlurStyle.Normal, feather, true));
        const inset = feather * 1.6;
        const rad = feather * 1.8;
        const shapeRect = Skia.XYWHRect(inset, inset, w - inset * 2, h - inset * 2);
        if (oval) {
          // شكلٌ بيضاويٌّ (إهليلجيّ) بحوافَّ مموّهة — مرّتان لتكثيفِ الحافّة (أقلُّ شفافيّة)
          canvas.drawOval(shapeRect, bg);
          canvas.drawOval(shapeRect, bg);
        } else {
          const rr = Skia.RRectXY(shapeRect, rad, rad);
          canvas.drawRRect(rr, bg);  // رسمةٌ واحدة = حافّةٌ أنفَذُ (أكثرُ شفافيّة)
        }
      } else {
        canvas.drawRect(Skia.XYWHRect(0, 0, w, h), bg);
      }
      // 2) توهّجٌ علويٌّ من الوسط
      const tg = Skia.Paint();
      tg.setShader(Skia.Shader.MakeRadialGradient({ x: w * 0.5, y: h * 0.16 }, h * 0.85, [rgba(158, 106, 248, 0.34), rgba(120, 80, 210, 0)], [0, 1], TileMode.Clamp));
      canvas.drawRect(Skia.XYWHRect(0, 0, w, h), tg);
      // 3) سُحُبُ الدخان — تشتدُّ وسطَ الانتقال
      for (let i = 0; i < smoke.length; i++) {
        const sm = smoke[i];
        const sx = w * (0.5 + Math.sin(t * 0.000045 * sm.sp + sm.ph) * 0.30);
        const sy = h * (0.45 + Math.cos(t * 0.00004 * sm.sp + sm.ph * 1.3) * 0.26);
        const rr = mx * sm.r;
        const pnt = Skia.Paint(); pnt.setBlendMode(BlendMode.Plus);
        pnt.setShader(Skia.Shader.MakeRadialGradient({ x: sx, y: sy }, rr, [rgba(156, 114, 234, 0.05 + surge * 0.09), rgba(156, 114, 234, 0)], [0, 1], TileMode.Clamp));
        canvas.drawCircle(sx, sy, rr, pnt);
      }
      // 4) ذرّاتٌ طافية
      const sp = Skia.Paint(); sp.setBlendMode(BlendMode.Plus);
      for (let i = 0; i < silt.length; i++) {
        const sg = silt[i];
        const yy = (((sg.y - t * sg.v) % 1) + 1) % 1;
        const xx = (sg.x + Math.sin(t * 0.0002 + sg.ph) * 0.01) * w;
        sp.setColor(rgba(212, 198, 255, 0.12 + 0.05 * Math.sin(t * 0.001 + sg.ph)));
        canvas.drawCircle(xx, yy * h, sg.s, sp);
      }
      // زوايا شفافةٌ فقط: نقشُ دوائرَ مموّهةٍ (DstOut) في الأركانِ الأربعة → تتلاشى الزوايا وحدَها،
      // والحوافُّ المستقيمةُ تبقى ظاهرةً معرَّفة.
      if (cornerCut > 0) {
        const ci = feather > 0 ? feather * 1.6 : 0;
        const cut = Skia.Paint();
        cut.setBlendMode(BlendMode.DstOut);
        cut.setMaskFilter(Skia.MaskFilter.MakeBlur(BlurStyle.Normal, cornerCut * 0.5, true));
        cut.setColor(Skia.Color('#000000'));
        canvas.drawCircle(ci, ci, cornerCut, cut);
        canvas.drawCircle(w - ci, ci, cornerCut, cut);
        canvas.drawCircle(ci, h - ci, cornerCut, cut);
        canvas.drawCircle(w - ci, h - ci, cornerCut, cut);
      }
    }, Skia.XYWHRect(0, 0, w, h));
  });

  return (
    <View style={StyleSheet.absoluteFill} onLayout={(e) => { W.value = e.nativeEvent.layout.width; H.value = e.nativeEvent.layout.height; }}>
      <Canvas style={{ flex: 1 }}><Picture picture={picture} /></Canvas>
    </View>
  );
}

// هالةُ ضبابٍ حولَ النافذة — مستطيلٌ مستديرٌ مموّهٌ بشدّة (Skia، مطابقٌ تمامًا على iOS وأندرويد).
// تُوضَعُ خلفَ البطاقةِ في حاويةٍ أكبرَ منها فيتسرّبُ الضبابُ حولَ حدودِ النافذة. ثابتةٌ بعدَ القياس (رخيصة).
// inset (اختياريّ): بُعدُ حافّةِ المستطيلِ الصلبِ عن حافّةِ الحاوية — يتحكّمُ بمدى امتدادِ الضبابِ
// مستقلًّا عن sigma (كي يصلَ الضبابُ أبعدَ دون قصٍّ). الافتراضيّ = sigma*1.5.
export function FogHalo({ sigma, color = 'rgba(138,99,230,0.55)', radius = 40, inset }: { sigma: number; color?: string; radius?: number; inset?: number }) {
  const W = useSharedValue(0), H = useSharedValue(0);
  const picture = useDerivedValue(() => {
    'worklet';
    const w = W.value, h = H.value;
    return createPicture((canvas: SkCanvas) => {
      'worklet';
      if (w === 0 || h === 0) return;
      const p = Skia.Paint();
      p.setMaskFilter(Skia.MaskFilter.MakeBlur(BlurStyle.Normal, sigma, true));
      p.setColor(Skia.Color(color));
      const ins = inset ?? sigma * 1.5;
      canvas.drawRRect(Skia.RRectXY(Skia.XYWHRect(ins, ins, w - ins * 2, h - ins * 2), radius, radius), p);
    }, Skia.XYWHRect(0, 0, w, h));
  });

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none" onLayout={(e) => { W.value = e.nativeEvent.layout.width; H.value = e.nativeEvent.layout.height; }}>
      <Canvas style={{ flex: 1 }}><Picture picture={picture} /></Canvas>
    </View>
  );
}

// تكثيفُ الضبابِ عند الأركانِ الأربعة — بُقَعٌ مموّهةٌ عند زوايا النافذة (حيثُ تكونُ الزوايا شفّافة).
// inset = بُعدُ مركزِ كلِّ بُقعةٍ عن حافّةِ الحاوية (ليُطابقَ زاويةَ النافذة). ثابتةٌ بعدَ القياس (رخيصة).
export function FogCorners({ sigma, radius, color = 'rgba(210,185,255,0.9)', inset = 0 }: { sigma: number; radius: number; color?: string; inset?: number }) {
  const W = useSharedValue(0), H = useSharedValue(0);
  const picture = useDerivedValue(() => {
    'worklet';
    const w = W.value, h = H.value;
    return createPicture((canvas: SkCanvas) => {
      'worklet';
      if (w === 0 || h === 0) return;
      const p = Skia.Paint();
      p.setMaskFilter(Skia.MaskFilter.MakeBlur(BlurStyle.Normal, sigma, true));
      p.setColor(Skia.Color(color));
      const x0 = inset, x1 = w - inset, y0 = inset, y1 = h - inset;
      canvas.drawCircle(x0, y0, radius, p);
      canvas.drawCircle(x1, y0, radius, p);
      canvas.drawCircle(x0, y1, radius, p);
      canvas.drawCircle(x1, y1, radius, p);
    }, Skia.XYWHRect(0, 0, w, h));
  });

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none" onLayout={(e) => { W.value = e.nativeEvent.layout.width; H.value = e.nativeEvent.layout.height; }}>
      <Canvas style={{ flex: 1 }}><Picture picture={picture} /></Canvas>
    </View>
  );
}

// دخانُ الذوبان — حجابٌ ضبابيّ + نُفّاخاتٌ تصعدُ وتتّسع، شدّتُها = sin(prog·π) (ذروةٌ في المنتصف)
export function DissolveSmoke({ prog }: { prog: SharedValue<number> }) {
  const W = useSharedValue(0), H = useSharedValue(0), time = useSharedValue(0);
  const puffs = useMemo(() => {
    const a: { x: number; y: number; r: number; vy: number; dx: number; ph: number; a: number }[] = [];
    for (let i = 0; i < 60; i++) a.push({ x: rnd(i), y: rnd(i + 11), r: 42 + rnd(i + 3) * 80, vy: 0.04 + rnd(i + 5) * 0.12, dx: (rnd(i + 7) - 0.5) * 0.06, ph: rnd(i + 9) * 6.28, a: 0.5 + rnd(i + 13) * 0.6 });
    return a;
  }, []);
  useFrameCallback((info) => { 'worklet'; const dt = Math.min(40, info.timeSincePreviousFrame ?? 16); time.value += dt; }, true);

  const picture = useDerivedValue(() => {
    'worklet';
    const w = W.value, h = H.value, t = time.value;
    const burst = envelope(prog.value);
    return createPicture((canvas: SkCanvas) => {
      'worklet';
      if (w === 0 || h === 0 || burst < 0.01) return;
      const mx = Math.max(w, h);
      // 0) حجابٌ ضبابيّ يغشّى المشهد لحظةَ الذوبان
      const veil = Skia.Paint(); veil.setBlendMode(BlendMode.Plus);
      veil.setShader(Skia.Shader.MakeRadialGradient({ x: w * 0.5, y: h * 0.46 }, mx * 0.95, [rgba(150, 112, 228, burst * 0.15), rgba(150, 112, 228, burst * 0.05), rgba(150, 112, 228, 0)], [0, 0.6, 1], TileMode.Clamp));
      canvas.drawRect(Skia.XYWHRect(0, 0, w, h), veil);
      // 1) نُفّاخاتُ دخانٍ صاعدةٌ متّسعة
      for (let i = 0; i < puffs.length; i++) {
        const pf = puffs[i];
        let yy = (pf.y - t * 0.00006 * pf.vy * 60) % 1.2;
        if (yy < -0.1) yy += 1.2;
        const x = (pf.x + Math.sin(t * 0.0003 + pf.ph) * 0.03 + pf.dx) * w, y = yy * h;
        const r = pf.r * (0.85 + 0.95 * burst), a = pf.a * burst * 0.17;
        const pnt = Skia.Paint(); pnt.setBlendMode(BlendMode.Plus);
        pnt.setShader(Skia.Shader.MakeRadialGradient({ x, y }, r, [rgba(190, 156, 242, a), rgba(168, 120, 235, a * 0.45), rgba(168, 120, 235, 0)], [0, 0.5, 1], TileMode.Clamp));
        canvas.drawCircle(x, y, r, pnt);
      }
    }, Skia.XYWHRect(0, 0, w, h));
  });

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none" onLayout={(e) => { W.value = e.nativeEvent.layout.width; H.value = e.nativeEvent.layout.height; }}>
      <Canvas style={{ flex: 1 }}><Picture picture={picture} /></Canvas>
    </View>
  );
}
