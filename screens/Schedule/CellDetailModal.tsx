import React from 'react';
import { View, Text, TouchableOpacity, Modal } from 'react-native';
import { scale } from '../../lib/scale';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { ScheduleSlot, DayOfWeek, DAYS, PERIODS, STATUS_CONFIG, ROLE_CONFIG } from './types';

interface CellDetailModalProps {
  visible: boolean;
  day: DayOfWeek | null;
  period: number | null;
  slots: ScheduleSlot[];
  onClose: () => void;
}

const CLINIC_COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EC4899', '#8B5CF6'];

export function CellDetailModal({ visible, day, period, slots, onClose }: CellDetailModalProps) {
  if (!day || !period) return null;

  const dayInfo = DAYS.find(d => d.key === day);
  const periodInfo = PERIODS.find(p => p.id === period);
  const cellSlots = slots.filter(s => s.day === day && s.period === period);

  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={onClose}>
      <View style={{
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: 'rgba(0,0,0,0.4)',
      }}>
        <View style={{
          width: '85%',
          maxHeight: '70%',
          backgroundColor: 'rgba(255,255,255,0.92)',
          borderRadius: scale(24),
          padding: scale(20),
          borderWidth: scale(2.5),
          borderColor: 'rgba(255,255,255,0.8)',
          shadowColor: '#000',
          shadowOffset: { width: 0, height: scale(10) },
          shadowOpacity: 0.2,
          shadowRadius: scale(20),
          elevation: 10,
        }}>
          {/* Header */}
          <View style={{
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: scale(16),
            paddingBottom: scale(12),
            borderBottomWidth: scale(1.5),
            borderBottomColor: 'rgba(0,0,0,0.06)',
          }}>
            <View>
              <Text style={{
                fontSize: scale(18),
                fontWeight: '700',
                color: '#1E3A8A',
              }}>
                {dayInfo?.label} - {periodInfo?.label}
              </Text>
              <Text style={{
                fontSize: scale(13),
                fontWeight: '600',
                color: '#667EEA',
                marginTop: scale(2),
              }}>
                {periodInfo?.icon} {periodInfo?.start} - {periodInfo?.end}
              </Text>
            </View>
            <TouchableOpacity onPress={onClose} style={{
              width: scale(36),
              height: scale(36),
              borderRadius: scale(18),
              backgroundColor: 'rgba(0,0,0,0.06)',
              alignItems: 'center',
              justifyContent: 'center',
            }}>
              <Ionicons name="close" size={scale(20)} color="#6B7280" />
            </TouchableOpacity>
          </View>

          {/* Doctor Slots */}
          {cellSlots.length > 0 ? (
            cellSlots.map(slot => {
              const isSpecialStatus = slot.status !== 'active';
              const statusConfig = STATUS_CONFIG[slot.status];
              const roleConfig = ROLE_CONFIG[slot.role];
              const clinicColor = slot.clinicNumber > 0 ? CLINIC_COLORS[(slot.clinicNumber - 1) % CLINIC_COLORS.length] : roleConfig.color;

              return (
                <View key={slot.id} style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: scale(12),
                  padding: scale(12),
                  borderRadius: scale(14),
                  marginBottom: scale(8),
                  backgroundColor: isSpecialStatus ? statusConfig.bgColor : roleConfig.bgColor,
                  borderWidth: scale(1.5),
                  borderColor: isSpecialStatus ? statusConfig.borderColor : roleConfig.borderColor,
                }}>
                  {/* Avatar */}
                  <View style={{
                    width: scale(40),
                    height: scale(40),
                    borderRadius: scale(20),
                    backgroundColor: isSpecialStatus ? statusConfig.color : clinicColor,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}>
                    <Text style={{
                      fontSize: scale(14),
                      fontWeight: '800',
                      color: '#FFFFFF',
                    }}>
                      {slot.role === 'delegator' ? '📋' : `ع${slot.clinicNumber}`}
                    </Text>
                  </View>

                  {/* Info */}
                  <View style={{ flex: 1 }}>
                    <Text style={{
                      fontSize: scale(15),
                      fontWeight: '600',
                      color: '#2D3748',
                      textDecorationLine: isSpecialStatus ? 'line-through' : 'none',
                    }}>
                      د. {slot.doctorName}
                    </Text>
                    <Text style={{
                      fontSize: scale(12),
                      fontWeight: '700',
                      color: isSpecialStatus ? statusConfig.color : roleConfig.color,
                      marginTop: scale(2),
                    }}>
                      {isSpecialStatus ? statusConfig.label : (slot.role === 'delegator' ? roleConfig.label : `Clinic ${slot.clinicNumber}`)}
                    </Text>
                  </View>

                  {/* Status Icon */}
                  {isSpecialStatus && (
                    <Text style={{ fontSize: scale(20) }}>{statusConfig.icon}</Text>
                  )}
                </View>
              );
            })
          ) : (
            <View style={{
              alignItems: 'center',
              paddingVertical: scale(30),
            }}>
              <Ionicons name="calendar-outline" size={scale(48)} color="#CBD5E0" />
              <Text style={{
                fontSize: scale(16),
                fontWeight: '600',
                color: '#A0AEC0',
                marginTop: scale(10),
              }}>No doctors assigned</Text>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}
