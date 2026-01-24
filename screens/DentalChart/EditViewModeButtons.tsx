import React from 'react';
import { View, Text, TouchableOpacity, Animated } from 'react-native';
import { styles, SCREEN_HEIGHT } from './styles';
import { handleViewModeToggle, ViewModeAnimationsParams } from './viewModeAnimations';

// ═══════════════════════════════════════════════════════════════
// Edit/View Mode Buttons Component
// Toggle buttons for switching between Edit and View modes
// ═══════════════════════════════════════════════════════════════

interface EditViewModeButtonsProps {
  // Edit Button Props
  isEditModeActive: boolean;
  setIsEditModeActive: (active: boolean) => void;
  editButtonSlide: Animated.Value;

  // View Button Props
  isViewModeActive: boolean;
  setIsViewModeActive: (active: boolean) => void;
  viewButtonPositionAnim: Animated.Value;

  // Animation Props for View Mode
  toothAnims: ViewModeAnimationsParams['toothAnims'];
  setIsReferralExpanded: (expanded: boolean) => void;

  // Common Props
  buttonsOpacity: Animated.Value;
  isOralHygieneExpanded: boolean;
  isTreatmentRecordExpanded: boolean;
  isPlanningRecordExpanded: boolean;
  isReferralExpanded: boolean;
  selectedTooth: number | string | null;
}

export function EditViewModeButtons({
  isEditModeActive,
  setIsEditModeActive,
  editButtonSlide,
  isViewModeActive,
  setIsViewModeActive,
  viewButtonPositionAnim,
  toothAnims,
  setIsReferralExpanded,
  buttonsOpacity,
  isOralHygieneExpanded,
  isTreatmentRecordExpanded,
  isPlanningRecordExpanded,
  isReferralExpanded,
  selectedTooth,
}: EditViewModeButtonsProps) {
  return (
    <>
      {/* Edit Mode Button */}
      <Animated.View
        style={[
          styles.editButtonContainer,
          {
            transform: [{ translateX: editButtonSlide }],
            opacity: isOralHygieneExpanded ? 0 : buttonsOpacity,
            zIndex: isOralHygieneExpanded ? 700 : (selectedTooth ? 900 : 9999),
            elevation: isOralHygieneExpanded ? 700 : (selectedTooth ? 900 : 9999),
          }
        ]}
        pointerEvents={selectedTooth ? "none" : "box-none"}
      >
        <TouchableOpacity
          activeOpacity={0.8}
          onPress={() => {
            const newState = !isEditModeActive;
            console.log('✓ Edit Button Pressed! New state:', newState);
            setIsEditModeActive(newState);
          }}
          style={[
            styles.editModeButton,
            isEditModeActive ? styles.editModeButtonActive : styles.editModeButtonInactive,
          ]}
        >
          <Text style={[
            styles.editModeButtonText,
            isEditModeActive && styles.editModeButtonTextActive
          ]}>
            Edit
          </Text>
        </TouchableOpacity>
      </Animated.View>

      {/* View Mode Button */}
      <Animated.View style={[styles.viewButtonContainer, {
        opacity: isOralHygieneExpanded ? 0 : buttonsOpacity,
        zIndex: isOralHygieneExpanded ? 700 : ((isTreatmentRecordExpanded || isPlanningRecordExpanded || isReferralExpanded) ? 9998 : (isViewModeActive ? 10020 : (selectedTooth ? 900 : 9999))),
        elevation: isOralHygieneExpanded ? 700 : ((isTreatmentRecordExpanded || isPlanningRecordExpanded || isReferralExpanded) ? 9998 : (isViewModeActive ? 10020 : (selectedTooth ? 900 : 9999))),
        transform: [
          { translateX: -50 },
          {
            translateY: viewButtonPositionAnim.interpolate({
              inputRange: [0, 1],
              outputRange: [0, -(SCREEN_HEIGHT * 0.41 - 100)]
            })
          }
        ]
      }]} pointerEvents={selectedTooth ? "none" : "box-none"}>
        <TouchableOpacity
          activeOpacity={0.8}
          onPress={() => {
            const newState = !isViewModeActive;
            console.log('✓ View Button Pressed! Current state:', isViewModeActive, '→ New state:', newState);
            setIsViewModeActive(newState);

            // استخدام الدالة المستخرجة للأنيميشن
            handleViewModeToggle(newState, {
              toothAnims,
              setIsReferralExpanded,
            });
          }}
          style={[
            styles.viewModeButton,
            isViewModeActive ? styles.viewModeButtonActive : styles.viewModeButtonInactive,
          ]}
        >
          <Text style={[
            styles.viewModeButtonText,
            isViewModeActive && styles.viewModeButtonTextActive
          ]}>
            View
          </Text>
        </TouchableOpacity>
      </Animated.View>
    </>
  );
}
