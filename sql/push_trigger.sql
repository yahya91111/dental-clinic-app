-- ═══════════════════════════════════════════════════════════════
-- Auto Push Notification Trigger
-- Sends push via Expo API when a new notification is inserted
-- Requires pg_net extension (enabled by default on Supabase)
-- ═══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION send_push_on_notification()
RETURNS TRIGGER AS $$
DECLARE
  token_record RECORD;
BEGIN
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
CREATE TRIGGER trigger_push_on_notification
  AFTER INSERT ON notifications
  FOR EACH ROW
  EXECUTE FUNCTION send_push_on_notification();
