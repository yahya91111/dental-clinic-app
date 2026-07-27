-- ═══════════════════════════════════════════════════════════════════════════
--  أرشفةُ اليومِ على الخادم — ٢٣:٥٩ بتوقيتِ بغداد، لكلِّ المراكز
-- ═══════════════════════════════════════════════════════════════════════════
--
--  كانتِ الأرشفةُ مؤقّتًا داخلَ التطبيق: يسألُ كلَّ دقيقةٍ «هل الساعةُ ٢٣:٥٩؟». فإن كان
--  التطبيقُ مغلقًا تلك الدقيقةَ بعينِها لم تحدثِ الأرشفةُ **ولم تُعوَّضْ في الغد** — فيختلطُ
--  مرضى الأمسِ بمرضى اليوم. وهنا تجري على الخادمِ فلا تفوتُ ليلةً ولا تتعلّقُ بجهاز.
--
--  ملاحظةُ التوقيت: pg_cron يجدولُ بالـ UTC. وبغدادُ UTC+3 بلا توقيتٍ صيفيّ،
--  فـ ٢٣:٥٩ بغداد = ٢٠:٥٩ UTC. واليومُ يُحسَبُ بالتوقيتِ المحلّيِّ لا الـ UTC.
--
--  آمنٌ لإعادةِ التشغيل.

-- ── ١) الامتداد ────────────────────────────────────────────────────────────
-- إن مُنِعَ هنا فمَكِّنْه من لوحةِ Supabase: Database → Extensions → pg_cron
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- ── ٢) الدالّة ─────────────────────────────────────────────────────────────
-- لا تلمسُ status: تبقى الحالةُ كما كانت، فمَن لم يحضرْ لا يظهرُ في الأرشيفِ مُعالَجًا.
CREATE OR REPLACE FUNCTION archive_day()
RETURNS TABLE (archived_count INT, day DATE)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_day DATE;
  v_n   INT;
BEGIN
  v_day := (NOW() AT TIME ZONE 'Asia/Baghdad')::DATE;

  -- أحداثُ الخطِّ الزمنيِّ للكروتِ المنتهية: تُحذَفُ كما كانت تفعلُ أرشفةُ التطبيق.
  -- (أوقاتُ الكرتِ نفسُها في صفِّ المريض: registered_at / clinic_entry_at / completed_at)
  DELETE FROM timeline_events te
   USING patients p
   WHERE te.patient_id = p.id
     AND p.archive_date IS NULL;

  UPDATE patients
     SET archive_date = v_day
   WHERE archive_date IS NULL;

  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN QUERY SELECT v_n, v_day;
END;
$$;

-- ── ٣) الجدولة ─────────────────────────────────────────────────────────────
-- إزالةُ أيِّ جدولةٍ سابقةٍ بالاسمِ نفسِه، ثمّ الجدولةُ من جديد (فيصحُّ تشغيلُ الملفِّ مرارًا)
SELECT cron.unschedule('archive-day')
 WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'archive-day');

SELECT cron.schedule('archive-day', '59 20 * * *', $cron$SELECT archive_day()$cron$);

-- ── ٤) للتحقّق ─────────────────────────────────────────────────────────────
--   SELECT jobname, schedule, active FROM cron.job WHERE jobname = 'archive-day';
--   SELECT * FROM cron.job_run_details WHERE jobid =
--     (SELECT jobid FROM cron.job WHERE jobname = 'archive-day')
--     ORDER BY start_time DESC LIMIT 5;
--   -- تشغيلٌ يدويٌّ للاختبار (يؤرشفُ فورًا):  SELECT * FROM archive_day();
