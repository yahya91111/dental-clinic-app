// ═══════════════════════════════════════════════════════════════
// Test AI V2 from terminal — no app needed
// ═══════════════════════════════════════════════════════════════
// Usage:
//   npx tsx --env-file=.env scripts/test-ai-v2.ts "ابنِ جدول الأسبوع"
//   npx tsx --env-file=.env scripts/test-ai-v2.ts "مرحبا"
//   npx tsx --env-file=.env scripts/test-ai-v2.ts
//
// What it does:
//   1. Loads EXPO_PUBLIC_ANTHROPIC_API_KEY from .env
//   2. Builds a fake Team Leader user
//   3. Sends your message to sendMessageV2
//   4. Prints the response + token usage
//
// Use this to validate the V2 prompt without touching the app.
// ═══════════════════════════════════════════════════════════════

import { sendMessageV2, type V2User } from '../lib/ai_v2';

const fakeUser: V2User = {
  id: '00000000-0000-0000-0000-000000000001',
  name: 'يحيى',
  role: 'team_leader',
  clinicId: '10000000-0000-0000-0000-000000000001',
  clinicName: 'عيادة مشرف',
};

function divider(label: string) {
  const line = '─'.repeat(60);
  console.log(`\n${line}\n${label}\n${line}`);
}

async function main() {
  const userMessage = process.argv.slice(2).join(' ').trim() || 'مرحبا';

  divider('USER MESSAGE');
  console.log(userMessage);

  divider('SYSTEM');
  console.log(`User: ${fakeUser.name} (${fakeUser.role})`);
  console.log(`Clinic: ${fakeUser.clinicName}`);
  console.log(`Model: claude-haiku-4-5`);

  divider('CALLING V2...');
  const startMs = Date.now();
  const result = await sendMessageV2({
    messages: [{ role: 'user', content: userMessage }],
    user: fakeUser,
    clinicId: fakeUser.clinicId,
  });
  const elapsedMs = Date.now() - startMs;

  divider('RESPONSE');
  if (result.success) {
    console.log(result.message);
  } else {
    console.log(`ERROR: ${result.error}`);
  }

  divider('METRICS');
  console.log(`Time:    ${(elapsedMs / 1000).toFixed(2)}s`);
  if (result.usage) {
    console.log(`Input:   ${result.usage.inputTokens} tokens`);
    console.log(`Output:  ${result.usage.outputTokens} tokens`);
    console.log(`Rounds:  ${result.usage.roundsUsed}`);

    // Rough cost estimate for Haiku 4.5 ($0.80 / $4 per MTok)
    const costInput = (result.usage.inputTokens / 1_000_000) * 0.8;
    const costOutput = (result.usage.outputTokens / 1_000_000) * 4;
    const costTotal = costInput + costOutput;
    console.log(`Cost:    ~$${costTotal.toFixed(5)} (input + output, no cache)`);
  }
  console.log('');
}

main().catch((err) => {
  console.error('\nFatal error:');
  console.error(err);
  process.exit(1);
});
