/* C2 — القلب الموحَّد: rebalanceForward صار يستعمل الحلّال الجديد داخليًّا. نتحقّق:
 * (أ) العلمان مطفأان → rebalanceForward يعمل كالقديم تمامًا، جدولٌ صالح، لا انهيار.
 * (ب) علم التطبيق مُشغَّل → التمريرة الجديدة تعمل **داخل** rebalanceForward، جدولٌ صالح.
 * (ج) لا انهيار في الحالتين. */
import { loadScheduleData, schedule } from '../lib/algorithms/schedule';
import type { WeekDay, Shift, TraineeMode } from '../lib/algorithms/schedule';
import { extractHeavySeats, lastHeavyStamps, solveLookahead } from '../lib/algorithms/solver';
const CID='10000000-0000-0000-0000-000000000001'; const WEEKS=['2099-01-04','2099-01-11'];
const DAYS:WeekDay[]=['sunday','monday','tuesday','wednesday','thursday'];
const DI:Record<string,number>={sunday:0,monday:1,tuesday:2,wednesday:3,thursday:4};
let pass=0,fail=0; const fails:string[]=[];
const check=(n:string,c:boolean,d='')=>{ if(c){pass++;console.log('  ✓ '+n);}else{fail++;fails.push(`${n} — ${d}`);console.log('  ✗ '+n+' — '+d);} };

async function buildAll(){
  const pre=await loadScheduleData(CID,WEEKS[0]!);
  const tm:Record<string,TraineeMode>={}; for(const t of pre.data!.doctors.filter(d=>d.workStatus==='trainee'))tm[t.id]='beginner';
  const aShiftPlan=Object.fromEntries(DAYS.map(d=>[d,'morning' as Shift])) as Record<WeekDay,Shift>;
  for(const w of WEEKS){ const recipe={weekStart:w,clinicId:CID,aShiftPlan,boardConfig:{scenario:{kind:'all_morning' as const},includeInExRotation:false},traineeModes:tm};
    await schedule.build({...recipe,dryRun:false}); await schedule.saveBuildConfig({...recipe,dryRun:true} as any); }
}
async function valid(w:string){
  const data=(await loadScheduleData(CID,w)).data!;
  let dbl=false;
  for(const day of DAYS) for(const h of [[1,2],[3,4]]){ const seen=new Set<string>();
    for(const s of data.existingSlots.filter(s=>DI[s.dayOfWeek]===DI[day]&&h.includes(s.period)&&s.status==='active'&&(s.role==='clinic'||s.role==='delegator'))){
      const k=`${s.doctorId}|${s.period}`; if(seen.has(k))dbl=true; seen.add(k); } }
  return !dbl;
}
(async()=>{
  await buildAll();
  delete process.env.NEW_HEART_APPLY; delete process.env.NEW_HEART_SHADOW;
  // (أ) العلمان مطفأان.
  let threw=false; try{ await schedule.rebalanceForward({clinicId:CID,weekStart:WEEKS[0]!,fromDay:'sunday',fromShift:'morning'}); }catch{ threw=true; }
  check('(أ) مطفأ: rebalanceForward لا ينهار', !threw);
  check('(أ) مطفأ: الجدول صالح', await valid(WEEKS[0]!));

  // (ب) علم التطبيق مُشغَّل → التمريرة الجديدة داخل rebalanceForward.
  process.env.NEW_HEART_APPLY='1';
  const logs:string[]=[]; const orig=console.log; console.log=(...a:any)=>{logs.push(a.join(' '));};
  let threw2=false; try{ await schedule.rebalanceForward({clinicId:CID,weekStart:WEEKS[0]!,fromDay:'sunday',fromShift:'morning'}); }catch{ threw2=true; }
  console.log=orig;
  check('(ب) مُشغَّل: rebalanceForward لا ينهار', !threw2);
  check('(ب) مُشغَّل: التمريرة الجديدة عملت داخله', logs.some(l=>l.includes('NEW-HEART APPLY')), logs.join('|').slice(0,80));
  check('(ب) مُشغَّل: الجدول صالح', await valid(WEEKS[0]!));
  console.log('     سجلّ القلب الجديد:', logs.filter(l=>l.includes('NEW-HEART')).join(' | ')||'(لا شيء)');

  delete process.env.NEW_HEART_APPLY;
  console.log(`\n${pass} PASS / ${fail} FAIL`); if(fails.length)fails.forEach(f=>console.log('  • '+f));
  process.exit(fail?1:0);
})().catch(e=>{console.error('ERR',e.message,e.stack);process.exit(1);});
