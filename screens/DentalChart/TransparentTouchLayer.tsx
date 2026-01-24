import React from 'react';
import { View, TouchableWithoutFeedback } from 'react-native';
import { SCREEN_WIDTH, SCREEN_HEIGHT } from './styles';

// ═══════════════════════════════════════════════════════════════
// Transparent Touch Layer Component
// Creates touch areas around the selected tooth to close it when tapping outside
// ═══════════════════════════════════════════════════════════════

interface TransparentTouchLayerProps {
  selectedTooth: number;
  onClose: () => void;
}

export function TransparentTouchLayer({ selectedTooth, onClose }: TransparentTouchLayerProps) {
  // حساب حدود السن المكبر
  // Tiny teeth (6,7,8,9,10,11,22,23,24,25,26,27): 37x47، Medium teeth (1-5,12-21,28-32): 33x42
  const isTinyTooth = [6, 7, 8, 9, 10, 11, 22, 23, 24, 25, 26, 27].includes(selectedTooth);
  const originalWidth = isTinyTooth ? 37 : 33;
  const originalHeight = isTinyTooth ? 47 : 42;
  // للأسنان المدورة ±90 درجة (1-32)، نعكس الأبعاد
  const isRotatedTooth = selectedTooth >= 1 && selectedTooth <= 32;
  let toothWidth = (isRotatedTooth ? originalHeight : originalWidth) * 8;
  let toothHeight = (isRotatedTooth ? originalWidth : originalHeight) * 8;

  let centerX = SCREEN_WIDTH / 2 - 20;
  let centerY = SCREEN_HEIGHT / 2;

  // حساب يدوي مستقل للأسنان 6, 7, 8, 9, 10, 11 (8, 7, 6 يمين ويسار فوق)
  if (selectedTooth === 6 || selectedTooth === 7 || selectedTooth === 8 || selectedTooth === 9 || selectedTooth === 10 || selectedTooth === 11) {
    const originalToothWidth = 37;
    const originalToothHeight = 47;

    centerX = SCREEN_WIDTH / 2 - 20;
    centerY = SCREEN_HEIGHT / 2 + 69;
    toothWidth = originalToothHeight * 8;
    toothHeight = originalToothWidth * 8;
  }

  // حساب يدوي مستقل للأسنان 25, 26, 27 (8, 7, 6 تحت يسار)
  if (selectedTooth === 25 || selectedTooth === 26 || selectedTooth === 27) {
    const originalToothWidth = 37;
    const originalToothHeight = 47;

    centerX = SCREEN_WIDTH / 2 + 30;
    centerY = SCREEN_HEIGHT / 2 + 50;
    toothWidth = originalToothHeight * 8;
    toothHeight = originalToothWidth * 8;
  }

  // حساب يدوي مستقل للأسنان 22, 23, 24 (3, 2, 1 تحت يمين)
  if (selectedTooth === 22 || selectedTooth === 23 || selectedTooth === 24) {
    const originalToothWidth = 37;
    const originalToothHeight = 47;

    centerX = SCREEN_WIDTH / 2 + 10;
    centerY = SCREEN_HEIGHT / 2 + 30;
    toothWidth = originalToothHeight * 8;
    toothHeight = originalToothWidth * 8;
  }

  // حساب يدوي مستقل للأسنان 17-21 (8-4 تحت يمين)
  if (selectedTooth >= 17 && selectedTooth <= 21) {
    const originalToothWidth = 37;
    const originalToothHeight = 47;

    centerX = SCREEN_WIDTH / 2 + 10;
    centerY = SCREEN_HEIGHT / 2 + 10;
    toothWidth = originalToothHeight * 7;
    toothHeight = originalToothWidth * 7;
  }

  // حساب يدوي مستقل للأسنان 4, 5, 12, 13 (5, 4 يمين ويسار فوق)
  if (selectedTooth === 4 || selectedTooth === 5 || selectedTooth === 12 || selectedTooth === 13) {
    const originalToothWidth = 37;
    const originalToothHeight = 47;

    centerX = SCREEN_WIDTH / 2;
    centerY = SCREEN_HEIGHT / 2 + 90;
    toothWidth = originalToothHeight * 7;
    toothHeight = originalToothWidth * 7;
  }

  // حساب يدوي مستقل للأسنان 1, 2, 3, 14, 15, 16 (3, 2, 1 يمين ويسار فوق)
  if (selectedTooth === 1 || selectedTooth === 2 || selectedTooth === 3 || selectedTooth === 14 || selectedTooth === 15 || selectedTooth === 16) {
    centerX = SCREEN_WIDTH / 2;
    centerY = SCREEN_HEIGHT / 2 + 110;
    toothWidth = 329;
    toothHeight = 259;
  }

  // حساب يدوي مستقل للأسنان 28-32 (8-4 تحت يسار)
  if (selectedTooth >= 28 && selectedTooth <= 32) {
    const originalToothWidth = 33;
    const originalToothHeight = 42;

    centerX = SCREEN_WIDTH / 2 + 10;
    centerY = SCREEN_HEIGHT / 2;
    toothWidth = originalToothHeight * 8;
    toothHeight = originalToothWidth * 8;
  }

  const toothTop = centerY - toothHeight / 2;
  const toothBottom = centerY + toothHeight / 2;
  const toothLeft = centerX - toothWidth / 2;
  const toothRight = centerX + toothWidth / 2;

  return (
    <>
      {/* المنطقة العلوية - من أعلى الشاشة حتى الحد العلوي للسن */}
      <TouchableWithoutFeedback onPress={onClose}>
        <View
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: SCREEN_WIDTH,
            height: toothTop,
            zIndex: 998,
            backgroundColor: 'transparent',
          }}
        />
      </TouchableWithoutFeedback>

      {/* المنطقة السفلية - من الحد السفلي للسن حتى أسفل الشاشة */}
      <TouchableWithoutFeedback onPress={onClose}>
        <View
          style={{
            position: 'absolute',
            top: toothBottom,
            left: 0,
            width: SCREEN_WIDTH,
            height: SCREEN_HEIGHT - toothBottom,
            zIndex: 998,
            backgroundColor: 'transparent',
          }}
        />
      </TouchableWithoutFeedback>

      {/* المنطقة اليسرى - من يسار الشاشة حتى الحد الأيسر للسن */}
      <TouchableWithoutFeedback onPress={onClose}>
        <View
          style={{
            position: 'absolute',
            top: toothTop,
            left: 0,
            width: toothLeft,
            height: toothHeight,
            zIndex: 998,
            backgroundColor: 'transparent',
          }}
        />
      </TouchableWithoutFeedback>

      {/* المنطقة اليمنى - من الحد الأيمن للسن حتى يمين الشاشة */}
      <TouchableWithoutFeedback onPress={onClose}>
        <View
          style={{
            position: 'absolute',
            top: toothTop,
            left: toothRight,
            width: SCREEN_WIDTH - toothRight,
            height: toothHeight,
            zIndex: 998,
            backgroundColor: 'transparent',
          }}
        />
      </TouchableWithoutFeedback>
    </>
  );
}
