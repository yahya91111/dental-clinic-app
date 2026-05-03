import React from 'react';
import { View, Text, TouchableOpacity, Platform } from 'react-native';
import { scale } from '../../lib/scale';
import { LinearGradient } from 'expo-linear-gradient';
import { DAYS, PERIODS, ScheduleSlot, DayOfWeek, STATUS_CONFIG, ROLE_CONFIG } from './types';

interface ScheduleGridProps {
  slots: ScheduleSlot[];
  onCellPress: (day: DayOfWeek, period: number) => void;
}

// Mini badge for doctor name inside grid cell
const MiniBadge = ({ slot }: { slot: ScheduleSlot }) => {
  const isSpecialStatus = slot.status !== 'active';
  const config = isSpecialStatus ? STATUS_CONFIG[slot.status] : ROLE_CONFIG[slot.role];

  return (
    <View style={{
      width: '100%',
      paddingVertical: scale(2),
      paddingHorizontal: scale(3),
      borderRadius: scale(5),
      backgroundColor: config.bgColor,
      borderWidth: scale(1),
      borderColor: config.borderColor,
      marginBottom: scale(2),
    }}>
      <Text style={{
        fontSize: scale(8),
        fontWeight: '700',
        color: config.color,
        textAlign: 'center',
      }} numberOfLines={1}>
        {slot.role === 'delegator' && slot.status === 'active' ? '📋' : ''}
        {isSpecialStatus ? STATUS_CONFIG[slot.status].icon : ''}
        {slot.doctorName}
      </Text>
    </View>
  );
};

// Empty slot placeholder
const EmptyBadge = () => (
  <View style={{
    width: '100%',
    paddingVertical: scale(4),
    borderRadius: scale(5),
    borderWidth: scale(1),
    borderStyle: 'dashed',
    borderColor: 'rgba(0,0,0,0.08)',
    backgroundColor: 'rgba(0,0,0,0.02)',
  }}>
    <Text style={{
      fontSize: scale(8),
      color: '#CBD5E0',
      textAlign: 'center',
      fontWeight: '600',
    }}>+</Text>
  </View>
);

export function ScheduleGrid({ slots, onCellPress }: ScheduleGridProps) {
  const getSlots = (day: DayOfWeek, period: number) =>
    slots.filter(s => s.day === day && s.period === period);

  return (
    <View style={{ marginBottom: scale(12) }}>
      {/* Header Row - Periods (horizontal) */}
      <View style={{ flexDirection: 'row', gap: scale(3), marginBottom: scale(3) }}>
        {PERIODS.map(period => (
          <View key={period.id} style={{
            flex: 1,
            backgroundColor: 'rgba(255,255,255,0.35)',
            borderRadius: scale(10),
            paddingVertical: scale(6),
            alignItems: 'center',
            justifyContent: 'center',
            borderWidth: scale(1.5),
            borderColor: 'rgba(255,255,255,0.5)',
          }}>
            <Text style={{ fontSize: scale(12) }}>{period.icon}</Text>
            <Text style={{ fontSize: scale(7), fontWeight: '700', color: '#4A5568', marginTop: scale(1) }}>
              {period.start}
            </Text>
            <Text style={{ fontSize: scale(7), fontWeight: '700', color: '#4A5568' }}>
              {period.end}
            </Text>
          </View>
        ))}
        {/* Corner - empty */}
        <View style={{ width: scale(48) }} />
      </View>

      {/* Day Rows (vertical) */}
      {DAYS.map(day => (
        <View key={day.key} style={{
          flexDirection: 'row',
          gap: scale(3),
          marginBottom: scale(3),
        }}>
          {/* Period Cells */}
          {PERIODS.map(period => {
            const cellSlots = getSlots(day.key, period.id);
            const hasSlots = cellSlots.length > 0;

            return (
              <TouchableOpacity
                key={`${day.key}-${period.id}`}
                activeOpacity={0.7}
                onPress={() => onCellPress(day.key, period.id)}
                style={{
                  flex: 1,
                  backgroundColor: hasSlots
                    ? 'rgba(255,255,255,0.45)'
                    : 'rgba(255,255,255,0.25)',
                  borderRadius: scale(10),
                  padding: scale(4),
                  minHeight: scale(70),
                  justifyContent: cellSlots.length > 0 ? 'flex-start' : 'center',
                  alignItems: 'center',
                  borderWidth: scale(1.5),
                  borderColor: hasSlots
                    ? 'rgba(255,255,255,0.6)'
                    : 'rgba(255,255,255,0.4)',
                }}
              >
                {cellSlots.length > 0
                  ? cellSlots.map(slot => <MiniBadge key={slot.id} slot={slot} />)
                  : <EmptyBadge />
                }
              </TouchableOpacity>
            );
          })}

          {/* Day Label Column - game button style */}
          <View style={{
            width: scale(48),
            borderRadius: scale(14),
            overflow: 'hidden',
            borderWidth: scale(2.5),
            borderColor: 'rgba(4, 120, 87, 0.3)',
            shadowColor: '#000',
            shadowOffset: { width: 0, height: scale(2) },
            shadowOpacity: 0.25,
            shadowRadius: scale(3),
            elevation: 4,
          }}>
            {/* Vertical gradient: edges dark, center light */}
            <LinearGradient
              colors={['rgba(5,150,105,0.5)', 'rgba(52,211,153,0.35)', 'rgba(52,211,153,0.35)', 'rgba(5,150,105,0.5)']}
              start={{ x: 0, y: 0 }}
              end={{ x: 0, y: 1 }}
              style={{
                flex: 1,
                alignItems: 'center',
                justifyContent: 'center',
                paddingVertical: scale(8),
              }}
            >
              <Text style={{
                fontSize: scale(10),
                fontWeight: '800',
                color: '#FFFFFF',
                textShadowColor: 'rgba(4, 120, 87, 0.7)',
                textShadowOffset: { width: 0, height: scale(1) },
                textShadowRadius: scale(2),
              }}>{day.shortLabel}</Text>
            </LinearGradient>
          </View>
        </View>
      ))}
    </View>
  );
}
