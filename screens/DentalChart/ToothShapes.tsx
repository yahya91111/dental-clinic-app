// ===============================================================
// Tooth SVG Shape Components
// ===============================================================
// All tooth shape components for the dental chart visualization

import React, { useRef, useEffect } from 'react';
import { View, TouchableOpacity, Animated } from 'react-native';
import Svg, { Line, Rect, Defs, ClipPath, G, Polygon } from 'react-native-svg';
import { CONDITION_COLORS } from './constants';
import { ToothSurfaceConditions } from './dentalHelpers';

// ---------------------------------------------------------------
// Props Interface
// ---------------------------------------------------------------
export interface ToothWithSectionsProps {
  colors?: ToothSurfaceConditions;
  onToothPress?: () => void;
  onSurfacePress?: (surface: keyof ToothSurfaceConditions) => void;
  rotation?: number;
  swapSides?: boolean;
  borderColor?: string;
}

// ---------------------------------------------------------------
// Basic Tooth Components (Display Only)
// ---------------------------------------------------------------

// Molar tooth shape - oval
export const ToothWithSections: React.FC = () => {
  return (
    <View style={{ width: 40, height: 52, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width="40" height="52" viewBox="0 0 40 52">
        <Rect x="2" y="2" width="36" height="48" rx="18" ry="18" fill="transparent" stroke="rgba(255, 255, 255, 0.9)" strokeWidth="2" />
        <Rect x="14" y="18" width="12" height="16" rx="2" ry="2" fill="transparent" stroke="rgba(255, 255, 255, 0.9)" strokeWidth="1.5" />
        <Line x1="14" y1="18" x2="8" y2="8" stroke="rgba(255, 255, 255, 0.9)" strokeWidth="1.5" />
        <Line x1="26" y1="18" x2="32" y2="8" stroke="rgba(255, 255, 255, 0.9)" strokeWidth="1.5" />
        <Line x1="14" y1="34" x2="8" y2="44" stroke="rgba(255, 255, 255, 0.9)" strokeWidth="1.5" />
        <Line x1="26" y1="34" x2="32" y2="44" stroke="rgba(255, 255, 255, 0.9)" strokeWidth="1.5" />
      </Svg>
    </View>
  );
};

// Molar tooth shape - square (teeth 6, 7, 8)
export const ToothWithSectionsSquare: React.FC = () => {
  return (
    <View style={{ width: 40, height: 52, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width="40" height="52" viewBox="0 0 40 52">
        <Rect x="2" y="2" width="36" height="48" rx="8" ry="8" fill="transparent" stroke="rgba(255, 255, 255, 0.9)" strokeWidth="2" />
        <Rect x="14" y="18" width="12" height="16" rx="2" ry="2" fill="transparent" stroke="rgba(255, 255, 255, 0.9)" strokeWidth="1.5" />
        <Line x1="14" y1="18" x2="4" y2="4" stroke="rgba(255, 255, 255, 0.9)" strokeWidth="1.5" />
        <Line x1="26" y1="18" x2="36" y2="4" stroke="rgba(255, 255, 255, 0.9)" strokeWidth="1.5" />
        <Line x1="14" y1="34" x2="4" y2="48" stroke="rgba(255, 255, 255, 0.9)" strokeWidth="1.5" />
        <Line x1="26" y1="34" x2="36" y2="48" stroke="rgba(255, 255, 255, 0.9)" strokeWidth="1.5" />
      </Svg>
    </View>
  );
};

// Small canine (tooth 3)
export const ToothWithSectionsCanineSmall: React.FC = () => {
  return (
    <View style={{ width: 30, height: 38, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width="30" height="38" viewBox="0 0 32 50">
        <Rect x="2" y="2" width="28" height="46" rx="14" ry="20" fill="rgba(251, 191, 36, 0.15)" stroke="rgba(251, 191, 36, 0.3)" strokeWidth="1" />
        <Rect x="2" y="2" width="28" height="46" rx="14" ry="20" fill="transparent" stroke="rgba(135, 206, 250, 0.95)" strokeWidth="2.5" />
        <Rect x="10" y="17" width="12" height="16" rx="2" ry="2" fill="rgba(251, 191, 36, 0.12)" stroke="rgba(135, 206, 250, 0.85)" strokeWidth="1.8" />
        <Line x1="10" y1="17" x2="5" y2="7" stroke="rgba(135, 206, 250, 0.8)" strokeWidth="1.8" />
        <Line x1="22" y1="17" x2="27" y2="7" stroke="rgba(135, 206, 250, 0.8)" strokeWidth="1.8" />
        <Line x1="10" y1="33" x2="5" y2="43" stroke="rgba(135, 206, 250, 0.8)" strokeWidth="1.8" />
        <Line x1="22" y1="33" x2="27" y2="43" stroke="rgba(135, 206, 250, 0.8)" strokeWidth="1.8" />
      </Svg>
    </View>
  );
};

// Small incisor (teeth 1, 2)
export const ToothWithSectionsIncisorSmall: React.FC = () => {
  return (
    <View style={{ width: 30, height: 38, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width="30" height="38" viewBox="0 0 30 48">
        <Rect x="2" y="2" width="26" height="44" rx="13" ry="18" fill="rgba(251, 191, 36, 0.15)" stroke="rgba(251, 191, 36, 0.3)" strokeWidth="1" />
        <Rect x="2" y="2" width="26" height="44" rx="13" ry="18" fill="transparent" stroke="rgba(135, 206, 250, 0.95)" strokeWidth="2.5" />
        <Rect x="9" y="16" width="12" height="16" rx="2" ry="2" fill="rgba(251, 191, 36, 0.12)" stroke="rgba(135, 206, 250, 0.85)" strokeWidth="1.8" />
        <Line x1="9" y1="16" x2="4" y2="7" stroke="rgba(135, 206, 250, 0.8)" strokeWidth="1.8" />
        <Line x1="21" y1="16" x2="26" y2="7" stroke="rgba(135, 206, 250, 0.8)" strokeWidth="1.8" />
        <Line x1="9" y1="32" x2="4" y2="41" stroke="rgba(135, 206, 250, 0.8)" strokeWidth="1.8" />
        <Line x1="21" y1="32" x2="26" y2="41" stroke="rgba(135, 206, 250, 0.8)" strokeWidth="1.8" />
      </Svg>
    </View>
  );
};

// Premolar
export const ToothWithSectionsPremolar: React.FC = () => {
  return (
    <View style={{ width: 35, height: 45, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width="35" height="45" viewBox="0 0 35 45">
        <Rect x="2" y="2" width="31" height="41" rx="15" ry="15" fill="transparent" stroke="rgba(255, 255, 255, 0.9)" strokeWidth="2" />
        <Rect x="12" y="16" width="11" height="13" rx="2" ry="2" fill="transparent" stroke="rgba(255, 255, 255, 0.9)" strokeWidth="1.5" />
        <Line x1="12" y1="16" x2="7" y2="8" stroke="rgba(255, 255, 255, 0.9)" strokeWidth="1.5" />
        <Line x1="23" y1="16" x2="28" y2="8" stroke="rgba(255, 255, 255, 0.9)" strokeWidth="1.5" />
        <Line x1="12" y1="29" x2="7" y2="37" stroke="rgba(255, 255, 255, 0.9)" strokeWidth="1.5" />
        <Line x1="23" y1="29" x2="28" y2="37" stroke="rgba(255, 255, 255, 0.9)" strokeWidth="1.5" />
      </Svg>
    </View>
  );
};

// Canine
export const ToothWithSectionsCanine: React.FC = () => {
  return (
    <View style={{ width: 32, height: 50, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width="32" height="50" viewBox="0 0 32 50">
        <Rect x="2" y="2" width="28" height="46" rx="14" ry="20" fill="transparent" stroke="rgba(255, 255, 255, 0.9)" strokeWidth="2" />
        <Rect x="11" y="18" width="10" height="14" rx="2" ry="2" fill="transparent" stroke="rgba(255, 255, 255, 0.9)" strokeWidth="1.5" />
        <Line x1="11" y1="18" x2="6" y2="8" stroke="rgba(255, 255, 255, 0.9)" strokeWidth="1.5" />
        <Line x1="21" y1="18" x2="26" y2="8" stroke="rgba(255, 255, 255, 0.9)" strokeWidth="1.5" />
        <Line x1="11" y1="32" x2="6" y2="42" stroke="rgba(255, 255, 255, 0.9)" strokeWidth="1.5" />
        <Line x1="21" y1="32" x2="26" y2="42" stroke="rgba(255, 255, 255, 0.9)" strokeWidth="1.5" />
      </Svg>
    </View>
  );
};

// Incisor
export const ToothWithSectionsIncisor: React.FC = () => {
  return (
    <View style={{ width: 30, height: 48, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width="30" height="48" viewBox="0 0 30 48">
        <Rect x="2" y="2" width="26" height="44" rx="13" ry="18" fill="transparent" stroke="rgba(255, 255, 255, 0.9)" strokeWidth="2" />
        <Rect x="10" y="17" width="10" height="14" rx="2" ry="2" fill="transparent" stroke="rgba(255, 255, 255, 0.9)" strokeWidth="1.5" />
        <Line x1="10" y1="17" x2="5" y2="8" stroke="rgba(255, 255, 255, 0.9)" strokeWidth="1.5" />
        <Line x1="20" y1="17" x2="25" y2="8" stroke="rgba(255, 255, 255, 0.9)" strokeWidth="1.5" />
        <Line x1="10" y1="31" x2="5" y2="40" stroke="rgba(255, 255, 255, 0.9)" strokeWidth="1.5" />
        <Line x1="20" y1="31" x2="25" y2="40" stroke="rgba(255, 255, 255, 0.9)" strokeWidth="1.5" />
      </Svg>
    </View>
  );
};

// Incisor without center box
export const ToothWithSectionsIncisorNoCenter: React.FC = () => {
  return (
    <View style={{ width: 30, height: 48, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width="30" height="48" viewBox="0 0 30 48">
        <Rect x="2" y="2" width="26" height="44" rx="13" ry="18" fill="transparent" stroke="rgba(255, 255, 255, 0.9)" strokeWidth="2" />
        <Line x1="15" y1="8" x2="15" y2="40" stroke="rgba(255, 255, 255, 0.7)" strokeWidth="1.5" />
        <Line x1="15" y1="17" x2="5" y2="8" stroke="rgba(255, 255, 255, 0.7)" strokeWidth="1.5" />
        <Line x1="15" y1="17" x2="25" y2="8" stroke="rgba(255, 255, 255, 0.7)" strokeWidth="1.5" />
        <Line x1="15" y1="31" x2="5" y2="40" stroke="rgba(255, 255, 255, 0.7)" strokeWidth="1.5" />
        <Line x1="15" y1="31" x2="25" y2="40" stroke="rgba(255, 255, 255, 0.7)" strokeWidth="1.5" />
      </Svg>
    </View>
  );
};

// Canine without center box
export const ToothWithSectionsCanineNoCenter: React.FC = () => {
  return (
    <View style={{ width: 32, height: 50, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width="32" height="50" viewBox="0 0 32 50">
        <Rect x="2" y="2" width="28" height="46" rx="14" ry="20" fill="transparent" stroke="rgba(255, 255, 255, 0.9)" strokeWidth="2" />
        <Line x1="16" y1="8" x2="16" y2="42" stroke="rgba(255, 255, 255, 0.7)" strokeWidth="1.5" />
        <Line x1="16" y1="18" x2="6" y2="8" stroke="rgba(255, 255, 255, 0.7)" strokeWidth="1.5" />
        <Line x1="16" y1="18" x2="26" y2="8" stroke="rgba(255, 255, 255, 0.7)" strokeWidth="1.5" />
        <Line x1="16" y1="32" x2="6" y2="42" stroke="rgba(255, 255, 255, 0.7)" strokeWidth="1.5" />
        <Line x1="16" y1="32" x2="26" y2="42" stroke="rgba(255, 255, 255, 0.7)" strokeWidth="1.5" />
      </Svg>
    </View>
  );
};

// ---------------------------------------------------------------
// Interactive Tooth Components (with colors and touch)
// ---------------------------------------------------------------

// Tiny square molar (teeth 6, 7, 8 with smaller lines)
export const ToothWithSectionsSquareTiny: React.FC<ToothWithSectionsProps> = ({
  colors,
  onToothPress,
  onSurfacePress,
  rotation = 0,
  swapSides = false,
  borderColor,
}) => {
  const pulseAnim = useRef(new Animated.Value(1)).current;

  const getColor = (surface: keyof ToothSurfaceConditions) => {
    let actualSurface = surface;
    if (swapSides) {
      if (surface === 'left') actualSurface = 'right';
      else if (surface === 'right') actualSurface = 'left';
    }
    if (colors && colors[actualSurface]) {
      return CONDITION_COLORS[colors[actualSurface] as string];
    }
    return 'rgba(251, 191, 36, 0.12)';
  };

  const isMissing = colors && Object.values(colors).some(condition => condition === 'missing');
  const needsDiagnosis = colors && Object.values(colors).some(condition => condition === 'needs_diagnosis');

  useEffect(() => {
    if (needsDiagnosis) {
      const pulse = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 0.4, duration: 1500, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 1500, useNativeDriver: true }),
        ])
      );
      pulse.start();
      return () => pulse.stop();
    } else {
      pulseAnim.setValue(1);
    }
  }, [needsDiagnosis, pulseAnim]);

  const finalBorderColor = isMissing ? "#666666" : borderColor || "rgba(135, 206, 250, 0.95)";

  return (
    <TouchableOpacity
      style={{ width: 37, height: 47, alignItems: 'center', justifyContent: 'center' }}
      onPress={onToothPress}
      activeOpacity={0.7}
    >
      <Animated.View style={{ opacity: pulseAnim }}>
        <Svg width="37" height="47" viewBox="0 0 37 47">
          <Defs>
            <ClipPath id="toothClipTiny">
              <Rect x="2.5" y="2.5" width="32" height="42" rx="8.5" ry="12" />
            </ClipPath>
          </Defs>
          <Rect x="1.8" y="1.8" width="33.4" height="43.4" rx="9" ry="12.6" fill="rgba(251, 191, 36, 0.15)" stroke="rgba(251, 191, 36, 0.3)" strokeWidth="1" />
          <G clipPath="url(#toothClipTiny)">
            <Polygon points="2.5,2.5 34.5,2.5 24.1,16.3 13,16.3" fill={getColor('top')} opacity={0.85} />
            <Polygon points="13,30.8 24.1,30.8 34.5,44.5 2.5,44.5" fill={getColor('bottom')} opacity={0.85} />
            <Polygon points="2.5,2.5 13,16.3 13,30.8 2.5,44.5" fill={getColor('left')} opacity={0.85} />
            <Polygon points="24.1,16.3 34.5,2.5 34.5,44.5 24.1,30.8" fill={getColor('right')} opacity={0.85} />
            <Rect x="13" y="16.3" width="11.1" height="14.5" rx="2" ry="2" fill={getColor('center')} opacity={0.85} />
          </G>
          <Rect x="1.8" y="1.8" width="33.4" height="43.4" rx="9" ry="12.6" fill="transparent" stroke={finalBorderColor} strokeWidth="2.5" />
          {!isMissing && <Rect x="13" y="16.3" width="11.1" height="14.5" rx="2" ry="2" fill="transparent" stroke={finalBorderColor} strokeWidth="1.8" strokeOpacity={0.9} />}
          <Line x1="13" y1="16.3" x2="5" y2="5" stroke={finalBorderColor} strokeWidth="1.8" strokeOpacity={0.8} />
          <Line x1="24.1" y1="16.3" x2="32" y2="5" stroke={finalBorderColor} strokeWidth="1.8" strokeOpacity={0.8} />
          <Line x1="13" y1="30.8" x2="5" y2="42" stroke={finalBorderColor} strokeWidth="1.8" strokeOpacity={0.8} />
          <Line x1="24.1" y1="30.8" x2="32" y2="42" stroke={finalBorderColor} strokeWidth="1.8" strokeOpacity={0.8} />
          {isMissing && (
            <>
              <Line x1="8" y1="8" x2="29" y2="39" stroke="#666666" strokeWidth="3" strokeLinecap="round" />
              <Line x1="29" y1="8" x2="8" y2="39" stroke="#666666" strokeWidth="3" strokeLinecap="round" />
            </>
          )}
        </Svg>
      </Animated.View>
      {onSurfacePress && (
        <>
          <TouchableOpacity style={{ position: 'absolute', left: 3.7, top: 3.6, width: 29.6, height: 12.7, backgroundColor: 'transparent', zIndex: 1005, elevation: 1005 }} onPress={(e) => { e.stopPropagation(); onSurfacePress('top'); }} activeOpacity={0.5} />
          <TouchableOpacity style={{ position: 'absolute', left: 3.7, top: 30.8, width: 29.6, height: 12.6, backgroundColor: 'transparent', zIndex: 1005, elevation: 1005 }} onPress={(e) => { e.stopPropagation(); onSurfacePress('bottom'); }} activeOpacity={0.5} />
          <TouchableOpacity style={{ position: 'absolute', left: 3.7, top: 16.3, width: 9.3, height: 14.5, backgroundColor: 'transparent', zIndex: 1005, elevation: 1005 }} onPress={(e) => { e.stopPropagation(); onSurfacePress(swapSides ? 'right' : 'left'); }} activeOpacity={0.5} />
          <TouchableOpacity style={{ position: 'absolute', left: 24.1, top: 16.3, width: 9.2, height: 14.5, backgroundColor: 'transparent', zIndex: 1005, elevation: 1005 }} onPress={(e) => { e.stopPropagation(); onSurfacePress(swapSides ? 'left' : 'right'); }} activeOpacity={0.5} />
          <TouchableOpacity style={{ position: 'absolute', left: 13, top: 16.3, width: 11.1, height: 14.5, backgroundColor: 'transparent', zIndex: 1005, elevation: 1005 }} onPress={(e) => { e.stopPropagation(); onSurfacePress('center'); }} activeOpacity={0.5} />
        </>
      )}
    </TouchableOpacity>
  );
};

// Medium square molar (teeth 4, 5)
export const ToothWithSectionsSquareMedium: React.FC<ToothWithSectionsProps> = ({
  colors,
  onToothPress,
  onSurfacePress,
  rotation = 0,
  swapSides = false,
  borderColor,
}) => {
  const pulseAnim = useRef(new Animated.Value(1)).current;

  const getColor = (surface: keyof ToothSurfaceConditions) => {
    let actualSurface = surface;
    if (swapSides) {
      if (surface === 'left') actualSurface = 'right';
      else if (surface === 'right') actualSurface = 'left';
    }
    if (colors && colors[actualSurface]) {
      return CONDITION_COLORS[colors[actualSurface] as string];
    }
    return 'rgba(251, 191, 36, 0.12)';
  };

  const isMissing = colors && Object.values(colors).some(condition => condition === 'missing');
  const needsDiagnosis = colors && Object.values(colors).some(condition => condition === 'needs_diagnosis');

  useEffect(() => {
    if (needsDiagnosis) {
      const pulse = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 0.4, duration: 1500, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 1500, useNativeDriver: true }),
        ])
      );
      pulse.start();
      return () => pulse.stop();
    } else {
      pulseAnim.setValue(1);
    }
  }, [needsDiagnosis, pulseAnim]);

  const finalBorderColor = isMissing ? "#666666" : borderColor || "rgba(135, 206, 250, 0.95)";

  return (
    <TouchableOpacity
      style={{ width: 33, height: 42, alignItems: 'center', justifyContent: 'center' }}
      onPress={onToothPress}
      activeOpacity={0.7}
    >
      <Animated.View style={{ opacity: pulseAnim }}>
        <Svg width="33" height="42" viewBox="0 0 33 42">
          <Defs>
            <ClipPath id="toothClipMedium">
              <Rect x="2.3" y="2.3" width="28.4" height="37.4" rx="7.75" ry="10.7" />
            </ClipPath>
          </Defs>
          <Rect x="1.65" y="1.6" width="29.7" height="38.8" rx="8.25" ry="11.3" fill="rgba(251, 191, 36, 0.15)" stroke="rgba(251, 191, 36, 0.3)" strokeWidth="1" />
          <G clipPath="url(#toothClipMedium)">
            <Polygon points="2,2 31,2 21.45,14.5 11.55,14.5" fill={getColor('top')} opacity={0.85} />
            <Polygon points="11.55,27.4 21.45,27.4 31,40 2,40" fill={getColor('bottom')} opacity={0.85} />
            <Polygon points="2,2 11.55,14.5 11.55,27.4 2,40" fill={getColor('left')} opacity={0.85} />
            <Polygon points="21.45,14.5 31,2 31,40 21.45,27.4" fill={getColor('right')} opacity={0.85} />
            <Rect x="11.55" y="14.5" width="9.9" height="12.9" rx="2" ry="2" fill={getColor('center')} opacity={0.85} />
          </G>
          <Rect x="1.65" y="1.6" width="29.7" height="38.8" rx="8.25" ry="11.3" fill="transparent" stroke={finalBorderColor} strokeWidth="2.5" />
          {!isMissing && <Rect x="11.55" y="14.5" width="9.9" height="12.9" rx="2" ry="2" fill="transparent" stroke={finalBorderColor} strokeWidth="1.8" strokeOpacity={0.9} />}
          <Line x1="11.55" y1="14.5" x2="4.5" y2="4.5" stroke={finalBorderColor} strokeWidth="1.8" strokeOpacity={0.8} />
          <Line x1="21.45" y1="14.5" x2="28.5" y2="4.5" stroke={finalBorderColor} strokeWidth="1.8" strokeOpacity={0.8} />
          <Line x1="11.55" y1="27.4" x2="4.5" y2="37.5" stroke={finalBorderColor} strokeWidth="1.8" strokeOpacity={0.8} />
          <Line x1="21.45" y1="27.4" x2="28.5" y2="37.5" stroke={finalBorderColor} strokeWidth="1.8" strokeOpacity={0.8} />
          {isMissing && (
            <>
              <Line x1="7" y1="7" x2="26" y2="35" stroke="#666666" strokeWidth="3" strokeLinecap="round" />
              <Line x1="26" y1="7" x2="7" y2="35" stroke="#666666" strokeWidth="3" strokeLinecap="round" />
            </>
          )}
        </Svg>
      </Animated.View>
      {onSurfacePress && (
        <>
          <TouchableOpacity style={{ position: 'absolute', left: 3.3, top: 3.2, width: 26.4, height: 11.3, zIndex: 1005, elevation: 1005 }} onPress={(e) => { e.stopPropagation(); onSurfacePress('top'); }} activeOpacity={1} />
          <TouchableOpacity style={{ position: 'absolute', left: 3.3, top: 27.5, width: 26.4, height: 11.3, zIndex: 1005, elevation: 1005 }} onPress={(e) => { e.stopPropagation(); onSurfacePress('bottom'); }} activeOpacity={1} />
          <TouchableOpacity style={{ position: 'absolute', left: 3.3, top: 14.5, width: 8.25, height: 13, zIndex: 1005, elevation: 1005 }} onPress={(e) => { e.stopPropagation(); onSurfacePress(swapSides ? 'right' : 'left'); }} activeOpacity={1} />
          <TouchableOpacity style={{ position: 'absolute', left: 21.45, top: 14.5, width: 8.25, height: 13, zIndex: 1005, elevation: 1005 }} onPress={(e) => { e.stopPropagation(); onSurfacePress(swapSides ? 'left' : 'right'); }} activeOpacity={1} />
          <TouchableOpacity style={{ position: 'absolute', left: 11.55, top: 14.5, width: 9.9, height: 12.9, zIndex: 1005, elevation: 1005 }} onPress={(e) => { e.stopPropagation(); onSurfacePress('center'); }} activeOpacity={1} />
        </>
      )}
    </TouchableOpacity>
  );
};
