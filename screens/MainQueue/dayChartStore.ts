/**
 * dayChartStore — إبقاءُ لقطةِ مخطّطِ اليومِ محفوظةً باستمرار.
 *
 * الأرشفةُ صارت على الخادم (sql/archive_day_cron.sql، ٢٣:٥٩ بتوقيتِ بغداد): تفرّغُ
 * طوابيرَ المراكزِ كلِّها سواءٌ فُتِحَ التطبيقُ أم لا. أمّا المخطّطُ فيُحسَبُ على الجهازِ
 * بالضرورة، فلا سبيلَ إلى أن يلتقطَه الخادمُ لحظةَ الأرشفة.
 *
 * فالحلُّ ألّا نعلّقَ الحفظَ بلحظةٍ واحدةٍ أصلًا: اللقطةُ تُكتَبُ وهي تُبنى، فيبقى في
 * قاعدةِ البيانات دائمًا آخرُ ما رآه المركز. وحينَ يؤرشفُ الخادمُ في الليلِ تكونُ اللقطةُ
 * موجودةً سلفًا، فلا يُنتَظَرُ من الجهازِ شيء.
 *
 * والكتابةُ لا تجري مع كلِّ نبضةِ ساعة: تُميَّزُ حالتان —
 *   • تبدّلَ **المضمون** (دخلَ مريضٌ، أُنجزَ، تغيّرت مدّةٌ، حُرِّرَ بريك) → كتابةٌ بعدَ ثوانٍ.
 *   • مضتْ دقيقةٌ والمضمونُ نفسُه (الخطُّ الزمنيُّ يتقدّمُ وحدَه) → كتابةٌ على مهلٍ طويلة.
 */
import { saveDayChart } from '../../lib/database';
import type { DayChart } from './queueLanes';

const CHANGE_DELAY_MS = 8 * 1000;        // تبدّلَ المضمون: نمهلُ قليلًا كي تهدأَ سلسلةُ التغييرات
const IDLE_EVERY_MS = 5 * 60 * 1000;     // لم يتبدّلْ شيء: تحديثٌ بطيءٌ لموضعِ خطِّ الزمنِ لا أكثر

let pending: { clinicId: string; chart: DayChart } | null = null;
let lastSig = '';
let lastWriteAt = 0;
let timer: ReturnType<typeof setTimeout> | null = null;

const arm = (ms: number) => {
  if (timer) return;                     // موعدٌ قائمٌ بالفعل — لا نُزاحمُه بآخر
  timer = setTimeout(() => { timer = null; void flushDayChart(); }, ms);
};

/**
 * يُستدعى مع كلِّ بناءٍ للمخطّط. sig = بصمةُ المضمونِ (بلا وقتٍ) — بها نعرفُ أوقعَ تغييرٌ
 * حقيقيٌّ أم أنّ الساعةَ وحدَها تقدّمت.
 */
export function rememberDayChart(clinicId: string | null, chart: DayChart, sig: string) {
  if (!clinicId) return;
  pending = { clinicId, chart };
  const key = `${clinicId}·${chart.day}·${sig}`;
  if (key !== lastSig) {
    lastSig = key;
    arm(lastWriteAt === 0 ? 0 : CHANGE_DELAY_MS);      // أوّلُ لقطةٍ تُكتَبُ فورًا
  } else if (Date.now() - lastWriteAt >= IDLE_EVERY_MS) {
    arm(0);
  }
}

/** كتابةٌ فوريّةٌ لآخرِ لقطة. */
export async function flushDayChart(): Promise<void> {
  if (!pending) return;
  const { clinicId, chart } = pending;
  lastWriteAt = Date.now();
  try {
    await saveDayChart(clinicId, chart.day, chart);
  } catch {
    // الحفظُ ليس أهمَّ من سيرِ العمل: لا نُعطِّلُ شيئًا بفشلِ لقطة
  }
}
