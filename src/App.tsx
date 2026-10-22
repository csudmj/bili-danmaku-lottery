import {createPortal} from 'react-dom';
import {version} from '../package.json';
import {validWeight,probabilityLabel} from '../shared/weights';
import {useEffect, useRef, useState} from 'react';
import type {CSSProperties, ReactNode} from 'react';
import {ArrowUpRight, Check, ChevronRight, Copy, Crown, Gift, Image as ImageIcon, MessageCircle,
    GripVertical, ArrowUp, ArrowDown, ListOrdered, Minus, SlidersHorizontal, UserMinus, MonitorUp, Moon, Pause, Pin, Play, Radio, RotateCcw, ShieldCheck, Sparkles, Ticket, Users, X} from 'lucide-react';
import type {LotterySnapshot, Participant, Danmu, ActivityMode} from '../electron/lottery';
import type {MedalRule} from '../electron/eligibility';
import './App.css';
import {About} from './components/About';
import {AccountActions,AccountStatus} from './components/Account';
import {WeightSettings} from './components/WeightSettings';
import {VideoLottery} from './components/VideoLottery';
import {History} from './components/History';
import {useListScroll} from './hooks/use-list-scroll';
import {parseRoom, readRoom, saveRoom} from '../shared/room-preference';

const initial: LotterySnapshot = {giftSort:false,compensation:{enabled:false,increment:0.1},weightRules:{captain:1,admiral:1,governor:1,fan:1,ordinary:1},queueOrderEdited:false,mode: 'lottery', queueLimit: 20, removedCount: 0, participants: [], winners: [], latestWinners: [], drawNumber: 0, total: 0,
    roomId: '', keyword: '', medalRule: 'off', connection: 'stopped', user: null, loginStatus: 'checking',
    overlayOpen: false, overlayPinned: true, ready: false};
const isOverlay = location.hash === '#overlay';

function Button({children, tone = 'quiet', className = '', ...props}: React.ButtonHTMLAttributes<HTMLButtonElement> & {tone?: string}) {
    return <button className={`action ${tone} ${className}`} {...props}>{children}</button>;
}
function Empty({icon, title, text}: {icon: ReactNode; title: string; text?: string}) {
    return <div className="empty-state"><span className="empty-icon">{icon}</span><strong>{title}</strong>{text && <p>{text}</p>}</div>;
}
function Person({person, index, winner = false, onRemove, onWeight, probability, giftAmount}: {person: Participant; index?: number; winner?: boolean; probability?:string;giftAmount?:number; onRemove?: () => void; onWeight?: () => void}) {
    return <div className={`person-row ${winner ? 'person-winner' : ''}`}>
        <span className="person-number">{winner ? <Crown size={16}/> : String((index ?? 0) + 1).padStart(2, '0')}</span>
        <div className="person-info"><strong title={person.name}>{person.name}</strong><small>UID {person.uid}</small></div>
        {person.guardLevel ? <span className="guard-label">{({1:'总督',2:'提督',3:'舰长'} as Record<number,string>)[person.guardLevel]}</span> : null}
        {person.medal && <span className="medal" title={person.medal.name}><ShieldCheck size={11}/>{person.medal.name}<b>{person.medal.level}</b></span>}
        {probability && <span className="person-metric" title="下一位中奖概率；多名抽取会逐次重新计算">{probability}<small>下一位中奖</small></span>}
        {giftAmount!==undefined && <span className="person-metric">¥{(giftAmount/1000).toFixed(3).replace(/0$/,'')}<small>本轮礼物</small></span>}
        {onWeight && <Button className="weight-button" title="修改抽奖权重" onClick={onWeight}><SlidersHorizontal size={12}/>{person.weight ?? 1}</Button>}
        {onRemove ? <Button className="remove-person" title={`移除 ${person.name}`} aria-label={`移除 ${person.name}`} onClick={onRemove}><UserMinus size={14}/></Button> : !winner && <Check className="admitted-check" size={14}/>}

    </div>;
}

function LiveApp({onStyleChange}:{onStyleChange?:(style:CSSProperties)=>void}={}) {
    const [state, setState] = useState<LotterySnapshot>(initial);
    const draggedUid = useRef<number|null>(null);
    const [dropHint,setDropHint]=useState('');
    const [messages, setMessages] = useState<Danmu[]>([]);
    const [room, setRoom] = useState(() => readRoom(localStorage));
    const [word, setWord] = useState('');
    const [rule, setRule] = useState<MedalRule>('off');
    const [mode, setMode] = useState<ActivityMode>('lottery');
    const [queueLimit, setQueueLimit] = useState(20);
    const [removeTarget, setRemoveTarget] = useState<Participant | null>(null);
    const [weightTarget, setWeightTarget] = useState<Participant | null>(null);
    const [weightDraft, setWeightDraft] = useState(1);
    const [count, setCount] = useState(1);
    const [busy, setBusy] = useState('');
    const [notice, setNotice] = useState('');
    const advancedDialog = useRef<HTMLDialogElement>(null);
    const advancedButton = useRef<HTMLButtonElement>(null);
    function openAdvanced() {
        const dialog = advancedDialog.current, button = advancedButton.current;
        if (!dialog || !button) return;
        dialog.style.animation = 'none';
        dialog.showModal();
        const from = button.getBoundingClientRect(), to = dialog.getBoundingClientRect();
        dialog.style.setProperty('--launch-x', `${from.left + from.width / 2 - to.left - to.width / 2}px`);
        dialog.style.setProperty('--launch-y', `${from.top + from.height / 2 - to.top - to.height / 2}px`);
        dialog.style.animation = ''; 
    }
    const [appearance, setAppearance] = useState(false);
    const [tab, setTab] = useState<'participants' | 'winners'>('participants');
    const [background, setBackground] = useState('');
    const [dim, setDim] = useState(() => {
        const saved = Number(localStorage.getItem(isOverlay ? 'overlay-dim' : 'main-dim') || 64);
        return Number.isFinite(saved) ? Math.max(45, Math.min(85, saved)) : 64;
    });
    const inFlight = useRef(false);
    const commandSequence = useRef(0);
    const feed = useRef<HTMLDivElement>(null);
    const listScroll = useListScroll(isOverlay ? 'overlay-list-scroll' : 'main-list-scroll');
    const autoScroll = useRef(true);
    const active = state.connection !== 'stopped';
    const locked = active;
    const queueMode = (state.ready || isOverlay ? state.mode : mode) === 'queue';
    const totalWeight=state.participants.reduce((sum,p)=>sum+(p.weight??1),0);
    const unequal=state.participants.some(p=>(p.weight??1)!==(state.participants[0]?.weight??1));
    const metrics=(person:Participant)=>queueMode?{giftAmount:state.giftSort?(person.giftAmount??0):undefined}:{probability:unequal?probabilityLabel(person.weight??1,totalWeight):undefined};
    const [increment,setIncrement]=useState(0.1);
    const style = {'--scene': `url("${background || new URL('./art/stage.jpg', location.href).href}")`, '--shade': dim / 100} as CSSProperties;
    useEffect(()=>{onStyleChange?.({'--scene': `url("${background || new URL('./art/stage.jpg', location.href).href}")`, '--shade':dim/100} as CSSProperties);},[background,dim,onStyleChange]);


    useEffect(() => {
        const ipc = window.ipcRenderer;
        let alive = true;
        const onState: Parameters<typeof ipc.on>[1] = (_event, data: LotterySnapshot) => {if (alive) setState(data);};
        const onMessage: Parameters<typeof ipc.on>[1] = (_event, data: Danmu) => setMessages(prev => [...prev.slice(-1999), data]);
        const onNotice: Parameters<typeof ipc.on>[1] = (_event, text: string) => setNotice(text);
        const onReset = () => {setMessages([]); setCount(1);};
        const onBackground: Parameters<typeof ipc.on>[1] = (_event, value: string) => setBackground(value);
        ipc.on('background-changed', onBackground);
        ipc.invoke('background:get').then(result => {if (alive && result.ok) setBackground(result.data || '');}).catch(() => {});
        ipc.on('lottery-state', onState); ipc.on('app-notice', onNotice);
        if (!isOverlay) {ipc.on('danmu_msg', onMessage); ipc.on('messages-reset', onReset);}
        ipc.invoke('lottery:get').then(result => {if (alive && result.ok) setState(result.data);}).catch(() => setNotice('无法连接应用，请重新打开程序'));
        return () => {
            alive = false; ipc.removeListener('background-changed', onBackground); ipc.removeListener('lottery-state', onState); ipc.removeListener('app-notice', onNotice);
            ipc.removeListener('danmu_msg', onMessage); ipc.removeListener('messages-reset', onReset);
        };
    }, []);
    useEffect(() => {
        if (state.ready) {setRoom(state.roomId); setWord(state.keyword); setRule(state.medalRule); setMode(state.mode); setQueueLimit(state.queueLimit);}
    }, [state.ready, state.roomId, state.keyword, state.medalRule, state.mode, state.queueLimit]);
    useEffect(() => {
        if (!notice) return;
        const timer = setTimeout(() => setNotice(''), 6500);
        return () => clearTimeout(timer);
    }, [notice]);
    useEffect(() => {
        localStorage.setItem(isOverlay ? 'overlay-dim' : 'main-dim', String(dim));
    }, [dim]);
    useEffect(() => {if (autoScroll.current && feed.current) feed.current.scrollTop = feed.current.scrollHeight;}, [messages]);

    async function command(channel: string, value?: unknown) {
        if (inFlight.current && !['lottery:stop', 'lottery:reset', 'overlay:close', 'overlay:minimize'].includes(channel)) return;
        const sequence = ++commandSequence.current;
        inFlight.current = true; setBusy(channel);
        try {
            const result = await window.ipcRenderer.invoke(channel, value);
            if (!result.ok) {setNotice(result.message || '操作未完成，请重试'); return false;}
            return true;
        } catch {setNotice('操作未完成，请稍后重试'); return false;}
        finally {if (sequence === commandSequence.current) {inFlight.current = false; setBusy('');}}
    }
    async function draw(amount = 1) {
        if (await command('lottery:draw', amount)) setTab('winners');
    }
    function renderManagedPerson(person:Participant,index:number){
        const row=<Person person={person} index={index} {...(tab==='participants'?metrics(person):{})} winner={tab==='winners'} onRemove={tab==='participants'?()=>setRemoveTarget(person):undefined} onWeight={!queueMode&&tab==='participants'?()=>{setWeightTarget(person);setWeightDraft(person.weight??1);}:undefined}/>;
        if(!queueMode||state.giftSort||tab!=='participants')return <div key={person.uid}>{row}</div>;
        const finish=()=>{draggedUid.current=null;setDropHint('');listScroll.hold(false);};
        function targetAt(x:number,y:number){
            const element=document.elementFromPoint(x,y)?.closest<HTMLElement>('[data-queue-uid]');
            if(!element)return null;
            const targetUid=Number(element.dataset.queueUid),rect=element.getBoundingClientRect();
            return {targetUid,placement:y<rect.top+rect.height/2?'before' as const:'after' as const};
        }
        return <div key={person.uid} data-queue-uid={person.uid} className={`queue-managed ${dropHint.startsWith(person.uid+':')?dropHint.split(':')[1]:''}`}>
            <div className="queue-order-controls"><button className="drag-handle" disabled={Boolean(busy)} aria-label={`拖动 ${person.name} 调整顺序`} title="拖动调整队列顺序" onPointerDown={event=>{
                if(event.button!==0||busy)return;
                event.preventDefault();event.currentTarget.setPointerCapture(event.pointerId);
                draggedUid.current=person.uid;listScroll.hold(true);
            }} onPointerMove={event=>{
                if(draggedUid.current!==person.uid)return;
                const target=targetAt(event.clientX,event.clientY);
                setDropHint(target&&target.targetUid!==person.uid?`${target.targetUid}:${target.placement}`:'');
            }} onPointerUp={event=>{
                if(draggedUid.current!==person.uid)return;
                const target=targetAt(event.clientX,event.clientY);finish();
                if(event.currentTarget.hasPointerCapture(event.pointerId))event.currentTarget.releasePointerCapture(event.pointerId);
                if(target&&target.targetUid!==person.uid)void command('queue:move',{uid:person.uid,...target});
            }} onPointerCancel={finish} onLostPointerCapture={finish}><GripVertical size={16}/></button>
            <button disabled={Boolean(busy)||index===0} aria-label={`上移 ${person.name}`} onClick={()=>command('queue:move',{uid:person.uid,targetUid:state.participants[index-1].uid,placement:'before'})}><ArrowUp size={12}/></button>
            <button disabled={Boolean(busy)||index===state.participants.length-1} aria-label={`下移 ${person.name}`} onClick={()=>command('queue:move',{uid:person.uid,targetUid:state.participants[index+1].uid,placement:'after'})}><ArrowDown size={12}/></button></div>{row}
        </div>;
    }
    const themePanel = <div className="appearance-panel">
        <div className="section-label"><ImageIcon size={14}/>背景照片<Button title="关闭背景设置" aria-label="关闭背景设置" onClick={() => setAppearance(false)}><X size={14}/></Button></div>
        <div className="background-actions"><Button disabled={Boolean(busy)} tone="blue" onClick={() => command('background:select')}><ImageIcon size={16}/>选择照片</Button><Button disabled={!background || Boolean(busy)} onClick={() => command('background:reset')}><RotateCcw size={14}/>恢复默认</Button></div>
        <label className="dim-label"><span><Moon size={13}/>背景压暗 <b>{dim}%</b></span><input aria-label="背景压暗程度" type="range" min="45" max="85" value={dim} onChange={event => setDim(Number(event.target.value))}/></label>
    </div>;
    const toast = notice && <div className="app-toast" role="status"><span>{notice}</span><button aria-label="关闭提示" onClick={() => setNotice('')}><X size={15}/></button></div>;

    const managementDialog = (removeTarget || weightTarget) && <div className="modal-scrim"><section className="reset-dialog" role="dialog" aria-modal="true" aria-labelledby="participant-dialog-title">
        <h2 id="participant-dialog-title">{removeTarget ? '移除参与者？' : '设置抽奖权重'}</h2>
        <p className="dialog-person">{(removeTarget || weightTarget)?.name}<br/>UID {(removeTarget || weightTarget)?.uid}</p>
        {removeTarget ? <p>从当前名单移除，本轮不能再次加入。{queueMode ? '空出的名额可由新的观众报名。' : '此人将不再参与本轮抽奖。'}</p> : <><label className="weight-field">权重<input aria-label="参与者权重" type="number" min="1" max="10000" step="0.01" value={weightDraft} onChange={event => setWeightDraft(Number(event.target.value))}/></label><p>默认 1，可设置为 1–10000，最多两位小数。每次抽取概率按当前剩余参与者的权重比例计算。</p></>}
        <div><Button onClick={() => {setRemoveTarget(null); setWeightTarget(null);}}>取消</Button><Button tone={removeTarget ? 'rose' : 'blue'} disabled={Boolean(busy) || (!removeTarget && (!validWeight(weightDraft)))} onClick={async () => {
            const ok = removeTarget ? await command('participant:remove', removeTarget.uid) : await command('participant:weight', {uid: weightTarget!.uid, weight: weightDraft});
            if (ok) {setRemoveTarget(null); setWeightTarget(null);}
        }}>{removeTarget ? '确认移除' : '保存权重'}</Button></div>
    </section></div>;

    if (isOverlay) return <main className="overlay-shell" style={style}>
        <header className="overlay-titlebar"><span><Sparkles size={13}/>抽奖姬</span><div>
            <Button title="背景设置" aria-label="背景设置" onClick={() => setAppearance(!appearance)}><ImageIcon size={14}/></Button>
            <Button className={state.overlayPinned ? 'is-pinned' : ''} title={state.overlayPinned ? '取消置顶' : '窗口置顶'} aria-label={state.overlayPinned ? '取消置顶' : '窗口置顶'} onClick={() => command('overlay:pin')}><Pin size={14}/></Button>
            <Button title="最小化小窗" aria-label="最小化小窗" onClick={() => command('overlay:minimize')}><Minus size={15}/></Button>
            <Button title="关闭小窗" aria-label="关闭小窗" onClick={() => command('overlay:close')}><X size={15}/></Button>
        </div></header>
        <div className={`overlay-login login-status ${state.loginStatus === 'authenticated' ? 'authenticated' : 'anonymous'}`}>{state.loginStatus === 'authenticated' && state.user ? '已登录' : '未登录'}</div>
        {appearance && themePanel}
        <section className="overlay-draw-area">
            <div className="overlay-kicker"><span className={`live-dot ${active ? 'on' : ''}`}/>{state.connection === 'connected' ? '正在获取弹幕' : state.connection === 'connecting' ? '正在连接弹幕' : '弹幕收集暂停'}</div>
            {queueMode ? <div className="queue-heading"><ListOrdered size={21}/><strong>{state.giftSort?'按本轮礼物金额排队':state.queueOrderEdited?'当前排队顺序':'按弹幕顺序排队'}</strong><span>{state.participants.length} / {state.queueLimit}</span></div> : <Button tone="gold" className="overlay-draw" disabled={Boolean(busy) || !state.ready || !state.user || state.participants.length === 0} onClick={() => draw(1)}><Gift size={20}/>{busy === 'lottery:draw' ? '正在揭晓…' : '抽取一位'}<Sparkles size={17}/></Button>}
            <Button className="overlay-restart" disabled={Boolean(busy) || !state.user || !state.keyword} onClick={() => command('lottery:restart')}>开始收集弹幕</Button>
            <Button className="overlay-restart" disabled={active ? busy === 'lottery:stop' : Boolean(busy) || !state.ready || !state.user} onClick={() => command(active ? 'lottery:stop' : 'lottery:resume')}>{active ? <Pause size={14}/> : <Play size={14}/>}{active ? '暂停收集' : '继续收集'}</Button>
            <p className="overlay-word">{state.keyword ? <>发送 <b>{state.keyword}</b> {queueMode ? '加入排队' : '参与抽奖'}</> : '等待主界面设置抽奖'}</p>
        </section>
        {!queueMode && <section aria-live="polite" className={`overlay-winner ${state.latestWinners.length ? 'has-winner' : ''}`}>
            {state.latestWinners.length ? <><div className="winner-kicker"><Crown size={14}/>恭喜中奖 · 第 {state.drawNumber} 次抽取</div>
                {state.latestWinners.map(person => <div key={person.uid}><strong className="winner-name" title={person.name}>{person.name}</strong><span className="winner-uid">UID {person.uid}</span></div>)}</> : <><Crown size={26}/><strong>尚未抽奖</strong><span>中奖者将在这里置顶展示</span></>}
        </section>}
        <section className="overlay-list"><div className="list-scroll-controls"><button className="action quiet" aria-pressed={listScroll.enabled} onClick={listScroll.toggle}>{listScroll.enabled ? "自动滚动：开" : "自动滚动：关"}</button></div><div className="overlay-list-title"><span><Users size={15}/>{queueMode ? '当前队列' : '成功参与'}</span><b>{state.participants.length}<small>{queueMode ? ' 人等待' : ' 人待抽'}</small></b></div>
            <div className="overlay-list-scroll" ref={listScroll.ref} onWheel={listScroll.pause} onPointerDown={listScroll.pause}>{state.participants.length ? state.participants.map((person, index) => <Person key={person.uid} person={person} index={index} {...metrics(person)} onRemove={() => setRemoveTarget(person)}/>) : <Empty icon={<Ticket size={24}/>} title={state.total ? '当前名单为空' : '等待第一位参与者'} text={queueMode ? '空位按后续弹幕顺序补入' : state.total ? '点击开始收集，开启下一轮' : '符合条件的弹幕会自动加入'}/>}</div>
        </section>
        <footer className="overlay-footer"><ShieldCheck size={12}/>{queueMode&&state.queueOrderEdited?'主持人已调整队列顺序':'同一账号，每轮一次参与'}<span>共 {state.total} 人参与</span></footer>{managementDialog}{toast}
    </main>;

    return <main className="studio-shell" style={style}>
        <header className="studio-header"><div className="brand"><div><strong>B站直播</strong><small>弹幕抽奖与排队</small></div></div>
            <div className="header-actions"><About/><Button onClick={() => setAppearance(!appearance)}><ImageIcon size={16}/>背景</Button>
                <AccountActions user={state.user} busy={Boolean(busy)} onLogin={()=>void command('login:open','')} onRefresh={()=>void command('login:refresh')}/>
            </div>{appearance && themePanel}
        </header>
        <section className="studio-intro"><AccountStatus user={state.user} loginStatus={state.loginStatus}/>
            <Button tone="purple" disabled={!state.ready || !state.user || Boolean(busy)} onClick={() => command('overlay:open')}><MonitorUp size={18}/>{state.overlayOpen ? '显示直播小窗' : '打开直播小窗'}<ArrowUpRight size={15}/></Button>
        </section>
        <section className="stats-strip"><div><span className="stat-icon blue"><Radio size={20}/></span><span><small>直播间</small><strong>{state.ready ? state.roomId : room || '未设置'}</strong></span><span className={`connection-pill ${state.connection}`}><i/>{state.connection === 'connected' ? '正在获取弹幕' : state.connection === 'connecting' ? '正在连接弹幕' : '弹幕收集暂停'}</span></div>
            <div><span className="stat-icon purple"><Users size={20}/></span><span><small>成功参与</small><strong>{state.total}<em> 人</em></strong></span></div>
            <div><span className="stat-icon gold"><Crown size={20}/></span><span><small>{queueMode ? '已移出队列' : '已中奖'}</small><strong>{queueMode ? state.removedCount : state.winners.length}<em> 位</em></strong></span></div>
        </section>
        <section className="workspace-grid">
            <aside className="glass-panel settings-panel"><div className="panel-heading"><span><Ticket size={17}/>本轮设置</span><small>01 / SETUP</small></div>
                <div className="settings-fields"><div className="mode-tabs"><Button disabled={locked} className={mode === 'lottery' ? 'selected' : ''} onClick={() => {setMode('lottery'); setTab('participants');}}><Gift size={14}/>抽奖</Button><Button disabled={locked} className={mode === 'queue' ? 'selected' : ''} onClick={() => {setMode('queue'); setTab('participants');}}><ListOrdered size={14}/>排队</Button></div>
                {mode === 'queue' && <div className="queue-limit"><label>等待人数上限<input aria-label="排队人数上限" type="number" min="1" max="10000" value={queueLimit} onChange={event => setQueueLimit(Number(event.target.value))}/></label>{state.mode === 'queue' && state.ready && <Button disabled={Boolean(busy) || queueLimit === state.queueLimit} onClick={() => command('queue:limit',queueLimit)}>应用</Button>}<small>满员时不再入列；移除后开放空位，新观众需重新发送关键词。</small></div>}

                <label className="field-label">直播间号<input aria-label="直播间号" disabled={locked} value={room} onChange={event => {
                    const value=parseRoom(event.target.value);
                    if(value===null){setNotice('请输入数字房间号，或完整的 live.bilibili.com 直播链接');return;}
                    setRoom(value);if(!saveRoom(localStorage,value))setNotice('房间号可正常使用，但暂时无法保存到本机');
                }} placeholder="输入房间号或粘贴直播链接"/></label>
                <label className="field-label">参与互动词<input aria-label="参与互动词" disabled={locked} value={word} onChange={event => setWord(event.target.value)} placeholder="例如：今晚好运" maxLength={100}/><small>弹幕包含互动词，即可匹配</small></label>
                <fieldset className="rule-options" disabled={locked}><legend>粉丝牌要求</legend>
                    <label className={rule === 'off' ? 'checked' : ''}><input type="radio" name="medal" checked={rule === 'off'} onChange={() => setRule('off')}/><Users size={15}/><span>所有观众<small>不限粉丝牌</small></span><i>{rule === 'off' && <Check size={12}/>}</i></label>
                    <label className={rule === 'wear' ? 'checked' : ''}><input type="radio" name="medal" checked={rule === 'wear'} onChange={() => setRule('wear')}/><ShieldCheck size={15}/><span>本直播间粉丝<small>需佩戴本房间粉丝牌</small></span><i>{rule === 'wear' && <Check size={12}/>}</i></label>
                </fieldset></div>
                <div className="settings-actions"><Button tone="blue" disabled={Boolean(busy) || !state.user || !room || !word.trim()} onClick={async () => {if(await command('lottery:start', {roomId: room, keyword: word, medalRule: rule, mode, queueLimit})) setTab('participants');}}>开始收集弹幕</Button>
                    <p>{!state.user ? '先登录自己的 B 站账号，再开始收集' : '再次开始将保存本轮历史，并开启新一轮'}</p>
                </div>
                <Button className="reset-button" disabled={active ? busy === 'lottery:stop' : Boolean(busy) || !state.ready || !state.user} onClick={() => command(active ? 'lottery:stop' : 'lottery:resume')}>{active ? <Pause size={14}/> : <Play size={14}/>}{active ? '暂停收集' : '继续收集'}</Button>
                <div className="advanced-settings"><button ref={advancedButton} className="action advanced-trigger" onClick={openAdvanced}><SlidersHorizontal size={14}/><span>高级设置</span><small>{(queueMode?state.giftSort:state.compensation.enabled)?'已开启':'未开启'}</small><ChevronRight size={14}/></button></div>
                {createPortal(<dialog ref={advancedDialog} className="advanced-dialog" aria-labelledby="advanced-title"><header><h2 id="advanced-title">{queueMode?'礼物排序':'未中奖补偿'}</h2><Button aria-label="关闭高级设置" onClick={()=>advancedDialog.current?.close()}><X size={18}/></Button></header>{queueMode ? <div className="feature-setting"><Button className="quiet feature-toggle" aria-pressed={state.giftSort} disabled={Boolean(busy)} onClick={()=>command('queue:gift-sort',!state.giftSort)}>礼物金额排序：{state.giftSort?'开':'关'}</Button><small>仅在开启期间累计入队后的付费礼物；同金额按入队时间。关闭后可手动插队。</small></div> : <div className="feature-setting"><Button className="quiet feature-toggle" aria-pressed={state.compensation.enabled} disabled={Boolean(busy)} onClick={()=>command('weights:compensation',{enabled:!state.compensation.enabled,increment:state.compensation.increment})}>未中奖自动增加权重：{state.compensation.enabled?'开':'关'}</Button><label>每轮增加<input type="number" aria-label="未中奖权重增量" min="0.01" max="10000" step="0.01" value={increment} onChange={e=>setIncrement(Number(e.target.value))}/></label><Button disabled={Boolean(busy)||increment===state.compensation.increment} onClick={()=>command('weights:compensation',{enabled:state.compensation.enabled,increment})}>应用增量</Button><small>每次点击抽奖结算一次，写入专属名单。中奖者的 UID 和同名规则会删除。</small></div>}</dialog>,document.body)}
            </aside>
            <section className="glass-panel feed-panel"><div className="panel-heading"><span><MessageCircle size={17}/>实时弹幕</span><small><span className={`live-dot ${active ? 'on' : ''}`}/> LIVE</small></div>
                <div ref={feed} className="panel-scroll feed-scroll" onScroll={() => {if (feed.current) autoScroll.current = feed.current.scrollHeight - feed.current.scrollTop - feed.current.clientHeight < 60;}}>
                    {messages.length ? messages.map((message, index) => <article className="chat-row" key={index}><div className="chat-avatar">{message.name?.slice(0, 1) || '?'}</div><div><header><strong>{message.name}</strong>{message.medal && <span className="medal">{message.medal.name}<b>{message.medal.level}</b></span>}</header><p>{message.content}</p></div></article>) : <Empty icon={<MessageCircle size={30}/>} title="暂无弹幕" text="开始收集后，直播间弹幕将在这里实时出现"/>}
                </div><div className="panel-footnote"><ShieldCheck size={12}/>仅有效 UID 可参与 · 保留最近 2000 条弹幕</div>
            </section>
            <section className="glass-panel people-panel"><div className="panel-heading"><span><Users size={17}/>{queueMode ? '排队名单' : '抽奖名单'}</span><small>同步直播小窗</small></div>
                <div className="list-scroll-controls">{!queueMode && <WeightSettings rules={state.weightRules} medalRequired={rule==='wear'}/>}<button className="action quiet" aria-pressed={listScroll.enabled} onClick={listScroll.toggle}>{listScroll.enabled ? "自动滚动：开" : "自动滚动：关"}</button></div><div className="list-tabs"><button className={tab === 'participants' ? 'selected' : ''} onClick={() => setTab('participants')}>{queueMode ? '当前队列' : '待抽观众'} <b>{state.participants.length}</b></button>{!queueMode && <button className={tab === 'winners' ? 'selected' : ''} onClick={() => setTab('winners')}>中奖名单 <b>{state.winners.length}</b></button>}</div>
                {!queueMode && <section className="winner-banner"><span className="winner-banner-icon"><Crown size={24}/></span><div><small>{state.latestWinners.length ? `第 ${state.drawNumber} 次抽取 · 恭喜中奖` : '本轮中奖者'}</small><strong>{state.latestWinners.length ? state.latestWinners.map(person => person.name).join('、') : '尚未抽奖'}</strong></div><Button disabled={!state.winners.length || Boolean(busy)} onClick={async () => {if (await command('lottery:copy')) setNotice('中奖名单已复制');}}><Copy size={15}/>复制中奖名单</Button></section>}
                <div className="panel-scroll" ref={listScroll.ref} onWheel={listScroll.pause} onPointerDown={listScroll.pause}>{(tab === 'participants' ? state.participants : state.winners).length ? (tab === 'participants' ? state.participants : state.winners).map((person, index) => renderManagedPerson(person,index)) : <Empty icon={tab === 'participants' ? <Ticket size={30}/> : <Crown size={30}/>} title={tab === 'participants' ? '暂无参与者' : '暂无中奖者'} text={tab === 'participants' ? '符合关键词和粉丝牌条件的观众自动加入' : '点击抽取，迎接本轮中奖者'}/>}</div>
                {!queueMode && <><div className="draw-controls"><label>抽取<input aria-label="抽取人数" type="number" min="1" max={Math.max(1, state.participants.length)} value={count} onChange={event => setCount(Number(event.target.value))}/>位</label><Button tone="gold" disabled={Boolean(busy) || !state.user || !state.ready || !Number.isInteger(count) || count < 1 || count > state.participants.length} onClick={() => draw(count)}><Gift size={17}/>抽取<ChevronRight size={14}/></Button></div>
                <p className="draw-note">点击抽取将暂停收集 · 已中奖者不重复抽取</p></>}
                <p className="management-note">{queueMode ? `${state.giftSort?'付费礼物累计金额降序，同额按入队时间':'拖动左侧手柄调整顺序，也可用上下箭头'} · ${state.participants.length}/${state.ready ? state.queueLimit : queueLimit} 人` : 'UID 规则优先于昵称规则和身份档位 · 仍可逐人修改权重'}</p>
            </section>
        </section>

        <footer className="studio-footer"><span><Sparkles size={12}/>抽奖姬</span><span>本地随机抽取 · UID 去重 · v{version}</span></footer>
        {managementDialog}{toast}
    </main>;
}

export default function App(){
    const [sharedStyle,setSharedStyle]=useState<CSSProperties>({});
    const [platform,setPlatform]=useState<'bilibili-live'|'bilibili-video'>('bilibili-live');
    if(isOverlay)return <LiveApp/>;
    return <div className="platform-layout"><nav className="platform-sidebar" aria-label="平台功能"><img src="./icon.png" alt="抽奖姬"/><strong>抽奖姬</strong><button className={platform==='bilibili-live'?'selected':''} onClick={()=>setPlatform('bilibili-live')}><Radio size={19}/>B站直播</button><button className={platform==='bilibili-video'?'selected':''} onClick={()=>setPlatform('bilibili-video')}><Play size={19}/>B站视频</button><History initialSource={platform==='bilibili-video'?'video':'live'}/></nav><div className="platform-content" style={sharedStyle}><div hidden={platform!=='bilibili-live'}><LiveApp onStyleChange={setSharedStyle}/></div><div hidden={platform!=='bilibili-video'}><VideoLottery/></div></div></div>;
}




