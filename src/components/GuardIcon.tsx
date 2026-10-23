export function GuardIcon({level}:{level:number}){
 const label=({1:'总督',2:'提督',3:'舰长'} as Record<number,string>)[level];
 if(!label)return null;
 const color=({1:'#ed9c52',2:'#b99bff',3:'#69c8ff'} as Record<number,string>)[level];
 return <svg className="overlay-guard-icon" viewBox="0 0 24 24" role="img" aria-label={label}><title>{label}</title>
  <circle cx="12" cy="12" r="10.5" fill="#17263f" stroke={color} strokeWidth="1.8"/>
  <circle cx="12" cy="12" r="8.2" fill={color} opacity=".2"/>
  {level===3?<g fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="6" r="1.5"/><path d="M12 8v10M8 10h8M6 13c0 7 12 7 12 0M4.5 14.5 6 13l1.5 1.5M16.5 14.5 18 13l1.5 1.5"/></g>:level===2?<g stroke={color} strokeWidth="1.6" strokeLinejoin="round"><path d="m5 8 3.5 3L12 6l3.5 5L19 8l-2 9H7Z" fill={color} fillOpacity=".3"/><path d="M8 19h8"/></g>:<g stroke={color} strokeWidth="1.5" strokeLinejoin="round"><path d="m12 4 2.4 5 5.6.8-4 3.9.9 5.5-4.9-2.6-4.9 2.6.9-5.5-4-3.9 5.6-.8Z" fill={color} fillOpacity=".35"/></g>}
 </svg>;
}
