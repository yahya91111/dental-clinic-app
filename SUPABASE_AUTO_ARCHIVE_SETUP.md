# 🕛 Supabase Auto Archive - Setup Guide

## 📋 نظرة عامة

هذا الدليل يشرح كيفية إعداد **أرشفة تلقائية** في Supabase تعمل كل يوم الساعة 12:00 صباحاً بدون الحاجة لفتح التطبيق.

---

## ✨ الميزات

- ✅ **يعمل تلقائياً** - حتى لو جميع التطبيقات مغلقة
- ✅ **موثوق 100%** - يعمل على سيرفر Supabase
- ✅ **ينظف Timeline** - يحذف timeline_events تلقائياً
- ✅ **جدولة دقيقة** - كل يوم الساعة 12:00 صباحاً بالضبط
- ✅ **سجلات واضحة** - يمكن مراجعة Logs في Supabase

---

## 🔧 الخطوات

### 1️⃣ إنشاء Edge Function

**أ) افتح Supabase Dashboard:**
```
https://supabase.com/dashboard/project/YOUR_PROJECT_ID
```

**ب) اذهب إلى:**
```
Edge Functions → Create a new function
```

**ج) اسم الـ Function:**
```
auto-archive-patients
```

**د) الكود:**

```typescript
// supabase/functions/auto-archive-patients/index.ts

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Create Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseKey)

    const today = new Date().toISOString().split('T')[0] // YYYY-MM-DD
    
    console.log('[AutoArchive] Starting automatic archive for date:', today)

    // Step 1: Get all unarchived patients
    const { data: unarchivedPatients, error: fetchError } = await supabase
      .from('patients')
      .select('id')
      .is('archive_date', null)

    if (fetchError) {
      throw new Error(`Failed to fetch patients: ${fetchError.message}`)
    }

    if (!unarchivedPatients || unarchivedPatients.length === 0) {
      console.log('[AutoArchive] No patients to archive')
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: 'No patients to archive',
          archived_count: 0 
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200 
        }
      )
    }

    const patientIds = unarchivedPatients.map(p => p.id)
    console.log(`[AutoArchive] Found ${patientIds.length} patients to archive`)

    // Step 2: Archive patients
    const { error: archiveError } = await supabase
      .from('patients')
      .update({ 
        archive_date: today,
        status: 'complete'
      })
      .in('id', patientIds)

    if (archiveError) {
      throw new Error(`Failed to archive patients: ${archiveError.message}`)
    }

    console.log('[AutoArchive] Successfully archived patients')

    // Step 3: Clean up timeline events
    const { error: timelineError } = await supabase
      .from('timeline_events')
      .delete()
      .in('patient_id', patientIds)

    if (timelineError) {
      console.error('[AutoArchive] Error cleaning timeline:', timelineError.message)
      // Don't fail the whole operation
    } else {
      console.log('[AutoArchive] Successfully cleaned timeline')
    }

    // Success response
    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Archive completed successfully',
        archived_count: patientIds.length,
        date: today
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    )

  } catch (error) {
    console.error('[AutoArchive] Error:', error)
    
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error.message 
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500 
      }
    )
  }
})
```

---

### 2️⃣ Deploy الـ Function

**في Terminal:**

```bash
# 1. تسجيل الدخول
supabase login

# 2. Link المشروع
supabase link --project-ref YOUR_PROJECT_ID

# 3. Deploy الـ Function
supabase functions deploy auto-archive-patients
```

**أو من Dashboard:**
- اضغط "Deploy" بعد كتابة الكود

---

### 3️⃣ إعداد Cron Job

**أ) اذهب إلى:**
```
Database → Extensions → pg_cron (Enable)
```

**ب) افتح SQL Editor وشغل:**

```sql
-- Enable pg_cron extension
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Grant permissions
GRANT USAGE ON SCHEMA cron TO postgres;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA cron TO postgres;

-- Schedule daily archive at midnight (Kuwait time = UTC+3)
-- Midnight Kuwait = 21:00 UTC (previous day)
SELECT cron.schedule(
  'auto-archive-patients-daily',           -- Job name
  '0 21 * * *',                            -- Cron expression (9 PM UTC = 12 AM Kuwait)
  $$
  SELECT
    net.http_post(
      url:='https://YOUR_PROJECT_ID.supabase.co/functions/v1/auto-archive-patients',
      headers:='{"Content-Type": "application/json", "Authorization": "Bearer YOUR_SERVICE_ROLE_KEY"}'::jsonb,
      body:='{}'::jsonb
    ) as request_id;
  $$
);
```

**⚠️ ملاحظات مهمة:**

1. **استبدل `YOUR_PROJECT_ID`** بـ Project ID الخاص بك
2. **استبدل `YOUR_SERVICE_ROLE_KEY`** بـ Service Role Key (من Settings → API)
3. **التوقيت:** `0 21 * * *` = 9 PM UTC = 12 AM Kuwait (UTC+3)

---

### 4️⃣ التحقق من الـ Cron Job

```sql
-- عرض جميع الـ Cron Jobs
SELECT * FROM cron.job;

-- عرض سجل التنفيذ
SELECT * FROM cron.job_run_details 
ORDER BY start_time DESC 
LIMIT 10;
```

---

### 5️⃣ اختبار الـ Function يدوياً

**من Terminal:**

```bash
curl -X POST \
  'https://YOUR_PROJECT_ID.supabase.co/functions/v1/auto-archive-patients' \
  -H 'Authorization: Bearer YOUR_SERVICE_ROLE_KEY' \
  -H 'Content-Type: application/json'
```

**أو من Dashboard:**
- Edge Functions → auto-archive-patients → Invoke

---

## 🔍 مراقبة السجلات

**في Supabase Dashboard:**

```
Edge Functions → auto-archive-patients → Logs
```

**أو SQL:**

```sql
-- عرض آخر 10 تنفيذات
SELECT 
  jobid,
  runid,
  job_name,
  status,
  start_time,
  end_time,
  return_message
FROM cron.job_run_details 
WHERE job_name = 'auto-archive-patients-daily'
ORDER BY start_time DESC 
LIMIT 10;
```

---

## 🛠️ إدارة الـ Cron Job

### إيقاف الـ Job:

```sql
SELECT cron.unschedule('auto-archive-patients-daily');
```

### تعديل التوقيت:

```sql
-- حذف القديم
SELECT cron.unschedule('auto-archive-patients-daily');

-- إضافة جديد بتوقيت مختلف
SELECT cron.schedule(
  'auto-archive-patients-daily',
  '0 22 * * *',  -- 10 PM UTC = 1 AM Kuwait
  $$ ... $$
);
```

### عرض جميع الـ Jobs:

```sql
SELECT * FROM cron.job;
```

---

## 📊 Cron Expression Reference

```
┌───────────── minute (0 - 59)
│ ┌───────────── hour (0 - 23)
│ │ ┌───────────── day of month (1 - 31)
│ │ │ ┌───────────── month (1 - 12)
│ │ │ │ ┌───────────── day of week (0 - 6) (Sunday to Saturday)
│ │ │ │ │
│ │ │ │ │
* * * * *
```

**أمثلة:**

- `0 21 * * *` - كل يوم الساعة 9 PM UTC (12 AM Kuwait)
- `0 0 * * *` - كل يوم الساعة 12 AM UTC (3 AM Kuwait)
- `0 */6 * * *` - كل 6 ساعات
- `0 0 * * 0` - كل أحد الساعة 12 AM UTC

---

## ✅ الفوائد مقارنة بالحل السابق

| الميزة | التطبيق (setInterval) | Supabase Edge Function |
|--------|----------------------|----------------------|
| يعمل والتطبيق مغلق | ❌ لا | ✅ نعم |
| موثوقية | ⚠️ متوسطة | ✅ عالية جداً |
| استهلاك البطارية | ⚠️ متوسط | ✅ صفر |
| سهولة المراقبة | ❌ صعب | ✅ سهل (Logs) |
| دقة التوقيت | ⚠️ ±1 دقيقة | ✅ دقيق جداً |
| يعمل على iOS/Android | ⚠️ محدود | ✅ يعمل دائماً |

---

## 🎯 الخلاصة

بعد إعداد هذا الحل:

✅ **الأرشفة تعمل تلقائياً** كل يوم الساعة 12:00 صباحاً
✅ **لا يحتاج التطبيق أن يكون مفتوحاً**
✅ **ينظف Timeline تلقائياً**
✅ **موثوق 100%** - يعمل على سيرفر Supabase
✅ **يمكن مراقبته** من Dashboard

---

## 📞 الدعم

إذا واجهت أي مشكلة:
1. تحقق من Logs في Edge Functions
2. تحقق من `cron.job_run_details`
3. تأكد من Service Role Key صحيح
4. تأكد من التوقيت صحيح (UTC vs Kuwait time)

---

**🎉 الآن لديك أرشفة تلقائية احترافية!**
