import {priceAction} from "./price-action.mjs?v=3";
const average = values => values.reduce((sum, v) => sum + v, 0) / values.length;
const barsPerDay = minutes => 1440 / minutes;
export function parseCandles(rows, minutes) {
  if (!Array.isArray(rows) || rows.length < Math.max(90, barsPerDay(minutes) + 1)) throw Error("Incomplete candle history");
  const parsed = rows.map(row => {
    if (!Array.isArray(row) || row.length < 7) throw Error("Unexpected candle data");
    const [t,o,h,l,c,,v] = row.map(Number);
    if (![t,o,h,l,c,v].every(Number.isFinite) || !Number.isSafeInteger(t) || t % (minutes*60) !== 0 || l <= 0 || v < 0 || l > Math.min(o,c) || h < Math.max(o,c)) throw Error("Invalid price data");
    return {t,o,h,l,c,v};
  });
  for(let i=1;i<parsed.length;i++) if(parsed[i].t - parsed[i-1].t !== minutes*60) throw Error("Candle history has a gap");
  return parsed;
}
function ema(values, n) {
  const result=Array(values.length).fill(null);
  result[n-1]=average(values.slice(0,n));
  for(let i=n;i<values.length;i++) result[i]=result[i-1]+(2/(n+1))*(values[i]-result[i-1]);
  return result;
}
function indicators(bars) {
  const closes=bars.map(b=>b.c), fast=ema(closes,9), slow=ema(closes,21);
  const gains=[], losses=[], ranges=[];
  let gain=0,loss=0,atr=0;
  return bars.map((b,i)=>{
    const delta=i?b.c-bars[i-1].c:0;
    const range=i?Math.max(b.h-b.l,Math.abs(b.h-bars[i-1].c),Math.abs(b.l-bars[i-1].c)):b.h-b.l;
    if(i>0 && i<=14){gains.push(Math.max(delta,0));losses.push(Math.max(-delta,0));ranges.push(range)}
    if(i===14){gain=average(gains);loss=average(losses);atr=average(ranges)}
    if(i>14){gain=(gain*13+Math.max(delta,0))/14;loss=(loss*13+Math.max(-delta,0))/14;atr=(atr*13+range)/14}
    const rsi=i<14?null:loss===0?(gain===0?50:100):100-100/(1+gain/loss);
    return {...b,fast:fast[i],slow:slow[i],rsi,atr};
  });
}
export function direction(prev, b) {
  if(!prev || prev.slow===null || !b.atr) return "Wait";
  if(prev.fast<=prev.slow && b.fast>b.slow && b.rsi>50) return "Buy";
  if(prev.fast>=prev.slow && b.fast<b.slow && b.rsi<50) return "Sell";
  return "Wait";
}
export function simulate(plan, bars) {
  // Only completed candles can settle a paper setup. Same-candle ambiguity uses the stop.
  for (const b of bars.slice(0,12)) {
    const up=plan.side==="Buy";
    const gapStop=up?b.o<=plan.sl:b.o>=plan.sl, gapTarget=up?b.o>=plan.tp:b.o<=plan.tp;
    const stop=up?b.l<=plan.sl:b.h>=plan.sl, target=up?b.h>=plan.tp:b.l<=plan.tp;
    if(gapStop || gapTarget || stop || target) {
      const stopped=gapStop || (!gapTarget && stop);
      return {status:stopped?"Stopped":"Target hit",exit:gapStop?b.o:stopped?plan.sl:plan.tp,ended:b.t+plan.minutes*60,
        both:!gapStop&&!gapTarget&&stop&&target};
    }
  }
  if(bars.length>=12)return {status:"Timed out",exit:bars[11].c,ended:bars[11].t+plan.minutes*60};
  return {status:"Open",exit:null,ended:null};
}
function crossover(all, minutes) {
  const bars=indicators(all.slice(0,-1)), plans=[];
  for(let i=63;i<bars.length;i++){
    const b=bars[i],side=direction(bars[i-1],b);
    if(side==="Wait")continue;
    const next=all[i+1], risk=1.5*b.atr, sign=side==="Buy"?1:-1;
    const plan={id:minutes+"-"+b.t,minutes,side,t:next.t,entry:next.o,sl:next.o-sign*risk,tp:next.o+sign*2*risk,risk,rsi:b.rsi};
    plans.push({...plan,...simulate(plan,bars.slice(i+1,i+13))});
  }
  return {bars,plans,signal:direction(bars.at(-2),bars.at(-1))};
}
export function analyze(all, minutes, strategy = "price-action") {
  const study = strategy === "crossover" ? crossover(all,minutes) : priceAction(all,minutes);
  const {bars} = study;
  if (strategy !== "crossover") {
    study.plans = study.plans.map(plan => {
      const first = (plan.t - bars[0].t) / (minutes * 60);
      return {...plan,...simulate(plan,bars.slice(first,first + 12))};
    });
  }
  const last=bars.at(-1), current=all.at(-1), day=bars.slice(-barsPerDay(minutes));
  return {...study,last,current,asof:current.t,
    stats:{change:(last.c-day[0].o)/day[0].o*100,high:Math.max(...day.map(b=>b.h)),low:Math.min(...day.map(b=>b.l)),volume:day.reduce((s,b)=>s+b.v,0)}};
}
export function isFresh(current,minutes,now=Date.now()/1000) {
  return current.t<=now && now<current.t+minutes*60;
}
