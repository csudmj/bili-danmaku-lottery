import {useEffect,useState} from 'react';
import QRCode from 'qrcode';
import {Info, X, Download, ExternalLink, RefreshCw, Wrench} from 'lucide-react';
import {PROJECT, type UpdateState} from '../../shared/project';

export function About() {
    const [open,setOpen]=useState(false),[qr,setQr]=useState(''),[version,setVersion]=useState(''),[error,setError]=useState('');
    const [update,setUpdate]=useState<UpdateState>({status:'idle'});
    useEffect(()=>{
        let alive=true;
        void QRCode.toDataURL(PROJECT.url,{width:220,margin:2,errorCorrectionLevel:'M'}).then(v=>{if(alive)setQr(v);}).catch(()=>{if(alive)setError('二维码生成失败，请使用下方链接');});
        const receive=(_event:unknown,state:UpdateState)=>{if(alive)setUpdate(state);};
        window.ipcRenderer.on('update-state',receive);
        // Main-process startup registers the updater asynchronously.
        let attempts=0;
        const load=async()=>{try{const result=await window.ipcRenderer.invoke('app:info');if(alive && result.ok){setVersion(result.data.version);setUpdate(result.data.update);return;}}catch{}if(alive && ++attempts<5)timer=setTimeout(load,1500);};
        let timer:ReturnType<typeof setTimeout>;void load();
        return()=>{alive=false;clearTimeout(timer);window.ipcRenderer.removeListener('update-state',receive);};
    },[]);
    const act=async(channel:string,value?:string)=>{
        setError('');try{const result=await window.ipcRenderer.invoke(channel,value);if(!result.ok)setError(result.message||'操作失败');}catch{setError('暂时无法执行此操作，请稍后重试');}
    };
    const busy=['checking','downloading'].includes(update.status);
    const hint:Record<UpdateState['status'],string>={idle:'启动后自动检查，也可手动检查',checking:'正在检查 GitHub 正式版本…',available:`发现新版本 ${update.version}`,current:'当前已是最新正式版',downloading:`正在下载 ${Math.round(update.percent||0)}%`,downloaded:`${update.version} 已下载，等待安装`,error:'更新检查或下载未完成',unsupported:'当前为免安装版或开发环境'};
    return <><button className={`action ${['available','downloaded'].includes(update.status)?'blue':'quiet'}`} onClick={()=>setOpen(true)}><Info size={16}/>{update.status==='available'?'发现更新':update.status==='downloaded'?'安装更新':'关于 / 更新'}</button>
        {open && <div className="modal-scrim"><section className="about-dialog" role="dialog" aria-modal="true" aria-labelledby="about-title">
            <div className="about-heading"><h2 id="about-title">关于抽奖姬</h2><button className="action" aria-label="关闭关于" onClick={()=>setOpen(false)}><X size={18}/></button></div>
            <p>开发者：<strong>{PROJECT.developer}</strong> · v{version||'读取中'}</p>
            <p>面向 B 站直播的弹幕抽奖、顺序排队与直播展示工具。</p>
            <div className="about-project">{qr && <img src={qr} alt="GitHub 仓库链接二维码"/>}<div><strong>项目主页</strong><button className="repo-link" onClick={()=>act('app:link','repository')}>{PROJECT.url}</button><p>扫码或点击链接，欢迎提交 Issue 和 PR。</p><div className="about-links">{(['repository','issues','pulls'] as const).map((key,i)=><button className="action quiet" key={key} onClick={()=>act('app:link',key)}><ExternalLink size={13}/>{['GitHub','Issues','PR'][i]}</button>)}</div></div></div>
            <div className="update-box"><strong>{hint[update.status]}</strong>{update.message && <p>{update.message}</p>}{update.status==='downloading' && <progress max="100" value={update.percent||0}/>}
                <div className="about-links"><button className="action blue" disabled={busy||update.status==='unsupported'||update.status==='downloaded'} onClick={()=>act('update:check')}><RefreshCw size={14}/>检查更新</button>
                    {update.status==='available' && <button className="action gold" onClick={()=>act('update:download')}><Download size={14}/>下载更新</button>}
                    {update.status==='downloaded' && <button className="action gold" onClick={()=>act('update:install')}>安装并重启</button>}
                    <button className="action quiet" onClick={()=>act('app:link','releases')}>打开下载页</button></div>
                <p>安装版支持自动检查；下载与安装由你确认。安装前请停止收集并保存本轮结果。</p>
            </div>
            <button className="action quiet" onClick={()=>act('app:diagnostics')}><Wrench size={14}/>导出诊断信息</button><p className="about-error" role="status">{error}</p>
        </section></div>}
    </>;
}
