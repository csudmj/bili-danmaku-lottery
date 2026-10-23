import {test} from 'node:test';
import assert from 'node:assert/strict';
import {loadVideoInfo,loadVideoDanmu} from '../electron/video-source.ts';
import {VideoLottery} from '../electron/video-lottery.ts';
import {videoBvid} from '../shared/video.ts';
const info={bvid:'BV1Na4Q64Eos',title:'测试视频',ownerUid:1,parts:[{cid:2,page:1,title:'P1'},{cid:3,page:2,title:'P2'}]};
const row=(id,uid=1,cid=2)=>({id_str:String(id),mid:uid,uname:'观众'+uid,msg:'关键词',oid:cid,ctime:1700000000});
const payload=(rows,total=rows.length,num=1)=>({code:0,data:{result:rows,page:{total,num}}});
const signal=()=>new AbortController().signal;
test('video identity requires exact Bilibili URL and owning UID',async()=>{
 assert.equal(videoBvid('https://www.bilibili.com/video/BV1Na4Q64Eos/?a=1'),'BV1Na4Q64Eos');
 assert.throws(()=>videoBvid('https://evil.test/video/BV1Na4Q64Eos'));
 const request=async()=>({code:0,data:{title:'视频',owner:{mid:1},pages:[{cid:2,page:1,part:'P1'}]}});
 assert.equal((await loadVideoInfo(info.bvid,1,request,signal())).ownerUid,1);
 await assert.rejects(loadVideoInfo(info.bvid,9,request,signal()),/自己投稿/);
});
test('video pagination reads both pages and rejects caps, missing identity and drift',async()=>{
 const rows=Array.from({length:51},(_,i)=>row(i+1));
 const request=async url=>{const n=Number(new URL(url).searchParams.get('pn'));return payload(rows.slice((n-1)*50,n*50),51,n);};
 assert.equal((await loadVideoDanmu(info,[2],request,signal())).length,51);
 for(const bad of [payload([row(1)],1000),payload([row(1)],10000),payload([{...row(1),mid:undefined}]),payload([row(1)],2),payload([row(1),row(1)])])await assert.rejects(loadVideoDanmu(info,[2],async()=>bad,signal()));
 await assert.rejects(loadVideoDanmu(info,[2],async url=>new URL(url).searchParams.get('pn')==='1'?payload(rows.slice(0,50),51):payload([row(51)],52,2),signal()),/发生变化/);
});
test('video pool commits only complete data, deduplicates UID across parts and keeps live rules separate',async()=>{
 const request=async url=>url.includes('web-interface')?{code:0,data:{title:'视频',owner:{mid:1},pages:[{cid:2,page:1,part:'P1'},{cid:3,page:2,part:'P2'}]}}:payload([row('90071992547409999',5,Number(new URL(url).searchParams.get('oid')))]);
 const controller=new VideoLottery(request,()=>{});await controller.prepare(info.bvid,1);await controller.collect({keyword:'关键词',cids:[2,3]},1,()=>[{uid:5,name:'备注',weight:3}]);
 assert.equal(controller.snapshot().participants.length,1);assert.equal(controller.snapshot().matched,2);assert.equal(controller.snapshot().participants[0].weight,3);
 controller.accountChanged(2);assert.equal(controller.snapshot().total,0);
});
test('video cancel prevents a late response from committing',async()=>{
 let resolve;const pending=new Promise(r=>resolve=r);
 const controller=new VideoLottery(async()=>pending,()=>{});const task=controller.prepare(info.bvid,1);controller.reset();resolve({code:0,data:{title:'视频',owner:{mid:1},pages:[{cid:2,page:1,part:'P1'}]}});await assert.rejects(task);assert.equal(controller.snapshot().info,null);assert.equal(controller.status,'idle');
});
