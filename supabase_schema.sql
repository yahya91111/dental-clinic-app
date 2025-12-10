-- Create patients table
CREATE TABLE IF NOT EXISTS patients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  queue_number INTEGER NOT NULL UNIQUE,
  name VARCHAR(255) NOT NULL,
  clinic VARCHAR(100) NOT NULL DEFAULT 'Clinic',
  condition VARCHAR(100),
  treatment VARCHAR(100),
  status VARCHAR(20) NOT NULL DEFAULT 'normal' CHECK (status IN ('normal', 'elderly', 'na', 'complete')),
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create timeline_events table
CREATE TABLE IF NOT EXISTS timeline_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  event_type VARCHAR(50) NOT NULL CHECK (event_type IN ('registered', 'clinic_assigned', 'not_available', 'completed')),
  event_details VARCHAR(255),
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create index on patient_id for faster queries
CREATE INDEX IF NOT EXISTS idx_timeline_events_patient_id ON timeline_events(patient_id);

-- Create index on queue_number for faster lookups
CREATE INDEX IF NOT EXISTS idx_patients_queue_number ON patients(queue_number);

-- Create index on status for filtering
CREATE INDEX IF NOT EXISTS idx_patients_status ON patients(status);

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to automatically update updated_at
CREATE TRIGGER update_patients_updated_at
  BEFORE UPDATE ON patients
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
