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
import { scale } from '../../lib/scale';
import { BlurView } from 'expo-blur';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
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
        paddingHorizontal: scale(10),
        paddingVertical: scale(6),
        borderRadius: scale(8),
        minWidth: scale(40),
        alignItems: 'center',
        justifyContent: 'center',
      },
      borderStyles[quadrant]
    ]}>
      <Text style={{ fontSize: scale(14), fontWeight: '700', color: '#1E40AF', letterSpacing: scale(0.3) }}>
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
          <View style={{ width: '85%', borderRadius: scale(24), overflow: 'hidden' }}>
            <BlurView intensity={90} tint="light" style={styles.conditionMenuContainer}>
              <View style={{ backgroundColor: 'rgba(240, 249, 255, 0.95)' }}>
                {/* Header */}
                <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: scale(20), paddingVertical: scale(18) }}>
                  <View style={{ flex: 1, alignItems: 'center' }}>
                    <Text style={styles.conditionMenuTitle}>{getSurfaceName(selectedSurface, selectedTooth || undefined)}</Text>
                    <Text style={styles.conditionMenuSubtitle}>{getToothPosition(selectedTooth || 0)}</Text>
                  </View>
                  <TouchableOpacity onPress={onClose} style={{ padding: scale(4) }}>
                    <Ionicons name="close" size={scale(24)} color="#1E3A8A" />
                  </TouchableOpacity>
                </View>

                <View style={styles.conditionMenuDivider} />

                {/* Tab Buttons */}
                <View style={{ flexDirection: 'row', gap: scale(12), paddingHorizontal: scale(16), marginTop: scale(12), marginBottom: scale(12) }}>
                  <TouchableOpacity
                    style={{
                      flex: 1,
                      backgroundColor: activeTab === 'condition' ? '#3B82F6' : 'rgba(255, 255, 255, 0.9)',
                      paddingVertical: scale(12),
                      paddingHorizontal: scale(18),
                      borderRadius: scale(12),
                      alignItems: 'center',
                      borderWidth: activeTab === 'condition' ? 0 : 1.5,
                      borderColor: 'rgba(203, 213, 225, 0.5)',
                      shadowColor: activeTab === 'condition' ? '#3B82F6' : '#000',
                      shadowOffset: {
                        width: scale(0),
                        height: activeTab === 'condition' ? 4 : 2,
                      },
                      shadowOpacity: activeTab === 'condition' ? 0.3 : 0.08,
                      shadowRadius: activeTab === 'condition' ? 8 : 4,
                      elevation: activeTab === 'condition' ? 6 : 2,
                    }}
                    onPress={() => setActiveTab('condition')}
                  >
                    <Text style={{
                      fontSize: scale(13),
                      fontWeight: '700',
                      color: activeTab === 'condition' ? '#FFFFFF' : '#475569',
                      letterSpacing: scale(0.3),
                    }}>Condition</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={{
                      flex: 1,
                      backgroundColor: activeTab === 'toothStatus' ? '#3B82F6' : 'rgba(255, 255, 255, 0.9)',
                      paddingVertical: scale(12),
                      paddingHorizontal: scale(18),
                      borderRadius: scale(12),
                      alignItems: 'center',
                      borderWidth: activeTab === 'toothStatus' ? 0 : 1.5,
                      borderColor: 'rgba(203, 213, 225, 0.5)',
                      shadowColor: activeTab === 'toothStatus' ? '#3B82F6' : '#000',
                      shadowOffset: {
                        width: scale(0),
                        height: activeTab === 'toothStatus' ? 4 : 2,
                      },
                      shadowOpacity: activeTab === 'toothStatus' ? 0.3 : 0.08,
                      shadowRadius: activeTab === 'toothStatus' ? 8 : 4,
                      elevation: activeTab === 'toothStatus' ? 6 : 2,
                    }}
                    onPress={() => setActiveTab('toothStatus')}
                  >
                    <Text style={{
                      fontSize: scale(13),
                      fontWeight: '700',
                      color: activeTab === 'toothStatus' ? '#FFFFFF' : '#475569',
                      letterSpacing: scale(0.3),
                    }}>Tooth Status</Text>
                  </TouchableOpacity>
                </View>

                {/* Icon Grid */}
                <View style={{ paddingHorizontal: scale(16), paddingVertical: scale(12) }}>
                  {activeTab === 'condition' ? (
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: scale(12) }}>
                      {[
                        { key: 'caries', name: 'Caries', color: '#DC2626' },
                        { key: 'broken', name: 'Broken', color: '#EC4899' },
                        { key: 'pulpectomy', name: 'Pulpectomy', color: '#800000' },
                        { key: 'extraction', name: 'Extraction', color: '#1F2937' },
                        { key: 'follow_up', name: 'Follow-up', color: '#2563EB' },
                        { key: 'needs_diagnosis', name: 'Diagnosis', color: '#D97706' },
                      ].map((item) => (
                        <TouchableOpacity
                          key={item.key}
                          style={{
                            width: scale(90),
                            height: scale(90),
                            backgroundColor: 'rgba(255, 255, 255, 0.9)',
                            borderRadius: scale(18),
                            alignItems: 'center',
                            justifyContent: 'center',
                            borderWidth: scale(2),
                            borderColor: 'rgba(255, 255, 255, 0.6)',
                          }}
                          onPress={() => onSelect(item.key as ToothCondition)}
                        >
                          <MaterialCommunityIcons name="tooth" size={scale(30)} color={item.color} />
                          <Text style={{ fontSize: scale(11), fontWeight: '700', color: '#1E3A8A', marginTop: scale(6), textAlign: 'center' }}>{item.name}</Text>
                        </TouchableOpacity>
                      ))}

                      {/* Clear */}
                      <TouchableOpacity
                        style={{
                          width: scale(90),
                          height: scale(90),
                          backgroundColor: 'rgba(255, 220, 220, 0.9)',
                          borderRadius: scale(18),
                          alignItems: 'center',
                          justifyContent: 'center',
                          borderWidth: scale(2),
                          borderColor: 'rgba(239, 68, 68, 0.3)',
                        }}
                        onPress={() => onSelect(null)}
                      >
                        <Ionicons name="close-circle" size={scale(30)} color="#EF4444" />
                        <Text style={{ fontSize: scale(11), fontWeight: '700', color: '#EF4444', marginTop: scale(6) }}>Clear</Text>
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: scale(12) }}>
                      {[
                        { key: 'missing', name: 'Missing', color: '#6B7280', useX: true },
                        { key: 'filling_replacement', name: 'Temp Fill', color: '#808080' },
                        { key: 'permanent_filling', name: 'Perm Fill', color: '#059669' },
                        { key: 'treated', name: 'RCT Done', color: '#800000' },
                      ].map((item) => (
                        <TouchableOpacity
                          key={item.key}
                          style={{
                            width: scale(90),
                            height: scale(90),
                            backgroundColor: 'rgba(255, 255, 255, 0.9)',
                            borderRadius: scale(18),
                            alignItems: 'center',
                            justifyContent: 'center',
                            borderWidth: scale(2),
                            borderColor: 'rgba(255, 255, 255, 0.6)',
                          }}
                          onPress={() => onSelect(item.key as ToothCondition)}
                        >
                          {(item as any).useX
                            ? <Ionicons name="close" size={scale(30)} color={item.color} />
                            : <MaterialCommunityIcons name="tooth" size={scale(30)} color={item.color} />
                          }
                          <Text style={{ fontSize: scale(11), fontWeight: '700', color: '#1E3A8A', marginTop: scale(6), textAlign: 'center' }}>{item.name}</Text>
                        </TouchableOpacity>
                      ))}

                      {/* Clear */}
                      <TouchableOpacity
                        style={{
                          width: scale(90),
                          height: scale(90),
                          backgroundColor: 'rgba(255, 220, 220, 0.9)',
                          borderRadius: scale(18),
                          alignItems: 'center',
                          justifyContent: 'center',
                          borderWidth: scale(2),
                          borderColor: 'rgba(239, 68, 68, 0.3)',
                        }}
                        onPress={() => onSelect('CLEAR_TOOTH_STATUS' as any)}
                      >
                        <Ionicons name="close-circle" size={scale(30)} color="#EF4444" />
                        <Text style={{ fontSize: scale(11), fontWeight: '700', color: '#EF4444', marginTop: scale(6) }}>Clear</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              </View>
            </BlurView>
          </View>
        </TouchableWithoutFeedback>
      </TouchableOpacity>
    </Modal>
  );
};
