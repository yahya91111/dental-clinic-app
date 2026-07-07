-- ═══════════════════════════════════════════════════════════════
-- Auto Push Notification Trigger
-- Sends push via Expo API when a new notification is inserted
-- Requires pg_net extension (enabled by default on Supabase)
-- ═══════════════════════════════════════════════════════════════
-- This trigger is the SINGLE source of push notifications. The app's
-- JS createNotification() does NOT send push (it used to, which caused
-- double rings). Keep push logic here only.
--
-- Silent types (no ring): notifications that belong to the AI orb /
-- in-app surfaces and must not buzz the phone. `gap_alert` (coverage
-- card) and `coverage_fill` (shift-fill draft card) redden the AI button
-- silently — never push them.
--
-- Pushing orb cards: `seat_change` (the «طرأ تغييرٌ على جدولك» card) is an
-- orb card BUT must reach the affected doctor even when the app is closed,
-- so it deliberately PUSHES (it is NOT in the silent list). One row is
-- inserted per affected doctor per change-event → one ring each. Do not add
-- it to the silent list.
--
-- `shortage_alert` (the «يوجد فترة فارغة» card) is likewise an orb card that
-- PUSHES: an unfillable clinic gap is important, so each team leader's copy
-- must reach the phone. One row per leader → one ring each. NOT silent.
--
-- `rebalance_consent` (the «موازنةُ يومٍ عدّلتَه» card) is SILENT: a low-urgency
-- in-app decision (the engine asking permission to balance a day the leader edited
-- by hand — coverage already happened, no patient is uncovered). It reddens the AI
-- orb like the reserve-choice card; the leader decides نعم/لا when convenient. Silent.
--
-- Grouped requests: a multi-day request (e.g. sick leave Sun+Mon+Tue)
-- is collected into ONE `request_info` row whose `body` grows as days
-- are appended (day 1 = INSERT, days 2+ = UPDATE). We push ONCE per
-- request — on the initial INSERT only. Appending later days updates the
-- in-app card silently (no second ring); the leader opens it to see all
-- days. A genuinely separate request (outside the batch window) is a new
-- INSERT, so it rings on its own.
-- ═══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION send_push_on_notification()
RETURNS TRIGGER AS $$
DECLARE
  token_record RECORD;
BEGIN
  -- أنواع صامتة: لا تُرسِل لها دفعًا (مكانها داخل التطبيق فقط)
  IF NEW.type IN ('gap_alert', 'coverage_fill', 'rebalance_consent') THEN
    RETURN NEW;
  END IF;

  -- طلبُ تبديلٍ متعدّدُ الأيّام: صفٌّ لكلِّ يوم (نفسُ swap_batch)، لكن رنّةٌ واحدةٌ للطلبِ كلِّه.
  -- ادفع فقط لأوّلِ صفٍّ يصلُ المستلمَ من نفسِ المجموعة؛ صفوفُ الأيّامِ التالية صامتة (تظهر في
  -- الكرت نفسِه داخلَ التطبيق). طلبُ اليومِ الواحدِ القديم (بلا swap_batch) يدفعُ كالمعتاد.
  IF TG_OP = 'INSERT' AND NEW.type = 'swap_request' AND NEW.data ? 'swap_batch' AND EXISTS (
    SELECT 1 FROM notifications n
    WHERE n.recipient_id = NEW.recipient_id
      AND n.type = 'swap_request'
      AND n.id <> NEW.id
      AND n.data->>'swap_batch' = NEW.data->>'swap_batch'
  ) THEN
    RETURN NEW;
  END IF;

  -- طلبٌ متعدّد الأيّام: ادفع مرّةً واحدة عند الإنشاء فقط. إلحاق أيّامٍ لاحقة
  -- (UPDATE) يحدّث الكرت داخل التطبيق بلا رنّةٍ ثانية — رنّةٌ واحدةٌ لكلّ طلب.
  IF TG_OP = 'UPDATE' AND NEW.type = 'request_info' THEN
    RETURN NEW;
  END IF;

  -- على التحديث (للأنواع الأخرى): ادفع فقط إن تغيّر الجسم. تغييرات القراءة/
  -- حالة الإجراء لا تُغيّر الجسم فلا تُطلق دفعًا مكرّرًا.
  IF TG_OP = 'UPDATE' AND NEW.body IS NOT DISTINCT FROM OLD.body THEN
    RETURN NEW;
  END IF;

  -- Get all push tokens for the recipient
  FOR token_record IN
    SELECT token FROM push_tokens WHERE user_id = NEW.recipient_id
  LOOP
    -- Send push via Expo Push API
    PERFORM net.http_post(
      url := 'https://exp.host/--/api/v2/push/send',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Accept', 'application/json'
      ),
      body := jsonb_build_object(
        'to', token_record.token,
        'sound', 'default',
        'title', NEW.title,
        'body', NEW.body,
        'data', COALESCE(NEW.data, '{}'::jsonb)
      )
    );
  END LOOP;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger: run after insert OR a body-changing update (grouped requests)
DROP TRIGGER IF EXISTS trigger_push_on_notification ON notifications;
CREATE TRIGGER trigger_push_on_notification
  AFTER INSERT OR UPDATE ON notifications
  FOR EACH ROW
  EXECUTE FUNCTION send_push_on_notification();
