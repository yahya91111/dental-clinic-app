// ===============================================================
// Dental Chart Components
// ===============================================================
// Reusable UI components for the dental chart screen

import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  TouchableWithoutFeedback,
  Modal,
  ScrollView,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import type { ToothCondition } from '../../types';
import { styles } from './styles';
import {
  ToothSurfaceConditions,
  getToothQuadrant,
  getToothPositionNumber,
  getSurfaceName,
  getToothPosition,
} from './dentalHelpers';
import { conditionsList, toothStatusList } from './constants';

// ---------------------------------------------------------------
// ToothNumberBadge Component
// ---------------------------------------------------------------
// Displays the tooth number with quadrant-specific border styling

interface ToothNumberBadgeProps {
  toothNumber: number;
}

export const ToothNumberBadge: React.FC<ToothNumberBadgeProps> = ({ toothNumber }) => {
  const quadrant = getToothQuadrant(toothNumber);
  const displayNumber = getToothPositionNumber(toothNumber);

  const borderStyles = {
    'UL': { borderLeftWidth: 2.5, borderBottomWidth: 2.5, borderLeftColor: '#2563EB', borderBottomColor: '#2563EB' },
    'UR': { borderRightWidth: 2.5, borderBottomWidth: 2.5, borderRightColor: '#2563EB', borderBottomColor: '#2563EB' },
    'LL': { borderLeftWidth: 2.5, borderTopWidth: 2.5, borderLeftColor: '#2563EB', borderTopColor: '#2563EB' },
    'LR': { borderRightWidth: 2.5, borderTopWidth: 2.5, borderRightColor: '#2563EB', borderTopColor: '#2563EB' },
  };

  return (
    <View style={[
      {
        backgroundColor: 'rgba(37, 99, 235, 0.12)',
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 8,
        minWidth: 40,
        alignItems: 'center',
        justifyContent: 'center',
      },
      borderStyles[quadrant]
    ]}>
      <Text style={{ fontSize: 14, fontWeight: '700', color: '#1E40AF', letterSpacing: 0.3 }}>
        {displayNumber}
      </Text>
    </View>
  );
};

// ---------------------------------------------------------------
// ConditionMenu Component
// ---------------------------------------------------------------
// Modal menu for selecting tooth conditions and status

export interface ConditionMenuProps {
  visible: boolean;
  onSelect: (condition: ToothCondition) => void;
  onClose: () => void;
  selectedSurface: keyof ToothSurfaceConditions | null;
  selectedTooth: number | null;
}

export const ConditionMenu: React.FC<ConditionMenuProps> = ({
  visible,
  onSelect,
  onClose,
  selectedSurface,
  selectedTooth
}) => {
  const [activeTab, setActiveTab] = useState<'condition' | 'toothStatus'>('condition');

  if (!visible) return null;

  return (
    <Modal
      transparent
      visible={visible}
      animationType="fade"
      onRequestClose={onClose}
    >
      <TouchableOpacity
        style={styles.conditionMenuOverlay}
        activeOpacity={1}
        onPress={onClose}
      >
        <TouchableWithoutFeedback>
          <View style={{ width: '85%', borderRadius: 24, overflow: 'hidden' }}>
            <BlurView intensity={90} tint="light" style={styles.conditionMenuContainer}>
              <View style={{ backgroundColor: 'rgba(240, 249, 255, 0.95)' }}>
                {/* Header */}
                <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 18 }}>
                  <View style={{ flex: 1, alignItems: 'center' }}>
                    <Text style={styles.conditionMenuTitle}>{getSurfaceName(selectedSurface, selectedTooth || undefined)}</Text>
                    <Text style={styles.conditionMenuSubtitle}>{getToothPosition(selectedTooth || 0)}</Text>
                  </View>
                  <TouchableOpacity onPress={onClose} style={{ padding: 4 }}>
                    <Ionicons name="close" size={24} color="#1E3A8A" />
                  </TouchableOpacity>
                </View>

                <View style={styles.conditionMenuDivider} />

                {/* Tab Buttons */}
                <View style={{ flexDirection: 'row', gap: 12, paddingHorizontal: 16, marginTop: 12, marginBottom: 12 }}>
                  <TouchableOpacity
                    style={{
                      flex: 1,
                      backgroundColor: activeTab === 'condition' ? '#3B82F6' : 'rgba(255, 255, 255, 0.9)',
                      paddingVertical: 12,
                      paddingHorizontal: 18,
                      borderRadius: 12,
                      alignItems: 'center',
                      borderWidth: activeTab === 'condition' ? 0 : 1.5,
                      borderColor: 'rgba(203, 213, 225, 0.5)',
                      shadowColor: activeTab === 'condition' ? '#3B82F6' : '#000',
                      shadowOffset: {
                        width: 0,
                        height: activeTab === 'condition' ? 4 : 2,
                      },
                      shadowOpacity: activeTab === 'condition' ? 0.3 : 0.08,
                      shadowRadius: activeTab === 'condition' ? 8 : 4,
                      elevation: activeTab === 'condition' ? 6 : 2,
                    }}
                    onPress={() => setActiveTab('condition')}
                  >
                    <Text style={{
                      fontSize: 13,
                      fontWeight: '700',
                      color: activeTab === 'condition' ? '#FFFFFF' : '#475569',
                      letterSpacing: 0.3,
                    }}>Condition</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={{
                      flex: 1,
                      backgroundColor: activeTab === 'toothStatus' ? '#3B82F6' : 'rgba(255, 255, 255, 0.9)',
                      paddingVertical: 12,
                      paddingHorizontal: 18,
                      borderRadius: 12,
                      alignItems: 'center',
                      borderWidth: activeTab === 'toothStatus' ? 0 : 1.5,
                      borderColor: 'rgba(203, 213, 225, 0.5)',
                      shadowColor: activeTab === 'toothStatus' ? '#3B82F6' : '#000',
                      shadowOffset: {
                        width: 0,
                        height: activeTab === 'toothStatus' ? 4 : 2,
                      },
                      shadowOpacity: activeTab === 'toothStatus' ? 0.3 : 0.08,
                      shadowRadius: activeTab === 'toothStatus' ? 8 : 4,
                      elevation: activeTab === 'toothStatus' ? 6 : 2,
                    }}
                    onPress={() => setActiveTab('toothStatus')}
                  >
                    <Text style={{
                      fontSize: 13,
                      fontWeight: '700',
                      color: activeTab === 'toothStatus' ? '#FFFFFF' : '#475569',
                      letterSpacing: 0.3,
                    }}>Tooth Status</Text>
                  </TouchableOpacity>
                </View>

                <ScrollView style={styles.conditionMenuScroll}>
                  {activeTab === 'condition' ? (
                    <>
                      {conditionsList.map((condition) => (
                        <TouchableOpacity
                          key={condition.key}
                          style={styles.conditionMenuItem}
                          onPress={() => onSelect(condition.key)}
                        >
                          <View
                            style={[
                              styles.conditionColorBox,
                              { backgroundColor: condition.color }
                            ]}
                          />
                          <Text style={styles.conditionMenuItemText}>{condition.name}</Text>
                        </TouchableOpacity>
                      ))}

                      {/* Clear Condition Option */}
                      <TouchableOpacity
                        style={styles.conditionMenuItem}
                        onPress={() => onSelect(null)}
                      >
                        <Ionicons name="close-circle" size={24} color="#FF5252" />
                        <Text style={[styles.conditionMenuItemText, { color: '#FF5252', marginLeft: 12 }]}>Clear Condition</Text>
                      </TouchableOpacity>
                    </>
                  ) : (
                    <>
                      {toothStatusList.map((status) => (
                        <TouchableOpacity
                          key={status.key}
                          style={styles.conditionMenuItem}
                          onPress={() => onSelect(status.key)}
                        >
                          <View
                            style={[
                              styles.conditionColorBox,
                              {
                                backgroundColor: status.color,
                                borderWidth: status.key === 'treated' ? 2 : 0,
                                borderColor: status.key === 'treated' ? '#800000' : 'transparent'
                              }
                            ]}
                          />
                          <Text style={styles.conditionMenuItemText}>{status.name}</Text>
                        </TouchableOpacity>
                      ))}

                      {/* Clear Tooth Status Option */}
                      <TouchableOpacity
                        style={styles.conditionMenuItem}
                        onPress={() => onSelect('CLEAR_TOOTH_STATUS' as any)}
                      >
                        <Ionicons name="close-circle" size={24} color="#FF5252" />
                        <Text style={[styles.conditionMenuItemText, { color: '#FF5252', marginLeft: 12 }]}>Clear Condition</Text>
                      </TouchableOpacity>
                    </>
                  )}
                </ScrollView>
              </View>
            </BlurView>
          </View>
        </TouchableWithoutFeedback>
      </TouchableOpacity>
    </Modal>
  );
};
