/* تحقّق من مُسجِّل الظلّ: يعمل خلف العلم، صامتٌ بدونه، لا يرمي أبدًا، لا يكتب. */
import { loadScheduleData, schedule } from '../lib/algorithms/schedule';
import type { WeekDay, Shift, TraineeMode } from '../lib/algorithms/schedule';
import { shadowRebalanceLog } from '../lib/algorithms/solver_shadow';
const CID='10000000-0000-0000-0000-000000000001'; const W='2099-01-04';
const DAYS:WeekDay[]=['sunday','monday','tuesday','wednesday','thursday'];
let pass=0,fail=0;
const check=(n:string,c:boolean)=>{ if(c){pass++;console.log('  ✓ '+n);}else{fail++;console.log('  ✗ '+n);} };
(async()=>{
  const pre=await loadScheduleData(CID,W);
  const tm:Record<string,TraineeMode>={}; for(const t of pre.data!.doctors.filter(d=>d.workStatus==='trainee'))tm[t.id]='beginner';
  const aShiftPlan=Object.fromEntries(DAYS.map(d=>[d,'morning' as Shift])) as Record<WeekDay,Shift>;
  await schedule.build({weekStart:W,clinicId:CID,aShiftPlan,boardConfig:{scenario:{kind:'all_morning' as const},includeInExRotation:false},traineeModes:tm,dryRun:false});
  await schedule.saveBuildConfig({weekStart:W,clinicId:CID,aShiftPlan,boardConfig:{scenario:{kind:'all_morning' as const},includeInExRotation:false},traineeModes:tm,dryRun:true} as any);

  // العلم مطفأ → صامت، لا يرمي.
  let threw=false; const logs:string[]=[]; const orig=console.log; console.log=(...a:any)=>logs.push(a.join(' '));
  try { await shadowRebalanceLog({clinicId:CID,weekStart:W,label:'test'}); } catch { threw=true; }
  console.log=orig;
  check('مطفأ: صامت (لا سجلّ)', logs.length===0);
  check('مطفأ: لا يرمي', !threw);

  // العلم مُشغَّل → يُسجّل، لا يرمي.
  process.env.NEW_HEART_SHADOW='1';
  const logs2:string[]=[]; console.log=(...a:any)=>logs2.push(a.join(' '));
  let threw2=false; try { await shadowRebalanceLog({clinicId:CID,weekStart:W,label:'استئذان'}); } catch { threw2=true; }
  console.log=orig;
  check('مُشغَّل: يُسجّل سطرًا', logs2.some(l=>l.includes('NEW-HEART SHADOW')));
  check('مُشغَّل: لا يرمي', !threw2);
  console.log('  السجلّ:', logs2.join(' | '));

  // عيادة غير الاختبار → صامت حتى مع العلم (أمان).
  const logs3:string[]=[]; console.log=(...a:any)=>logs3.push(a.join(' '));
  await shadowRebalanceLog({clinicId:'99999999-0000-0000-0000-000000000099',weekStart:W,label:'x'});
  console.log=orig;
  check('عيادةٌ أخرى: صامت (أمان)', logs3.length===0);

  console.log(`\n${pass} PASS / ${fail} FAIL`);
  process.exit(fail?1:0);
})().catch(e=>{console.error(e);process.exit(1);});
