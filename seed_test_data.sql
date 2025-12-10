-- إضافة بيانات تجريبية لاختبار My Statistics

-- إضافة مرضى تجريبيين مكتملين
INSERT INTO patients (id, queue_number, name, clinic, condition, treatment, status, archive_date, created_at)
VALUES 
  ('test-1', 100, 'مريض تجريبي 1', 'Clinic 1', 'Pain', 'Filling', 'complete', CURRENT_DATE, NOW() - INTERVAL '5 days'),
  ('test-2', 101, 'مريض تجريبي 2', 'Clinic 2', 'Broken Tooth', 'Extraction', 'complete', CURRENT_DATE, NOW() - INTERVAL '4 days'),
  ('test-3', 102, 'مريض تجريبي 3', 'Clinic 1', 'Checkup', 'Scaling', 'complete', CURRENT_DATE, NOW() - INTERVAL '3 days'),
  ('test-4', 103, 'مريض تجريبي 4', 'Clinic 3', 'Pain', 'Pulpectomy', 'complete', CURRENT_DATE, NOW() - INTERVAL '2 days'),
  ('test-5', 104, 'مريض تجريبي 5', 'Clinic 2', 'Pain', 'Filling', 'complete', CURRENT_DATE, NOW() - INTERVAL '1 day'),
  ('test-6', 105, 'مريض تجريبي 6', 'Clinic 1', 'Checkup', 'Scaling', 'complete', CURRENT_DATE, NOW())
ON CONFLICT (id) DO NOTHING;

-- إضافة timeline events مع اسم الطبيب
INSERT INTO timeline_events (patient_id, event_type, timestamp, doctor_name)
VALUES 
  ('test-1', 'completed', NOW() - INTERVAL '5 days', 'د. أحمد محمد'),
  ('test-2', 'completed', NOW() - INTERVAL '4 days', 'د. أحمد محمد'),
  ('test-3', 'completed', NOW() - INTERVAL '3 days', 'د. أحمد محمد'),
  ('test-4', 'completed', NOW() - INTERVAL '2 days', 'د. أحمد محمد'),
  ('test-5', 'completed', NOW() - INTERVAL '1 day', 'د. أحمد محمد'),
  ('test-6', 'completed', NOW(), 'د. أحمد محمد')
ON CONFLICT DO NOTHING;
