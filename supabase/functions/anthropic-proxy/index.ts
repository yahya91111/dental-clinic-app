// ═══════════════════════════════════════════════════════════════
// anthropic-proxy — Supabase Edge Function
// ═══════════════════════════════════════════════════════════════
// وسيطٌ رفيعٌ بين التطبيق و Anthropic: يستقبل جسمَ طلبِ /v1/messages كما
// هو، يحقنُ مفتاحَ الذكاء (سرّ الخادم ANTHROPIC_API_KEY) ويُمرّره، ثمّ
// يُعيدُ ردَّ Anthropic حرفيًّا. المفتاحُ لا يُشحَنُ أبدًا في التطبيق.
//
// النشر:  supabase functions deploy anthropic-proxy
// السرّ:  supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
// ═══════════════════════════════════════════════════════════════
const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';

const CORS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (obj: unknown, status: number) =>
  new Response(JSON.stringify(obj), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: { message: 'Method not allowed' } }, 405);

  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!apiKey) return json({ error: { message: 'Server missing ANTHROPIC_API_KEY secret.' } }, 500);

  // نمرّر جسمَ الطلبِ كما هو (model/system/tools/messages) بلا تعديل.
  const body = await req.text();

  const upstream = await fetch(ANTHROPIC_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-beta': 'extended-cache-ttl-2025-04-11',
    },
    body,
  });

  const text = await upstream.text();
  return new Response(text, { status: upstream.status, headers: { ...CORS, 'Content-Type': 'application/json' } });
});
