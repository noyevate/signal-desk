const SWING_MAX_AGE = 40;
const RETEST_WINDOW = 6;
const CONTINUATION_WINDOW = 8;
const WARMUP_BARS = SWING_MAX_AGE + RETEST_WINDOW + 2;

function confirmedSwing(bars, index, field) {
  const pivot = bars[index - 2];
  const others = [bars[index - 4], bars[index - 3], bars[index - 1], bars[index]];
  const isExtreme = others.every(bar => field === "h" ? pivot.h > bar.h : pivot.l < bar.l);
  return isExtreme ? {level:pivot[field], pivotAt:pivot.t, index:index - 2, broken:false} : null;
}

function breaksLevel(swing, previousClose, close, index, side) {
  if (!swing || swing.broken || index - swing.index > SWING_MAX_AGE) return false;
  return side === "Buy"
    ? previousClose <= swing.level && close > swing.level
    : previousClose >= swing.level && close < swing.level;
}

// Use only fully closed groups of smaller candles for the broader trend.
// 15m -> 1h, 1h -> 4h, 4h -> 1d.
function higherTrend(bars, index, minutes, side) {
  const group=minutes===240?6:4, completed=[], higherSeconds=group*minutes*60;
  for (let j=0;j<=index;j++) {
    if ((bars[j].t+minutes*60)%higherSeconds===0) completed.push(bars[j].c);
  }
  if (completed.length<9) return false;
  const latest=completed.at(-1);
  const mean=completed.slice(-9).reduce((sum,v)=>sum+v,0)/9;
  return side==="Buy"?latest>mean:latest<mean;
}

function strongClose(bar, side) {
  const range=bar.h-bar.l;
  if (!range || Math.abs(bar.c-bar.o)<range*.25) return false;
  return side==="Buy"
    ? bar.c>bar.o && bar.c>=(bar.h+bar.l)/2
    : bar.c<bar.o && bar.c<=(bar.h+bar.l)/2;
}

function buildPlan(watch, retest, next, minutes) {
  const long = watch.side === "Buy";
  const sl = long ? retest.l : retest.h;
  const entry = next.o;
  const risk = Math.abs(entry - sl);
  const tp = entry + (long ? 2 : -2) * risk;
  if (!risk || tp <= 0 || (long ? entry <= watch.level : entry >= watch.level)) return null;
  return {
    id:"pa1-" + minutes + "-" + retest.t, strategy:"price-action", minutes,
    setupType:"Break and retest", side:watch.side, t:next.t, entry, sl, risk, tp,
    tp1:entry + (long ? 1 : -1) * risk, level:watch.level,
    pivotAt:watch.pivotAt, breakAt:watch.breakAt, retestAt:retest.t,
  };
}

function continuationPlan(watch, bar, next, minutes) {
  const long=watch.side==="Buy", entry=next.o;
  const sl=long?watch.pullback.l:watch.pullback.h;
  const risk=Math.abs(entry-sl);
  if (!risk || (long ? entry<=watch.level || entry<=sl : entry>=watch.level || entry>=sl)) return null;
  return {
    id:"pa2-"+minutes+"-"+bar.t, strategy:"price-action", setupType:"Continuation", minutes,
    side:watch.side,t:next.t,entry,sl,risk,tp:entry+(long?2:-2)*risk,
    tp1:entry+(long?1:-1)*risk,level:watch.level,pivotAt:watch.pivotAt,
    breakAt:watch.breakAt,retestAt:watch.retestAt,pullbackAt:watch.pullback.t,confirmAt:bar.t,
  };
}

// Each pivot becomes knowable only after its second right-hand candle closes.
export function priceAction(all, minutes) {
  const bars = all.slice(0,-1);
  const plans = [];
  let high = null, low = null, watch = null, continuation = null;
  for (let i = 4; i < bars.length; i++) {
    const bar = bars[i], previous = bars[i-1], next = all[i+1];
    high = confirmedSwing(bars,i,"h") || high;
    low = confirmedSwing(bars,i,"l") || low;
    const breaksHigh = breaksLevel(high,previous.c,bar.c,i,"Buy") && strongClose(bar,"Buy");
    const breaksLow = breaksLevel(low,previous.c,bar.c,i,"Sell") && strongClose(bar,"Sell");
    if (breaksHigh) high.broken = true;
    if (breaksLow) low.broken = true;
    if (continuation) {
      const age=i-continuation.index, long=continuation.side==="Buy";
      if (age>CONTINUATION_WINDOW || (long?bar.c<=continuation.level:bar.c>=continuation.level)) {
        continuation=null;
      } else if (continuation.pullback) {
        const pullback=continuation.pullback;
        if (i-pullback.index>4 || (long?bar.l<=continuation.level:bar.h>=continuation.level)) {
          continuation=null;
        } else {
          const confirmed=(long?bar.c>pullback.h:bar.c<pullback.l)
            && strongClose(bar,continuation.side)
            && higherTrend(bars,i,minutes,continuation.side);
          if (confirmed) {
            const plan=continuationPlan(continuation,bar,next,minutes);
            if (plan && i>=WARMUP_BARS) plans.push(plan);
            continuation=null;
          }
        }
      } else if (age>0 && (long?bar.c<bar.o && bar.l>continuation.level:bar.c>bar.o && bar.h<continuation.level)) {
        continuation.pullback={...bar,index:i};
      }
    }
    let confirmed = false;
    if (watch) {
      const age = i - watch.index;
      const long = watch.side === "Buy";
      const held = long ? bar.c > watch.level : bar.c < watch.level;
      if (age > RETEST_WINDOW || !held) {
        watch = null;
      } else {
        const midpoint = (bar.h + bar.l) / 2;
        const rejection = long
          ? bar.l <= watch.level && bar.c > bar.o && bar.c >= midpoint
          : bar.h >= watch.level && bar.c < bar.o && bar.c <= midpoint;
        if (rejection) {
          const plan = buildPlan(watch,bar,next,minutes);
          if (plan && i >= WARMUP_BARS && higherTrend(bars,i,minutes,plan.side)) {
            plans.push(plan);
            continuation={side:plan.side,level:plan.level,pivotAt:plan.pivotAt,
              breakAt:plan.breakAt,retestAt:plan.retestAt,index:i,pullback:null};
          }
          confirmed = true;
          watch = null;
        } else if (age === RETEST_WINDOW) {
          watch = null;
        }
      }
    }
    if (!watch && !confirmed && (breaksHigh || breaksLow)) {
      const swing = breaksHigh ? high : low;
      watch = {side:breaksHigh ? "Buy" : "Sell",level:swing.level,pivotAt:swing.pivotAt,breakAt:bar.t,index:i};
    }
  }
  const current = all.at(-1);
  const signal = plans.at(-1)?.t === current.t ? plans.at(-1).side : "Wait";
  const pending = watch && {...watch, remaining:RETEST_WINDOW - (bars.length-1-watch.index)};
  const continuationPending=continuation && {...continuation,
    remaining:continuation.pullback?4-(bars.length-1-continuation.pullback.index):CONTINUATION_WINDOW-(bars.length-1-continuation.index)};
  const eligible = swing => swing && !swing.broken && bars.length - 1 - swing.index <= SWING_MAX_AGE ? swing : null;
  return {bars, plans, signal, watch:pending, continuation:continuationPending,
    swings:{high:eligible(high),low:eligible(low)}};
}
