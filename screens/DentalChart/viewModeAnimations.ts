import { Animated } from 'react-native';
import { scale } from '../../lib/scale';

// ═══════════════════════════════════════════════════════════════
// View Mode Animations
// Handles the transition between teeth view and containers view
// ═══════════════════════════════════════════════════════════════

export interface ViewModeAnimationsParams {
  toothAnims: {
    rightTeethSlide: Animated.Value;
    leftTeethSlide: Animated.Value;
    editButtonSlide: Animated.Value;
    verticalTopLineSlide: Animated.Value;
    verticalBottomLineSlide: Animated.Value;
    horizontalRightLineSlide: Animated.Value;
    horizontalLeftLineSlide: Animated.Value;
    rightNumbersSlide: Animated.Value;
    leftNumbersSlide: Animated.Value;
    oralHygieneOpacity: Animated.Value;
    viewButtonPositionAnim: Animated.Value;
    referralContainerSlide: Animated.Value;
    treatmentRecordSlide: Animated.Value;
    planningRecordSlide: Animated.Value;
    referralSectionsHeight: Animated.Value;
    treatmentRecordPushDown: Animated.Value;
    planningRecordPushDown: Animated.Value;
  };
  setIsReferralExpanded: (expanded: boolean) => void;
}

/**
 * Animate showing View Mode - hide teeth and show containers
 */
export function animateShowViewMode({
  toothAnims,
  setIsReferralExpanded,
}: ViewModeAnimationsParams): void {
  console.log('🔵 Showing referral container - hiding teeth');

  // إخفاء الأسنان وزر Edit والخطوط وأرقام الأسنان
  Animated.parallel([
    Animated.timing(toothAnims.rightTeethSlide, {
      toValue: scale(500),
      duration: 400,
      useNativeDriver: true,
    }),
    Animated.timing(toothAnims.leftTeethSlide, {
      toValue: scale(-500),
      duration: 400,
      useNativeDriver: true,
    }),
    Animated.timing(toothAnims.editButtonSlide, {
      toValue: scale(-300),
      duration: 400,
      useNativeDriver: true,
    }),
    Animated.timing(toothAnims.verticalTopLineSlide, {
      toValue: scale(-200),
      duration: 400,
      useNativeDriver: true,
    }),
    Animated.timing(toothAnims.verticalBottomLineSlide, {
      toValue: scale(200),
      duration: 400,
      useNativeDriver: true,
    }),
    Animated.timing(toothAnims.horizontalRightLineSlide, {
      toValue: scale(500),
      duration: 400,
      useNativeDriver: true,
    }),
    Animated.timing(toothAnims.horizontalLeftLineSlide, {
      toValue: scale(-500),
      duration: 400,
      useNativeDriver: true,
    }),
    Animated.timing(toothAnims.rightNumbersSlide, {
      toValue: scale(500),
      duration: 400,
      useNativeDriver: true,
    }),
    Animated.timing(toothAnims.leftNumbersSlide, {
      toValue: scale(-500),
      duration: 400,
      useNativeDriver: true,
    }),
    Animated.timing(toothAnims.oralHygieneOpacity, {
      toValue: 0,
      duration: 400,
      useNativeDriver: true,
    }),
    Animated.timing(toothAnims.viewButtonPositionAnim, {
      toValue: 1,
      duration: 400,
      useNativeDriver: true,
    }),
  ]).start(() => {
    console.log('🟢 Teeth hidden - now showing containers');
    // إعادة تعيين الحاوية للحالة المغلقة
    setIsReferralExpanded(false);
    toothAnims.referralSectionsHeight.setValue(0);
    toothAnims.treatmentRecordPushDown.setValue(0);
    toothAnims.planningRecordPushDown.setValue(0);

    // بعد انتهاء اختفاء الأسنان، إظهار الحاويات بالتسلسل
    // 1. Referral من اليمين
    Animated.timing(toothAnims.referralContainerSlide, {
      toValue: 0,
      duration: 150,
      useNativeDriver: true,
    }).start(() => {
      console.log(' Referral container visible');
      // 2. Treatment Record من اليسار
      Animated.timing(toothAnims.treatmentRecordSlide, {
        toValue: 0,
        duration: 150,
        useNativeDriver: true,
      }).start(() => {
        console.log(' Treatment Record visible');
        // 3. Planning Record من اليمين
        Animated.timing(toothAnims.planningRecordSlide, {
          toValue: 0,
          duration: 150,
          useNativeDriver: true,
        }).start(() => {
          console.log(' All containers visible');
        });
      });
    });
  });
}

/**
 * Animate hiding View Mode - hide containers and show teeth
 */
export function animateHideViewMode({
  toothAnims,
  setIsReferralExpanded,
}: ViewModeAnimationsParams): void {
  console.log('🔴 Hiding containers - returning teeth');

  // إعادة تعيين الحاوية للحالة المغلقة
  setIsReferralExpanded(false);
  toothAnims.referralSectionsHeight.setValue(0);
  toothAnims.treatmentRecordPushDown.setValue(0);
  toothAnims.planningRecordPushDown.setValue(0);

  // إخفاء الحاويات بالتسلسل العكسي
  // 1. Planning Record (يمين)
  Animated.timing(toothAnims.planningRecordSlide, {
    toValue: scale(1000),
    duration: 100,
    useNativeDriver: true,
  }).start(() => {
    console.log('🟡 Planning Record hidden');
    // 2. Treatment Record (يسار)
    Animated.timing(toothAnims.treatmentRecordSlide, {
      toValue: scale(-1000),
      duration: 100,
      useNativeDriver: true,
    }).start(() => {
      console.log('🟡 Treatment Record hidden');
      // 3. Referral (يمين)
      Animated.timing(toothAnims.referralContainerSlide, {
        toValue: scale(1000),
        duration: 100,
        useNativeDriver: true,
      }).start(() => {
        console.log('🟡 All containers hidden - now returning teeth');
        // ثم إرجاع الأسنان وزر Edit والخطوط وأرقام الأسنان لأماكنها
        Animated.parallel([
          Animated.timing(toothAnims.rightTeethSlide, {
            toValue: 0,
            duration: 300,
            useNativeDriver: true,
          }),
          Animated.timing(toothAnims.leftTeethSlide, {
            toValue: 0,
            duration: 300,
            useNativeDriver: true,
          }),
          Animated.timing(toothAnims.editButtonSlide, {
            toValue: 0,
            duration: 300,
            useNativeDriver: true,
          }),
          Animated.timing(toothAnims.verticalTopLineSlide, {
            toValue: 0,
            duration: 300,
            useNativeDriver: true,
          }),
          Animated.timing(toothAnims.verticalBottomLineSlide, {
            toValue: 0,
            duration: 300,
            useNativeDriver: true,
          }),
          Animated.timing(toothAnims.horizontalRightLineSlide, {
            toValue: 0,
            duration: 300,
            useNativeDriver: true,
          }),
          Animated.timing(toothAnims.horizontalLeftLineSlide, {
            toValue: 0,
            duration: 300,
            useNativeDriver: true,
          }),
          Animated.timing(toothAnims.rightNumbersSlide, {
            toValue: 0,
            duration: 300,
            useNativeDriver: true,
          }),
          Animated.timing(toothAnims.leftNumbersSlide, {
            toValue: 0,
            duration: 300,
            useNativeDriver: true,
          }),
          Animated.timing(toothAnims.oralHygieneOpacity, {
            toValue: 1,
            duration: 300,
            useNativeDriver: true,
          }),
          Animated.timing(toothAnims.viewButtonPositionAnim, {
            toValue: 0,
            duration: 300,
            useNativeDriver: true,
          }),
        ]).start(() => {
          console.log(' Teeth returned to original position');
        });
      });
    });
  });
}

/**
 * Handle View Mode toggle - main entry point
 */
export function handleViewModeToggle(
  newState: boolean,
  params: ViewModeAnimationsParams
): void {
  if (newState) {
    animateShowViewMode(params);
  } else {
    animateHideViewMode(params);
  }
}
