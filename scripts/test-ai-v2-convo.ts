// ═══════════════════════════════════════════════════════════════
// Test AI V2 — multi-turn conversation
// ═══════════════════════════════════════════════════════════════
// يحاكي محادثة كاملة بين TL والذكاء، خطوة بخطوة.
//
// Usage:
//   npx tsx --env-file=.env scripts/test-ai-v2-convo.ts
//
// يطبع كل رد من الذكاء + التكلفة + الوقت لكل جولة.
// ═══════════════════════════════════════════════════════════════

import { sendMessageV2, type V2Message, type V2User } from '../lib/ai_v2';

const fakeUser: V2User = {
  id: '00000000-0000-0000-0000-000000000001',
  name: 'يحيى',
  role: 'team_leader',
  clinicId: '10000000-0000-0000-0000-000000000001',
  clinicName: 'عيادة مشرف',
};

// الأسبوع المختبر (يجب أن يكون أحد): 2026-05-31
const CONTEXT_DATA =
  `Selected week start (Sunday): 2026-05-31\n` +
  `Clinic count: 2\n` +
  `Currently viewing: Daily Duty`;

// سيناريو المحادثة — كل سطر = رسالة TL
const USER_TURNS: string[] = [
  'ابنِ جدول للأسبوع الذي يبدأ 2026-05-31',
  'قروب A صباح كل الأيام (الأحد، الاثنين، الثلاثاء، الأربعاء، الخميس)',
  'البورد: scenarioKind=all_morning، includeInExRotation=false',
  'لا عطل رسمية، لا تفضيلات أطباء',
  'اعرض معاينة (dryRun) قبل الحفظ',
  'تمام، احفظ الآن',
];

function divider(label: string) {
  const line = '─'.repeat(70);
  console.log(`\n${line}\n${label}\n${line}`);
}

async function main() {
  const history: V2Message[] = [];
  let totalIn = 0;
  let totalOut = 0;
  let totalTime = 0;

  for (let i = 0; i < USER_TURNS.length; i++) {
    const userMsg = USER_TURNS[i]!;
    history.push({ role: 'user', content: userMsg });

    divider(`TURN ${i + 1} — USER`);
    console.log(userMsg);

    const start = Date.now();
    const result = await sendMessageV2({
      messages: history,
      user: fakeUser,
      clinicId: fakeUser.clinicId,
      contextData: CONTEXT_DATA,
    });
    const elapsed = Date.now() - start;
    totalTime += elapsed;

    divider(`TURN ${i + 1} — AI RESPONSE`);
    if (result.success) {
      console.log(result.message);
      history.push({ role: 'assistant', content: result.message });
    } else {
      console.log(`ERROR: ${result.error}`);
      break;
    }

    if (result.usage) {
      totalIn += result.usage.inputTokens;
      totalOut += result.usage.outputTokens;
      console.log(
        `\n[${(elapsed / 1000).toFixed(2)}s | in=${result.usage.inputTokens} out=${result.usage.outputTokens} | rounds=${result.usage.roundsUsed}]`,
      );
    }
  }

  divider('TOTAL METRICS');
  console.log(`Time:   ${(totalTime / 1000).toFixed(2)}s`);
  console.log(`Input:  ${totalIn} tokens`);
  console.log(`Output: ${totalOut} tokens`);
  const cost = (totalIn / 1_000_000) * 0.8 + (totalOut / 1_000_000) * 4;
  console.log(`Cost:   ~$${cost.toFixed(5)}`);
  console.log('');
}

main().catch((err) => {
  console.error('\nFatal:');
  console.error(err);
  process.exit(1);
});
