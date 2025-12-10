#!/bin/bash
SUPABASE_URL="https://usuljsxfvhhcxdwnshpr.supabase.co"
SUPABASE_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVzdWxqc3hmdmhoY3hkd25zaHByIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjI2MTc0MTEsImV4cCI6MjA3ODE5MzQxMX0.cXd-iJVVsWr1O-pZ3swdYD6Rv-cwZ5y12TxDoeIX7Hs"

# Create table using Supabase REST API
curl -X POST "${SUPABASE_URL}/rest/v1/rpc/exec_sql" \
  -H "apikey: ${SUPABASE_KEY}" \
  -H "Authorization: Bearer ${SUPABASE_KEY}" \
  -H "Content-Type: application/json" \
  -d '{"query": "CREATE TABLE IF NOT EXISTS daily_archives (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), archive_date DATE NOT NULL, patient_data JSONB NOT NULL, created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()); CREATE INDEX IF NOT EXISTS idx_archive_date ON daily_archives(archive_date);"}'
