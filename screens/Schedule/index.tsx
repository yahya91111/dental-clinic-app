import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StatusBar, Animated } from 'react-native';
import { scale } from '../../lib/scale';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { DayOfWeek } from './types';
import { ScheduleGrid } from './ScheduleGrid';
import { CellDetailModal } from './CellDetailModal';
import { WeekStrip } from './WeekStrip';
import { MOCK_SLOTS } from './mockData';

interface ScheduleScreenProps {
  onBack: () => void;
}

export default function ScheduleScreen({ onBack }: ScheduleScreenProps) {
  // Blob animations (matching DoctorProfileScreen)
  const blob1Anim = useRef(new Animated.Value(0)).current;
  const blob2Anim = useRef(new Animated.Value(0)).current;
  const blob3Anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const createBlobLoop = (anim: Animated.Value, duration: number) => {
      Animated.loop(
        Animated.sequence([
          Animated.timing(anim, { toValue: 1, duration, useNativeDriver: true }),
          Animated.timing(anim, { toValue: 0, duration, useNativeDriver: true }),
        ])
      ).start();
    };
    createBlobLoop(blob1Anim, 8000);
    createBlobLoop(blob2Anim, 10000);
    createBlobLoop(blob3Anim, 12000);
  }, []);

  // Week navigation - selected week start (Sunday)
  const getCurrentSunday = () => {
    const now = new Date();
    const d = new Date(now);
    d.setDate(d.getDate() - d.getDay());
    d.setHours(0, 0, 0, 0);
    return d;
  };
  const [selectedWeekStart, setSelectedWeekStart] = useState(getCurrentSunday());

  // Cell detail modal
  const [selectedCell, setSelectedCell] = useState<{ day: DayOfWeek; period: number } | null>(null);

  // Currently using mock data
  const slots = MOCK_SLOTS;

  return (
    <View style={{ flex: 1 }}>
      <StatusBar translucent={true} backgroundColor="transparent" barStyle="dark-content" />
      {/* Gradient Mesh Background - matching DoctorProfileScreen */}
      <LinearGradient
        colors={['#F0F4F8', '#E8EDF3', '#F5F0F8']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
      />
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        <View style={{ flex: 1 }}>

          {/* Animated Blobs - matching DoctorProfileScreen */}
          <Animated.View
            style={{
              position: 'absolute',
              width: scale(300),
              height: scale(300),
              borderRadius: scale(150),
              top: scale(100),
              right: scale(-50),
              backgroundColor: 'rgba(167, 139, 250, 0.15)',
              transform: [
                { translateX: blob1Anim.interpolate({ inputRange: [0, 1], outputRange: [0, scale(30)] }) },
                { translateY: blob1Anim.interpolate({ inputRange: [0, 1], outputRange: [0, scale(-40)] }) },
              ],
            }}
          />
          <Animated.View
            style={{
              position: 'absolute',
              width: scale(300),
              height: scale(300),
              borderRadius: scale(150),
              bottom: scale(150),
              left: scale(-80),
              backgroundColor: 'rgba(125, 211, 252, 0.12)',
              transform: [
                { translateX: blob2Anim.interpolate({ inputRange: [0, 1], outputRange: [0, scale(-50)] }) },
                { translateY: blob2Anim.interpolate({ inputRange: [0, 1], outputRange: [0, scale(30)] }) },
              ],
            }}
          />
          <Animated.View
            style={{
              position: 'absolute',
              width: scale(300),
              height: scale(300),
              borderRadius: scale(150),
              top: '50%',
              right: '20%',
              backgroundColor: 'rgba(240, 98, 146, 0.1)',
              transform: [
                { translateX: blob3Anim.interpolate({ inputRange: [0, 1], outputRange: [0, scale(40)] }) },
                { translateY: blob3Anim.interpolate({ inputRange: [0, 1], outputRange: [0, scale(-50)] }) },
              ],
            }}
          />

          {/* Header - matching DoctorsScreen style */}
          <View style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingHorizontal: scale(20),
            paddingVertical: scale(16),
          }}>
            <TouchableOpacity
              onPress={onBack}
              style={{
                width: scale(40),
                height: scale(40),
                borderRadius: scale(20),
                backgroundColor: 'rgba(255,255,255,0.25)',
                alignItems: 'center',
                justifyContent: 'center',
                borderWidth: scale(2),
                borderColor: 'rgba(255,255,255,0.4)',
              }}
            >
              <Ionicons name="arrow-back" size={scale(24)} color="#2D3748" />
            </TouchableOpacity>
            <Text style={{
              fontSize: scale(34),
              fontWeight: '700',
              color: '#4A5568',
              letterSpacing: -0.5,
              flex: 1,
              textAlign: 'center',
            }}>Schedule</Text>
            <View style={{ width: scale(40) }} />
          </View>

          {/* Week Strip - attached to header */}
          <WeekStrip
            selectedWeekStart={selectedWeekStart}
            onSelectWeek={setSelectedWeekStart}
          />

          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{ paddingHorizontal: scale(10), paddingTop: scale(12), paddingBottom: scale(40) }}
            showsVerticalScrollIndicator={false}
          >

            {/* Schedule Grid */}
            <ScheduleGrid
              slots={slots}
              onCellPress={(day, period) => setSelectedCell({ day, period })}
            />

          </ScrollView>
        </View>
      </SafeAreaView>

      {/* Cell Detail Modal */}
      <CellDetailModal
        visible={selectedCell !== null}
        day={selectedCell?.day || null}
        period={selectedCell?.period || null}
        slots={slots}
        onClose={() => setSelectedCell(null)}
      />
    </View>
  );
}
