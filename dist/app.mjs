import {parseCandles,analyze,isFresh,simulate} from "./engine.mjs?v=3";
import {mountChart} from "./chart.mjs?v=2";
const byId=id=>document.getElementById(id);
const paths={
 grid:'<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
 book:'<path d="M5 3h13a1 1 0 0 1 1 1v16H6a2 2 0 0 1-2-2V5a2 2 0 0 1 1-2Zm-1 14a2 2 0 0 1 2-2h13M8 7h7m-7 3h5"/>',
 flask:'<path d="M9 3h6m-5 0v6l-6 9a1.6 1.6 0 0 0 1.3 2.5h13.4A1.6 1.6 0 0 0 20 18l-6-9V3M7 15h10"/>',
 bell:'<path d="M5 16c2-2 2-4 2-7a5 5 0 0 1 10 0c0 3 0 5 2 7l1 1H4l1-1Zm5 4a2.2 2.2 0 0 0 4 0"/>',
 refresh:'<path d="M20 10a8 8 0 0 0-14-4L3 9m0-6v6h6M4 14a8 8 0 0 0 14 4l3-3m0 6v-6h-6"/>',
 candle:'<path d="M6 3v4m0 8v5m6-15v6m0 7v3m6-18v3m0 6v7"/><rect x="4" y="7" width="4" height="8" rx=".8"/><rect x="10" y="11" width="4" height="7" rx=".8"/><rect x="16" y="6" width="4" height="6" rx=".8"/>',
 scan:'<path d="M8 3H4v4m12-4h4v4M4 17v4h4m8 0h4v-4M3 13h5l3-6 3 10 2-5h5"/>',
 info:'<circle cx="12" cy="12" r="9"/><path d="M12 11v5m0-9v.1"/>',
 arrow:'<path d="M4 12h15m-6-6 6 6-6 6"/>',external:'<path d="M6 18 18 6M8 6h10v10"/>',
 down:'<path d="m4 6 6 6 4-3 6 8m-5 0h5v-5"/>',up:'<path d="m4 18 6-6 4 3 6-8m-5 0h5v5"/>',
 x:'<path d="m6 6 12 12M18 6 6 18"/>',chevron:'<path d="m9 5 7 7-7 7"/>'
};
const icon=name=>'<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">'+paths[name]+'</svg>';
document.querySelectorAll("[data-icon]").forEach(el=>el.replaceWith(document.createRange().createContextualFragment(icon(el.dataset.icon))));
const usd=n=>n==null?"—":new Intl.NumberFormat("en-US",{style:"currency",currency:"USD",minimumFractionDigits:2}).format(n);
const fmt=(t,options)=>new Intl.DateTimeFormat("en-GB",{timeZone:"Africa/Lagos",...options}).format(t*1000);
const date=t=>fmt(t,{day:"2-digit",month:"short",year:"numeric"}),time=t=>fmt(t,{hour:"2-digit",minute:"2-digit",hour12:false});
const label=m=>({15:"15m",60:"1h",240:"4h"}[m]);
const get=(key,def)=>{try{return JSON.parse(localStorage.getItem("btcdesk.v1."+key))??def}catch{return def}};
const save=(key,val)=>{try{localStorage.setItem("btcdesk.v1."+key,JSON.stringify(val))}catch{}};
const initial=Number(get("interval",15));
let strategy = get("strategy","price-action") === "crossover" ? "crossover" : "price-action";
const isPriceAction = () => strategy === "price-action";
const strategyName = () => isPriceAction() ? "Breakout + continuation" : "EMA crossover";
// The original journal stays under its existing key.
const strategyKey = (key,minutes) => (isPriceAction() ? "pa1." : "") + key + "." + minutes;
let period=[15,60,240].includes(initial)?initial:15, data=null, source="connecting", records=[], page=0, request=0, controller=null,pinned=null;
let alertsOn=get("alerts",false)===true, lastObserved=null, toastTimer;
const draw=mountChart(byId("chart"),byId("charttip"),()=>period);
const inJournal=()=>location.hash==="#journal";
function toast(msg){const box=byId("toast");box.textContent=msg;box.hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>box.hidden=true,9500)}
function dialog(title,body){byId("modalTitle").textContent=title;byId("modalBody").innerHTML=body;if(!byId("modal").open)byId("modal").showModal()}
const oldRecords=m=>{const v=get(strategyKey("plans",m),[]);return Array.isArray(v)?v.filter(p=>p&&Number.isFinite(p.t)&&Number.isFinite(p.entry)&&["Buy","Sell"].includes(p.side)&&p.minutes===m):[]};
function extendJournal(a,m){
  const existing=oldRecords(m), map=new Map(existing.map(p=>[p.id,p]));
  for(const p of a.plans)if(!map.has(p.id))map.set(p.id,p);
  const first=a.bars[0].t;
  for(const [id,p] of map){
    if(p.status!=="Open")continue;
    if(p.t<first){map.set(id,{...p,status:"Unresolved"});continue}
    const next=a.bars.filter(b=>b.t>=p.t).slice(0,12);
    map.set(id,{...p,...simulate(p,next)});
  }
  const list=[...map.values()].sort((a,b)=>b.t-a.t).slice(0,1200);
  save(strategyKey("plans",m),list);return list;
}
function feedState(){
  const title={connecting:"Connecting",live:"Live feed",snapshot:"Historical snapshot",missing:"Feed offline"}[source];
  const el=byId("feed");el.className="feed "+(source==="live"?"live":source==="connecting"?"":"offline");el.lastElementChild.textContent=title;
  byId("notice").hidden=source==="live"||source==="connecting";
  byId("notice").textContent=source==="snapshot"&&data?"Live feed unavailable. Showing saved Kraken candles through "+date(data.asof)+", "+time(data.asof)+" WAT. Live signals and alerts are paused.":"Market data is unavailable. Refresh to try again.";
}
function table(){
  const full=inJournal(),filter=byId("filter").value;
  const rows=records.filter(p=>!full||filter==="All signals"||p.side===filter||p.status===filter), size=full?15:4;
  const total=Math.max(1,Math.ceil(rows.length/size));page=Math.min(page,total-1);
  byId("history").innerHTML=rows.slice(full?page*size:0,full?(page+1)*size:size).map(p=>{
    const state={"Target hit":"target",Stopped:"stopped","Timed out":"timed",Open:"open",Unresolved:"unresolved"}[p.status]||"timed";
    return '<tr data-id="'+p.id+'"><td>'+date(p.t)+'<span class="time">'+time(p.t)+'</span></td><td><span class="side '+p.side.toLowerCase()+'">'+icon(p.side==="Buy"?"up":"down")+p.side+'</span><span class="time">'+(p.setupType|| (p.strategy==="price-action"?"Break and retest":"EMA crossover"))+'</span></td><td>'+usd(p.entry)+'</td><td>'+usd(p.tp)+'</td><td>'+usd(p.sl)+'</td><td><span class="outcome '+state+'">'+p.status+'</span></td><td><button class="rowbtn" aria-label="Inspect '+p.side+' setup from '+date(p.t)+' '+time(p.t)+'">'+icon("chevron")+'</button></td></tr>';
  }).join("")||'<tr><td colspan="7" class="empty">'+(data?"No matching setups in this journal.":"Waiting for candle history.")+'</td></tr>';
  byId("journalFoot").textContent=label(period)+" candles · "+strategyName();
  byId("pages").innerHTML=full&&rows.length?'<button id="prevPage" aria-label="Previous page" '+(!page?"disabled":"")+'>‹</button> '+(page+1)+' / '+total+' <button id="nextPage" aria-label="Next page" '+(page>=total-1?"disabled":"")+'>›</button>':Math.min(rows.length,size)+" of "+rows.length;
  if(byId("prevPage")){byId("prevPage").onclick=()=>{page--;table()};byId("nextPage").onclick=()=>{page++;table()}}
  byId("journalInfo").textContent="Showing "+label(period)+" "+strategyName()+" setups. Recent history is reconstructed from completed candles. TP1 is a reference; paper outcomes use TP2. Select a row for details.";
}
function chartStructure(){
  if(!isPriceAction() || !data)return null;
  const active = pinned || data.plans.findLast(p => p.t === data.asof) || data.watch || data.continuation;
  if(active){
    return {lines:[{level:active.level,pivotAt:active.pivotAt,label:"Breakout level",color:"#ffaf62"}],
      breakAt:active.breakAt,retestAt:active.pullbackAt || active.retestAt};
  }
  const lines=[];
  if(data.swings.high)lines.push({...data.swings.high,label:"Swing high",color:"#b29be4"});
  if(data.swings.low)lines.push({...data.swings.low,label:"Swing low",color:"#8eb9e4"});
  return {lines};
}
function drawChart(){
  byId("chartSelection").hidden=!pinned;
  if(pinned)byId("chartSelectionLabel").textContent=pinned.side+" setup · "+date(pinned.t)+" "+time(pinned.t)+" WAT";
  const overlay=chartStructure();
  byId("legend").innerHTML=isPriceAction()
    ? (overlay?.breakAt ? '<b>B</b> Break <b>R</b> Retest / pullback' : '<span class="line swingkey"></span>Swing levels')
    : '<span class="line fast"></span>EMA 9<span class="line slow"></span>EMA 21';
  draw(data?.bars||[],pinned,overlay);
}
byId("resetChart").onclick=()=>{pinned=null;drawChart()};
function signalReason(side,plan){
  if(source!=="live")return "A current signal needs a fresh market candle. Historical setups are available in the journal.";
  if(!isPriceAction()){
    if(side==="Wait")return "No confirmed crossover on the latest "+label(period)+" close. Waiting for the next candle.";
    return side==="Buy"?"The fast average crossed above the slow average. Momentum confirmed the move.":"The fast average crossed below the slow average. Momentum confirmed the move.";
  }
  if(plan)return plan.setupType==="Continuation"
    ? "Continuation: price held "+usd(plan.level)+", pulled back, then a completed candle broke beyond the pullback. Its wick defines the stop."
    : "Breakout: BTC retested "+usd(plan.level)+" and closed "+(side==="Buy"?"bullishly above":"bearishly below")+" it. The retest wick defines the stop.";
  if(data.watch){
    const watch=data.watch;
    return "BTC broke "+(watch.side==="Buy"?"above ":"below ")+usd(watch.level)+". Waiting for a confirming retest within the next "+watch.remaining+" candle"+(watch.remaining===1?"":"s")+".";
  }
  if(data.continuation){
    const c=data.continuation;
    return c.pullback?"Breakout confirmed. Watching for a candle close beyond the pullback "+(c.side==="Buy"?"high":"low")+" within "+c.remaining+" candles.":"Breakout confirmed. Waiting for a pullback that holds "+usd(c.level)+".";
  }
  return "Waiting for a candle close beyond a confirmed swing, then a retest or continuation that holds the level.";
}
function render(){
  feedState();
  document.querySelectorAll("[data-period]").forEach(b=>{const on=Number(b.dataset.period)===period;b.classList.toggle("active",on);b.setAttribute("aria-pressed",String(on))});
  byId("inspect").disabled=!records.length;table();
  if(!data){for(const id of ["price","change","high","low","volume","entry","tp1","tp","sl","signal"])byId(id).textContent="—";byId("signalvisual").className="signalvisual";byId("signalLabel").textContent="CURRENT SIGNAL";byId("closedAt").textContent="Awaiting candle data";byId("reason").textContent="Waiting for fresh, completed candles.";drawChart();return}
  const {last,stats}=data;byId("price").textContent=usd(last.c);
  byId("change").textContent=(stats.change>=0?"+":"")+stats.change.toFixed(2)+"%";byId("change").className=stats.change>=0?"pos":"neg";
  byId("high").textContent=usd(stats.high);byId("low").textContent=usd(stats.low);
  byId("volume").textContent=stats.volume.toLocaleString("en-US",{maximumFractionDigits:1})+" BTC";
  byId("closedAt").textContent="Last close · "+time(data.asof)+" WAT";
  drawChart();
  const live=source==="live",side=live?data.signal:"Paused";
  const plan=live&&side!=="Wait"?data.plans.findLast(p=>p.t===data.asof):null;
  byId("signal").textContent=side;byId("signalvisual").className="signalvisual "+side.toLowerCase();
  byId("signalLabel").textContent=live?strategyName().toUpperCase():"LIVE SIGNAL";
  byId("reason").textContent=signalReason(side,plan);
  byId("entry").textContent=usd(plan?.entry);byId("tp1").textContent=usd(plan?.tp1);byId("tp").textContent=usd(plan?.tp);byId("sl").textContent=usd(plan?.sl);
}
function view(){
  const full=inJournal();byId("overview").hidden=full;byId("title").textContent=full?"Signal journal":"Market overview";
  byId("intro").textContent=full?"Review entry levels and outcomes for each paper setup.":isPriceAction()?"BTC/USD breakout and continuation paper setups.":"BTC/USD moving averages, momentum and paper trades.";
  byId("navOverview").classList.toggle("active",!full);byId("navJournal").classList.toggle("active",full);
  for(const [id,on] of [["navOverview",!full],["navJournal",full]]){if(on)byId(id).setAttribute("aria-current","page");else byId(id).removeAttribute("aria-current")}
  byId("journalTitle").textContent=full?"Paper setups":"Recent signals";byId("filterbox").hidden=!full;byId("journalInfo").hidden=!full;byId("journalLink").hidden=full;
  byId("journalPanel").style.marginTop=full?"0":"";page=0;table();if(!full&&data)drawChart();
}
function checkAlert(a,m){
  const t=a.asof,prev=lastObserved;lastObserved=t;
  if(!alertsOn||prev===null||t===prev||a.signal==="Wait"||get(strategyKey("seen",m),0)>=t)return;
  save(strategyKey("seen",m),t);const p=a.plans.findLast(p=>p.t===t);if(!p)return;
  const msg=(p.setupType||strategyName())+" · "+label(m)+" "+p.side+" paper setup · Entry "+usd(p.entry)+" · TP2 "+usd(p.tp)+" · SL "+usd(p.sl);toast(msg);
  if("Notification" in window&&Notification.permission==="granted"){try{new Notification("BTC/USD signal",{body:msg,tag:"btcdesk-"+p.id})}catch{}}
}
async function loadMarket(reset=false){
  const m=period, selectedStrategy=strategy, token=++request;controller?.abort();const ctrl=new AbortController();controller=ctrl;
  if(reset){data=null;pinned=null;byId("chartSelection").hidden=true;records=oldRecords(m);source="connecting";lastObserved=null;render()}
  byId("refresh").disabled=true;
  const timer=setTimeout(()=>ctrl.abort(),12000);
  try{
    const response=await fetch("https://api.kraken.com/0/public/OHLC?pair=XBTUSD&interval="+m,{cache:"no-store",signal:ctrl.signal});
    if(!response.ok)throw Error("Market feed unavailable");
    const json=await response.json();if(json.error?.length)throw Error("Exchange error");
    const raw=json.result?.XXBTZUSD,parsed=parseCandles(raw,m),a=analyze(parsed,m,selectedStrategy);
    if(token!==request)return;
    if(!isFresh(a.current,m))throw Error("Stale market feed");
    data=a;source="live";records=extendJournal(a,m);save("candles."+m,raw);render();checkAlert(a,m);
  }catch{
    if(token!==request)return;
    if(!data){
      let raw=get("candles."+m,null);
      const use=rows=>{const a=analyze(parseCandles(rows,m),m,selectedStrategy);data=a;records=extendJournal(a,m)};
      try{use(raw)}catch{try{const fallback=await fetch("./data/"+m+".json");raw=await fallback.json();if(token!==request)return;use(raw)}catch{}}
    }
    if(token!==request)return;
    source=data?"snapshot":"missing";render();
  }finally{clearTimeout(timer);if(token===request){byId("refresh").disabled=false;controller=null}}
}
const crossoverRules='<p><strong>Buy or sell</strong><br>On the selected timeframe, a buy needs the 9-period exponential moving average to cross above the 21-period average with the 14-period RSI above 50. A sell uses the opposite crossover with RSI below 50. Otherwise the signal is Wait.</p><p><strong>Entry and exits</strong><br>Entry uses the following candle’s opening price. The stop sits 1.5 times the 14-period average true range from entry. The target sits twice that distance away. Sell setups model a hypothetical short.</p><p><strong>Paper outcomes</strong><br>Each setup is tracked independently for 12 candles. Completed bars settle outcomes. If both levels are touched in one bar, the simulation counts the stop first unless the open already crossed a level. A gap through the stop uses the opening price. Results exclude fees and slippage.</p><p><strong>Market data</strong><br>Kraken BTC/USD spot prices refresh every 30 seconds while this page is open. Chart, signals and 24-hour statistics use completed candles. All times are West Africa Time.</p>';
const priceRules=`
<p><strong>1 · Find a level</strong><br>A swing high exceeds the highs of the two candles on each side. A swing low falls below all four neighboring lows. Only completed candles count. Track the most recent swing on each side for up to 40 candles.</p>
<p><strong>2 · Break and retest</strong><br>A bullish candle closing above a swing high starts a Buy watch if its body spans at least 25% of its full range and it closes in the upper half. Within the next six candles, price must touch that level and close above both the level and its open, in the upper half of the candle. A Sell reverses those rules at a swing low. A close at or back through the level cancels the watch. Each swing gets one breakout attempt. The desk watches one broken level at a time.</p>
<p><strong>3 · Continuation and trend</strong><br>After a valid retest, watch the next eight completed candles. A Buy needs a bearish pullback candle whose low remains above the broken level, then within four candles a strong bullish close above that pullback high. A Sell reverses these rules. The confirming candle must have a body of at least 25% of its full range and close in its directional half. Both setups require the last completed higher-timeframe close to be on the trade side of its last nine higher-timeframe closes' average. Higher timeframes are 1h for 15m, 4h for 1h, and 1d for 4h. A close through the broken level, a wick through it after the pullback, or expiry cancels the watch. Only one continuation is generated per retest.</p>
<p><strong>4 · Entry and exits</strong><br>Enter on the following candle’s open, provided it remains beyond the broken level and on the safe side of the stop. A breakout stop uses the retest wick; a continuation stop uses the pullback wick. TP1 is 1R, shown as a reference only; TP2 is 2R and is the paper simulation’s exit target. The simulation does not partially close or trail.</p>
<p><strong>5 · Paper outcome</strong><br>Exit at the twelfth close if the stop or TP2 is not reached. When both occur in one candle the model records the stop first, unless the opening price already crossed a level. Fees and slippage are excluded. Chart times are West Africa Time. These are our explicit rules inspired by published breakout ideas, not copies of the robots.</p>`;
byId("rules").onclick=byId("method").onclick=()=>dialog(strategyName()+" rules",isPriceAction()?priceRules:crossoverRules);
function details(p){
  if(!p)return;
  const outcome=p.status==="Open"?"Awaiting a completed candle that reaches a level, or the 12-candle time limit.":p.status==="Unresolved"?"The available history does not cover all candles needed to settle this setup.":p.status==="Timed out"?"Neither level was reached within 12 candles. The model exited at the twelfth close.":p.both?"Both levels were touched in one candle. The simulation recorded the stop first.":"The completed candle reached the "+(p.status==="Stopped"?"stop-loss":"take-profit")+" level.";
  const pair=(k,v)=>'<div><span>'+k+'</span><b>'+v+'</b></div>';
  const stamp=t=>date(t)+" "+time(t)+" WAT";
  const action=p.strategy==="price-action";
  const levelInfo=action
    ? pair("Setup",p.setupType||"Break and retest")+pair("Broken swing",usd(p.level))+pair("Break candle opened",stamp(p.breakAt))+pair("Retest candle opened",stamp(p.retestAt))+(p.pullbackAt?pair("Pullback candle opened",stamp(p.pullbackAt))+pair("Confirmation candle opened",stamp(p.confirmAt)):"")
    : pair("RSI at confirmation",p.rsi.toFixed(1));
  const narrative=action
    ? p.setupType==="Continuation"
      ? "After the retest, price pulled back without crossing the broken level. A completed candle then broke beyond the pullback. The stop uses the pullback wick."
      : "Price revisited the broken swing and the retest closed "+(p.side==="Buy"?"bullishly above":"bearishly below")+" it. The stop is at that candle’s "+(p.side==="Buy"?"low.":"high.")
    : "Paper entry uses the first open after the confirmed crossover.";
  dialog(p.side+" setup",'<div class="spotcaps">BTC / USD · '+label(p.minutes)+' · '+stamp(p.t)+'</div><p><strong>'+strategyName()+'</strong></p><div class="detailrows">'+levelInfo+pair("Paper entry",usd(p.entry))+(p.tp1!=null?pair("TP1 · 1R reference",usd(p.tp1)):"")+pair("TP2 · paper exit",usd(p.tp))+pair("Stop loss",usd(p.sl))+pair("Planned reward / risk","2 : 1")+pair("Outcome",p.status)+(p.exit!=null?pair("Simulated exit",usd(p.exit))+pair("Gross result",((p.side==="Buy"?1:-1)*(p.exit-p.entry)/p.risk).toFixed(2)+" R")+pair("Outcome confirmed",stamp(p.ended)):"")+'</div><p>'+narrative+'</p><p>'+outcome+'</p>'+((data&&p.t>=data.bars[0].t&&p.t<=data.asof)?'<button id="plotSetup" class="primary">Show on chart</button>':''));
  if(byId("plotSetup"))byId("plotSetup").onclick=()=>{pinned=p;byId("modal").close();if(inJournal())location.hash="overview";drawChart();byId("chartSelection").scrollIntoView({block:"center"})};
}
byId("inspect").onclick=()=>details(records[0]);byId("history").onclick=e=>{const row=e.target.closest("[data-id]");if(row)details(records.find(p=>p.id===row.dataset.id))};
byId("dismiss").onclick=()=>byId("modal").close();byId("modal").onclick=e=>{if(e.target===byId("modal")){const b=byId("modal").getBoundingClientRect();if(e.clientX<b.left||e.clientX>b.right||e.clientY<b.top||e.clientY>b.bottom)byId("modal").close()}};
function alertDialog(){
  const support="Notification" in window, allowed=support&&Notification.permission==="granted",denied=support&&Notification.permission==="denied";
  dialog("Signal alerts",'<p>Keep this dashboard open to receive '+strategyName()+' alerts for new buy and sell setups on the selected timeframe. Each alert includes the paper entry, target and stop.</p><div class="detailrows"><div><span>Monitoring</span><b>'+label(period)+' BTC/USD</b></div><div><span>In-page alerts</span><b>'+(alertsOn?"Enabled":"Off")+'</b></div><div><span>Browser notifications</span><b>'+(allowed?"Allowed":denied?"Blocked":support?"Not enabled":"Unavailable")+'</b></div></div><button class="primary" id="toggleAlert">'+(alertsOn?"Turn off alerts":"Enable signal alerts")+'</button>'+(alertsOn&&support&&!allowed&&!denied?'<p><button class="primary" id="notifyBrowser">Allow browser notifications</button></p>':'')+(denied?'<p>Your browser settings control notification permission. In-page alerts still work.</p>':''));
  byId("toggleAlert").onclick=()=>{alertsOn=!alertsOn;save("alerts",alertsOn);byId("alertDot").hidden=!alertsOn;alertDialog()};
  if(byId("notifyBrowser"))byId("notifyBrowser").onclick=async()=>{try{await Notification.requestPermission()}catch{toast("Browser notifications are unavailable here.")}alertDialog()};
}
byId("strategy").value=strategy;
byId("strategy").onchange=()=>{
  strategy=byId("strategy").value; save("strategy",strategy);
  byId("filter").value="All signals"; page=0;
  loadMarket(true); view();
};
byId("alerts").onclick=alertDialog;byId("alertDot").hidden=!alertsOn;
byId("timeframes").onclick=e=>{const button=e.target.closest("[data-period]");if(!button||Number(button.dataset.period)===period)return;period=Number(button.dataset.period);save("interval",period);page=0;loadMarket(true)};
byId("filter").onchange=()=>{page=0;table()};byId("refresh").onclick=()=>loadMarket();
window.addEventListener("hashchange",()=>{view();window.scrollTo(0,0)});view();loadMarket(true);
setInterval(()=>{if(!controller)loadMarket()},30000);
setInterval(()=>{if(source==="live"&&data&&!isFresh(data.current,period)){source="snapshot";render();if(!controller)loadMarket()}},1000);
document.addEventListener("visibilitychange",()=>{if(!document.hidden){if(source==="live"&&data&&!isFresh(data.current,period)){source="snapshot";render()}loadMarket()}});
