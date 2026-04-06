import { Dimensions, PixelRatio, StyleSheet, Platform } from 'react-native';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

// Reference: iPhone Pro Max (430 x 932)
const BASE_WIDTH = 430;
const BASE_HEIGHT = 932;

// iPad detection - skip scaling on iPads
const IS_TABLET = Math.min(SCREEN_WIDTH, SCREEN_HEIGHT) >= 600;

// Width scale ratio (clamped to phone range)
const WIDTH_RATIO = IS_TABLET ? 1 : SCREEN_WIDTH / BASE_WIDTH;
const HEIGHT_RATIO = IS_TABLET ? 1 : SCREEN_HEIGHT / BASE_HEIGHT;

/**
 * Scale a size proportionally based on screen width.
 * Use for: width, padding, margin, fontSize, borderRadius, gap, etc.
 */
export const scale = (size: number): number => {
  if (IS_TABLET) return size;
  return Math.round(PixelRatio.roundToNearestPixel(size * WIDTH_RATIO));
};

/**
 * Scale a size proportionally based on screen height.
 * Use for: height (when you want vertical proportionality).
 */
export const verticalScale = (size: number): number => {
  if (IS_TABLET) return size;
  return Math.round(PixelRatio.roundToNearestPixel(size * HEIGHT_RATIO));
};

/**
 * Moderate scale - less aggressive scaling, useful for fonts.
 * factor 0.5 means: half of the difference is applied.
 */
export const moderateScale = (size: number, factor: number = 0.5): number => {
  if (IS_TABLET) return size;
  return Math.round(PixelRatio.roundToNearestPixel(size + (scale(size) - size) * factor));
};

// Style properties that should be scaled (numeric values only)
const SCALABLE_PROPS = new Set([
  'width', 'height', 'minWidth', 'minHeight', 'maxWidth', 'maxHeight',
  'padding', 'paddingTop', 'paddingBottom', 'paddingLeft', 'paddingRight',
  'paddingHorizontal', 'paddingVertical', 'paddingStart', 'paddingEnd',
  'margin', 'marginTop', 'marginBottom', 'marginLeft', 'marginRight',
  'marginHorizontal', 'marginVertical', 'marginStart', 'marginEnd',
  'top', 'bottom', 'left', 'right', 'start', 'end',
  'borderRadius', 'borderTopLeftRadius', 'borderTopRightRadius',
  'borderBottomLeftRadius', 'borderBottomRightRadius',
  'borderTopStartRadius', 'borderTopEndRadius',
  'borderBottomStartRadius', 'borderBottomEndRadius',
  'borderWidth', 'borderTopWidth', 'borderBottomWidth',
  'borderLeftWidth', 'borderRightWidth',
  'fontSize', 'lineHeight', 'letterSpacing',
  'gap', 'rowGap', 'columnGap',
  'iconSize',
]);

/**
 * Recursively scale all numeric values for size-related properties in a style object.
 */
function scaleStyleObject(styleObj: any): any {
  if (!styleObj || typeof styleObj !== 'object') return styleObj;

  const scaled: any = {};
  for (const key in styleObj) {
    const value = styleObj[key];
    if (typeof value === 'number' && SCALABLE_PROPS.has(key)) {
      scaled[key] = scale(value);
    } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      scaled[key] = scaleStyleObject(value);
    } else if (Array.isArray(value)) {
      scaled[key] = value.map((v) =>
        typeof v === 'object' && v !== null ? scaleStyleObject(v) : v
      );
    } else {
      scaled[key] = value;
    }
  }
  return scaled;
}

/**
 * Drop-in replacement for StyleSheet.create that automatically scales numeric values.
 * Usage: change `StyleSheet.create({...})` to `scaledStyleSheet({...})`.
 */
export function scaledStyleSheet<T extends Record<string, any>>(styles: T): T {
  const scaled: any = {};
  for (const key in styles) {
    scaled[key] = scaleStyleObject(styles[key]);
  }
  return StyleSheet.create(scaled) as T;
}

export const SCREEN = {
  width: SCREEN_WIDTH,
  height: SCREEN_HEIGHT,
  isTablet: IS_TABLET,
  widthRatio: WIDTH_RATIO,
  heightRatio: HEIGHT_RATIO,
};
