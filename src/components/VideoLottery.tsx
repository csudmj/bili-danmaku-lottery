import {useEffect,useState} from 'react';
import type {VideoLottery as VideoController} from '../../electron/video-lottery';
import {VideoBackground} from './VideoBackground';
import type {VideoSource} from '../../shared/video';
import {About} from './About';
import {AccountActions,AccountStatus} from './Account';
import type {LotterySnapshot} from '../../electron/lottery';
import {WeightSettings} from './WeightSettings';
import {probabilityLabel} from '../../shared/weights';
import {useListScroll} from '../hooks/use-list-scroll';
type State=ReturnType<VideoController['snapshot']>;
export function VideoLottery(){
    const [state,setState]=useState<State|null>(null),[input,setInput]=useState(''),[keyword,setKeyword]=useState(''),[part,setPart]=useState('all');
    const [source,setSource]=useState<VideoSource>('danmu'),[scope,setScope]=useState('main'),[root,setRoot]=useState(''),[start,setStart]=useState(''),[end,setEnd]=useState('');
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
    const loading=state?.status==='loading',locked=Boolean(state?.total)||loading||state?.status==='ready';
    const total=state?.participants.reduce((sum,p)=>sum+(p.weight??1),0)??0;

    return <main className="video-studio studio-shell">
        <header className="studio-header"><div className="brand"><div><strong>B站视频</strong><small>弹幕与评论抽奖</small></div></div><div className="header-actions"><About/><VideoBackground/><AccountActions user={account.user} busy={busy} onLogin={()=>void command('login:open','')} onRefresh={()=>void command('login:refresh')}/></div></header>
        <section className="studio-intro"><AccountStatus {...account}/></section>
        <p>{source==='danmu'?'弹幕仅支持当前登录账号自己的投稿。':'评论支持可访问的公开视频，无需是自己的投稿。'}按真实 UID 去重，每人一个名额。</p>
        {(error||state?.error)&&<p className="about-error video-message" role="alert">{error||state?.error}</p>}
        <div className="video-workspace"><section className="glass-panel video-controls video-setup">
            <div className="mode-tabs" role="group" aria-label="视频抽奖类型">{([["danmu","弹幕抽奖"],["comments","评论抽奖"]] as const).map(([key,label])=><button key={key} className="action quiet" aria-pressed={source===key} disabled={locked||busy} onClick={()=>{setSource(key);void command("video:reset");}}>{label}</button>)}</div>
            <label className="field-label">视频 BV 号或链接<input value={input} disabled={locked||busy} onChange={e=>setInput(e.target.value)} placeholder="https://www.bilibili.com/video/BV…"/></label>
            <button className="action blue" disabled={!logged||busy||locked||!input.trim()} onClick={()=>{setPart('all');void command('video:prepare',{video:input,source});}}>读取视频</button>
            {state?.info&&<><h2>{state.info.title}</h2>{source==='danmu'&&<label className="field-label">分P<select disabled={locked||busy} value={part} onChange={e=>setPart(e.target.value)}><option value="all">全部分P</option>{state.info.parts.map(p=><option key={p.cid} value={p.cid}>P{p.page} {p.title}</option>)}</select></label>}
{source==='comments'&&<><label className="field-label">评论范围<select value={scope} disabled={locked||busy} onChange={e=>setScope(e.target.value)}><option value="main">仅主评论</option><option value="all">主评论 + 全部楼中楼</option><option value="thread">仅指定主评论下的回复</option></select></label>{scope==='thread'&&<label className="field-label">主评论 ID 或评论链接<input value={root} disabled={locked||busy} onChange={e=>setRoot(e.target.value)} placeholder="主评论 rpid 或带 #reply 的链接"/><small>只包含回复，不包含主评论本身。可从主评论分享链接取得 ID。</small></label>}</>}
                <label className="field-label">参与关键词<input disabled={locked||busy} value={keyword} maxLength={100} onChange={e=>setKeyword(e.target.value)} placeholder="留空表示发言即可参与"/></label>
                <label className="field-label">起始时间（可留空）<input type="datetime-local" step="1" disabled={locked||busy} value={start} onChange={e=>setStart(e.target.value)}/></label><label className="field-label">结束时间（可留空）<input type="datetime-local" step="1" disabled={locked||busy} value={end} onChange={e=>setEnd(e.target.value)}/></label><small>按本机时区的发布时间筛选，包含起止时刻。起始留空不限；结束留空时，点击抽奖会重新读取并以点击时刻截止。</small>
                <button className="action blue" disabled={locked||busy||!logged||(source==='comments'&&scope==='thread'&&!root.trim())} onClick={()=>command('video:collect',{keyword,cids:part==='all'?state.info!.parts.map(p=>p.cid):[Number(part)],range:{start:start?Math.floor(new Date(start).getTime()/1000):null,end:end?Math.floor(new Date(end).getTime()/1000):null},includeReplies:scope==='all',root:source==='comments'&&scope==='thread'?root:''})}>获取{source==='comments'?'评论':'弹幕'}并生成名单</button></>}
            <button className="action quiet" onClick={()=>setConfirm('reset')}>{loading?'取消读取 / 重置':'重置本轮'}</button>
            <p role="status">{loading?state?.progress?`正在读取：第 ${state.progress.page} 页 · ${state.progress.received}/${state.progress.total} 条`:'正在读取视频信息…':state?.status==='ready'?`已读取 ${state.read} 条 · 条件匹配 ${state.matched} 条 · 去重后 ${state.total} 人`:'等待读取'}</p>
            {state?.status==='ready'&&<small>本次截止：{new Date((state.range.end??state.cutoff)*1000).toLocaleString()}</small>}<small>平台列表有数量上限；达到上限、缺少 UID、分页异常时会停止，本次不生成抽奖名单。完成分页也不代表已删除或平台未提供的历史内容。</small>
        </section>
        {state&&<section className="glass-panel video-people"><div className="panel-heading"><h2>待抽观众（{state.participants.length}）</h2><WeightSettings rules={state.weightRules} medalRequired={false} video/><button className="action quiet" aria-pressed={scroll.enabled} onClick={scroll.toggle}>自动滚动：{scroll.enabled?'开':'关'}</button></div>
            <div className="video-person-list" ref={scroll.ref} onWheel={scroll.pause} onPointerDown={scroll.pause}>{state.participants.map(p=><div className="video-person" key={p.uid}><span><strong>{p.name}</strong><small>UID {p.uid}{` · 中奖率 ${probabilityLabel(p.weight??1,total)}`}</small></span><label>权重<input aria-label={`${p.name}权重`} key={`${p.uid}-${p.weight}`} type="number" min="1" max="10000" step="0.01" defaultValue={p.weight} disabled={busy||loading} onBlur={e=>{const input=e.currentTarget;if(Number(input.value)!==p.weight)void command('video:weight',{uid:p.uid,weight:Number(input.value)}).then(ok=>{if(!ok)input.value=String(p.weight??1);});}}/></label><button className="action" disabled={busy||loading} onClick={()=>setConfirm(p.uid)}>移除</button></div>)}{!state.participants.length&&<p>暂无待抽观众</p>}</div>
            <div className="draw-controls"><label>抽取<input aria-label="视频抽取人数" type="number" min="1" max={Math.max(1,state.participants.length)} value={count} onChange={e=>setCount(Number(e.target.value))}/>位</label><button className="action gold" disabled={busy||!logged||state.status!=='ready'||!Number.isInteger(count)||count<1||count>state.participants.length} onClick={()=>command('video:draw',count)}>抽奖</button></div>
            <p>默认每人权重 1；专属名单与直播共用。已中奖者不重复抽取，匹配的专属 UID 和昵称规则会清除。</p>
        </section>}
        <section className="glass-panel video-controls video-results"><h2>本轮中奖者</h2><strong>{state?.latestWinners.map(p=>p.name).join('、')||'尚未抽奖'}</strong><button className="action" disabled={!state?.winners.length||busy} onClick={()=>command('video:copy')}>复制中奖名单</button><div>{state?.winners.map(p=><p key={p.uid}>{p.name} · UID {p.uid}</p>)}</div></section>
        </div>
        {confirm!==null&&<div className="modal-scrim"><section className="reset-dialog" role="alertdialog" aria-label="确认视频名单操作"><h2>{confirm==='reset'?'重置视频本轮？':'移除此人？'}</h2><p>{confirm==='reset'?'取消正在进行的读取，清空视频参与名单与本轮中奖结果。历史记录保留。':'该观众本轮将不再参与抽奖。'}</p><button className="action" onClick={()=>setConfirm(null)}>取消</button><button className="action rose" onClick={()=>{void command(confirm==='reset'?'video:reset':'video:remove',confirm==='reset'?undefined:confirm);setConfirm(null);}}>确认</button></section></div>}
    </main>;
}

