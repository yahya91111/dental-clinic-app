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
-- card) reddens the AI button silently — never push it.
-- ═══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION send_push_on_notification()
RETURNS TRIGGER AS $$
DECLARE
  token_record RECORD;
BEGIN
  -- أنواع صامتة: لا تُرسِل لها دفعًا (مكانها داخل التطبيق فقط)
  IF NEW.type IN ('gap_alert') THEN
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

-- Trigger: run after every new notification
DROP TRIGGER IF EXISTS trigger_push_on_notification ON notifications;
CREATE TRIGGER trigger_push_on_notification
  AFTER INSERT ON notifications
  FOR EACH ROW
  EXECUTE FUNCTION send_push_on_notification();
