-- ═══════════════════════════════════════════════════════════════════════════
--  مخطّطُ الدورِ اليوميّ — لقطةٌ محفوظةٌ لكلِّ يومٍ في كلِّ مركز
-- ═══════════════════════════════════════════════════════════════════════════
--
--  لماذا لقطةٌ ولا نُعيدُ البناءَ من صفوفِ المرضى المؤرشفة؟
--    ١) الأرشفةُ اليدويّةُ تُجبِرُ status='complete' على الجميع، فمَن كان منتظِرًا ولم يدخلْ
--       يعودُ في إعادةِ البناءِ كأنّه عُولِجَ — تشويهٌ لا يُصلَح.
--    ٢) البريكاتُ وعددُ الكراسي تُقرأُ من إعداداتِ المركزِ **الحاليّة**. فلو غُيِّرَ وقتُ
--       التبديلِ الشهرَ القادمَ لارتدَّ التغييرُ على مخطّطاتِ كلِّ الأيّامِ الماضيةِ فكذبَتْ.
--  فاللقطةُ هي الصدقُ الوحيدُ: ما رآه الطبيبُ ذلك اليومَ، محفوظًا كما رآه.
--
--  آمنٌ لإعادةِ التشغيل.

-- ── ١) الجدول ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS queue_day_charts (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id  UUID        NOT NULL,
  day        DATE        NOT NULL,
  chart      JSONB       NOT NULL,   -- DayChart (screens/MainQueue/queueLanes.ts)
  saved_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (clinic_id, day)            -- يومٌ واحدٌ لكلِّ مركز؛ الكتابةُ تُحدِّثُ اللقطةَ ولا تُكرِّرُها
);

CREATE INDEX IF NOT EXISTS idx_queue_day_charts_lookup
  ON queue_day_charts(clinic_id, day DESC);

-- ── ٢) RLS ─────────────────────────────────────────────────────────────────
-- المصادقةُ في هذا التطبيقِ عبرَ جدولِ doctors لا Supabase Auth، فالسياسةُ مفتوحةٌ
-- كبقيّةِ جداولِ التطبيق، والعزلُ يتمُّ في الاستعلامِ بـ clinic_id.
ALTER TABLE queue_day_charts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS queue_day_charts_all ON queue_day_charts;
CREATE POLICY queue_day_charts_all ON queue_day_charts
  FOR ALL USING (true) WITH CHECK (true);
