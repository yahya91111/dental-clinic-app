import React from 'react';
import { Animated } from 'react-native';
import Svg, { Line } from 'react-native-svg';
import { styles } from './styles';

// ═══════════════════════════════════════════════════════════════
// Cross Divider Lines Component
// Yellow separator lines between quadrants in the teeth grid
// ═══════════════════════════════════════════════════════════════

interface CrossDividerLinesProps {
  verticalTopLineSlide: Animated.Value;
  verticalBottomLineSlide: Animated.Value;
  horizontalLeftLineSlide: Animated.Value;
  horizontalRightLineSlide: Animated.Value;
}

export function CrossDividerLines({
  verticalTopLineSlide,
  verticalBottomLineSlide,
  horizontalLeftLineSlide,
  horizontalRightLineSlide,
}: CrossDividerLinesProps) {
  return (
    <>
      {/* الخط العمودي العلوي */}
      <Animated.View
        style={[styles.centerDivider, { transform: [{ translateY: verticalTopLineSlide }] }]}
        pointerEvents="none"
      >
        <Svg width="100%" height="100%" viewBox="0 0 100 100">
          {/* الخط العمودي الأصفر الصغير في الأعلى بين رقم 1 و1 */}
          <Line
            x1="50"
            y1="-30"
            x2="50"
            y2="-10"
            stroke="rgba(251, 191, 36, 0.3)"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </Svg>
      </Animated.View>

      {/* الخط العمودي السفلي */}
      <Animated.View
        style={[styles.centerDivider, { transform: [{ translateY: verticalBottomLineSlide }] }]}
        pointerEvents="none"
      >
        <Svg width="100%" height="100%" viewBox="0 0 100 100">
          {/* الخط العمودي الأصفر الصغير في الأسفل بين رقم 1 و1 للفك السفلي */}
          <Line
            x1="50"
            y1="110"
            x2="50"
            y2="130"
            stroke="rgba(251, 191, 36, 0.3)"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </Svg>
      </Animated.View>

      {/* الخط الأفقي الأيسر */}
      <Animated.View
        style={[styles.centerDivider, { transform: [{ translateX: horizontalLeftLineSlide }] }]}
        pointerEvents="none"
      >
        <Svg width="100%" height="100%" viewBox="0 0 100 100">
          {/* الخط الأفقي الأصفر الصغير بين 8 و 8 على اليسار */}
          <Line
            x1="10"
            y1="50"
            x2="30"
            y2="50"
            stroke="rgba(251, 191, 36, 0.3)"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </Svg>
      </Animated.View>

      {/* الخط الأفقي الأيمن */}
      <Animated.View
        style={[styles.centerDivider, { transform: [{ translateX: horizontalRightLineSlide }] }]}
        pointerEvents="none"
      >
        <Svg width="100%" height="100%" viewBox="0 0 100 100">
          {/* الخط الأفقي الأصفر الصغير بين 8 و 8 على اليمين */}
          <Line
            x1="70"
            y1="50"
            x2="90"
            y2="50"
            stroke="rgba(251, 191, 36, 0.3)"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </Svg>
      </Animated.View>
    </>
  );
}
