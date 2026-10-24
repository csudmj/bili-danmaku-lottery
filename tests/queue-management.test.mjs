import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,rmSync} from 'node:fs';
import path from 'node:path';
import {LotteryPool} from '../electron/lottery.ts';
import {HistoryStore} from '../electron/history.ts';
import {loadLivePreferences,saveLivePreferences} from '../electron/live-preferences.ts';
const person=uid=>({uid,name:`观众${uid}`});
test('removed reentry follows current policy, preserves unique totals and never revives winners',()=>{
 const pool=new LotteryPool();pool.add(person(1));pool.remove(1);
 assert.equal(pool.add(person(1)),false);pool.setBlockRemoved(false);
 assert.equal(pool.add(person(1)),true);assert.equal(pool.snapshot().total,1);
 pool.draw(1,()=>0);assert.equal(pool.add(person(1)),false);
 pool.reset();assert.equal(pool.snapshot().blockRemoved,false);
 pool.add(person(2));pool.remove(2);pool.setBlockRemoved(true);assert.equal(pool.add(person(2)),false);
});
test('queue skip frees capacity, blocks automatic reentry, restores at tail or gift rank',()=>{
 const pool=new LotteryPool();pool.configure('queue',2);pool.setBlockRemoved(false);
 pool.add(person(1));pool.add(person(2));pool.skip(1);
 assert.deepEqual(pool.snapshot().participants.map(p=>p.uid),[2]);assert.equal(pool.add(person(1)),false);
 pool.add(person(3));assert.throws(()=>pool.restoreSkipped(1));assert.equal(pool.snapshot().skipped.length,1);
 pool.remove(3);pool.restoreSkipped(1);assert.deepEqual(pool.snapshot().participants.map(p=>p.uid),[2,1]);
 assert.equal(pool.snapshot().skipped.length,0);pool.setGiftSort(true);pool.addGift(1,1000,'g1');
 assert.equal(pool.snapshot().participants[0].uid,1);pool.skip(1);pool.restoreSkipped(1);
 assert.equal(pool.snapshot().participants[0].uid,1);assert.equal(pool.snapshot().participants[0].giftAmount,1000);
 pool.skip(1);pool.reset();assert.equal(pool.snapshot().skipped.length,0);assert.equal(pool.snapshot().giftSort,true);
});
test('preferences and skipped history survive fresh store instances',()=>{
 mkdirSync('.build-cache',{recursive:true});const dir=mkdtempSync(path.resolve('.build-cache/queue-preferences-'));
 try{
  const file=path.join(dir,'preferences.json');assert.deepEqual(loadLivePreferences(file),{blockRemoved:true,giftSort:false});
  saveLivePreferences(file,{blockRemoved:false,giftSort:true});assert.deepEqual(loadLivePreferences(file),{blockRemoved:false,giftSort:true});
  assert.throws(()=>saveLivePreferences(file,{blockRemoved:'no',giftSort:true}));assert.equal(loadLivePreferences(file).blockRemoved,false);
  const historyFile=path.join(dir,'history.json'),store=new HistoryStore(historyFile),pool=new LotteryPool();pool.configure('queue',2);
  pool.add(person(1));pool.skip(1);store.capture('live','6','',pool.snapshot());store.finish('live');
  assert.equal(new HistoryStore(historyFile).list().rounds[0].people[0].status,'skipped');
 }finally{rmSync(dir,{recursive:true,force:true});}
});
