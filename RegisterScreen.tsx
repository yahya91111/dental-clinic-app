import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Animated,
  StatusBar,
  ScrollView,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from './lib/supabase';
import uuid from 'react-native-uuid';

interface RegisterScreenProps {
  onBack: () => void;
  onRegisterSuccess: () => void;
}

export default function RegisterScreen({ onBack, onRegisterSuccess }: RegisterScreenProps) {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // Animated Blobs
  const blob1Anim = React.useState(new Animated.Value(0))[0];
  const blob2Anim = React.useState(new Animated.Value(0))[0];
  const blob3Anim = React.useState(new Animated.Value(0))[0];
  const blob4Anim = React.useState(new Animated.Value(0))[0];
  const blob5Anim = React.useState(new Animated.Value(0))[0];

  // Animate blobs continuously
  React.useEffect(() => {
    // Blob 1 - Slow circular motion
    Animated.loop(
      Animated.sequence([
        Animated.timing(blob1Anim, {
          toValue: 1,
          duration: 10000,
          useNativeDriver: true,
        }),
        Animated.timing(blob1Anim, {
          toValue: 0,
          duration: 10000,
          useNativeDriver: true,
        }),
      ])
    ).start();

    // Blob 2 - Medium speed
    Animated.loop(
      Animated.sequence([
        Animated.timing(blob2Anim, {
          toValue: 1,
          duration: 14000,
          useNativeDriver: true,
        }),
        Animated.timing(blob2Anim, {
          toValue: 0,
          duration: 14000,
          useNativeDriver: true,
        }),
      ])
    ).start();

    // Blob 3 - Fast motion
    Animated.loop(
      Animated.sequence([
        Animated.timing(blob3Anim, {
          toValue: 1,
          duration: 8000,
          useNativeDriver: true,
        }),
        Animated.timing(blob3Anim, {
          toValue: 0,
          duration: 8000,
          useNativeDriver: true,
        }),
      ])
    ).start();

    // Blob 4 - Very slow
    Animated.loop(
      Animated.sequence([
        Animated.timing(blob4Anim, {
          toValue: 1,
          duration: 16000,
          useNativeDriver: true,
        }),
        Animated.timing(blob4Anim, {
          toValue: 0,
          duration: 16000,
          useNativeDriver: true,
        }),
      ])
    ).start();

    // Blob 5 - Medium-fast
    Animated.loop(
      Animated.sequence([
        Animated.timing(blob5Anim, {
          toValue: 1,
          duration: 11000,
          useNativeDriver: true,
        }),
        Animated.timing(blob5Anim, {
          toValue: 0,
          duration: 11000,
          useNativeDriver: true,
        }),
      ])
    ).start();
  }, []);

  const handleRegister = async () => {
    // Validation
    if (!firstName || !lastName || !email || !password || !confirmPassword) {
      Alert.alert('خطأ', 'الرجاء ملء جميع الحقول');
      return;
    }

    if (password !== confirmPassword) {
      Alert.alert('خطأ', 'كلمة المرور وتأكيد كلمة المرور غير متطابقين');
      return;
    }

    if (password.length < 6) {
      Alert.alert('خطأ', 'كلمة المرور يجب أن تكون 6 أحرف على الأقل');
      return;
    }

    setIsLoading(true);

    try {
      // Check if email already exists in both tables
      const { data: existingInDoctors } = await supabase
        .from('doctors')
        .select('email')
        .eq('email', email.toLowerCase())
        .single();

      const { data: existingInPending } = await supabase
        .from('pending_doctors')
        .select('email')
        .eq('email', email.toLowerCase())
        .single();

      if (existingInDoctors || existingInPending) {
        Alert.alert('خطأ', 'هذا البريد الإلكتروني مستخدم بالفعل');
        setIsLoading(false);
        return;
      }

      // Generate unique virtual_center_id as UUID
      const newVirtualCenterId = uuid.v4() as string;

      // ✅ Step 1: Create user in Authentication
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: email.toLowerCase(),
        password: password,
        options: {
          data: {
            name: `د. ${firstName} ${lastName}`,
            role: 'doctor',
            clinic_id: null,
            virtual_center_id: newVirtualCenterId
          }
        }
      });

      if (authError) throw authError;

      if (!authData.user) {
        throw new Error('Failed to create user in Authentication');
      }

      // ✅ Step 2: Create new doctor in pending_doctors with same UUID
      const { data: newDoctor, error: insertError } = await supabase
        .from('pending_doctors')
        .insert([
          {
            id: authData.user.id, // ✅ Use same UUID from auth.users
            name: `د. ${firstName} ${lastName}`,
            email: email.toLowerCase(),
            password: password, // ✅ Store password (required by table schema)
            role: 'doctor',
            clinic_id: null, // No real clinic yet
            virtual_center_id: newVirtualCenterId,
            virtual_center_name: 'My Practice',
            is_approved: false, // Not approved yet
          },
        ])
        .select()
        .single();

      if (insertError) throw insertError;

      setIsLoading(false);
      Alert.alert(
        'نجح التسجيل!',
        `مرحباً د. ${firstName} ${lastName}\n\nتم إنشاء حسابك بنجاح!\n\nيمكنك الآن تسجيل الدخول وإدارة عيادتك الخاصة.`,
        [
          {
            text: 'حسناً',
            onPress: onRegisterSuccess,
          },
        ]
      );
    } catch (error) {
      console.error('Registration error:', error);
      setIsLoading(false);
      Alert.alert('خطأ', 'فشل إنشاء الحساب. الرجاء المحاولة مرة أخرى.');
    }
  };

  return (
    <View style={styles.container}>
      {/* Status Bar - Transparent with Light Icons */}
      <StatusBar
        translucent={true}
        backgroundColor="transparent"
        barStyle="light-content"
      />
      
      {/* Purple Gradient Background */}
      <LinearGradient
        colors={['#F5E6F8', '#F0E6F8', '#E8D4F3']}
        locations={[0, 0.5, 1]}
        style={StyleSheet.absoluteFillObject}
      />

      {/* Animated Blobs - Purple, Blue, Green */}
      <Animated.View
        style={[
          styles.blob,
          {
            top: '5%',
            left: '5%',
            width: 200,
            height: 200,
            backgroundColor: 'rgba(168, 85, 247, 0.35)', // Purple
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
                  outputRange: [0, -40],
                }),
              },
            ],
          },
        ]}
      />
      <Animated.View
        style={[
          styles.blob,
          {
            top: '70%',
            right: '5%',
            width: 230,
            height: 230,
            backgroundColor: 'rgba(91, 159, 237, 0.35)', // Blue
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
          styles.blob,
          {
            bottom: '10%',
            left: '50%',
            marginLeft: -110,
            width: 210,
            height: 210,
            backgroundColor: 'rgba(125, 211, 192, 0.35)', // Green
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
          styles.blob,
          {
            top: '15%',
            right: '20%',
            width: 180,
            height: 180,
            backgroundColor: 'rgba(91, 159, 237, 0.30)', // Blue
            transform: [
              {
                translateX: blob4Anim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0, 28],
                }),
              },
              {
                translateY: blob4Anim.interpolate({
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
          styles.blob,
          {
            top: '40%',
            left: '10%',
            width: 170,
            height: 170,
            backgroundColor: 'rgba(168, 85, 247, 0.30)', // Purple
            transform: [
              {
                translateX: blob5Anim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0, -20],
                }),
              },
              {
                translateY: blob5Anim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0, 25],
                }),
              },
            ],
          },
        ]}
      />

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.content}>
            {/* Back Button */}
            <TouchableOpacity style={styles.backButton} onPress={onBack}>
              <Ionicons name="arrow-forward" size={24} color="#FFFFFF" />
            </TouchableOpacity>

            {/* Glass Container with White Border and Color Tint */}
            <View style={styles.glassContainer}>
              {/* Color Tint Layer - Purple, Blue, Green */}
              <LinearGradient
                colors={[
                  'rgba(168, 85, 247, 0.10)',  // Purple
                  'rgba(91, 159, 237, 0.10)',   // Blue
                  'rgba(125, 211, 192, 0.10)',  // Green
                ]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.colorTint}
              />
              {/* Content */}
              <View style={styles.glassContent}>
                {/* Title */}
                <View style={styles.header}>
                  <Text style={styles.title}>إنشاء حساب جديد</Text>
                  <Text style={styles.subtitle}>انضم إلينا الآن</Text>
                </View>

                {/* Register Form */}
                <View style={styles.form}>
                  {/* First Name Field */}
                  <View style={styles.inputWrapper}>
                    <View style={styles.inputContainer}>
                      <Ionicons name="person-outline" size={22} color="#94A3B8" style={styles.inputIcon} />
                      <TextInput
                        style={styles.input}
                        placeholder="الاسم الأول"
                        placeholderTextColor="#94A3B8"
                        value={firstName}
                        onChangeText={setFirstName}
                        autoCapitalize="words"
                      />
                      <Text style={styles.doctorPrefix}>د. </Text>
                    </View>
                  </View>

                  {/* Last Name Field */}
                  <View style={styles.inputWrapper}>
                    <View style={styles.inputContainer}>
                      <Ionicons name="person-outline" size={22} color="#94A3B8" style={styles.inputIcon} />
                      <TextInput
                        style={styles.input}
                        placeholder="الاسم الثاني"
                        placeholderTextColor="#94A3B8"
                        value={lastName}
                        onChangeText={setLastName}
                        autoCapitalize="words"
                      />
                    </View>
                  </View>

                  {/* Email Field */}
                  <View style={styles.inputWrapper}>
                    <View style={styles.inputContainer}>
                      <Ionicons name="mail-outline" size={22} color="#94A3B8" style={styles.inputIcon} />
                      <TextInput
                        style={styles.input}
                        placeholder="البريد الإلكتروني"
                        placeholderTextColor="#94A3B8"
                        value={email}
                        onChangeText={setEmail}
                        keyboardType="email-address"
                        autoCapitalize="none"
                      />
                    </View>
                  </View>

                  {/* Password Field */}
                  <View style={styles.inputWrapper}>
                    <View style={styles.inputContainer}>
                      <Ionicons name="lock-closed-outline" size={22} color="#94A3B8" style={styles.inputIcon} />
                      <TextInput
                        style={styles.input}
                        placeholder="كلمة المرور"
                        placeholderTextColor="#94A3B8"
                        value={password}
                        onChangeText={setPassword}
                        secureTextEntry={!showPassword}
                      />
                      <TouchableOpacity
                        onPress={() => setShowPassword(!showPassword)}
                        style={styles.eyeIcon}
                      >
                        <Ionicons
                          name={showPassword ? 'eye-outline' : 'eye-off-outline'}
                          size={22}
                          color="#94A3B8"
                        />
                      </TouchableOpacity>
                    </View>
                  </View>

                  {/* Confirm Password Field */}
                  <View style={styles.inputWrapper}>
                    <View style={styles.inputContainer}>
                      <Ionicons name="lock-closed-outline" size={22} color="#94A3B8" style={styles.inputIcon} />
                      <TextInput
                        style={styles.input}
                        placeholder="تأكيد كلمة المرور"
                        placeholderTextColor="#94A3B8"
                        value={confirmPassword}
                        onChangeText={setConfirmPassword}
                        secureTextEntry={!showConfirmPassword}
                      />
                      <TouchableOpacity
                        onPress={() => setShowConfirmPassword(!showConfirmPassword)}
                        style={styles.eyeIcon}
                      >
                        <Ionicons
                          name={showConfirmPassword ? 'eye-outline' : 'eye-off-outline'}
                          size={22}
                          color="#94A3B8"
                        />
                      </TouchableOpacity>
                    </View>
                  </View>

                  {/* Submit Button */}
                  <TouchableOpacity
                    style={[styles.submitButton, isLoading && styles.submitButtonDisabled]}
                    onPress={handleRegister}
                    disabled={isLoading}
                  >
                    <LinearGradient
                      colors={['#C48EF5', '#E88EF5']}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 0 }}
                      style={styles.submitGradient}
                    >
                      {isLoading ? (
                        <ActivityIndicator color="#FFFFFF" size="small" />
                      ) : (
                        <Text style={styles.submitButtonText}>إنشاء الحساب</Text>
                      )}
                    </LinearGradient>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingVertical: 40,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  blob: {
    position: 'absolute',
    borderRadius: 9999,
    opacity: 1,
  },
  backButton: {
    position: 'absolute',
    top: 50,
    right: 24,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.3)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  glassContainer: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    borderRadius: 32,
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.4)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 20 },
    shadowOpacity: 0.3,
    shadowRadius: 40,
    elevation: 10,
    backdropFilter: 'blur(20px)',
    overflow: 'hidden',
    position: 'relative',
  },
  colorTint: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 32,
  },
  glassContent: {
    padding: 32,
    position: 'relative',
    zIndex: 1,
  },
  header: {
    alignItems: 'center',
    marginBottom: 32,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 8,
    textAlign: 'center',
    letterSpacing: 0.5,
  },
  subtitle: {
    fontSize: 16,
    color: 'rgba(255, 255, 255, 0.7)',
    textAlign: 'center',
  },
  form: {
    width: '100%',
  },
  inputWrapper: {
    marginBottom: 16,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.18)',
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.3)',
    paddingHorizontal: 16,
    height: 56,
  },
  inputIcon: {
    marginRight: 12,
  },
  doctorPrefix: {
    fontSize: 16,
    color: '#FFFFFF',
    fontWeight: '600',
    marginLeft: 8,
  },
  input: {
    flex: 1,
    fontSize: 16,
    color: '#FFFFFF',
    textAlign: 'right',
  },
  eyeIcon: {
    padding: 4,
  },
  submitButton: {
    marginTop: 12,
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#5B9FED',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 8,
  },
  submitButtonDisabled: {
    opacity: 0.6,
  },
  submitGradient: {
    paddingVertical: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitButtonText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
});
