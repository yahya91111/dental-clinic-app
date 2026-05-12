-- ═══════════════════════════════════════════════════════════════
-- Notifications & Push Tokens Tables
-- ═══════════════════════════════════════════════════════════════

-- Notifications table
CREATE TABLE notifications (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  clinic_id UUID REFERENCES clinics(id),

  -- Recipient
  recipient_id UUID NOT NULL,

  -- Sender (optional)
  sender_id UUID,
  sender_name TEXT,

  -- Content
  type TEXT NOT NULL,        -- 'swap_request', 'schedule_change', 'ai_alert', 'admin_message', 'general'
  title TEXT NOT NULL,
  body TEXT NOT NULL,

  -- Extra data (flexible JSON)
  data JSONB DEFAULT '{}',

  -- Status
  is_read BOOLEAN DEFAULT false,

  -- Action (for requests like swap)
  action_type TEXT,          -- 'accept_reject', null
  action_status TEXT,        -- 'pending', 'accepted', 'rejected', null

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_notifications_recipient ON notifications(recipient_id, is_read, created_at DESC);
CREATE INDEX idx_notifications_clinic ON notifications(clinic_id, created_at DESC);

-- Push tokens table
CREATE TABLE push_tokens (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  clinic_id UUID REFERENCES clinics(id),
  token TEXT NOT NULL,
  platform TEXT NOT NULL,    -- 'ios', 'android'
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, token)
);
