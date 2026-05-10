import React, { useEffect, useRef } from 'react';
import { View, TouchableOpacity, Animated, StyleSheet } from 'react-native';
import { scale } from '../lib/scale';

export type AIState = 'idle' | 'listening' | 'thinking' | 'success' | 'error';

interface AIOrbProps {
  state?: AIState;
  size?: number;
  onPress: () => void;
}

// Colors per state
const STATE_COLORS: Record<AIState, { core: string[]; ring: string; wave: string }> = {
  idle: {
    core: ['rgba(255,255,255,0.95)', 'rgba(200,180,255,0.9)', 'rgba(139,92,246,0.8)', 'rgba(107,63,160,0.6)'],
    ring: 'rgba(139,92,246,0.4)',
    wave: 'rgba(167,139,250,0.35)',
  },
  listening: {
    core: ['rgba(255,255,255,0.95)', 'rgba(180,200,255,0.9)', 'rgba(59,130,246,0.8)', 'rgba(37,99,235,0.6)'],
    ring: 'rgba(59,130,246,0.5)',
    wave: 'rgba(59,130,246,0.35)',
  },
  thinking: {
    core: ['rgba(255,255,255,0.95)', 'rgba(180,160,255,0.9)', 'rgba(124,58,237,0.85)', 'rgba(100,50,180,0.7)'],
    ring: 'rgba(124,58,237,0.5)',
    wave: 'rgba(124,58,237,0.35)',
  },
  success: {
    core: ['rgba(255,255,255,0.95)', 'rgba(180,255,200,0.9)', 'rgba(34,197,94,0.8)', 'rgba(22,163,74,0.6)'],
    ring: 'rgba(34,197,94,0.4)',
    wave: 'rgba(34,197,94,0.35)',
  },
  error: {
    core: ['rgba(255,255,255,0.9)', 'rgba(255,180,180,0.9)', 'rgba(239,68,68,0.8)', 'rgba(220,38,38,0.6)'],
    ring: 'rgba(239,68,68,0.4)',
    wave: 'rgba(239,68,68,0.3)',
  },
};

export function AIOrb({ state = 'idle', size = 60, onPress }: AIOrbProps) {
  const coreSize = size * 0.56;

  // Animations
  const pulseAnim = useRef(new Animated.Value(0)).current;
  const wave1Anim = useRef(new Animated.Value(0)).current;
  const wave2Anim = useRef(new Animated.Value(0)).current;
  const wave3Anim = useRef(new Animated.Value(0)).current;
  const floatAnim = useRef(new Animated.Value(0)).current;
  const shakeAnim = useRef(new Animated.Value(0)).current;
  const particle1Anim = useRef(new Animated.Value(0)).current;
  const particle2Anim = useRef(new Animated.Value(0)).current;
  const particle3Anim = useRef(new Animated.Value(0)).current;

  // Pulse speed based on state
  const getPulseDuration = () => {
    switch (state) {
      case 'thinking': return 800;
      case 'listening': return 1000;
      case 'error': return 300;
      default: return 2000;
    }
  };

  const getWaveDuration = () => {
    switch (state) {
      case 'thinking': return 1500;
      case 'listening': return 2000;
      default: return 3000;
    }
  };

  useEffect(() => {
    // Core pulse
    const pulseDur = getPulseDuration();
    const pulseLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1, duration: pulseDur, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 0, duration: pulseDur, useNativeDriver: true }),
      ])
    );
    pulseLoop.start();

    // Waves
    const waveDur = getWaveDuration();
    const waveLoop1 = Animated.loop(
      Animated.timing(wave1Anim, { toValue: 1, duration: waveDur, useNativeDriver: true })
    );
    const waveLoop2 = Animated.loop(
      Animated.timing(wave2Anim, { toValue: 1, duration: waveDur, useNativeDriver: true })
    );
    const waveLoop3 = Animated.loop(
      Animated.timing(wave3Anim, { toValue: 1, duration: waveDur, useNativeDriver: true })
    );
    waveLoop1.start();
    setTimeout(() => waveLoop2.start(), waveDur / 3);
    setTimeout(() => waveLoop3.start(), (waveDur * 2) / 3);

    // Float (idle only)
    const floatLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(floatAnim, { toValue: 1, duration: state === 'thinking' ? 1000 : 3000, useNativeDriver: true }),
        Animated.timing(floatAnim, { toValue: 0, duration: state === 'thinking' ? 1000 : 3000, useNativeDriver: true }),
      ])
    );
    floatLoop.start();

    // Particles
    const particleLoop1 = Animated.loop(Animated.timing(particle1Anim, { toValue: 1, duration: 4000, useNativeDriver: true }));
    const particleLoop2 = Animated.loop(Animated.timing(particle2Anim, { toValue: 1, duration: 4000, useNativeDriver: true }));
    const particleLoop3 = Animated.loop(Animated.timing(particle3Anim, { toValue: 1, duration: 4000, useNativeDriver: true }));
    particleLoop1.start();
    setTimeout(() => particleLoop2.start(), 1300);
    setTimeout(() => particleLoop3.start(), 2600);

    // Error shake
    if (state === 'error') {
      Animated.sequence([
        ...Array(3).fill(null).flatMap(() => [
          Animated.timing(shakeAnim, { toValue: 1, duration: 75, useNativeDriver: true }),
          Animated.timing(shakeAnim, { toValue: -1, duration: 75, useNativeDriver: true }),
        ]),
        Animated.timing(shakeAnim, { toValue: 0, duration: 75, useNativeDriver: true }),
      ]).start();
    }

    return () => {
      pulseLoop.stop();
      waveLoop1.stop();
      waveLoop2.stop();
      waveLoop3.stop();
      floatLoop.stop();
      particleLoop1.stop();
      particleLoop2.stop();
      particleLoop3.stop();
    };
  }, [state]);

  const colors = STATE_COLORS[state];

  const coreScale = pulseAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [1, state === 'thinking' ? 1.15 : state === 'listening' ? 1.12 : 1.08],
  });

  const floatY = floatAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -scale(6)],
  });

  const shakeX = shakeAnim.interpolate({
    inputRange: [-1, 0, 1],
    outputRange: [-3, 0, 3],
  });

  const renderWave = (anim: Animated.Value) => (
    <Animated.View
      style={{
        position: 'absolute',
        width: size,
        height: size,
        borderRadius: size / 2,
        borderWidth: 1.5,
        borderColor: colors.wave,
        transform: [{
          scale: anim.interpolate({ inputRange: [0, 1], outputRange: [1, 2.2] }),
        }],
        opacity: anim.interpolate({ inputRange: [0, 0.7, 1], outputRange: [0.5, 0.15, 0] }),
      }}
    />
  );

  const renderParticle = (anim: Animated.Value, orbitRadius: number) => (
    <Animated.View
      style={{
        position: 'absolute',
        width: scale(3),
        height: scale(3),
        borderRadius: scale(1.5),
        backgroundColor: state === 'success' ? 'rgba(180,255,200,0.8)' : 'rgba(200,180,255,0.7)',
        transform: [
          {
            translateX: Animated.multiply(
              anim.interpolate({ inputRange: [0, 0.25, 0.5, 0.75, 1], outputRange: [1, 0, -1, 0, 1] }),
              orbitRadius
            ),
          },
          {
            translateY: Animated.multiply(
              anim.interpolate({ inputRange: [0, 0.25, 0.5, 0.75, 1], outputRange: [0, -1, 0, 1, 0] }),
              orbitRadius
            ),
          },
        ],
        opacity: anim.interpolate({ inputRange: [0, 0.1, 0.9, 1], outputRange: [0, 1, 1, 0] }),
      }}
    />
  );

  return (
    <TouchableOpacity
      activeOpacity={0.8}
      onPress={onPress}
      style={{
        position: 'absolute',
        bottom: scale(100),
        right: scale(20),
        zIndex: 1000,
      }}
    >
      <Animated.View style={{
        width: size + scale(24),
        height: size + scale(24),
        alignItems: 'center',
        justifyContent: 'center',
        transform: [
          { translateY: floatY },
          { translateX: shakeX },
        ],
      }}>
        {/* Waves */}
        {renderWave(wave1Anim)}
        {renderWave(wave2Anim)}
        {renderWave(wave3Anim)}

        {/* Outer rings */}
        <Animated.View style={{
          position: 'absolute',
          width: size,
          height: size,
          borderRadius: size / 2,
          borderWidth: 2,
          borderColor: colors.ring,
          opacity: pulseAnim.interpolate({ inputRange: [0, 1], outputRange: [0.5, 1] }),
          transform: [{ scale: pulseAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 1.05] }) }],
        }} />
        <Animated.View style={{
          position: 'absolute',
          width: size + scale(12),
          height: size + scale(12),
          borderRadius: (size + scale(12)) / 2,
          borderWidth: 1.5,
          borderColor: colors.ring.replace(/[\d.]+\)$/, '0.2)'),
          opacity: pulseAnim.interpolate({ inputRange: [0, 1], outputRange: [0.3, 0.7] }),
        }} />

        {/* Core */}
        <Animated.View style={{
          width: coreSize,
          height: coreSize,
          borderRadius: coreSize / 2,
          backgroundColor: colors.core[2],
          transform: [{ scale: coreScale }],
          shadowColor: colors.core[2],
          shadowOffset: { width: 0, height: 0 },
          shadowOpacity: 0.8,
          shadowRadius: scale(15),
          elevation: 10,
        }}>
          {/* Inner highlight */}
          <View style={{
            width: coreSize * 0.6,
            height: coreSize * 0.6,
            borderRadius: coreSize * 0.3,
            backgroundColor: 'rgba(255,255,255,0.35)',
            position: 'absolute',
            top: coreSize * 0.12,
            left: coreSize * 0.15,
          }} />
        </Animated.View>

        {/* Particles */}
        {renderParticle(particle1Anim, size * 0.45)}
        {renderParticle(particle2Anim, size * 0.45)}
        {renderParticle(particle3Anim, size * 0.45)}
      </Animated.View>
    </TouchableOpacity>
  );
}
