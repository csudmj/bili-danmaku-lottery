import {test} from 'node:test';import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,rmSync,writeFileSync,readFileSync} from 'node:fs';import path from 'node:path';
import {HistoryStore} from '../electron/history.ts';import {LotteryPool} from '../electron/lottery.ts';
test('history retains removed members, draw rounds and last 20 activities across restart',()=>{
 const base=path.resolve('.build-cache');mkdirSync(base,{recursive:true});const dir=mkdtempSync(path.join(base,'history-test-'));
 try{const file=path.join(dir,'history.json'),history=new HistoryStore(file),pool=new LotteryPool();
 pool.add({uid:1,name:'甲'});pool.add({uid:2,name:'乙'});history.capture('live','123','词',pool.snapshot());
 pool.remove(2);pool.draw(1,()=>0);history.capture('live','123','词',pool.snapshot());history.finish('live');
 const saved=new HistoryStore(file).list().rounds[0];assert.equal(saved.people.find(p=>p.uid===2).status,'removed');assert.equal(saved.draws[0].winners[0].uid,1);
 for(let i=0;i<24;i++){pool.reset();pool.add({uid:1,name:'甲'});history.capture('video',String(i),'词',pool.snapshot());history.finish('video');}
 const recent=new HistoryStore(file).list().rounds;assert.equal(recent.length,21);assert.equal(recent.filter(r=>r.source==='live').length,1);assert.equal(recent.filter(r=>r.source==='video').length,20);assert.equal(recent[0].target,'23');assert.equal(recent[19].target,'4');
 }finally{if(path.dirname(dir)===base)rmSync(dir,{recursive:true,force:true});}
});

test('history records an emptied queue and refuses malformed nested records without overwriting',()=>{
 const base=path.resolve('.build-cache');mkdirSync(base,{recursive:true});const dir=mkdtempSync(path.join(base,'history-test-'));
 try{const file=path.join(dir,'history.json'),history=new HistoryStore(file),pool=new LotteryPool();pool.configure('queue',20);
 pool.add({uid:1,name:'观众'});history.capture('live','1','词',pool.snapshot());pool.remove(1);history.capture('live','1','词',pool.snapshot());history.finish('live');
 assert.equal(new HistoryStore(file).list().rounds[0].people[0].status,'removed');
 const bad='[{"id":"x","source":"video","mode":"lottery","target":"x","keyword":"x","startedAt":"2026-10-22","people":[null],"order":[],"draws":[]}]';writeFileSync(file,bad);
 const broken=new HistoryStore(file);assert.ok(broken.list().error);pool.reset();pool.add({uid:2,name:'另一个'});broken.capture('live','1','词',pool.snapshot());broken.flush();assert.equal(readFileSync(file,'utf8'),bad);
 }finally{if(path.dirname(dir)===base)rmSync(dir,{recursive:true,force:true});}
});
