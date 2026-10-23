import {LotteryPool,type PersonalWeight} from './lottery.ts';
import {loadVideoComments,loadCommentThread} from './comment-source.ts';
import {parseTimeRange,matchesTime,commentRoot,type TimeRange,type VideoSource} from '../shared/video.ts';
import {loadVideoInfo,loadVideoDanmu,type VideoRequest} from './video-source.ts';
import type {VideoInfo,VideoProgress} from '../shared/video.ts';
export class VideoLottery {
    readonly pool=new LotteryPool();
    info:VideoInfo|null=null;
    status:'idle'|'loading'|'ready'|'error'='idle';
    error='';keyword='';matched=0;read=0;
    progress:VideoProgress|null=null;
    source:VideoSource='danmu';range:TimeRange={start:null,end:null};cutoff=0;includeReplies=false;root='';
    private cids:number[]=[];
    private task:AbortController|null=null;
    private owner=0;
    private request:VideoRequest;
    private changed:()=>void;
    constructor(request:VideoRequest,changed:()=>void){this.request=request;this.changed=changed;}
    snapshot(){return {...this.pool.snapshot(),info:this.info,status:this.status,error:this.error,keyword:this.keyword,matched:this.matched,read:this.read,progress:this.progress,source:this.source,range:this.range,cutoff:this.cutoff,includeReplies:this.includeReplies,root:this.root};}
    historyDetails(){return {kind:this.source,start:this.range.start,end:this.range.end,cutoff:this.cutoff,includeReplies:this.includeReplies,root:this.root};}
    reset(){this.task?.abort();this.task=null;this.pool.reset();this.info=null;this.status='idle';this.error='';this.progress=null;this.matched=0;this.read=0;this.owner=0;this.range={start:null,end:null};this.cutoff=0;this.cids=[];this.root='';this.includeReplies=false;this.keyword='';this.changed();}
    accountChanged(uid:number){if(this.owner&&this.owner!==uid)this.reset();}
    async prepare(value:unknown,owner:number){
        if(this.status==='loading'||this.pool.snapshot().total)throw Error('请先重置本轮，再更换视频');
        const input=typeof value==='string'?{video:value,source:'danmu'}:value as {video:unknown;source:VideoSource};
        if(!input||!['danmu','comments'].includes(input.source))throw Error('请选择弹幕或评论抽奖');
        this.reset();this.source=input.source as VideoSource;this.owner=owner;this.status='loading';const task=new AbortController();this.task=task;this.changed();
        try{const info=await loadVideoInfo(input.video,owner,this.request,task.signal,this.source==='danmu');task.signal.throwIfAborted();this.info=info;this.status='idle';return info;}
        catch(error){if(this.task===task){this.status='error';this.error=error instanceof Error?error.message:'视频读取失败';}throw error;}
        finally{if(this.task===task){this.task=null;this.changed();}}
    }
    async collect(value:unknown,owner:number,weights:()=>PersonalWeight[]){
        const input=value as {keyword:string;cids:number[];range?:TimeRange;includeReplies?:boolean;root?:string};
        if(!this.info||this.owner!==owner)throw Error('请先读取视频信息');
        if(this.status==='loading'||this.pool.snapshot().total)throw Error('请先重置本轮');
        if(!input||typeof input.keyword!=='string'||input.keyword.length>100||!Array.isArray(input.cids))throw Error('请选择分P，关键词可留空');
        this.root=input.root?commentRoot(input.root):'';this.range=parseTimeRange(input.range);this.includeReplies=input.includeReplies===true;this.cids=input.cids;this.cutoff=Math.floor(Date.now()/1000);
        if(this.range.start!==null&&this.range.start>(this.range.end??this.cutoff))throw Error('起始时间不能晚于当前截止时间');
        this.keyword=input.keyword.trim();this.error='';this.status='loading';this.progress=null;
        const task=new AbortController();this.task=task;this.changed();
        try{
            const progress=(p:VideoProgress)=>{this.progress=p;this.changed();};
            const rows=this.source==='comments'?await (this.root?loadCommentThread(this.info,this.root,this.request,task.signal,progress):loadVideoComments(this.info,this.includeReplies,this.request,task.signal,progress)):await loadVideoDanmu(this.info,input.cids,this.request,task.signal,progress);
            task.signal.throwIfAborted();this.pool.setPersonalWeights(weights());
            // No partial pool is ever committed on failure. One UID gets one entry across all selected parts.
            const matching=rows.filter(row=>row.content.trim()&&row.content.includes(this.keyword)&&matchesTime(row.ctime,this.range,this.cutoff));
            for(const row of matching)this.pool.add({uid:row.uid,name:row.name});
            this.read=rows.length;this.matched=matching.length;this.status='ready';
        }catch(error){if(this.task===task){this.status='error';this.error=error instanceof Error?error.message:'弹幕读取失败';}throw error;}
        finally{if(this.task===task){this.task=null;this.changed();}}
    }
    async refreshForDraw(owner:number,weights:()=>PersonalWeight[]) {
        this.ensureReady(owner);
        if(this.range.end!==null)return;
        const cutoff=Math.floor(Date.now()/1000),task=new AbortController();this.task=task;this.status='loading';this.error='';this.changed();
        try {
            const progress=(p:VideoProgress)=>{this.progress=p;this.changed();};
            const rows=this.source==='comments'?await (this.root?loadCommentThread(this.info!,this.root,this.request,task.signal,progress):loadVideoComments(this.info!,this.includeReplies,this.request,task.signal,progress)):await loadVideoDanmu(this.info!,this.cids,this.request,task.signal,progress);
            task.signal.throwIfAborted();
            const matching=rows.filter(row=>row.content.trim()&&row.content.includes(this.keyword)&&matchesTime(row.ctime,this.range,cutoff));
            const eligible=new Set(matching.map(row=>row.uid));
            this.pool.setPersonalWeights(weights());
            for(const person of this.pool.snapshot().participants)if(!eligible.has(person.uid))this.pool.remove(person.uid);
            for(const row of matching)this.pool.add({uid:row.uid,name:row.name});
            this.cutoff=cutoff;this.read=rows.length;this.matched=matching.length;this.status='ready';
        } catch(error){if(this.task===task){this.status='ready';this.error=error instanceof Error?error.message:'更新名单失败，本次未抽奖';}throw error;}
        finally{if(this.task===task){this.task=null;this.changed();}}
    }
    ensureReady(owner:number){if(this.status!=='ready'||owner!==this.owner)throw Error('请先完整读取视频参与名单');}
}
