import React from 'react';
import { Animated, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { scale } from '../../lib/scale';

// ─────────────────────────────────────────────────────────────────────────────
// QueueTopHaze — ما يحدثُ للكرتِ عندَ قاعِ رأسِ الصفحة.
//
// القائمةُ تقصُّ ما يخرجُ منها، والقصُّ حدٌّ حادّ: يصعدُ الكرتُ فيُقطَعُ نصفَه دفعةً
// واحدةً على خطٍّ مستقيم، وحافّتُه وظلُّه يجتمعانِ عليه فيُقرأُ خطًّا داكنًا. والحدُّ
// موجودٌ لا محالة — لكنّ ما يُرى منه ليس كذلك.
//
// فبينَ الرأسِ والقائمةِ ضبابٌ من لونِ الصفحةِ نفسِها: كثيفٌ عندَ الحدِّ حتّى لا يبلغَه
// من الكرتِ شيءٌ يُقطَع، ثمّ يرقُّ نازلًا حتّى يفنى. فالكرتُ لا يُقصُّ بل **يذوب**.
//
// وهو لا يظهرُ إلّا حينَ يكونُ تحتَه ما يُخفيه: شفافيّتُه معلَّقةٌ بإزاحةِ التمرير،
// فعندَ رأسِ القائمةِ لا ضبابَ ولا شريطَ ولا شيء — والصفحةُ نظيفةٌ كما هي. ثمّ يتكوّنُ
// في أوّلِ ثلاثينَ بكسلًا من التمرير، ويعودُ فيزولُ حينَ ترجع.
//
// ولا حدَّ له هو: أعلاه بلونِ الصفحةِ تمامًا فيتّصلُ بما فوقَه، وأسفلُه صفرٌ فينتهي
// إلى لا شيء. جسمٌ لا يُرى، ولا يُرى إلّا أثرُه.
// ─────────────────────────────────────────────────────────────────────────────

// لونُ الصفحةِ عندَ هذا الارتفاع — بينَ #F0F4F8 و#E8EDF3 من تدرّجِ الخلفيّةِ القُطريّ
const TONE = '236, 241, 246';

export const HAZE_H = scale(56);

// أكثفُ ما يكونُ عندَ الحدِّ ثمّ ينحدرُ سريعًا: النصفُ الأوّلُ يُخفي، والنصفُ الثاني يُخفي
// أنّه كان يُخفي.
const MIST: [string, string, string, string] = [
  `rgba(${TONE}, 1)`,
  `rgba(${TONE}, 0.94)`,
  `rgba(${TONE}, 0.58)`,
  `rgba(${TONE}, 0)`,
];

export const QueueTopHaze = React.memo(function QueueTopHaze({
  opacity,
}: {
  opacity: Animated.AnimatedInterpolation<number>;
}) {
  return (
    <Animated.View style={[s.wrap, { opacity }]} pointerEvents="none">
      <LinearGradient
        colors={MIST}
        locations={[0, 0.26, 0.58, 1]}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
    </Animated.View>
  );
});

const s = StyleSheet.create({
  wrap: { position: 'absolute', top: 0, left: 0, right: 0, height: HAZE_H },
});
