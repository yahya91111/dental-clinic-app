import React from 'react';
import { View, Text, TouchableOpacity, Platform } from 'react-native';
import { scale } from '../../lib/scale';
import { LinearGradient } from 'expo-linear-gradient';
import { DAYS, PERIODS, ScheduleSlot, DayOfWeek, STATUS_CONFIG, ROLE_CONFIG } from './types';

interface ScheduleGridProps {
  slots: ScheduleSlot[];
  onCellPress: (day: DayOfWeek, period: number) => void;
}

export function ScheduleGrid({ slots, onCellPress }: ScheduleGridProps) {
  const getSlots = (day: DayOfWeek, period: number) =>
    slots.filter(s => s.day === day && s.period === period);

  return (
    <View style={{ gap: scale(16) }}>
      {DAYS.map(day => (
        <View key={day.key} style={{
          borderRadius: scale(18),
          overflow: 'hidden',
          backgroundColor: 'rgba(255, 255, 255, 0.35)',
          borderWidth: scale(2.5),
          borderColor: 'rgba(255, 255, 255, 0.7)',
          shadowColor: Platform.OS === 'android' ? 'transparent' : '#5B9FED',
          shadowOffset: { width: 0, height: Platform.OS === 'android' ? 0 : scale(2) },
          shadowOpacity: Platform.OS === 'android' ? 0 : 0.1,
          shadowRadius: Platform.OS === 'android' ? 0 : scale(8),
          elevation: Platform.OS === 'android' ? 0 : 3,
        }}>

          {/* Row 1: Day + Periods with doctors */}
          <View style={{ flexDirection: 'row' }}>
            {/* Periods */}
            <LinearGradient
              colors={['rgba(184, 212, 241, 0.25)', 'rgba(212, 184, 232, 0.25)']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={{ flex: 1, flexDirection: 'row' }}
            >
              {PERIODS.map((period, periodIndex) => {
                const cellSlots = getSlots(day.key, period.id);
                return (
                  <TouchableOpacity
                    key={period.id}
                    activeOpacity={0.7}
                    onPress={() => onCellPress(day.key, period.id)}
                    style={{
                      flex: 1,
                      paddingVertical: scale(10),
                      paddingHorizontal: scale(4),
                      alignItems: 'center',
                      justifyContent: 'flex-start',
                      borderRightWidth: periodIndex < PERIODS.length - 1 ? scale(1.5) : 0,
                      borderRightColor: 'rgba(255, 255, 255, 0.6)',
                    }}
                  >
                    {/* Period header */}
                    <LinearGradient
                      colors={['rgba(124,108,180,0.4)', 'rgba(167,155,203,0.25)', 'rgba(167,155,203,0.25)', 'rgba(124,108,180,0.4)']}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 0 }}
                      style={{
                        paddingVertical: scale(4),
                        marginBottom: scale(6),
                        marginTop: scale(-10),
                        marginHorizontal: scale(-4),
                        width: '115%',
                        alignItems: 'center',
                        borderBottomWidth: scale(1.5),
                        borderBottomColor: 'rgba(255, 255, 255, 0.5)',
                      }}
                    >
                      <Text style={{
                        fontSize: scale(9),
                        fontWeight: '800',
                        color: '#FFFFFF',
                        textShadowColor: 'rgba(88, 74, 126, 0.5)',
                        textShadowOffset: { width: 0, height: scale(1) },
                        textShadowRadius: scale(2),
                      }}>P{period.id}</Text>
                      <Text style={{
                        fontSize: scale(7),
                        fontWeight: '600',
                        color: 'rgba(255, 255, 255, 0.85)',
                      }}>{period.start}-{period.end}</Text>
                    </LinearGradient>

                    {/* Doctor names */}
                    {cellSlots.length > 0 ? cellSlots.map(slot => {
                      const isSpecial = slot.status !== 'active';
                      const color = isSpecial ? STATUS_CONFIG[slot.status].color : ROLE_CONFIG[slot.role].color;
                      return (
                        <Text key={slot.id} style={{
                          fontSize: scale(9),
                          fontWeight: '700',
                          color: color,
                          marginBottom: scale(2),
                          textAlign: 'center',
                        }} numberOfLines={1}>{slot.doctorName}</Text>
                      );
                    }) : (
                      <Text style={{
                        fontSize: scale(10),
                        color: '#CBD5E0',
                        fontWeight: '600',
                      }}>—</Text>
                    )}
                  </TouchableOpacity>
                );
              })}
            </LinearGradient>

            {/* Day label - right side */}
            <LinearGradient
              colors={['rgba(124,108,180,0.4)', 'rgba(167,155,203,0.25)', 'rgba(167,155,203,0.25)', 'rgba(124,108,180,0.4)']}
              start={{ x: 0, y: 0 }}
              end={{ x: 0, y: 1 }}
              style={{
                width: scale(45),
                justifyContent: 'center',
                alignItems: 'center',
                borderLeftWidth: scale(1.5),
                borderLeftColor: 'rgba(255, 255, 255, 0.5)',
              }}
            >
              <Text style={{
                fontSize: scale(11),
                fontWeight: '800',
                color: '#FFFFFF',
                textShadowColor: 'rgba(88, 74, 126, 0.5)',
                textShadowOffset: { width: 0, height: scale(1) },
                textShadowRadius: scale(2),
              }}>{day.shortLabel}</Text>
            </LinearGradient>
          </View>

          {/* Divider between Day row and EX row */}
          <View style={{ flexDirection: 'row' }}>
            <View style={{
              flex: 1,
              height: scale(1.5),
              backgroundColor: 'rgba(255, 255, 255, 0.6)',
            }} />
            <View style={{
              width: scale(45),
              height: scale(1.5),
              backgroundColor: 'rgba(255, 255, 255, 0.5)',
            }} />
          </View>

          {/* Row 2: EX + doctors area */}
          <View style={{ flexDirection: 'row', minHeight: scale(35) }}>
            {/* EX doctors content */}
            <LinearGradient
              colors={['rgba(184, 212, 241, 0.25)', 'rgba(212, 184, 232, 0.25)']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={{
                flex: 1,
                paddingVertical: scale(8),
                paddingHorizontal: scale(10),
                flexDirection: 'row',
                flexWrap: 'wrap',
                gap: scale(8),
                alignItems: 'center',
              }}>
              <Text style={{
                fontSize: scale(9),
                fontWeight: '600',
                color: '#9CA3AF',
              }}> </Text>
            </LinearGradient>

            {/* EX label - right side, same style as day */}
            <LinearGradient
              colors={['rgba(124,108,180,0.4)', 'rgba(167,155,203,0.25)', 'rgba(167,155,203,0.25)', 'rgba(124,108,180,0.4)']}
              start={{ x: 0, y: 0 }}
              end={{ x: 0, y: 1 }}
              style={{
                width: scale(45),
                justifyContent: 'center',
                alignItems: 'center',
                borderLeftWidth: scale(1.5),
                borderLeftColor: 'rgba(255, 255, 255, 0.5)',
              }}
            >
              <Text style={{
                fontSize: scale(10),
                fontWeight: '800',
                color: '#FFFFFF',
                textShadowColor: 'rgba(88, 74, 126, 0.5)',
                textShadowOffset: { width: 0, height: scale(1) },
                textShadowRadius: scale(2),
              }}>EX</Text>
            </LinearGradient>
          </View>

        </View>
      ))}
    </View>
  );
}
