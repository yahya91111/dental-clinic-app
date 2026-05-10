-- ═══════════════════════════════════════════════════════════════
-- AI Conversations Table
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS ai_conversations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  clinic_id UUID NOT NULL,
  user_id UUID NOT NULL,
  user_name TEXT NOT NULL,
  context TEXT, -- which screen/feature (schedule, dental_chart, etc.)
  messages JSONB NOT NULL DEFAULT '[]', -- array of {role, content, timestamp}
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_conversations_user ON ai_conversations(user_id);
CREATE INDEX IF NOT EXISTS idx_ai_conversations_clinic ON ai_conversations(clinic_id);

ALTER TABLE ai_conversations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all for ai_conversations" ON ai_conversations FOR ALL USING (true) WITH CHECK (true);
