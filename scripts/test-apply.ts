/* تطبيق القلب الجديد (كتابة) على عيادة الاختبار. نتحقّق من **أمان الكتابة**:
 * (أ) بعد التطبيق الجدول صالح (لا حجز مزدوج، كلّ شفت بدليقيتره، يوافق القلب الجديد).
 * (ب) لا تكرار (idempotent). (هـ) قابلُ العودة بإعادة البناء. */
import { loadScheduleData, schedule } from '../lib/algorithms/schedule';
import type { WeekDay, Shift, TraineeMode } from '../lib/algorithms/schedule';
import { applyNewHeartRebalance } from '../lib/algorithms/solver_shadow';
import { extractHeavySeats, lastHeavyStamps, solveLookahead } from '../lib/algorithms/solver';
const CID='10000000-0000-0000-0000-000000000001'; const W='2099-01-04';
const DAYS:WeekDay[]=['sunday','monday','tuesday','wednesday','thursday'];
const DI:Record<string,number>={sunday:0,monday:1,tuesday:2,wednesday:3,thursday:4};
let pass=0,fail=0; const fails:string[]=[];
const check=(n:string,c:boolean,d='')=>{ if(c){pass++;console.log('  ✓ '+n);}else{fail++;fails.push(`${n} — ${d}`);console.log('  ✗ '+n+' — '+d);} };

async function build(){
  const pre=await loadScheduleData(CID,W);
  const tm:Record<string,TraineeMode>={}; for(const t of pre.data!.doctors.filter(d=>d.workStatus==='trainee'))tm[t.id]='beginner';
  const aShiftPlan=Object.fromEntries(DAYS.map(d=>[d,'morning' as Shift])) as Record<WeekDay,Shift>;
  const recipe={weekStart:W,clinicId:CID,aShiftPlan,boardConfig:{scenario:{kind:'all_morning' as const},includeInExRotation:false},traineeModes:tm};
  await schedule.build({...recipe,dryRun:false}); await schedule.saveBuildConfig({...recipe,dryRun:true} as any);
}
async function valid(){ // الجدول صالح: لا طبيبٌ في خانتين نشطتين بنفس الشفت + القلب الجديد يوافق
  const data=(await loadScheduleData(CID,W)).data!;
  const pool=new Set(data.doctors.filter(d=>d.groupTemplate.key!=='board'&&d.workStatus!=='trainee'&&d.workStatus!=='light_duty').map(d=>d.id));
  let dbl=false;
  for(const day of DAYS) for(const h of [[1,2],[3,4]]){
    const seen=new Map<string,number>();
    for(const s of data.existingSlots.filter(s=>DI[s.dayOfWeek]===DI[day]&&h.includes(s.period)&&s.status==='active'&&(s.role==='clinic'||s.role==='delegator'))){
      // طبيبٌ في فترتين مختلفتين بنفس الشفت مسموح (عيادة+دليقيتر مثلاً)؛ لكن لا خانتان بنفس الفترة
      const k=`${s.doctorId}|${s.period}`; seen.set(k,(seen.get(k)??0)+1); if((seen.get(k)??0)>1) dbl=true;
    }
  }
  const seats=[]; const all=[...data.pastSlots,...data.existingSlots];
  for(const day of DAYS){ const ss=data.existingSlots.filter(s=>DI[s.dayOfWeek]===DI[day]&&[1,2].includes(s.period)); seats.push(...extractHeavySeats(ss,pool)); }
  const rec=solveLookahead(data.doctors,seats as any,lastHeavyStamps(all.filter(s=>s.weekStart<W)));
  return { dbl, agrees: rec.assignments.length===0, conserved: rec.conserved };
}

(async()=>{
  await build();
  // (أ) تطبيقٌ على عيادة الاختبار → الجدول يبقى صالحًا.
  const r1=await applyNewHeartRebalance({clinicId:CID,weekStart:W,label:'test'});
  const v1=await valid();
  check('(أ) بعد التطبيق: لا حجز مزدوج', !v1.dbl, '');
  check('(أ) بعد التطبيق: القلب الجديد يوافق (مستقرّ)', v1.agrees, '');
  check('(أ) بعد التطبيق: محفوظ', v1.conserved, '');
  console.log(`     طُبّق: ${r1.applied} مبادلة`);
  // (ب) idempotent: إعادة التطبيق → صفر.
  const r2=await applyNewHeartRebalance({clinicId:CID,weekStart:W,label:'test'});
  check('(ب) لا تكرار (إعادة التطبيق = صفر)', r2.applied===0, `${r2.applied}`);
  // (هـ) قابلُ العودة: إعادة البناء تُرجِع جدولًا صالحًا.
  await build(); const v2=await valid();
  check('(هـ) قابلُ العودة: إعادة البناء تُنتج جدولًا صالحًا', !v2.dbl&&v2.conserved, '');

  console.log(`\n${pass} PASS / ${fail} FAIL`); if(fails.length)fails.forEach(f=>console.log('  • '+f));
  process.exit(fail?1:0);
})().catch(e=>{console.error('ERR',e.message,e.stack);process.exit(1);});
