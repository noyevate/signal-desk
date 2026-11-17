import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {analyze, parseCandles} from "../dist/engine.mjs";

function setup(tail) {
  const quiet = [100,101,99,100];
  const swing = [100,105,99,101];
  const breakout = [101,107,100,106];
  return [...Array(52).fill(quiet),swing,quiet,quiet,breakout,...tail].map(([o,h,l,c],i) => ({t:i*900,o,h,l,c,v:1}));
}
const retest = [105.4,106.8,104.6,106.4];
const open = [106.4,106.4,106.4,106.4];
const noTouch = [106,108,105.5,107];

test("both directions require a close through a confirmed pivot and a later rejection",()=>{
  const long = setup([retest,open]);
  const short = long.map(b=>({...b,o:200-b.o,h:200-b.l,l:200-b.h,c:200-b.c}));
  for(const [bars,side] of [[long,"Buy"],[short,"Sell"]]){
    const result=analyze(bars,15);
    const plan=result.plans[0];
    assert.equal(result.plans.length,1);
    assert.equal(result.signal,side);
    assert.equal(plan.pivotAt,bars[52].t);
    assert.equal(plan.breakAt,bars[55].t);
    assert.equal(plan.retestAt,bars[56].t);
    assert.equal(plan.entry,bars[57].o);
    assert.equal(plan.sl,side==="Buy"?bars[56].l:bars[56].h);
    assert.equal(plan.tp,plan.entry+2*(plan.entry-plan.sl));
    assert.equal(plan.status,"Open");
    const partial=bars.map((b,i)=>i===57?{...b,h:500,l:1,c:2}:b);
    assert.deepEqual(analyze(partial,15).plans,result.plans);
  }
});

test("breakout alone, tied swing highs, wrong candle direction and closes in wrong half produce no entry",()=>{
  const pending=analyze(setup([open]),15);
  assert.equal(pending.signal,"Wait"); assert.equal(pending.watch.remaining,6);
  for(const tail of [[106.5,106.8,104.6,106],[105.2,110,104.5,105.6],noTouch]){
    assert.equal(analyze(setup([tail,open]),15).plans.length,0);
  }
  const tied=setup([retest,open]);tied[51].h=105;
  assert.equal(analyze(tied,15).plans.length,0);
});

test("cancel on a close back at the level, expiry or a gap to the wrong side",()=>{
  for(const tail of [
    [[106,107,103,105],retest,open],
    [...Array(6).fill(noTouch),retest,open],
    [retest,[104.9,107,104,106]],
  ])assert.equal(analyze(setup(tail),15).plans.length,0);
  assert.equal(analyze(setup([...Array(5).fill(noTouch),retest,open]),15).plans.length,1);
});

test("one entry per breakout even after more touches",()=>{
  assert.equal(analyze(setup([retest,retest,retest,open]),15).plans.length,1);
});

test("continuation requires a pullback holding the broken level and a later candle close through its high",()=>{
  const pullback=[106.4,106.6,105.8,106.0];
  const confirm=[106.0,107.5,105.9,107.0];
  const next=[107.0,107.4,106.9,107.2];
  const long=setup([retest,pullback,confirm,next]);
  const short=long.map(b=>({...b,o:200-b.o,h:200-b.l,l:200-b.h,c:200-b.c}));
  for(const [bars,side] of [[long,"Buy"],[short,"Sell"]]){
    const r=analyze(bars,15);
    assert.equal(r.plans.length,2);
    assert.equal(r.plans[1].setupType,"Continuation");
    assert.equal(r.plans[1].side,side);
    assert.equal(r.plans[1].pullbackAt,bars[57].t);
    assert.equal(r.plans[1].confirmAt,bars[58].t);
    assert.equal(r.plans[1].t,bars[59].t);
    assert.equal(r.plans[1].sl,side==="Buy"?bars[57].l:bars[57].h);
    assert.equal(r.plans[1].tp1,r.plans[1].entry+(side==="Buy"?1:-1)*r.plans[1].risk);
    assert.equal(r.signal,side);
  }
  assert.equal(analyze(setup([retest,pullback,[106,107,105.9,106.5],next]),15).plans.length,1);
  assert.equal(analyze(setup([retest,[106.4,106.6,104.9,106.0],confirm,next]),15).plans.length,1);
  assert.equal(analyze(setup([retest,pullback,[106,108,104.9,107],next]),15).plans.length,1);
  assert.equal(analyze(setup([retest,pullback,[106,108,105.9,107],[104,107,103,106]]),15).plans.length,1);
});

test("weak breakout bodies and opposing completed higher timeframe trend are filtered",()=>{
  const weak=setup([retest,open]);
  weak[55]={...weak[55],o:104.9,h:109,l:99,c:105.1};
  assert.equal(analyze(weak,15).plans.length,0);
  const opposing=setup([retest,open]);
  for(let i=0;i<44;i++) opposing[i]={...opposing[i],o:120,h:121,l:119,c:120};
  assert.equal(analyze(opposing,15).plans.length,0);
});

test("historical signals match replay one candle at a time, independently of future data",()=>{
  for(const minutes of [15,60,240]){
    const rows=JSON.parse(readFileSync(new URL("../dist/data/"+minutes+".json",import.meta.url)));
    const bars=parseCandles(rows,minutes),full=analyze(bars,minutes);
    assert(full.plans.some(p=>p.side==="Buy"));assert(full.plans.some(p=>p.side==="Sell"));
    const seen=[];
    for(let i=90;i<=bars.length;i++){
      const replay=analyze(bars.slice(0,i),minutes);
      if(replay.signal!=="Wait")seen.push(replay.plans.at(-1).id);
    }
    assert.deepEqual(seen,full.plans.filter(p=>p.t>=bars[89].t).map(p=>p.id));
    const ema=analyze(bars,minutes,"crossover");
    assert(ema.plans.length>0 && ema.plans.every(p=>Number.isFinite(p.rsi)));
  }
});
