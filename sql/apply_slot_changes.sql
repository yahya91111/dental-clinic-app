-- ═══════════════════════════════════════════════════════════════
-- apply_slot_changes — تطبيق حزمة تغييرات على الجدول معاملةً واحدة
-- ═══════════════════════════════════════════════════════════════
-- التبديل يحتاج عدّة تحديثات/حذوف/إدراجات؛ لو انقطع الاتصال في
-- المنتصف بقي الجدول ناقصًا. هذه الدالّة تستلم الحزمة كاملةً وتطبّقها
-- داخل قاعدة البيانات في معاملة واحدة: إمّا تقع كلّها أو لا شيء.
-- المحرّك في التطبيق يحسب كلّ شيء؛ القاعدة تطبّق فقط (لا منطق هنا).
--
-- p_updates:    [{id, doctor_id, doctor_name, source?}] — نقل ملكيّة خانة
--               (source اختياريّ: يُحدَّث الوسم إن ورد، وإلّا بقي كما هو)
-- p_delete_ids: [uuid] — خانات تُحذف
-- p_inserts:    [{clinic_id, week_start, day_of_week, period,
--                 clinic_number, doctor_id, doctor_name, role,
--                 status, source}] — خانات تُكتب
--
-- يُشغَّل مرّةً واحدة في محرّر SQL في Supabase.

CREATE OR REPLACE FUNCTION apply_slot_changes(
  p_updates    JSONB  DEFAULT '[]'::jsonb,
  p_delete_ids UUID[] DEFAULT '{}',
  p_inserts    JSONB  DEFAULT '[]'::jsonb
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- ١) التحديثات: نقل ملكيّة الخانات (الموضع ثابت)
  UPDATE schedule_slots s
  SET doctor_id   = u.doctor_id,
      doctor_name = u.doctor_name,
      source      = COALESCE(u.source, s.source),  -- يُحدَّث الوسم إن ورد، وإلّا بقي كما هو
      updated_at  = NOW()
  FROM (
    SELECT (e->>'id')::uuid          AS id,
           (e->>'doctor_id')::uuid   AS doctor_id,
           e->>'doctor_name'         AS doctor_name,
           e->>'source'              AS source
    FROM jsonb_array_elements(p_updates) e
  ) u
  WHERE s.id = u.id;

  -- ٢) الحذوف
  DELETE FROM schedule_slots WHERE id = ANY(p_delete_ids);

  -- ٣) الإدراجات
  INSERT INTO schedule_slots
    (clinic_id, week_start, day_of_week, period, clinic_number,
     doctor_id, doctor_name, role, status, source)
  SELECT
    (e->>'clinic_id')::uuid,
    (e->>'week_start')::date,
    e->>'day_of_week',
    (e->>'period')::int,
    (e->>'clinic_number')::int,
    (e->>'doctor_id')::uuid,
    e->>'doctor_name',
    COALESCE(e->>'role',   'clinic'),
    COALESCE(e->>'status', 'active'),
    COALESCE(e->>'source', 'request')
  FROM jsonb_array_elements(p_inserts) e;
END;
$$;
