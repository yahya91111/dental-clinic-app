// v1.0.6 - D.C.M (Dental Clinic Management)
import React from 'react';
import { View, ActivityIndicator } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import {
  useFonts,
  IBMPlexSansArabic_400Regular,
  IBMPlexSansArabic_500Medium,
  IBMPlexSansArabic_600SemiBold,
  IBMPlexSansArabic_700Bold,
} from '@expo-google-fonts/ibm-plex-sans-arabic';
import { AuthProvider } from './AuthContext';
import { AppContent } from './screens/MainQueue/AppContent';
import { useInstantUpdates } from './lib/otaUpdate';

export default function App() {
  // التحديثُ الجوّيُّ يصلُ في حينِه لا في الإقلاعِ التالي — قبلَ حاجزِ الخطوطِ
  // كي يعملَ ولو تعثّرَ تحميلُها.
  useInstantUpdates();

  const [fontsLoaded] = useFonts({
    'IBMPlexSansArabic-Regular': IBMPlexSansArabic_400Regular,
    'IBMPlexSansArabic-Medium': IBMPlexSansArabic_500Medium,
    'IBMPlexSansArabic-SemiBold': IBMPlexSansArabic_600SemiBold,
    'IBMPlexSansArabic-Bold': IBMPlexSansArabic_700Bold,
  });

  if (!fontsLoaded) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <AuthProvider>
        <SafeAreaProvider>
          <AppContent />
        </SafeAreaProvider>
      </AuthProvider>
    </GestureHandlerRootView>
  );
}
