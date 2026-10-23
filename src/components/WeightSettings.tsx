import {validWeight} from '../../shared/weights';
import {useEffect,useState} from 'react';
import {createPortal} from 'react-dom';
import {SlidersHorizontal,X} from 'lucide-react';
import type {WeightRules,PersonalWeight} from '../../electron/lottery';

const entryKey=(entry:PersonalWeight)=>entry.uid===null?`name:${entry.name}`:`uid:${entry.uid}`;
const labels:Record<keyof WeightRules,string>={captain:'舰长',admiral:'提督',governor:'总督',fan:'普通本房间粉丝牌',ordinary:'无本房间粉丝牌'};
export function WeightSettings({rules,medalRequired,video=false}:{rules:WeightRules;medalRequired:boolean;video?:boolean}){
    const [revision,setRevision]=useState(0);
    const [refresh,setRefresh]=useState(0);
    useEffect(()=>{const listener=()=>setRefresh(n=>n+1);window.ipcRenderer.on('personal-weights-changed',listener);return()=>{window.ipcRenderer.removeListener('personal-weights-changed',listener);};},[]);
    const [open,setOpen]=useState(false),[tab,setTab]=useState<'rules'|'personal'>('rules');
    const [draft,setDraft]=useState(rules),[entries,setEntries]=useState<PersonalWeight[]>([]);
    const [uid,setUid]=useState(''),[name,setName]=useState(''),[weight,setWeight]=useState(1),[search,setSearch]=useState('');
    const [busy,setBusy]=useState(false),[loaded,setLoaded]=useState(false),[error,setError]=useState(''),[info,setInfo]=useState('');
    const [confirm,setConfirm]=useState<string|null>(null);
    const [editingKey,setEditingKey]=useState<string|null>(null);
    const signature=JSON.stringify(rules);
    useEffect(()=>{setDraft(JSON.parse(signature));},[signature]);
    useEffect(()=>{
        if(!open)return;
        let alive=true;setLoaded(false);setError('');setInfo('');
        window.ipcRenderer.invoke('weights:personal:get').then(result=>{
            if(!alive)return;
            if(!result.ok)throw Error(result.message);
            setRevision(result.data.revision);setEntries(result.data.entries);setLoaded(true);
            if(result.data.loadError)setError('专属名单读取失败，当前按空名单运行。原文件未覆盖；请先备份个人数据目录中的 personal-weights.json。保存新名单会替换原文件。');
        }).catch(()=>{if(alive)setError('无法读取专属名单，请关闭后重试');});
        return()=>{alive=false;};
    },[open,refresh]);
    async function call(channel:string,value?:unknown){
        if(busy)return false;setBusy(true);setError('');setInfo('');
        try{const result=await window.ipcRenderer.invoke(video&&['weights:rules','weights:reset'].includes(channel)?`video:${channel}`:channel,value);if(!result.ok)throw Error(result.message||'操作失败');return true;}
        catch(e){setError(e instanceof Error?e.message:'操作失败，请重试');return false;}finally{setBusy(false);}
    }
    async function saveEntries(next:PersonalWeight[]){
        if(await call('weights:personal:save',{entries:next,revision})){setEntries(next);setInfo('专属名单已保存，仅影响之后新入选者。');return true;}return false;
    }
    async function saveRules(){
        if(await call('weights:rules',{rules:draft,applyExisting:true}))setInfo('已应用到全部待抽者，之后新入选者也使用此设置；专属名单优先。');
    }
    const [page,setPage]=useState(0);
    useEffect(()=>setPage(0),[search]);
    const filtered=entries.filter(p=>`${p.name} ${p.uid}`.toLowerCase().includes(search.toLowerCase()));
    const currentPage=Math.min(page,Math.max(0,Math.ceil(filtered.length/100)-1));
    const invalid=Object.values(draft).some(v=>!validWeight(v));
    return <><button className="action quiet" onClick={()=>setOpen(true)}><SlidersHorizontal size={13}/>权重设置</button>
        {open&&createPortal(<div className="modal-scrim"><section className="weights-dialog" role="dialog" aria-modal="true" aria-labelledby="weights-title">
            <div className="about-heading"><h2 id="weights-title">抽奖权重设置</h2><button className="action" disabled={busy} aria-label="关闭权重设置" onClick={()=>{setOpen(false);setConfirm(null);}}><X size={18}/></button></div>
            <div className="mode-tabs"><button className={`action ${tab==='rules'?'selected':''}`} onClick={()=>setTab('rules')}>{video?'默认权重':'身份默认权重'}</button><button className={`action ${tab==='personal'?'selected':''}`} onClick={()=>setTab('personal')}>专属权重名单（{entries.length}）</button></div>
            {tab==='rules'?<>
                <p>{video?'默认 1，范围 1–10000，最多两位小数。专属 UID 优先于昵称规则，昵称规则优先于默认权重。':'全部默认 1，范围 1–10000，最多两位小数。大航海身份优先于粉丝牌；专属 UID 优先于昵称规则，昵称规则优先于身份档位。'}</p>
                <div className="weight-rules-grid">{(Object.keys(labels) as (keyof WeightRules)[]).filter(k=>video?k==='ordinary':k!=='ordinary'||!medalRequired).map(key=><label key={key}>{video?'普通观众':labels[key]}<input aria-label={`${video?'普通观众':labels[key]}默认权重`} type="number" min="1" max="10000" step="0.01" value={draft[key]} onChange={e=>setDraft({...draft,[key]:Number(e.target.value)})}/></label>)}</div>
                <p>{video?'视频初始默认权重为 1；专属名单与直播共用，不使用直播间身份档位。':'本直播间舰长、提督、总督分别识别；身份未知时按粉丝牌归类。佩戴其他直播间牌子归入“无本房间粉丝牌”。'}</p>
                <div className="about-links"><button className="action gold" disabled={busy||invalid} onClick={()=>setConfirm('apply')}>应用到全部待抽</button><button className="action quiet" disabled={busy} onClick={()=>setConfirm('reset')}>全部恢复为 1</button></div>
                <p>默认权重设置自动保存在本机，重置轮次或退出程序后仍保留。</p>
            </>:<>
                <p>填写 UID 时按 UID 匹配，昵称可辅助识别；UID 留空时按完整昵称匹配，所有同名观众共用该权重。UID 规则优先。名单保存在本机，默认空白，最多 100000 条。</p>
                <div className="personal-entry"><label>UID（可留空）<input aria-label="专属权重 UID" inputMode="numeric" value={uid} onChange={e=>setUid(e.target.value.replace(/\D/g,''))}/></label><label>昵称<input aria-label="专属权重昵称" value={name} maxLength={80} onChange={e=>setName(e.target.value)}/></label><label>权重<input aria-label="专属名单权重" type="number" min="1" max="10000" step="0.01" value={weight} onChange={e=>setWeight(Number(e.target.value))}/></label></div>
                <div className="about-links"><button className="action blue" disabled={busy||!loaded||(uid?(!Number.isSafeInteger(Number(uid))||Number(uid)<=0):!name.trim())||!validWeight(weight)} onClick={async()=>{
                    const entry:PersonalWeight={uid:uid?Number(uid):null,name:name.trim(),weight};
                    const next=[...entries.filter(p=>entryKey(p)!==entryKey(entry)&&entryKey(p)!==editingKey),entry];
                    if(await saveEntries(next)){setUid('');setName('');setWeight(1);setEditingKey(null);}
                }}>{editingKey!==null||entries.some(p=>entryKey(p)===(uid?`uid:${Number(uid)}`:`name:${name.trim()}`))?'保存修改':'添加条目'}</button><button className="action rose" disabled={busy||!loaded||!entries.length} onClick={()=>setConfirm('clear')}>清空专属名单</button></div>
                <input className="personal-search" aria-label="搜索专属名单" placeholder="搜索昵称或 UID" value={search} onChange={e=>setSearch(e.target.value)}/>
                <div className="personal-list">{filtered.slice(currentPage*100,(currentPage+1)*100).map(p=><div key={entryKey(p)}><span><strong>{p.name||'未填写昵称'}</strong><small>{p.uid===null?'同名匹配':`UID ${p.uid}`} · 权重 {p.weight}</small></span><button className="action" disabled={busy} onClick={()=>{setEditingKey(entryKey(p));setUid(p.uid===null?'':String(p.uid));setName(p.name);setWeight(p.weight);}}>编辑</button><button className="action" disabled={busy} onClick={()=>setConfirm(entryKey(p))}>删除</button></div>)}{loaded&&!entries.length&&<p>专属名单为空，使用默认权重。</p>}</div>
                {filtered.length>100&&<div className="about-links"><button className="action" disabled={currentPage===0} onClick={()=>setPage(currentPage-1)}>上一页</button><span>{currentPage+1} / {Math.ceil(filtered.length/100)}</span><button className="action" disabled={(currentPage+1)*100>=filtered.length} onClick={()=>setPage(currentPage+1)}>下一页</button></div>}
                <p>保存、删除或清空仅影响之后新入选者。若要更新当前待抽者，切换到默认权重设置并选择“应用到全部待抽”。</p>
            </>}
            <p className="about-error" role="alert">{error}</p><p role="status">{info}</p>
            {confirm!==null&&<div className="weight-confirm" role="alertdialog" aria-label="确认权重操作"><strong>确认操作？</strong><p>{confirm==='apply'?'应用后之前设置的手动权重会被覆盖，但不影响专属名单（舰长、粉丝牌权重）':confirm==='reset'?'默认权重和当前全部待抽者恢复为 1。专属名单保留，之后的新入选者仍可匹配专属权重。':confirm==='clear'?'永久清空本机专属名单。当前待抽者权重不变。':'删除这条专属权重记录？当前待抽者权重不变。'}</p><div className="about-links"><button className="action" disabled={busy} onClick={()=>setConfirm(null)}>取消</button><button className="action rose" disabled={busy} onClick={async()=>{
                if(confirm==='apply')await saveRules();
                else if(confirm==='reset'){if(await call('weights:reset')){setDraft({captain:1,admiral:1,governor:1,fan:1,ordinary:1});setInfo('默认权重和当前待抽者已恢复为 1。');}}
                else await saveEntries(confirm==='clear'?[]:entries.filter(p=>entryKey(p)!==confirm));
                setConfirm(null);
            }}>确认</button></div></div>}
        </section></div>,document.body)}
    </>;
}

