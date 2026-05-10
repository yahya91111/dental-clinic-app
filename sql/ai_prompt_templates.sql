-- ═══════════════════════════════════════════════════════════════
-- AI Prompt Templates - per clinic custom rules
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS ai_prompt_templates (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  clinic_id UUID NOT NULL,
  name TEXT NOT NULL,
  prompt TEXT NOT NULL,
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_prompt_templates_clinic ON ai_prompt_templates(clinic_id);

ALTER TABLE ai_prompt_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all for ai_prompt_templates" ON ai_prompt_templates FOR ALL USING (true) WITH CHECK (true);
