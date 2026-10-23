import {useEffect,useRef,useState} from 'react';

export function OverlayFont({value,effective,onChange,onOpen}:{value:number;effective:number;onChange:(value:number)=>void;onOpen:()=>void}){
 const [open,setOpen]=useState(false),root=useRef<HTMLDivElement>(null);
 useEffect(()=>{
  if(!open)return;
  const outside=(e:PointerEvent)=>{if(!root.current?.contains(e.target as Node))setOpen(false);};
  const escape=(e:KeyboardEvent)=>{if(e.key==='Escape'){setOpen(false);root.current?.querySelector('button')?.focus();}};
  document.addEventListener('pointerdown',outside);document.addEventListener('keydown',escape);
  return()=>{document.removeEventListener('pointerdown',outside);document.removeEventListener('keydown',escape);};
 },[open]);
 const change=(next:number)=>onChange(Math.max(85,Math.min(180,next)));
 return <div ref={root} className="overlay-font-menu">
  <button className="action quiet" title="字号设置" aria-label="字号设置" aria-expanded={open} onClick={()=>{if(!open)onOpen();setOpen(!open);}}>Aa</button>
  {open&&<section className="overlay-font-popover" aria-label="小窗字号设置">
   <div className="font-panel-heading"><strong>字号</strong><output>{value}%</output></div>
   <div className="font-slider-row"><button aria-label="缩小字号" disabled={value<=85} onClick={()=>change(value-5)}>A−</button><input aria-label="小窗字号" type="range" min="85" max="180" step="5" value={value} onChange={e=>change(Number(e.target.value))}/><button aria-label="放大字号" disabled={value>=180} onClick={()=>change(value+5)}>A＋</button></div>
   <div className="font-presets">{[100,140,180].map(size=><button key={size} aria-pressed={size===value} onClick={()=>change(size)}>{size}%</button>)}</div>
   {effective<value&&<p>适配当前窗口，实际显示 {effective}%</p>}
  </section>}
 </div>;
}
