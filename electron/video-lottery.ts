import {LotteryPool,type PersonalWeight} from './lottery.ts';
import {loadVideoInfo,loadVideoDanmu,type VideoRequest} from './video-source.ts';
import type {VideoInfo,VideoProgress} from '../shared/video.ts';
export class VideoLottery {
    readonly pool=new LotteryPool();
    info:VideoInfo|null=null;
    status:'idle'|'loading'|'ready'|'error'='idle';
    error='';keyword='';matched=0;read=0;
    progress:VideoProgress|null=null;
    private task:AbortController|null=null;
    private owner=0;
    private request:VideoRequest;
    private changed:()=>void;
    constructor(request:VideoRequest,changed:()=>void){this.request=request;this.changed=changed;}
    snapshot(){return {...this.pool.snapshot(),info:this.info,status:this.status,error:this.error,keyword:this.keyword,matched:this.matched,read:this.read,progress:this.progress};}
    reset(){this.task?.abort();this.task=null;this.pool.reset();this.info=null;this.status='idle';this.error='';this.progress=null;this.matched=0;this.read=0;this.owner=0;this.changed();}
    accountChanged(uid:number){if(this.owner&&this.owner!==uid)this.reset();}
    async prepare(value:unknown,owner:number){
        if(this.status==='loading'||this.pool.snapshot().total)throw Error('请先重置本轮，再更换视频');
        this.reset();this.owner=owner;this.status='loading';const task=new AbortController();this.task=task;this.changed();
        try{const info=await loadVideoInfo(value,owner,this.request,task.signal);task.signal.throwIfAborted();this.info=info;this.status='idle';return info;}
        catch(error){if(this.task===task){this.status='error';this.error=error instanceof Error?error.message:'视频读取失败';}throw error;}
        finally{if(this.task===task){this.task=null;this.changed();}}
    }
    async collect(value:unknown,owner:number,weights:()=>PersonalWeight[]){
        const input=value as {keyword:string;cids:number[]};
        if(!this.info||this.owner!==owner)throw Error('请先读取当前账号的视频');
        if(this.status==='loading'||this.pool.snapshot().total)throw Error('请先重置本轮');
        if(!input||typeof input.keyword!=='string'||!input.keyword.trim()||input.keyword.length>100||!Array.isArray(input.cids))throw Error('请填写关键词并选择分P');
        this.keyword=input.keyword.trim();this.error='';this.status='loading';this.progress=null;
        const task=new AbortController();this.task=task;this.changed();
        try{
            const rows=await loadVideoDanmu(this.info,input.cids,this.request,task.signal,p=>{this.progress=p;this.changed();});
            task.signal.throwIfAborted();this.pool.setPersonalWeights(weights());
            // No partial pool is ever committed on failure. One UID gets one entry across all selected parts.
            const matching=rows.filter(row=>row.content.includes(this.keyword));
            for(const row of matching)this.pool.add({uid:row.uid,name:row.name});
            this.read=rows.length;this.matched=matching.length;this.status='ready';
        }catch(error){if(this.task===task){this.status='error';this.error=error instanceof Error?error.message:'弹幕读取失败';}throw error;}
        finally{if(this.task===task){this.task=null;this.changed();}}
    }
    ensureReady(owner:number){if(this.status!=='ready'||owner!==this.owner)throw Error('请先完整读取当前账号的视频弹幕');}
}
