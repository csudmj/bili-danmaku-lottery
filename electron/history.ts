import {existsSync,readFileSync,mkdirSync,writeFileSync,renameSync} from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import type {LotteryPool,Participant} from './lottery.ts';
const validPerson=(p:unknown):boolean=>{if(!p||typeof p!=='object')return false;const v=p as Record<string,unknown>;return Number.isSafeInteger(v.uid)&&(v.uid as number)>0&&typeof v.name==='string';};
const validRound=(r:HistoryRound):boolean=>Boolean(r&&typeof r.id==='string'&&['live','video'].includes(r.source)&&['lottery','queue'].includes(r.mode)&&typeof r.target==='string'&&typeof r.keyword==='string'&&typeof r.startedAt==='string'&&Number.isFinite(Date.parse(r.startedAt))&&Array.isArray(r.people)&&r.people.every(p=>validPerson(p)&&['pending','winner','removed'].includes(p.status))&&Array.isArray(r.order)&&r.order.every(uid=>Number.isSafeInteger(uid)&&uid>0)&&Array.isArray(r.draws)&&r.draws.every(d=>d&&Number.isSafeInteger(d.number)&&Array.isArray(d.winners)&&d.winners.every(validPerson)));
type PoolState=ReturnType<LotteryPool['snapshot']>;
export interface HistoryPerson extends Participant {status:'pending'|'winner'|'removed'}
export interface HistoryRound {id:string;source:'live'|'video';mode:'lottery'|'queue';target:string;keyword:string;startedAt:string;updatedAt:string;endedAt?:string;people:HistoryPerson[];order:number[];draws:{number:number;at:string;winners:Participant[]}[];giftSort:boolean}
export class HistoryStore {
    private rounds:HistoryRound[]=[];
    private active=new Map<string,string>();
    private signatures=new Map<string,string>();
    private timer:ReturnType<typeof setTimeout>|undefined;
    private dirty=false;
    error='';
    private file:string;
    constructor(file:string){
        this.file=file;
        try{if(existsSync(file)){const saved=JSON.parse(readFileSync(file,'utf8'));if(!Array.isArray(saved)||saved.length>40||saved.some(r=>!validRound(r)))throw Error('历史记录格式异常');this.rounds=saved; if(['live','video'].some(source=>saved.filter((r:HistoryRound)=>r.source===source).length>20))throw Error('历史记录数量异常');}}
        catch{this.error='历史记录读取失败，原文件已保留；本次不会覆盖，请先备份并修复 history.json。';}
    }
    capture(source:'live'|'video',target:string,keyword:string,state:PoolState,force=false){
        if(this.error||(!force&&!state.total&&!this.active.has(source)))return;
        const signature=JSON.stringify({target,keyword,state});if(this.signatures.get(source)===signature)return;this.signatures.set(source,signature);
        const now=new Date().toISOString();let round=this.rounds.find(r=>r.id===this.active.get(source));
        if(!round){round={id:randomUUID(),source,mode:state.mode,target,keyword,startedAt:now,updatedAt:now,people:[],order:[],draws:[],giftSort:state.giftSort};this.active.set(source,round.id);this.rounds.unshift(round);let count=0;this.rounds=this.rounds.filter(r=>r.source!==source||++count<=20);}
        const people=new Map(round.people.map(p=>[p.uid,{...p,status:'removed' as HistoryPerson['status']}]));
        for(const p of state.participants)people.set(p.uid,{...p,status:'pending'});
        for(const p of state.winners)people.set(p.uid,{...p,status:'winner'});
        round.people=[...people.values()];round.order=state.participants.map(p=>p.uid);round.updatedAt=now;round.giftSort=state.giftSort;
        if(state.drawNumber&&!round.draws.some(d=>d.number===state.drawNumber))round.draws.push({number:state.drawNumber,at:now,winners:structuredClone(state.latestWinners)});
        this.dirty=true;if(!this.timer){this.timer=setTimeout(()=>{this.timer=undefined;this.flush();},500);this.timer.unref();}
    }
    finish(source:'live'|'video'){const round=this.rounds.find(r=>r.id===this.active.get(source));if(round){round.endedAt=new Date().toISOString();this.dirty=true;}this.active.delete(source);this.signatures.delete(source);this.flush();}
    flush(){if(this.timer){clearTimeout(this.timer);this.timer=undefined;}if(!this.dirty||this.error)return;
        try{mkdirSync(path.dirname(this.file),{recursive:true});writeFileSync(this.file+'.tmp',JSON.stringify(this.rounds),'utf8');renameSync(this.file+'.tmp',this.file);this.dirty=false;}
        catch{this.error='历史记录保存失败，请检查磁盘空间及个人数据目录权限。当前记录仍保留在内存中。';}
    }
    list(){this.flush();return {rounds:structuredClone(this.rounds),error:this.error};}
}
