import {LogIn,RefreshCw} from 'lucide-react';
import type {LotterySnapshot} from '../../electron/lottery';
type AccountState=Pick<LotterySnapshot,'user'|'loginStatus'>;
export function AccountActions({user,busy,onLogin,onRefresh}:Pick<AccountState,'user'>&{busy:boolean;onLogin:()=>void;onRefresh:()=>void}){
 return <><button className="action quiet" title="刷新登录状态" aria-label="刷新登录状态" disabled={busy} onClick={onRefresh}><RefreshCw size={16}/></button><button className="action blue" disabled={busy} onClick={onLogin}><LogIn size={16}/>{user?'切换账号':'登录 B 站'}</button></>;
}
export function AccountStatus({user,loginStatus}:AccountState){
 const label=loginStatus==='checking'?'正在检查 B 站登录状态':loginStatus==='error'?'登录状态检查失败，请刷新':user?`已登录 B 站 · ${user.name}`:'未登录 B 站 · 请先登录';
 return <div className={`login-status ${loginStatus}`} role="status"><LogIn size={23}/><strong>{label}</strong></div>;
}
