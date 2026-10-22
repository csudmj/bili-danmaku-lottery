import {useEffect,useState} from 'react';
import type {VideoLottery as VideoController} from '../../electron/video-lottery';
import {About} from './About';
import {AccountActions,AccountStatus} from './Account';
import type {LotterySnapshot} from '../../electron/lottery';
import {WeightSettings} from './WeightSettings';
import {probabilityLabel} from '../../shared/weights';
import {useListScroll} from '../hooks/use-list-scroll';
type State=ReturnType<VideoController['snapshot']>;
export function VideoLottery(){
    const [state,setState]=useState<State|null>(null),[input,setInput]=useState(''),[keyword,setKeyword]=useState(''),[part,setPart]=useState('all');
    const [busy,setBusy]=useState(false),[error,setError]=useState(''),[count,setCount]=useState(1),[confirm,setConfirm]=useState<number|'reset'|null>(null);
    const [account,setAccount]=useState<Pick<LotterySnapshot,'user'|'loginStatus'>>({user:null,loginStatus:'checking'});const logged=Boolean(account.user);const scroll=useListScroll('video-list-scroll');
    useEffect(()=>{
        const listener=(_event:unknown,value:State)=>setState(value),login=(_event:unknown,value:LotterySnapshot)=>setAccount({user:value.user,loginStatus:value.loginStatus});
        window.ipcRenderer.on('video-state',listener);window.ipcRenderer.on('lottery-state',login);
        window.ipcRenderer.invoke('video:get').then(r=>{if(r.ok)setState(r.data);});
        window.ipcRenderer.invoke('lottery:get').then(r=>{if(r.ok)setAccount({user:r.data.user,loginStatus:r.data.loginStatus});});
        return()=>{window.ipcRenderer.removeListener('video-state',listener);window.ipcRenderer.removeListener('lottery-state',login);};
    },[]);
    async function command(channel:string,value?:unknown){setBusy(true);setError('');try{const r=await window.ipcRenderer.invoke(channel,value);if(!r.ok)throw Error(r.message);return true;}catch(e){setError(e instanceof Error?e.message:'操作失败');return false;}finally{setBusy(false);}}
    const loading=state?.status==='loading',locked=Boolean(state?.total)||loading;
    const total=state?.participants.reduce((sum,p)=>sum+(p.weight??1),0)??0;
    const unequal=Boolean(state?.participants.some(p=>p.weight!==state.participants[0]?.weight));
    return <main className="video-studio studio-shell">
        <header className="studio-header"><div className="brand"><div><strong>B站视频</strong><small>本人投稿弹幕抽奖</small></div></div><div className="header-actions"><About/><AccountActions user={account.user} busy={busy} onLogin={()=>void command('login:open','')} onRefresh={()=>void command('login:refresh')}/></div></header>
        <section className="studio-intro"><AccountStatus {...account}/></section>
        <p>仅支持当前账号自己的投稿。读取创作中心可返回的弹幕，按真实 UID 去重；直播名单独立保留。</p>
        {(error||state?.error)&&<p className="about-error video-message" role="alert">{error||state?.error}</p>}
        <div className="video-workspace"><section className="glass-panel video-controls video-setup">
            <label className="field-label">视频 BV 号或链接<input value={input} disabled={locked||busy} onChange={e=>setInput(e.target.value)} placeholder="https://www.bilibili.com/video/BV…"/></label>
            <button className="action blue" disabled={!logged||busy||locked||!input.trim()} onClick={()=>{setPart('all');void command('video:prepare',input);}}>读取视频</button>
            {state?.info&&<><h2>{state.info.title}</h2><label className="field-label">分P<select disabled={locked||busy} value={part} onChange={e=>setPart(e.target.value)}><option value="all">全部分P</option>{state.info.parts.map(p=><option key={p.cid} value={p.cid}>P{p.page} {p.title}</option>)}</select></label>
                <label className="field-label">参与关键词<input disabled={locked||busy} value={keyword} maxLength={100} onChange={e=>setKeyword(e.target.value)} placeholder="弹幕包含关键词即可参与"/></label>
                <button className="action blue" disabled={locked||busy||!keyword.trim()||!logged} onClick={()=>command('video:collect',{keyword,cids:part==='all'?state.info!.parts.map(p=>p.cid):[Number(part)]})}>获取弹幕并生成名单</button></>}
            <button className="action quiet" onClick={()=>setConfirm('reset')}>{loading?'取消读取 / 重置':'重置本轮'}</button>
            <p role="status">{loading?state?.progress?`正在读取：分P ${state.progress.part}/${state.progress.parts} · 第 ${state.progress.page} 页 · ${state.progress.received}/${state.progress.total} 条`:'正在读取视频信息…':state?.status==='ready'?`已读取 ${state.read} 条 · 关键词匹配 ${state.matched} 条 · 去重后 ${state.total} 人`:'等待读取'}</p>
            <small>平台列表有数量上限；达到上限、缺少 UID、分页异常时会停止，本次不生成抽奖名单。完成分页也不代表已删除或平台未提供的历史弹幕。</small>
        </section>
        {state&&<section className="glass-panel video-people"><div className="panel-heading"><h2>待抽观众（{state.participants.length}）</h2><WeightSettings rules={state.weightRules} medalRequired={false} video/><button className="action quiet" aria-pressed={scroll.enabled} onClick={scroll.toggle}>自动滚动：{scroll.enabled?'开':'关'}</button></div>
            <div className="video-person-list" ref={scroll.ref} onWheel={scroll.pause} onPointerDown={scroll.pause}>{state.participants.map(p=><div className="video-person" key={p.uid}><span><strong>{p.name}</strong><small>UID {p.uid}{unequal?` · 下一位中奖概率 ${probabilityLabel(p.weight??1,total)}`:''}</small></span><label>权重<input aria-label={`${p.name}权重`} key={`${p.uid}-${p.weight}`} type="number" min="1" max="10000" step="0.01" defaultValue={p.weight} disabled={busy} onBlur={e=>{const input=e.currentTarget;if(Number(input.value)!==p.weight)void command('video:weight',{uid:p.uid,weight:Number(input.value)}).then(ok=>{if(!ok)input.value=String(p.weight??1);});}}/></label><button className="action" disabled={busy} onClick={()=>setConfirm(p.uid)}>移除</button></div>)}{!state.participants.length&&<p>暂无待抽观众</p>}</div>
            <div className="draw-controls"><label>抽取<input aria-label="视频抽取人数" type="number" min="1" max={Math.max(1,state.participants.length)} value={count} onChange={e=>setCount(Number(e.target.value))}/>位</label><button className="action gold" disabled={busy||!logged||state.status!=='ready'||!Number.isInteger(count)||count<1||count>state.participants.length} onClick={()=>command('video:draw',count)}>抽奖</button></div>
            <p>默认每人权重 1；专属名单与直播共用。已中奖者不重复抽取，匹配的专属 UID 和昵称规则会清除。</p>
        </section>}
        <section className="glass-panel video-controls video-results"><h2>本轮中奖者</h2><strong>{state?.latestWinners.map(p=>p.name).join('、')||'尚未抽奖'}</strong><button className="action" disabled={!state?.winners.length||busy} onClick={()=>command('video:copy')}>复制中奖名单</button><div>{state?.winners.map(p=><p key={p.uid}>{p.name} · UID {p.uid}</p>)}</div></section>
        </div>
        {confirm!==null&&<div className="modal-scrim"><section className="reset-dialog" role="alertdialog" aria-label="确认视频名单操作"><h2>{confirm==='reset'?'重置视频本轮？':'移除此人？'}</h2><p>{confirm==='reset'?'取消正在进行的读取，清空视频参与名单与本轮中奖结果。历史记录保留。':'该观众本轮将不再参与抽奖。'}</p><button className="action" onClick={()=>setConfirm(null)}>取消</button><button className="action rose" onClick={()=>{void command(confirm==='reset'?'video:reset':'video:remove',confirm==='reset'?undefined:confirm);setConfirm(null);}}>确认</button></section></div>}
    </main>;
}

