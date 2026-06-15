import React, { useEffect, useRef } from 'react';
import { TouchableOpacity, Animated, Easing } from 'react-native';
import Svg, { Path, Circle, Defs, RadialGradient, Stop } from 'react-native-svg';
import { scale } from '../lib/scale';

export type AIState = 'idle' | 'listening' | 'thinking' | 'success' | 'error';

interface AIOrbProps {
  state?: AIState;
  size?: number;
  onPress: () => void;
  onLongPress?: () => void;
  delayLongPress?: number;
  alert?: boolean; // محادثة بانتظار الردّ → يتحوّل للأحمر
}

// ═══════════════════════════════════════════════════════════════
// بقعةُ بتلاتٍ متشعّعة (مروحة/انفجارٌ ناعم) — قريبةٌ من أيقونة Claude.
// نولّد المسار برمجيًّا: نقاطٌ بالتناوب «طرفُ بتلة (بعيد)» و«وادٍ (قريب)»
// حول المركز، نَصِلها بمنحنياتٍ ناعمة (Catmull-Rom→Bézier) فتنتج بتلاتٌ
// مدوّرةَ الأطراف. تفاوتُ الأطوال يمنحها طابعًا عضويًّا (كالرسم اليدويّ).
// ═══════════════════════════════════════════════════════════════
const VB = 120;       // مربّع الرسم الداخليّ
const C = VB / 2;     // المركز
const TAU = Math.PI * 2;

function polar(a: number, r: number): [number, number] {
  return [C + Math.cos(a) * r, C + Math.sin(a) * r];
}

const f = (p: [number, number]) => `${p[0].toFixed(2)} ${p[1].toFixed(2)}`;

const K = 0.5523; // ثابت تقريب الدائرة بمنحنيات بيزييه

// بتلةٌ على شكل **قطرة**: طرفٌ خارجيٌّ مدوّرٌ ممتلئ (عند ro)، تضيق إلى **نقطةٍ في
// المركز** — فتخرج كلّ البتلات من مركزٍ واحدٍ بلا قرصٍ في الوسط. (aT اتّجاه الشعاع.)
function teardrop(aT: number, ro: number, hw: number): string {
  const ax = Math.cos(aT); const ay = Math.sin(aT);   // على المحور (للخارج)
  const px = -Math.sin(aT); const py = Math.cos(aT);  // عموديّ (العرض)
  const P = (r: number, w: number): [number, number] => [C + ax * r + px * w, C + ay * r + py * w];
  const ctr = P(0, 0);                 // النقطة في المركز
  const shL = P(ro, hw); const shR = P(ro, -hw);       // كتفا الطرف الخارجيّ
  const tip = P(ro + hw, 0);           // قمّة الطرف المدوّر
  return `M ${f(ctr)} `
    + `C ${f(P(ro * 0.45, hw * 0.35))} ${f(P(ro * 0.70, hw))} ${f(shL)} `   // ضلعٌ يسارٌ يضيق للمركز
    + `C ${f(P(ro + hw * K, hw))} ${f(P(ro + hw, hw * K))} ${f(tip)} `        // ربعُ الطرف المدوّر
    + `C ${f(P(ro + hw, -hw * K))} ${f(P(ro + hw * K, -hw))} ${f(shR)} `      // ربعه الآخر
    + `C ${f(P(ro * 0.70, -hw))} ${f(P(ro * 0.45, -hw * 0.35))} ${f(ctr)} Z `; // ضلعٌ يمينٌ يعود للمركز
}

// بتلاتٌ على شكل قطرةٍ تخرج من **مركزٍ واحد** وتندمج (نفس اتّجاه اللفّ → fill nonzero).
function buildLobes(opts: {
  petals: number; rOuter: number; halfW: number; lengths: number[]; rot: number;
}): string {
  const { petals, rOuter, halfW, lengths, rot } = opts;
  let d = '';
  for (let i = 0; i < petals; i++) {
    const aT = rot + (i / petals) * TAU;
    d += teardrop(aT, rOuter * (lengths[i] ?? 1), halfW);
  }
  return d;
}

// ١٤ بتلةً (قطرات) تخرج من مركزٍ واحد، بأطوالٍ متفاوتةٍ عضويّة
const BURST = buildLobes({
  petals: 14, rOuter: 46, halfW: 6,
  lengths: [1.12, 0.72, 1.05, 0.62, 1.20, 0.84, 0.68, 1.10, 0.78, 1.16, 0.66, 0.95, 1.18, 0.74],
  rot: -Math.PI / 2, // أوّل بتلةٍ للأعلى
});

type Palette = { glow: string; light: string; mid: string; deep: string; sheen: string;
  coreLight: string; coreMid: string; coreDeep: string };
// النواة بنفسجيّةٌ بدرجةٍ مختلفة (بَنفسجيّ-نيليّ أعمق) لتتميّز عن بتلاتِ البنفسجيّ
const PURPLE: Palette = { glow: '#A855F7', light: '#C084FC', mid: '#7C3AED', deep: '#5B21B6', sheen: '#F3E8FF',
  coreLight: '#DDD6FE', coreMid: '#8B5CF6', coreDeep: '#6D28D9' };
const RED: Palette = { glow: '#FF5A4D', light: '#FF8A7E', mid: '#E5342B', deep: '#B91C1C', sheen: '#FEE2E2',
  coreLight: '#FECDD3', coreMid: '#FB7185', coreDeep: '#E11D48' };

// شكلُ الأوربّ وحده (بلا حركةٍ ولا لمس) — لإعادة استعماله أيقونةً في الترويسة وغيرها.
// idPrefix يُفرِّد معرّفات التدرّجات كي لا تتعارض نسختان على نفس الشاشة.
export function OrbGlyph({ size = 40, alert, idPrefix = 'orb' }: { size?: number; alert?: boolean; idPrefix?: string }) {
  const pal = alert ? RED : PURPLE;
  const gGlow = `${idPrefix}Glow`, gFill = `${idPrefix}Fill`, gSheen = `${idPrefix}Sheen`, gCore = `${idPrefix}Core`;
  return (
    <Svg width={size} height={size} viewBox={`0 0 ${VB} ${VB}`}>
      <Defs>
        <RadialGradient id={gGlow} cx="50%" cy="50%" r="50%">
          <Stop offset="0%" stopColor={pal.glow} stopOpacity={0.45} />
          <Stop offset="55%" stopColor={pal.glow} stopOpacity={0.18} />
          <Stop offset="100%" stopColor={pal.glow} stopOpacity={0} />
        </RadialGradient>
        <RadialGradient id={gFill} cx="38%" cy="32%" r="78%">
          <Stop offset="0%" stopColor={pal.light} />
          <Stop offset="55%" stopColor={pal.mid} />
          <Stop offset="100%" stopColor={pal.deep} />
        </RadialGradient>
        <RadialGradient id={gSheen} cx="50%" cy="50%" r="50%">
          <Stop offset="0%" stopColor={pal.sheen} stopOpacity={0.45} />
          <Stop offset="100%" stopColor={pal.sheen} stopOpacity={0} />
        </RadialGradient>
        <RadialGradient id={gCore} cx="50%" cy="50%" r="50%">
          <Stop offset="0%" stopColor={pal.coreLight} stopOpacity={1} />
          <Stop offset="70%" stopColor={pal.coreMid} stopOpacity={1} />
          <Stop offset="100%" stopColor={pal.coreDeep} stopOpacity={1} />
        </RadialGradient>
      </Defs>
      <Circle cx={C} cy={C} r={58} fill={`url(#${gGlow})`} />
      <Path d={BURST} fill={`url(#${gFill})`} />
      <Circle cx={C} cy={C} r={17} fill={`url(#${gCore})`} />
      <Circle cx={C} cy={C} r={12} fill={`url(#${gSheen})`} />
    </Svg>
  );
}

export function AIOrb({ size = 40, onPress, onLongPress, delayLongPress = 400, alert }: AIOrbProps) {
  const spin = useRef(new Animated.Value(0)).current;     // دورانٌ بطيءٌ دائم
  const breathe = useRef(new Animated.Value(0)).current;  // تنفّسٌ هادئ
  const floatA = useRef(new Animated.Value(0)).current;   // طفوٌ خفيف لأعلى/أسفل

  useEffect(() => {
    const loops = [
      Animated.loop(Animated.timing(spin, { toValue: 1, duration: 56000, easing: Easing.linear, useNativeDriver: true, isInteraction: false })),
      Animated.loop(Animated.sequence([
        Animated.timing(breathe, { toValue: 1, duration: 2200, easing: Easing.inOut(Easing.sin), useNativeDriver: true, isInteraction: false }),
        Animated.timing(breathe, { toValue: 0, duration: 2200, easing: Easing.inOut(Easing.sin), useNativeDriver: true, isInteraction: false }),
      ])),
      Animated.loop(Animated.sequence([
        Animated.timing(floatA, { toValue: 1, duration: 3000, easing: Easing.inOut(Easing.ease), useNativeDriver: true, isInteraction: false }),
        Animated.timing(floatA, { toValue: 0, duration: 3000, easing: Easing.inOut(Easing.ease), useNativeDriver: true, isInteraction: false }),
      ])),
    ];
    loops.forEach((l) => l.start());
    return () => loops.forEach((l) => l.stop());
  }, [spin, breathe, floatA]);

  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  const scaleA = breathe.interpolate({ inputRange: [0, 1], outputRange: [0.95, 1.05] });
  const floatY = floatA.interpolate({ inputRange: [0, 1], outputRange: [0, -scale(6)] });
  const box = size * 1.5; // متّسعٌ ليبرز التوهّج خارج الشكل

  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={delayLongPress}
      style={{ position: 'absolute', bottom: scale(100), right: scale(20), zIndex: 1000 }}
    >
      {/* الطفو الخفيف (حركةٌ منفصلةٌ عن التنفّس/الدوران) */}
      <Animated.View style={{ width: box, height: box, alignItems: 'center', justifyContent: 'center', transform: [{ translateY: floatY }] }}>
        {/* التنفّس + الدوران على الشكل نفسه */}
        <Animated.View style={{ transform: [{ scale: scaleA }, { rotate }] }}>
          <OrbGlyph size={box} alert={alert} idPrefix="orbMain" />
        </Animated.View>
      </Animated.View>
    </TouchableOpacity>
  );
}
