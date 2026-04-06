import React from 'react';
import { StyleSheet, View, Text, TouchableOpacity, ScrollView, Animated, Platform, Alert, Dimensions } from 'react-native';
import { scaledStyleSheet, scale } from '../../lib/scale';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// ═══════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════

export interface ScalingRecord {
  id: string;
  timestamp: string;
  doctorName: string;
  timestampNum: number;
}

interface OralHygieneContainerProps {
  isExpanded: boolean;
  onToggle: () => void;
  onAddScaling: () => void;
  onDeleteRecord: (recordId: string, index: number) => Promise<void>;
  scalingRecords: ScalingRecord[];
  buttonsOpacity: Animated.Value;
  oralHygieneOpacity: Animated.Value;
  expandAnim: Animated.Value;
  isToothSelected: boolean;
}

// ═══════════════════════════════════════════════════════════════
// Component
// ═══════════════════════════════════════════════════════════════

export const OralHygieneContainer: React.FC<OralHygieneContainerProps> = ({
  isExpanded,
  onToggle,
  onAddScaling,
  onDeleteRecord,
  scalingRecords,
  buttonsOpacity,
  oralHygieneOpacity,
  expandAnim,
  isToothSelected,
}) => {
  const handleDeleteRecord = (recordId: string, index: number) => {
    Alert.alert(
      'Delete Record',
      'Are you sure you want to delete this scaling record?',
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => onDeleteRecord(recordId, index),
        },
      ]
    );
  };

  return (
    <Animated.View
      style={[
        styles.container,
        {
          zIndex: isExpanded ? 10001 : 800,
          elevation: isExpanded ? 10001 : 800,
          opacity: Animated.multiply(buttonsOpacity, oralHygieneOpacity),
        },
      ]}
      pointerEvents={isToothSelected ? 'none' : 'auto'}
    >
      <Animated.View
        style={[
          styles.innerContainer,
          {
            width: expandAnim.interpolate({
              inputRange: [0, 1],
              outputRange: [140, SCREEN_WIDTH * 0.75],
            }),
            height: expandAnim.interpolate({
              inputRange: [0, 1],
              outputRange: [scale(38), scale(320)],
            }),
            backgroundColor: isExpanded
              ? 'rgba(254, 215, 170, 0.2)'
              : 'rgba(251, 191, 36, 0.1)',
            borderColor: isExpanded
              ? 'rgba(254, 215, 170, 0.5)'
              : 'rgba(255, 255, 255, 0.5)',
            transform: [
              {
                translateX: expandAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [-70, -(SCREEN_WIDTH * 0.75) / 2],
                }),
              },
              {
                translateY: expandAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [scale(-19), scale(-160)],
                }),
              },
            ],
          },
        ]}
      >
        <BlurView intensity={50} tint="light" style={StyleSheet.absoluteFill}>
          <View
            style={[
              styles.blurContent,
              {
                backgroundColor: isExpanded
                  ? 'rgba(254, 215, 170, 0.3)'
                  : 'rgba(251, 191, 36, 0.15)',
              },
            ]}
          >
            {/* Header / Toggle Button */}
            <TouchableOpacity
              onPress={onToggle}
              activeOpacity={0.8}
              style={styles.headerButton}
            >
              <View
                style={[
                  styles.headerContent,
                  { paddingVertical: isExpanded ? 14 : 8 },
                ]}
              >
                {isExpanded && (
                  <Ionicons name="fitness-outline" size={scale(24)} color="#92400E" />
                )}
                <Text
                  style={[
                    styles.title,
                    isExpanded && styles.titleExpanded,
                  ]}
                >
                  Oral Hygiene
                </Text>
                {isExpanded && (
                  <Ionicons name="chevron-up" size={scale(20)} color="#92400E" />
                )}
              </View>
              {isExpanded && <View style={styles.divider} />}
            </TouchableOpacity>

            {/* Expanded Content */}
            {isExpanded && (
              <ScrollView
                style={styles.scrollView}
                showsVerticalScrollIndicator={false}
              >
                {/* Scaling Done Button */}
                <TouchableOpacity
                  style={styles.scalingButton}
                  onPress={onAddScaling}
                  activeOpacity={0.7}
                >
                  <BlurView intensity={40} tint="light" style={StyleSheet.absoluteFill}>
                    <View style={styles.scalingButtonContent}>
                      <Ionicons name="checkmark-circle" size={scale(22)} color="#059669" />
                      <Text style={styles.scalingButtonText}>Scaling Done</Text>
                    </View>
                  </BlurView>
                </TouchableOpacity>

                {/* Scaling Records */}
                {scalingRecords.length > 0 && (
                  <View style={styles.recordsContainer}>
                    <View style={styles.recordsHeader}>
                      <Ionicons name="file-tray-full" size={scale(20)} color="#92400E" />
                      <Text style={styles.recordsTitle}>Scaling Records</Text>
                    </View>
                    {scalingRecords.map((record, index) => (
                      <View
                        key={record.id || index}
                        style={[
                          styles.recordItem,
                          index === scalingRecords.length - 1 && { marginBottom: scale(0) },
                        ]}
                      >
                        <View style={styles.recordIcon}>
                          <Ionicons name="medical" size={scale(18)} color="#92400E" />
                        </View>
                        <View style={styles.recordInfo}>
                          <Text style={styles.recordDoctor}>
                            {record.doctorName}
                          </Text>
                          <Text style={styles.recordTime}>
                            {record.timestamp}
                          </Text>
                        </View>
                        <TouchableOpacity
                          onPress={() => handleDeleteRecord(record.id, index)}
                          style={styles.deleteButton}
                          activeOpacity={0.7}
                        >
                          <Ionicons name="trash-outline" size={scale(18)} color="#EF4444" />
                        </TouchableOpacity>
                      </View>
                    ))}
                  </View>
                )}
              </ScrollView>
            )}
          </View>
        </BlurView>
      </Animated.View>
    </Animated.View>
  );
};

// ═══════════════════════════════════════════════════════════════
// Styles
// ═══════════════════════════════════════════════════════════════

const styles = scaledStyleSheet({
  container: {
    position: 'absolute',
    top: '50%',
    left: '50%',
  },
  innerContainer: {
    paddingHorizontal: 16,
    paddingVertical: 4,
    borderRadius: 16,
    borderWidth: 1.5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    overflow: 'hidden',
  },
  blurContent: {
    flex: 1,
  },
  headerButton: {
    width: '100%',
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    gap: 10,
  },
  title: {
    fontSize: 14,
    fontWeight: '700',
    color: '#92400E',
  },
  titleExpanded: {
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  divider: {
    width: '85%',
    height: 2.5,
    backgroundColor: '#92400E',
    borderRadius: 2,
    alignSelf: 'center',
    marginTop: 8,
  },
  scrollView: {
    flex: 1,
    padding: 16,
    paddingTop: 20,
  },
  scalingButton: {
    height: 48,
    borderRadius: 14,
    overflow: 'hidden',
    marginBottom: 16,
    borderWidth: 1.5,
    borderColor: 'rgba(16, 185, 129, 0.35)',
    ...Platform.select({
      ios: {
        shadowColor: '#059669',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.25,
        shadowRadius: 8,
      },
    }),
  },
  scalingButtonContent: {
    flex: 1,
    backgroundColor: 'rgba(16, 185, 129, 0.25)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  scalingButtonText: {
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.5,
    color: '#059669',
  },
  recordsContainer: {
    backgroundColor: 'rgba(255, 255, 255, 0.6)',
    borderRadius: 16,
    padding: 16,
    marginTop: 4,
    ...Platform.select({
      ios: {
        shadowColor: '#92400E',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 6,
      },
    }),
  },
  recordsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 14,
  },
  recordsTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#92400E',
  },
  recordItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    padding: 14,
    borderRadius: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: 'rgba(254, 215, 170, 0.4)',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.06,
        shadowRadius: 3,
      },
    }),
  },
  recordIcon: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: 'rgba(254, 215, 170, 0.3)',
    borderWidth: 1.5,
    borderColor: 'rgba(254, 215, 170, 0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  recordInfo: {
    flex: 1,
    marginLeft: 12,
  },
  recordDoctor: {
    fontSize: 14,
    fontWeight: '600',
    color: '#92400E',
  },
  recordTime: {
    fontSize: 12,
    marginTop: 2,
    color: '#B45309',
  },
  deleteButton: {
    padding: 8,
    borderRadius: 8,
    backgroundColor: 'rgba(239, 68, 68, 0.08)',
  },
});

export default OralHygieneContainer;
