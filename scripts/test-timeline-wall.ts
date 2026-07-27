/**
 * اختبارُ حائطِ الشفت (البريك الثابت) في مخطّط الدور.
 *
 * البريكُ الثابتُ يقسمُ اليومَ إلى قطاعات، والعلاجُ يسعُ في قطاعٍ واحدٍ كاملًا:
 * لا يعبرُ التبديلَ، ولا يبدأُ داخلَه، ولا يُقَصُّ عندَه.
 * ويفرِّقُ بين حالتَي «لا يسعُه ما قبلَ التبديل» سؤالٌ واحد:
 *     هل كان لهذا المريضِ مكانٌ في شفتِه **حينَ سُجِّل**؟
 *   • نعم → مريضُ هذا الشفتِ وحدَه. إن أكلَ الوقتُ متّسعَه رحل (شارةُ «+N»)، ولا يُنقَلُ
 *     إلى شفتٍ ليس شفتَه — ولو مشى الخطُّ الزمنيُّ إلى آخرِ اليوم.
 *   • لا (سُجِّلَ والفجوةُ أضيقُ من علاجِه) → يُسجَّلُ بعدَ التبديلِ مباشرةً.
 * والاستثناءُ الوحيدُ الذي يجوزُ أن يمسَّ التبديل: مَن دخلَ العيادةَ فعلًا (واقعٌ لا تنبّؤ).
 *
 *   npx tsx scripts/test-timeline-wall.ts
 */
import { buildLanes, slotAvailable, shiftFit } from '../screens/MainQueue/queueLanes';
import type { Break } from '../screens/MainQueue/queueLanes';
import type { Patient } from '../screens/MainQueue/constants';

const hm = (m: number) => `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`;

let pass = 0, fail = 0;
const check = (ok: boolean, what: string, detail = '') => {
  if (ok) { pass++; console.log(`  ✓ ${what}`); }
  else { fail++; console.log(`  ✗ ${what}${detail ? `\n      ${detail}` : ''}`); }
};

// regAt: لحظةُ التسجيل (دقائقُ من منتصف الليل) — هي التي تفصلُ المنتظِرَ القديمَ عن التسجيلِ الجديد
const waiting = (n: number, minutes: number, regAt = 7 * 60, extra: Partial<Patient> = {}): Patient => ({
  id: `p${n}`, queue_number: n, name: `Patient ${n}`,
  clinic: 'Clinic', condition: 'Checkup', treatment: 'Filling',
  status: 'normal', expected_minutes: minutes,
  registered_at: new Date(2026, 0, 1, Math.floor(regAt / 60), regAt % 60),
  ...extra,
} as unknown as Patient);

const dump = (lanes: ReturnType<typeof buildLanes>['lanes']) => {
  for (const l of lanes) {
    const cells = l.blocks.map((b) =>
      `${b.kind === 'break' ? (b.fixed ? '▓FIXED' : '▒break') : b.p.name}[${hm(b.start)}→${hm(b.end)}]`);
    console.log(`      ${l.clinic}: ${cells.join('  ')}${l.beyond.length ? `   +${l.beyond.length}(${l.beyond.map((p) => p.name).join(',')})` : ''}`);
  }
};

// الحُرمةُ الواحدةُ التي يُقاسُ بها كلُّ شيء — للكروتِ المعلَّقةِ وحدَها
const PENDING = new Set(['fut', 'eld', 'na']);
const violations = (lanes: ReturnType<typeof buildLanes>['lanes'], w: Break) =>
  lanes.flatMap((l) => l.blocks.filter((b) =>
    PENDING.has(b.kind) && (
      (b.start < w.start && b.end > w.start) ||        // يعبرُ التبديل
      (b.start >= w.start && b.start < w.end)          // يبدأُ داخلَ التبديل
    )));

// ═══════════════════════════════════════════════════════════════
// ① الحالةُ التي رآها المستخدم على المحاكي: مريضان مسجَّلان صباحًا، والساعةُ تمشي لآخرِ اليوم
// ═══════════════════════════════════════════════════════════════
console.log('\n① مريضان سُجِّلا صباحًا، والمحاكي يمشي ٧:٠٠ → ٢١:٠٠ — لا يعبران أبدًا');
{
  const WALL: Break = { start: 13 * 60, end: 14 * 60 + 30, fixed: true };
  let firstBad: { now: number; txt: string } | null = null;
  for (let now = 7 * 60; now <= 21 * 60; now += 1) {
    const patients = [waiting(1, 30, 7 * 60), waiting(2, 40, 7 * 60)];
    const { lanes } = buildLanes(patients, now, ['Clinic 1'], [WALL]);
    const after = lanes[0].blocks.filter((b) => b.kind !== 'break' && b.start >= WALL.start);
    if (after.length) { firstBad = { now, txt: after.map((b) => `${b.p.name} ${hm(b.start)}→${hm(b.end)}`).join(', ') }; break; }
  }
  check(!firstBad, 'لا كرتَ واحدًا يمينَ التبديلِ في أيِّ دقيقةٍ من اليوم',
    firstBad ? `عند ${hm(firstBad.now)}: ${firstBad.txt}` : '');

  for (const now of [12 * 60, 12 * 60 + 50, 13 * 60 + 30, 16 * 60, 20 * 60]) {
    const { lanes } = buildLanes([waiting(1, 30, 7 * 60), waiting(2, 40, 7 * 60)], now, ['Clinic 1'], [WALL]);
    const after = lanes[0].blocks.filter((b) => b.kind !== 'break' && b.start >= WALL.start).length;
    const held = lanes[0].beyond.length;
    check(after === 0, `الساعة ${hm(now)}: يمينَ التبديل ${after} · الشارة ${held}`);
  }
  const { lanes: l16 } = buildLanes([waiting(1, 30, 7 * 60), waiting(2, 40, 7 * 60)], 16 * 60, ['Clinic 1'], [WALL]);
  dump(l16);
  check(l16[0].beyond.length === 2, 'وفي ١٦:٠٠ كلاهما في الشارة — رحلا ولم يُنقَلا', `وجدنا ${l16[0].beyond.length}`);
}

// ═══════════════════════════════════════════════════════════════
// ② والوجهُ الآخرُ للقاعدة: تسجيلٌ جديدٌ لا تسعُه الفجوةُ الباقية
// ═══════════════════════════════════════════════════════════════
console.log('\n② فجوةٌ ٣٠د لا تسعُ علاجًا ٤٠د لمريضٍ سُجِّلَ الآنَ → بعدَ التبديلِ مباشرة');
{
  const WALL: Break = { start: 13 * 60, end: 14 * 60 + 30, fixed: true };
  const now = 12 * 60;
  // الأوّلُ ١٢:٠٠ → ١٢:٣٠ فتبقى فجوةٌ ٣٠د؛ والثاني سُجِّلَ الآنَ ومدّتُه ٤٠
  const { lanes } = buildLanes([waiting(1, 30, 12 * 60), waiting(2, 40, 12 * 60)], now, ['Clinic 1'], [WALL]);
  dump(lanes);
  const b = lanes[0].blocks.find((x) => x.p.id === 'p2')!;
  check(b.start === 14 * 60 + 30, 'صاحبُ الأربعين → ١٤:٣٠', hm(b.start));
  check(lanes[0].beyond.length === 0, 'ولا شارةَ — له وقتٌ صريح');

  // والفجوةُ تبقى مفتوحةً لمن هو أقصر
  const { lanes: l2 } = buildLanes(
    [waiting(1, 30, 12 * 60), waiting(2, 40, 12 * 60), waiting(3, 20, 12 * 60)], now, ['Clinic 1'], [WALL]);
  dump(l2);
  const p3 = l2[0].blocks.find((x) => x.p.id === 'p3')!;
  check(p3.start === 12 * 60 + 30 && p3.end === 12 * 60 + 50, 'وصاحبُ العشرين يأخذُ الفجوةَ ١٢:٣٠ → ١٢:٥٠', `${hm(p3.start)}→${hm(p3.end)}`);
}

// ═══════════════════════════════════════════════════════════════
console.log('\n③ مَن سُجِّلَ بعدَ التبديلِ فهو مريضُ الشفتِ الجديد — يُوضَعُ في وقتِه');
{
  const WALL: Break = { start: 13 * 60, end: 14 * 60 + 30, fixed: true };
  const now = 15 * 60;
  const { lanes } = buildLanes([waiting(1, 30, 7 * 60), waiting(2, 30, 15 * 60)], now, ['Clinic 1'], [WALL]);
  dump(lanes);
  const p2 = lanes[0].blocks.find((x) => x.p.id === 'p2');
  check(p2 != null && p2.start === 15 * 60, 'المسجَّلُ ١٥:٠٠ يُوضَعُ ١٥:٠٠', p2 ? hm(p2.start) : 'غائب');
  check(lanes[0].blocks.find((x) => x.p.id === 'p1') == null && lanes[0].beyond.length === 1,
    'ومريضُ الصباحِ بقيَ في الشارة — لم يُنقَلْ إلى شفتٍ ليس شفتَه');
}

// ═══════════════════════════════════════════════════════════════
console.log('\n④ الموعدُ المحجوز، وزرُّ الحجزِ لا يعطي وقتًا داخلَ التبديل');
{
  const WALL: Break = { start: 13 * 60, end: 14 * 60 + 30, fixed: true };
  const now = 12 * 60;
  const { lanes } = buildLanes(
    [waiting(1, 30, 12 * 60), waiting(2, 20, 12 * 60, { appointment_min: 14 * 60 + 30 } as any)], now, ['Clinic 1'], [WALL]);
  dump(lanes);
  const b = lanes[0].blocks.find((x) => x.p.id === 'p2')!;
  check(b.start === 14 * 60 + 30 && b.end === 14 * 60 + 50, 'ينامُ على موعدِه ١٤:٣٠ → ١٤:٥٠', `${hm(b.start)}→${hm(b.end)}`);

  const { lanes: l2 } = buildLanes(
    [waiting(1, 20, 12 * 60, { appointment_min: 13 * 60 + 40 } as any)], now, ['Clinic 1'], [WALL]);
  const a = l2[0].blocks.find((x) => x.p.id === 'p1');
  check(a == null || a.start >= WALL.end, 'وموعدٌ ١٣:٤٠ داخلَ التبديل لا يُرسَمُ داخلَه', a ? hm(a.start) : 'شارة');

  check(!slotAvailable(13 * 60, 20, 1, lanes, [WALL]), 'وزرُّ الحجز: ١٣:٠٠ غيرُ متاح');
  check(!slotAvailable(12 * 60 + 40, 40, 1, lanes, [WALL]), '١٢:٤٠ لأربعين دقيقةً غيرُ متاح');
  check(slotAvailable(15 * 60, 20, 1, lanes, [WALL]), 'و١٥:٠٠ متاح');
}

// ═══════════════════════════════════════════════════════════════
console.log('\n⑤ الحُرمةُ من ٧:٠٠ إلى ٢١:٠٠ دقيقةً دقيقة — كلُّ نوعِ كرتٍ معلَّق');
{
  const WALL: Break = { start: 14 * 60, end: 14 * 60 + 30, fixed: true };
  const chairs = ['Clinic 1', 'Clinic 2'];
  const cast = () => [
    waiting(1, 30, 7 * 60), waiting(2, 45, 7 * 60), waiting(3, 20, 8 * 60),
    waiting(4, 30, 8 * 60, { status: 'na' } as any),                  // غيرُ متاح
    waiting(5, 55, 9 * 60, { status: 'na' } as any),
    waiting(6, 40, 9 * 60, { isElderly: true } as any),               // أولويّة
    waiting(7, 30, 10 * 60, { appointment_min: 14 * 60 + 15 } as any), // موعدٌ داخلَ التبديل
    waiting(8, 25, 10 * 60, { clinic: 'Clinic 2' } as any),           // عيادةٌ محدَّدة
  ];
  let firstBad: { now: number; txt: string } | null = null;
  let lost: number | null = null;
  for (let now = 7 * 60; now <= 21 * 60; now += 1) {
    const { lanes } = buildLanes(cast(), now, chairs, [WALL]);
    const bad = violations(lanes, WALL);
    if (bad.length && !firstBad) firstBad = { now, txt: bad.map((b) => `${b.p.name}(${b.kind}) ${hm(b.start)}→${hm(b.end)}`).join(', ') };
    const seen = new Set([
      ...lanes.flatMap((l) => l.blocks.filter((b) => b.kind !== 'break').map((b) => b.p.id)),
      ...lanes.flatMap((l) => l.beyond.map((p) => p.id)),
    ]);
    if (seen.size !== 8 && lost == null) lost = now;
    if (firstBad && lost != null) break;
  }
  check(!firstBad, 'لا عبورَ ولا وقوعَ داخلَ التبديلِ في أيِّ دقيقة',
    firstBad ? `عند ${hm(firstBad.now)}: ${firstBad.txt}` : '');
  check(lost == null, 'ولا يسقطُ مريضٌ من الحساب في أيِّ دقيقة', lost != null ? `عند ${hm(lost)}` : '');

  // ومَن سُجِّلَ قبلَ التبديلِ لا يُرسَمُ يمينَه مهما مضى الوقت.
  // (نستثني صاحبَ الموعدِ المحجوزِ داخلَ التبديل — حجزُه اختيارٌ صريحٌ لوقتٍ هناك، لا إزاحة.)
  let crossed: { now: number; txt: string } | null = null;
  for (let now = 7 * 60; now <= 21 * 60; now += 1) {
    const { lanes } = buildLanes(cast().filter((p) => p.appointment_min == null), now, chairs, [WALL]);
    const after = lanes.flatMap((l) => l.blocks.filter((b) => b.kind !== 'break' && b.start >= WALL.start));
    if (after.length) { crossed = { now, txt: after.map((b) => `${b.p.name} ${hm(b.start)}`).join(', ') }; break; }
  }
  check(!crossed, 'ولا كرتَ يمينَ التبديلِ — كلُّهم سُجِّلوا قبلَه',
    crossed ? `عند ${hm(crossed.now)}: ${crossed.txt}` : '');
}

// ═══════════════════════════════════════════════════════════════
console.log('\n⑥ الاستثناء: مَن دخلَ العيادةَ فعلًا يجوزُ أن ينتهيَ داخلَ التبديل');
{
  const WALL: Break = { start: 14 * 60, end: 14 * 60 + 30, fixed: true };
  const now = 13 * 60 + 50;
  const entered = waiting(1, 40, 13 * 60, { clinic_entry_at: new Date(2026, 0, 1, 13, 40) } as any);
  const { lanes } = buildLanes([entered], now, ['Clinic 1'], [WALL]);
  dump(lanes);
  const cur = lanes[0].blocks.find((b) => b.kind === 'cur' || b.kind === 'over')!;
  check(cur.end === 14 * 60 + 20, 'الجاري يمتدُّ إلى ١٤:٢٠ داخلَ التبديل — واقعٌ لا تنبّؤ', hm(cur.end));
}

// ═══════════════════════════════════════════════════════════════
console.log('\n⑦ تبديلانِ في اليوم');
{
  const W1: Break = { start: 11 * 60, end: 11 * 60 + 30, fixed: true };
  const W2: Break = { start: 14 * 60, end: 14 * 60 + 30, fixed: true };
  const now = 10 * 60;
  // كلُّهم سُجِّلوا ١٠:٠٠: الأوّلُ يسعُه ما قبلَ ١١:٠٠، والتسعونَ لا تسعُه فتُؤجَّل، والثلاثونَ تملأُ الفجوة
  const { lanes } = buildLanes(
    [waiting(1, 30, 10 * 60), waiting(2, 90, 10 * 60), waiting(3, 30, 10 * 60)], now, ['Clinic 1'], [W1, W2]);
  dump(lanes);
  check(violations(lanes, W1).length === 0, 'التبديلُ الأوّلُ سليم');
  check(violations(lanes, W2).length === 0, 'والثاني سليم');
  const p1 = lanes[0].blocks.find((b) => b.p.id === 'p1')!;
  const p2 = lanes[0].blocks.find((b) => b.p.id === 'p2')!;
  const p3 = lanes[0].blocks.find((b) => b.p.id === 'p3')!;
  check(p1.start === 10 * 60 && p1.end === 10 * 60 + 30, 'الأوّلُ ١٠:٠٠ → ١٠:٣٠', `${hm(p1.start)}→${hm(p1.end)}`);
  check(p2.start === 11 * 60 + 30, 'والتسعون لا تسعُ قبلَ ١١:٠٠ → تُؤجَّلُ إلى ١١:٣٠', hm(p2.start));
  check(p3.start === 10 * 60 + 30 && p3.end === 11 * 60, 'والثلاثونَ تملأُ فجوةَ ١٠:٣٠ → ١١:٠٠', `${hm(p3.start)}→${hm(p3.end)}`);
}

// ═══════════════════════════════════════════════════════════════
console.log('\n⑧ البريكُ المرنُ يُلتَفُّ حولَه (يُدفَعُ الكرتُ إلى ما بعدَه كاملًا)');
{
  const SOFT: Break = { start: 14 * 60, end: 14 * 60 + 30 };   // بلا fixed
  const now = 13 * 60 + 40;
  const { lanes } = buildLanes([waiting(1, 45, 13 * 60)], now, ['Clinic 1'], [SOFT]);
  dump(lanes);
  const card = lanes[0].blocks.find((b) => b.kind !== 'break')!;
  check(card.start >= SOFT.end && card.end - card.start === 45,
    'يقفزُ خلفَ المرنِ بمدّتِه كاملة', `${hm(card.start)}→${hm(card.end)}`);
}

// ═══════════════════════════════════════════════════════════════
console.log('\n⑨ الموعدُ ليس مسمارًا: مَن خلفَه يُزيحُه للأمام');
{
  const now = 13 * 60;
  const { lanes } = buildLanes([
    waiting(1, 60, 13 * 60),                                       // ١٣:٠٠ → ١٤:٠٠
    waiting(2, 30, 13 * 60, { appointment_min: 14 * 60 } as any),
    waiting(3, 30, 13 * 60),
  ], now, ['Clinic 1'], []);
  dump(lanes);
  const appt = lanes[0].blocks.find((b) => b.p.id === 'p2')!;
  check(appt.start >= 14 * 60, 'لا يبدأُ قبلَ موعدِه', hm(appt.start));

  const { lanes: l2 } = buildLanes([
    waiting(1, 90, 13 * 60),                                       // ١٣:٠٠ → ١٤:٣٠
    waiting(2, 30, 13 * 60, { appointment_min: 14 * 60 } as any),
  ], now, ['Clinic 1'], []);
  dump(l2);
  const appt2 = l2[0].blocks.find((b) => b.p.id === 'p2')!;
  check(appt2.start === 14 * 60 + 30, 'وينزاحُ إلى الأمامِ حينَ يتأخّرُ مَن قبلَه', hm(appt2.start));
}

// ═══════════════════════════════════════════════════════════════
console.log('\n⑩ تنبيهُ المدّة على الكرت (shiftFit): يقولُ الفجوةَ وساعةَ الدور');
{
  const WALL: Break = { start: 13 * 60, end: 14 * 60 + 30, fixed: true };
  const now = 12 * 60;
  // مريضٌ ٤٠د من ١٢:٠٠ → الكرسيُّ فارغٌ ١٢:٤٠، فالفجوةُ حتّى التبديلِ ٢٠ دقيقة
  const { lanes } = buildLanes([waiting(1, 40, 12 * 60)], now, ['Clinic 1'], [WALL]);
  dump(lanes);

  const a = shiftFit(40, lanes, [WALL], now, 'p2');
  check(!a.fits && a.gap === 20 && a.startsAt === 14 * 60 + 30,
    'أربعون دقيقةً: لا تسع · الفجوة ٢٠ · الدور ١٤:٣٠', `fits=${a.fits} gap=${a.gap} at=${a.startsAt != null ? hm(a.startsAt) : '—'}`);

  const b = shiftFit(20, lanes, [WALL], now, 'p2');
  check(b.fits && b.startsAt == null, 'وعشرون دقيقةً تسعُ تمامًا — لا تنبيه', `fits=${b.fits}`);

  const c = shiftFit(25, lanes, [WALL], now, 'p2');
  check(!c.fits, 'وخمسٌ وعشرون لا تسع — تنبيه');

  // ويستثني كتلةَ المريضِ نفسِه عندَ تعديلِ مدّتِه (وإلّا حسبَ نفسَه عائقًا لنفسِه)
  const self = shiftFit(40, lanes, [WALL], now, 'p1');
  check(self.fits && self.gap === 60, 'وصاحبُ الكرتِ نفسُه يُستثنى — الفجوةُ ٦٠', `gap=${self.gap}`);

  // بلا تبديلٍ ثابتٍ لا تنبيهَ أصلًا
  const none = shiftFit(200, lanes, [{ start: 13 * 60, end: 13 * 60 + 30 }], now, 'p2');
  check(none.fits && none.startsAt == null, 'والبريكُ المرنُ لا يُنبِّه — يُلتَفُّ حولَه لا يُوقِف');
}

// ═══════════════════════════════════════════════════════════════
console.log('\n⑪ حدُّ اليوم: المخطّطُ يومٌ تقويميٌّ كامل، ولا علاجَ يعبرُ إلى الغد');
{
  const { lanes, dayStart, dayEnd } = buildLanes([waiting(1, 30, 9 * 60)], 9 * 60, ['Clinic 1'], []);
  check(dayStart === 0 && dayEnd === 24 * 60, 'المحورُ ٠٠:٠٠ → ٢٤:٠٠ ثابتًا', `${hm(dayStart)} → ${hm(dayEnd)}`);
  check(lanes[0].blocks.length === 1, 'ويومٌ عاديٌّ يُرسَمُ كما هو');

  // ٢٣:٣٠ + ٣٠د = منتصفُ الليلِ تمامًا → يُرسَم
  const fitEnd = buildLanes([waiting(1, 30, 23 * 60 + 30)], 23 * 60 + 30, ['Clinic 1'], []).lanes[0];
  const e = fitEnd.blocks.find((b) => b.kind !== 'break');
  check(e != null && e.end === 24 * 60, 'وما ينتهي عندَ منتصفِ الليلِ تمامًا يُرسَم', e ? hm(e.end) : 'شارة');

  // ٢٣:٣٠ + ٦٠د → يعبرُ إلى الغد → لا يُرسَم، شارة
  const over = buildLanes([waiting(1, 60, 23 * 60 + 30)], 23 * 60 + 30, ['Clinic 1'], []).lanes[0];
  check(over.blocks.length === 0 && over.beyond.length === 1, 'وما يعبرُ منتصفَ الليلِ لا يُرسَمُ — شارة',
    `مرسوم ${over.blocks.length} · شارة ${over.beyond.length}`);

  // تبديلٌ ثابتٌ مسائيّ: مَن لا يسعُه ما قبلَه يُؤجَّلُ بعدَه ما دامَ اليومُ يسعُه
  const NIGHT: Break = { start: 22 * 60, end: 22 * 60 + 30, fixed: true };
  const late = buildLanes([waiting(1, 90, 21 * 60)], 21 * 60, ['Clinic 1'], [NIGHT]).lanes[0];
  dump([late]);
  const l1 = late.blocks.find((b) => b.kind !== 'break');
  check(l1 != null && l1.start === 22 * 60 + 30 && l1.end === 24 * 60, 'تسعونَ دقيقةً بعدَ تبديلِ ٢٢:٠٠ → ٢٢:٣٠ حتّى منتصفِ الليل',
    l1 ? `${hm(l1.start)}→${hm(l1.end)}` : 'شارة');

  const tooLate = buildLanes([waiting(1, 120, 21 * 60)], 21 * 60, ['Clinic 1'], [NIGHT]).lanes[0];
  check(tooLate.blocks.filter((b) => b.kind !== 'break').length === 0 && tooLate.beyond.length === 1,
    'ومئةٌ وعشرون لا يسعُها اليومُ بعدَ التبديل → شارة');
}

console.log(`\n${fail === 0 ? '✅' : '❌'}  ${pass} ناجح · ${fail} فاشل\n`);
process.exit(fail === 0 ? 0 : 1);
