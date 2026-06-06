import React, { useEffect, useRef } from 'react';
import { TouchableOpacity, Animated, Easing } from 'react-native';
import Svg, { Path, Circle, G } from 'react-native-svg';
import { scale } from '../lib/scale';

export type AIState = 'idle' | 'listening' | 'thinking' | 'success' | 'error';

interface AIOrbProps {
  state?: AIState;
  size?: number;
  onPress: () => void;
  onLongPress?: () => void;
  delayLongPress?: number;
  alert?: boolean; // نقطة حمراء عند وجود طلب/رسالة
}

// Tangled "thread ball" — purple strands woven into a sphere.
export const THREADS: { d: string; color: string; w: number }[] = [
  { color: '#A855F7', d: 'M20 60 C 30 20, 90 20, 100 60 C 90 100, 30 100, 20 60 Z', w: 2 },
  { color: '#7C3AED', d: 'M60 20 C 100 30, 100 90, 60 100 C 20 90, 20 30, 60 20 Z', w: 2 },
  { color: '#C084FC', d: 'M22 40 C 50 14, 90 28, 98 60 C 86 96, 40 102, 22 80 C 12 64, 14 50, 22 40 Z', w: 2 },
  { color: '#9333EA', d: 'M30 32 C 60 12, 96 38, 96 64 C 92 92, 50 102, 28 88 C 14 76, 16 46, 30 32 Z', w: 2 },
  { color: '#D8B4FE', d: 'M18 30 C 50 50, 70 50, 102 30 C 90 70, 70 70, 60 90 C 50 70, 30 70, 18 30 Z', w: 1.6 },
  { color: '#8B5CF6', d: 'M20 90 C 50 60, 70 60, 100 90 C 90 50, 70 50, 60 30 C 50 50, 30 50, 20 90 Z', w: 1.6 },
  { color: '#A78BFA', d: 'M30 28 C 60 56, 60 64, 90 92 M30 92 C 60 64, 60 56, 90 28', w: 1.5 },
  { color: '#DDD6FE', d: 'M14 60 Q 32 30, 60 60 T 106 60', w: 1.5 },
  { color: '#A855F7', d: 'M14 60 Q 32 90, 60 60 T 106 60', w: 1.5 },
  { color: '#9333EA', d: 'M14 60 Q 32 40, 60 60 T 106 60', w: 1.4 },
  { color: '#C084FC', d: 'M14 60 Q 32 80, 60 60 T 106 60', w: 1.4 },
  { color: '#7C3AED', d: 'M14 60 Q 32 35, 60 60 T 106 60', w: 1.3 },
  { color: '#E9D5FF', d: 'M14 60 Q 32 85, 60 60 T 106 60', w: 1.4 },
  { color: '#C084FC', d: 'M22 22 C 50 50, 70 70, 98 98', w: 1.4 },
  { color: '#8B5CF6', d: 'M98 22 C 70 50, 50 70, 22 98', w: 1.4 },
  { color: '#D8B4FE', d: 'M14 60 C 14 38, 106 38, 106 60 C 106 82, 14 82, 14 60 Z', w: 1.2 },
  { color: '#7C3AED', d: 'M60 14 C 38 14, 38 106, 60 106 C 82 106, 82 14, 60 14 Z', w: 1.2 },
  { color: '#E9D5FF', d: 'M22 36 C 60 60, 60 60, 98 84 M22 84 C 60 60, 60 60, 98 36', w: 1.3 },
];

// لوحة حمراء تُستعمل حين يكون هناك محادثة بانتظار الردّ (الزرّ كلّه أحمر)
const RED_PALETTE = ['#E5342B', '#FF5A4D', '#C81E14', '#FF7A6E', '#B91C1C', '#FF8A7E'];

const FLECKS = [
  { cx: 60, cy: 18, fill: '#E9D5FF' },
  { cx: 100, cy: 60, fill: '#A855F7' },
  { cx: 60, cy: 102, fill: '#7C3AED' },
  { cx: 18, cy: 60, fill: '#C084FC' },
];

export function AIOrb({ size = 64, onPress, onLongPress, delayLongPress = 400, alert }: AIOrbProps) {
  const spin = useRef(new Animated.Value(0)).current;
  const fleckSpin = useRef(new Animated.Value(0)).current;
  const floatAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(
      Animated.timing(spin, { toValue: 1, duration: 32000, easing: Easing.linear, useNativeDriver: true })
    ).start();
    Animated.loop(
      Animated.timing(fleckSpin, { toValue: 1, duration: 12000, easing: Easing.linear, useNativeDriver: true })
    ).start();
    Animated.loop(
      Animated.sequence([
        Animated.timing(floatAnim, { toValue: 1, duration: 3000, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(floatAnim, { toValue: 0, duration: 3000, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ])
    ).start();
  }, []);

  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  const fleckRotate = fleckSpin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  const floatY = floatAnim.interpolate({ inputRange: [0, 1], outputRange: [0, -scale(7)] });

  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={delayLongPress}
      style={{ position: 'absolute', bottom: scale(100), right: scale(20), zIndex: 1000 }}
    >
      <Animated.View
        style={{
          width: size + scale(24),
          height: size + scale(24),
          alignItems: 'center',
          justifyContent: 'center',
          transform: [{ translateY: floatY }],
        }}
      >
        {/* Rotating thread ball (no background) — purple edge glow */}
        <Animated.View
          style={{
            transform: [{ rotate }],
            shadowColor: alert ? '#E5342B' : '#A855F7',
            shadowOffset: { width: 0, height: 0 },
            shadowOpacity: 0.9,
            shadowRadius: scale(10),
            elevation: 12,
          }}
        >
          <Svg width={size} height={size} viewBox="0 0 120 120">
            {THREADS.map((t, i) => (
              <Path key={i} d={t.d} stroke={alert ? RED_PALETTE[i % RED_PALETTE.length] : t.color} strokeWidth={t.w} strokeLinecap="round" fill="none" opacity={0.9} />
            ))}
          </Svg>
        </Animated.View>

        {/* Counter-rotating bright flecks */}
        <Animated.View style={{ position: 'absolute', transform: [{ rotate: fleckRotate }] }}>
          <Svg width={size} height={size} viewBox="0 0 120 120">
            {FLECKS.map((f, i) => (
              <Circle key={i} cx={f.cx} cy={f.cy} r={2.4} fill={alert ? '#FFD2CD' : f.fill} />
            ))}
          </Svg>
        </Animated.View>
      </Animated.View>
    </TouchableOpacity>
  );
}
