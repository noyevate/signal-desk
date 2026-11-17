const money=n=>n.toLocaleString("en-US",{maximumFractionDigits:0});
const localTime=(t,mins)=>new Intl.DateTimeFormat("en-GB",{timeZone:"Africa/Lagos",...(mins===15?{hour:"2-digit",minute:"2-digit"}:{month:"short",day:"numeric",...(mins===60?{hour:"2-digit"}:{})})}).format(t*1000);
export function mountChart(canvas,tip,getPeriod){
  const ctx=canvas.getContext("2d");let bars=[],setup=null,structure=null,pointer=null,active=-1;
  canvas.tabIndex=0;
  function paint(){
    const w=canvas.clientWidth,h=canvas.clientHeight;if(!w||!h)return;
    const scale=window.devicePixelRatio||1;
    canvas.width=Math.round(w*scale);canvas.height=Math.round(h*scale);ctx.setTransform(scale,0,0,scale,0,0);
    ctx.clearRect(0,0,w,h);
    if(!bars.length){ctx.fillStyle="#9299a5";ctx.font="12px system-ui";ctx.fillText("Waiting for price data…",16,h/2);return}
    const count=w<450?42:w>850?84:65;
    const entryIndex=setup?bars.findIndex(b=>b.t>=setup.t):-1;
    const start=entryIndex<0?Math.max(0,bars.length-count):Math.max(0,Math.min(bars.length-count,entryIndex-Math.floor(count/2)));
    const drawbars=bars.slice(start,start+count);
    const left=4,right=w-68,top=18,bottom=h-53,volBottom=h-24,volHeight=22,step=(right-left)/drawbars.length;
    const allPrices=drawbars.flatMap(b=>[b.h,b.l,b.fast,b.slow].filter(Number.isFinite));
    if(setup)allPrices.push(setup.entry,setup.tp,setup.sl);
    if(structure)allPrices.push(...structure.lines.map(line=>line.level));
    let low=Math.min(...allPrices),high=Math.max(...allPrices);
    const pad=Math.max((high-low)*0.12,high*.0001);low-=pad;high+=pad;
    const y=v=>top+(high-v)/(high-low)*(bottom-top), x=i=>left+(i+.5)*step;
    const line=(x1,y1,x2,y2,color,dash=[])=>{ctx.strokeStyle=color;ctx.lineWidth=1;ctx.setLineDash(dash);ctx.beginPath();ctx.moveTo(x1,y1);ctx.lineTo(x2,y2);ctx.stroke();ctx.setLineDash([])};
    ctx.font='10px "IBM Plex Mono", monospace';ctx.textBaseline="middle";ctx.fillStyle="#939ca8";
    for(let i=0;i<=4;i++){const v=high-(high-low)*i/4;line(left,y(v),right,y(v),"#2b3037",[3,4]);ctx.fillText(money(v),right+9,y(v))}
    const ticks=w<480?4:6;
    for(let j=0;j<ticks;j++){const i=Math.round((drawbars.length-1)*j/(ticks-1));line(x(i),top,x(i),volBottom,"#24292f",[3,4]);ctx.textAlign=j===0?"left":j===ticks-1?"right":"center";ctx.fillText(localTime(drawbars[i].t,getPeriod()),x(i),h-10)}ctx.textAlign="left";
    const maxVolume=Math.max(...drawbars.map(b=>b.v),.01);
    drawbars.forEach((b,i)=>{
      const up=b.c>=b.o,color=up?"#58c99d":"#e48283",body=Math.max(2,step*.62);
      line(x(i),y(b.h),x(i),y(b.l),color);ctx.fillStyle=color;ctx.fillRect(x(i)-body/2,Math.min(y(b.o),y(b.c)),body,Math.max(1.3,Math.abs(y(b.o)-y(b.c))));
      ctx.fillStyle=up?"#33594e":"#654043";ctx.fillRect(x(i)-body/2,volBottom-volHeight*b.v/maxVolume,body,volHeight*b.v/maxVolume);
    });
    if(structure){
      for(const guide of structure.lines){
        const idx=drawbars.findIndex(b=>b.t>=guide.pivotAt);
        if(idx<0)continue;
        const pos=y(guide.level), begin=x(idx);
        line(begin,pos,right,pos,guide.color,[5,3]);
        ctx.font='500 10px "IBM Plex Mono", monospace';
        ctx.fillStyle=guide.color;ctx.fillText(guide.label,Math.min(begin+3,right-64),pos-7);
      }
      for(const [t,letter] of [[structure.breakAt,"B"],[structure.retestAt,"R"]]){
        const idx=drawbars.findIndex(b=>b.t===t);
        if(idx<0)continue;
        const xx=x(idx),yy=Math.max(top+6,y(drawbars[idx].h)-8);
        ctx.fillStyle="#ffaf62";ctx.beginPath();ctx.arc(xx,yy,6.5,0,2*Math.PI);ctx.fill();
        ctx.fillStyle="#17181a";ctx.font='bold 9px monospace';ctx.textAlign="center";ctx.fillText(letter,xx,yy);ctx.textAlign="left";
      }
    }else for(const [key,color] of [["fast","#edab68"],["slow","#aa92d8"]]){
      ctx.beginPath();ctx.strokeStyle=color;ctx.lineWidth=1.55;
      drawbars.forEach((b,i)=>{if(b[key]!==null){if(i)ctx.lineTo(x(i),y(b[key]));else ctx.moveTo(x(i),y(b[key]))}});ctx.stroke();
    }
    if(setup){
      const position=drawbars.findIndex(b=>b.t>=setup.t);
      const marker=position<0?right:x(position);
      line(marker,top,marker,volBottom,"#8c929c",[2,3]);
      const labels=[["TP",setup.tp,"#62d6ac"],["EN",setup.entry,"#b6bcc5"],["SL",setup.sl,"#f38687"]]
        .map(([name,value,color])=>({name,value,color,actual:y(value)})).sort((a,b)=>a.actual-b.actual);
      for(let i=0;i<labels.length;i++){
        const item=labels[i];
        item.pos=Math.max(item.actual,i===0?top:labels[i-1].pos+17);
      }
      labels.at(-1).pos=Math.min(labels.at(-1).pos,bottom);
      for(let i=labels.length-2;i>=0;i--)labels[i].pos=Math.min(labels[i].pos,labels[i+1].pos-17);
      for(const {name,value,color,actual,pos} of labels){
        line(left,actual,right-3,actual,color,[4,4]);
        line(right-3,actual,right+4,pos,color);
        ctx.fillStyle="#13161b";ctx.fillRect(right+4,pos-7.5,64,15);ctx.fillStyle=color;
        ctx.font='500 9px "IBM Plex Mono", monospace';ctx.fillText(name+" "+money(value),right+6,pos);
      }
    }else{
    const last=drawbars.at(-1),yy=y(last.c);line(left,yy,right,yy,"#c5915a",[4,4]);ctx.fillStyle="#edb072";
    ctx.fillRect(right+3,yy-8.5,64,17);ctx.fillStyle="#211912";ctx.font='500 10px "IBM Plex Mono", monospace';ctx.fillText(money(last.c),right+10,yy);
    }
    if(pointer!==null)active=Math.max(0,Math.min(drawbars.length-1,Math.floor((pointer-left)/step)));
    if(active>=0){active=Math.min(active,drawbars.length-1);const b=drawbars[active];line(x(active),top,x(active),volBottom,"#a3abb7",[2,3]);tip.textContent=localTime(b.t,getPeriod())+" WAT  ·  O "+money(b.o)+"  H "+money(b.h)+"  L "+money(b.l)+"  C "+money(b.c);tip.hidden=false}else tip.hidden=true;
  }
  canvas.addEventListener("pointermove",e=>{pointer=e.clientX-canvas.getBoundingClientRect().left;paint()});
  function reset(){pointer=null;active=-1;paint()}
  canvas.addEventListener("pointerleave",reset);canvas.addEventListener("blur",reset);
  canvas.addEventListener("keydown",e=>{if(e.key==="ArrowLeft"||e.key==="ArrowRight"){e.preventDefault();pointer=null;active=Math.max(0,active+(e.key==="ArrowRight"?1:-1));paint()}else if(e.key==="Escape")reset()});
  new ResizeObserver(paint).observe(canvas);document.fonts?.ready.then(paint);
  return (list,selected=null,overlay=null)=>{bars=list;setup=selected;structure=overlay;reset()};
}
