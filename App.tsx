// v1.0.6 - D.C.M (Dental Clinic Management)
import React from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider } from './AuthContext';
import { AppContent } from './screens/MainQueue/AppContent';

export default function App() {
  return (
    <AuthProvider>
      <SafeAreaProvider>
        <AppContent />
      </SafeAreaProvider>
    </AuthProvider>
  );
}
