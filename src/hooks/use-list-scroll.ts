import {useEffect, useRef, useState} from 'react';

export function useListScroll(key: string) {
    const ref=useRef<HTMLDivElement>(null);
    const [enabled,setEnabled]=useState(()=>localStorage.getItem(key)!=='off');
    const pauseUntil=useRef(0);
    const pause=()=>{pauseUntil.current=performance.now()+5000;};
    useEffect(()=>{localStorage.setItem(key,enabled?'on':'off');},[enabled,key]);
    useEffect(()=>{
        if(!enabled)return;
        let frame=0,previous=performance.now(),direction=1,edgeUntil=previous+1800,remainder=0;
        const tick=(now:number)=>{
            const dt=Math.min(80,Math.max(0,now-previous));previous=now;
            const el=ref.current;
            if(el && !document.hidden && now>=pauseUntil.current && now>=edgeUntil && !el.contains(document.activeElement)){
                const max=el.scrollHeight-el.clientHeight;
                if(max>1){
                    remainder+=dt*0.022;
                    const pixels=Math.floor(remainder);remainder-=pixels;
                    el.scrollTop=Math.max(0,Math.min(max,el.scrollTop+direction*pixels));
                    if((direction===1 && el.scrollTop>=max-1)||(direction===-1 && el.scrollTop<=1)){direction*=-1;edgeUntil=now+2000;}
                } else {direction=1;}
            }
            frame=requestAnimationFrame(tick);
        };
        frame=requestAnimationFrame(tick);
        return ()=>cancelAnimationFrame(frame);
    },[enabled]);
    return {ref,enabled,toggle:()=>setEnabled(v=>!v),pause};
}
