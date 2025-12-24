import React, { useState } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  StatusBar,
  ScrollView,
  Animated,
  Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from './AuthContext';

interface PatientProfileScreenProps {
  onBack: () => void;
  onNavigateHome: () => void;
  onNavigateAppointments: () => void;
  onNavigateArchive: () => void;
}

export default function PatientProfileScreen({
  onBack,
  onNavigateHome,
  onNavigateAppointments,
  onNavigateArchive
}: PatientProfileScreenProps) {
  const { user } = useAuth();

  // Animated Blobs - Same as App.tsx
  const blob1Anim = useState(new Animated.Value(0))[0];
  const blob2Anim = useState(new Animated.Value(0))[0];
  const blob3Anim = useState(new Animated.Value(0))[0];
  const blob4Anim = useState(new Animated.Value(0))[0];
  const blob5Anim = useState(new Animated.Value(0))[0];
  const blob6Anim = useState(new Animated.Value(0))[0];

  return (
    <View style={{ flex: 1 }}>
      <StatusBar translucent={true} backgroundColor="transparent" barStyle="light-content" />
      {/* Gradient Mesh Background */}
      <LinearGradient
        colors={['#F0F4F8', '#E8EDF3', '#F5F0F8']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFillObject}
      />
      <View style={styles.container}>
        <View style={styles.gradient}>

          {/* Animated Blobs - Same as App.tsx */}
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
          <Animated.View
            style={[
              styles.timelineBlob,
              {
                top: '15%',
                right: '10%',
                width: 220,
                height: 220,
                backgroundColor: 'rgba(184, 140, 227, 0.12)',
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
          <Animated.View
            style={[
              styles.timelineBlob,
              {
                bottom: '5%',
                left: '55%',
                marginLeft: -100,
                width: 200,
                height: 200,
                backgroundColor: 'rgba(236, 72, 153, 0.1)',
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
          <Animated.View
            style={[
              styles.timelineBlob,
              {
                top: '20%',
                right: '25%',
                width: 170,
                height: 170,
                backgroundColor: 'rgba(34, 197, 94, 0.11)',
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
          <Animated.View
            style={[
              styles.timelineBlob,
              {
                bottom: '30%',
                left: '15%',
                width: 150,
                height: 150,
                backgroundColor: 'rgba(239, 68, 68, 0.10)',
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

          {/* Content Wrapper */}
          <View style={styles.contentWrapper}>
            {/* Glass Container Header */}
            <View style={styles.glassHeaderContainer}>
              {/* Color Tint Layer */}
              <LinearGradient
                colors={[
                  'rgba(168, 85, 247, 0.10)',
                  'rgba(91, 159, 237, 0.10)',
                  'rgba(125, 211, 192, 0.10)',
                ]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.glassHeaderColorTint}
              />

              {/* Header Content */}
              <View style={styles.glassHeaderContent}>
                {/* Info */}
                <View style={styles.glassHeaderInfo}>
                  <Text style={styles.glassHeaderDoctorName} numberOfLines={1}>Patient Profile</Text>
                </View>
              </View>
            </View>

          {/* Content */}
          <View style={styles.content}>
            <ScrollView
              style={styles.cardsScrollView}
              contentContainerStyle={styles.contentContainer}
              showsVerticalScrollIndicator={false}
            >
              {/* 3D Floating Menu Buttons - Overwatch Style */}
              <View style={styles.menuButtonsContainer}>

                {/* Button 1: Dental Chart */}
                <TouchableOpacity
                  style={styles.menuButton}
                  activeOpacity={0.8}
                  onPress={() => {}}
                >
                  <View style={styles.menuButtonContainer}>
                    <Text style={styles.menuButtonText}>DENTAL CHART</Text>
                  </View>
                </TouchableOpacity>

                {/* Button 2: Medical History */}
                <TouchableOpacity
                  style={styles.menuButton}
                  activeOpacity={0.8}
                  onPress={() => {}}
                >
                  <View style={styles.menuButtonContainer}>
                    <Text style={styles.menuButtonText}>MEDICAL HISTORY</Text>
                  </View>
                </TouchableOpacity>

                {/* Button 3: Referrals */}
                <TouchableOpacity
                  style={styles.menuButton}
                  activeOpacity={0.8}
                  onPress={() => {}}
                >
                  <View style={styles.menuButtonContainer}>
                    <Text style={styles.menuButtonText}>REFERRALS</Text>
                  </View>
                </TouchableOpacity>

              </View>
            </ScrollView>
          </View>

          </View>

          {/* Bottom Navigation - Same as App.tsx */}
          <View style={styles.bottomNav}>
            <TouchableOpacity style={styles.navItem} onPress={onNavigateHome}>
              <Ionicons name="home-sharp" size={26} color="#9CA3AF" />
              <Text style={styles.navLabel}>Home</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.navItem}>
              <Ionicons name="person-circle" size={28} color="#7DD3C0" />
              <Text style={[styles.navLabel, styles.navLabelActive]}>Patient File</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.navItem}
              onPress={onNavigateAppointments}
            >
              <Ionicons name="calendar-sharp" size={26} color="#9CA3AF" />
              <Text style={styles.navLabel}>Appointments</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.navItem}
              onPress={onNavigateArchive}
            >
              <Ionicons name="archive-sharp" size={26} color="#9CA3AF" />
              <Text style={styles.navLabel}>Archive</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  gradient: {
    flex: 1,
    position: 'relative',
    overflow: 'hidden',
  },
  timelineBlob: {
    position: 'absolute',
    borderRadius: 1000,
  },
  contentWrapper: {
    flex: 1,
  },
  glassHeaderContainer: {
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    borderRadius: 0,
    borderBottomLeftRadius: 32,
    borderBottomRightRadius: 32,
    borderWidth: 2,
    borderTopWidth: 0,
    borderLeftWidth: 0,
    borderRightWidth: 0,
    borderColor: 'rgba(255, 255, 255, 0.4)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 10,
    overflow: 'hidden',
    position: 'relative',
    zIndex: 2,
    paddingTop: 50,
  },
  glassHeaderColorTint: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderBottomLeftRadius: 32,
    borderBottomRightRadius: 32,
  },
  glassHeaderContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    position: 'relative',
    zIndex: 1,
    width: '100%',
  },
  glassHeaderInfo: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  glassHeaderDoctorName: {
    fontSize: 20,
    fontWeight: '700',
    color: '#FFFFFF',
    textShadowColor: 'rgba(0, 0, 0, 0.3)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },
  content: {
    flex: 1,
  },
  cardsScrollView: {
    flex: 1,
  },
  contentContainer: {
    paddingTop: 40,
    paddingBottom: 100,
    paddingHorizontal: 0,
  },
  menuButtonsContainer: {
    flex: 1,
    justifyContent: 'flex-start',
    alignItems: 'flex-start',
    paddingLeft: 0,
    paddingTop: 60,
    gap: 20,
  },
  menuButton: {
    position: 'relative',
    paddingVertical: 8,
  },
  menuButtonContainer: {
    backgroundColor: 'rgba(168, 85, 247, 0.08)',
    paddingHorizontal: 40,
    paddingVertical: 20,
    borderRadius: 16,
  },
  menuButtonText: {
    fontSize: 28,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: 2,
    textTransform: 'uppercase',
    textShadowColor: 'rgba(0, 0, 0, 0.8)',
    textShadowOffset: { width: 0, height: 4 },
    textShadowRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.6,
    shadowRadius: 20,
    elevation: 15,
  },
  bottomNav: {
    flexDirection: 'row',
    paddingVertical: 10,
    paddingBottom: 20,
    backgroundColor: 'transparent',
    borderTopWidth: 1.5,
    borderTopColor: 'rgba(255, 255, 255, 0.5)',
  },
  navItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 6,
  },
  navLabel: {
    fontSize: 11,
    color: '#9CA3AF',
    marginTop: 4,
    fontWeight: '500',
  },
  navLabelActive: {
    color: '#7DD3C0',
    fontWeight: '600',
  },
});
