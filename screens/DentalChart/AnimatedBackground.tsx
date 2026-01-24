import React, { useState, useEffect } from 'react';
import { Animated } from 'react-native';
import { styles } from './styles';

// ═══════════════════════════════════════════════════════════════
// Animated Background Component
// Same blobs design as PatientProfileScreen
// ═══════════════════════════════════════════════════════════════

export function AnimatedBackground() {
  // Animated Blobs
  const blob1Anim = useState(new Animated.Value(0))[0];
  const blob2Anim = useState(new Animated.Value(0))[0];
  const blob3Anim = useState(new Animated.Value(0))[0];
  const blob4Anim = useState(new Animated.Value(0))[0];
  const blob5Anim = useState(new Animated.Value(0))[0];
  const blob6Anim = useState(new Animated.Value(0))[0];

  useEffect(() => {
    // Blob animations
    const animateBlob = (anim: Animated.Value, duration: number) => {
      Animated.loop(
        Animated.sequence([
          Animated.timing(anim, {
            toValue: 1,
            duration: duration,
            useNativeDriver: true,
          }),
          Animated.timing(anim, {
            toValue: 0,
            duration: duration,
            useNativeDriver: true,
          }),
        ])
      ).start();
    };

    animateBlob(blob1Anim, 6000);
    animateBlob(blob2Anim, 7000);
    animateBlob(blob3Anim, 8000);
    animateBlob(blob4Anim, 6500);
    animateBlob(blob5Anim, 7500);
    animateBlob(blob6Anim, 6800);
  }, []);

  return (
    <>
      {/* Blob 1 - Top Left Blue */}
      <Animated.View
        style={[
          styles.timelineBlob,
          {
            top: '3%',
            left: '5%',
            width: 180,
            height: 180,
            backgroundColor: 'rgba(91, 159, 237, 0.15)',
            transform: [
              {
                translateX: blob1Anim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0, 30],
                }),
              },
              {
                translateY: blob1Anim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0, -20],
                }),
              },
            ],
          },
        ]}
      />

      {/* Blob 2 - Top Right Yellow */}
      <Animated.View
        style={[
          styles.timelineBlob,
          {
            top: '15%',
            right: '10%',
            width: 220,
            height: 220,
            backgroundColor: 'rgba(251, 191, 36, 0.12)',
            transform: [
              {
                translateX: blob2Anim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0, -25],
                }),
              },
              {
                translateY: blob2Anim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0, 35],
                }),
              },
            ],
          },
        ]}
      />

      {/* Blob 3 - Bottom Center Blue */}
      <Animated.View
        style={[
          styles.timelineBlob,
          {
            bottom: '5%',
            left: '55%',
            marginLeft: -100,
            width: 200,
            height: 200,
            backgroundColor: 'rgba(91, 159, 237, 0.15)',
            transform: [
              {
                translateX: blob3Anim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0, 20],
                }),
              },
              {
                translateY: blob3Anim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0, -30],
                }),
              },
            ],
          },
        ]}
      />

      {/* Blob 4 - Middle Right Yellow */}
      <Animated.View
        style={[
          styles.timelineBlob,
          {
            top: '35%',
            left: '75%',
            width: 160,
            height: 160,
            backgroundColor: 'rgba(251, 191, 36, 0.12)',
            transform: [
              {
                translateX: blob4Anim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0, -20],
                }),
              },
              {
                translateY: blob4Anim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0, 25],
                }),
              },
            ],
          },
        ]}
      />

      {/* Blob 5 - Top Center Blue */}
      <Animated.View
        style={[
          styles.timelineBlob,
          {
            top: '20%',
            right: '25%',
            width: 170,
            height: 170,
            backgroundColor: 'rgba(91, 159, 237, 0.15)',
            transform: [
              {
                translateX: blob5Anim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0, 28],
                }),
              },
              {
                translateY: blob5Anim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0, -32],
                }),
              },
            ],
          },
        ]}
      />

      {/* Blob 6 - Bottom Left Yellow */}
      <Animated.View
        style={[
          styles.timelineBlob,
          {
            bottom: '30%',
            left: '15%',
            width: 150,
            height: 150,
            backgroundColor: 'rgba(251, 191, 36, 0.12)',
            transform: [
              {
                translateX: blob6Anim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0, -18],
                }),
              },
              {
                translateY: blob6Anim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0, 22],
                }),
              },
            ],
          },
        ]}
      />
    </>
  );
}
