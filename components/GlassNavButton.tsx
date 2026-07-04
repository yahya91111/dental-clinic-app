import React, { useRef } from 'react';
import { View, TouchableOpacity, Animated, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { scale } from '../lib/scale';

// زرُّ تنقّلٍ (إكس/عودة) داخلَ حاويةٍ زجاجيّةٍ بلا لون — مشترَكٌ بين صفحاتِ الذكاء:
// زجاجٌ صقيلٌ شفّافٌ محايد (أبيضُ خفيفٌ لا تلوينَ بنفسجيّ) بحافّةٍ فاتحةٍ ولمعةٍ علويّة،
// والأيقونةُ بيضاءُ في وسطه. يَنكمشُ قليلًا ويلمعُ لمعةً بيضاءَ خفيفةً لحظةَ النقر.
export function GlassNavButton({ icon, onPress, idPrefix, size = scale(40), iconSize = scale(24), nudge = 0 }: { icon: keyof typeof Ionicons.glyphMap; onPress: () => void; idPrefix?: string; size?: number; iconSize?: number; nudge?: number }) {
  const press = useRef(new Animated.Value(0)).current;
  const animTo = (v: number) => Animated.spring(press, { toValue: v, useNativeDriver: true, speed: 40, bounciness: v ? 0 : 8 }).start();
  const sc = press.interpolate({ inputRange: [0, 1], outputRange: [1, 0.88] });
  const tapSheen = press.interpolate({ inputRange: [0, 1], outputRange: [0, 0.16] });   // برقُ لمسٍ أبيضُ خفيف (بلا لون)
  return (
    <TouchableOpacity onPress={onPress} onPressIn={() => animTo(1)} onPressOut={() => animTo(0)} activeOpacity={1} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
      <Animated.View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center', transform: [{ scale: sc }] }}>
        {/* الحاويةُ الزجاجيّةُ بلا لون (زجاجٌ صقيلٌ محايد) */}
        <View style={{ position: 'absolute', width: size, height: size, borderRadius: size / 2, overflow: 'hidden', borderWidth: scale(1), borderColor: 'rgba(255,255,255,0.22)' }}>
          <LinearGradient colors={['rgba(255,255,255,0.12)', 'rgba(255,255,255,0.05)', 'rgba(255,255,255,0.02)']} start={{ x: 0.2, y: 0 }} end={{ x: 0.8, y: 1 }} style={StyleSheet.absoluteFill} />
          {/* لمعةٌ علويّةٌ زجاجيّة */}
          <LinearGradient colors={['rgba(255,255,255,0.30)', 'rgba(255,255,255,0)']} start={{ x: 0.5, y: 0 }} end={{ x: 0.5, y: 1 }} style={{ position: 'absolute', top: 0, left: 0, right: 0, height: size * 0.5 }} />
          {/* برقُ اللمسِ — أبيضُ صرفٌ بلا لون */}
          <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: '#FFFFFF', opacity: tapSheen }]} />
        </View>
        {/* الأيقونةُ — بيضاءُ بظلٍّ خفيفٍ للوضوحِ (بلا لون) */}
        <Ionicons name={icon} size={iconSize} color="#FFFFFF" style={{ marginLeft: nudge, textShadowColor: 'rgba(0,0,0,0.35)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: scale(4) }} />
      </Animated.View>
    </TouchableOpacity>
  );
}
