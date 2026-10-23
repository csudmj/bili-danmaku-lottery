import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,rmSync,readFileSync} from 'node:fs';
import path from 'node:path';
import {LotteryPool,DEFAULT_WEIGHTS} from '../electron/lottery.ts';
import {loadDefaultWeights,applySavedWeights} from '../electron/default-weights.ts';

test('default weights survive new pools and round resets; explicit reset persists independently',()=>{
 mkdirSync('.build-cache',{recursive:true});const dir=mkdtempSync(path.resolve('.build-cache/weight-settings-'));
 try{
  const live=path.join(dir,'live.json'),video=path.join(dir,'video.json'),pool=new LotteryPool();
  assert.deepEqual(loadDefaultWeights(live),DEFAULT_WEIGHTS);
  const rules={captain:5,admiral:10,governor:20,fan:2.5,ordinary:1.2};
  applySavedWeights(live,pool,rules,true);pool.reset();
  assert.deepEqual(pool.snapshot().weightRules,rules);
  const restarted=new LotteryPool();restarted.setWeightRules(loadDefaultWeights(live),false);
  assert.deepEqual(restarted.snapshot().weightRules,rules);
  applySavedWeights(video,new LotteryPool(),{...DEFAULT_WEIGHTS,ordinary:3},true);
  assert.throws(()=>applySavedWeights(live,pool,{...rules,fan:0},true));
  assert.deepEqual(loadDefaultWeights(live),rules);
  const blocked=path.join(dir,'file');applySavedWeights(blocked,new LotteryPool(),DEFAULT_WEIGHTS,false);
  assert.throws(()=>applySavedWeights(path.join(blocked,'fail.json'),pool,DEFAULT_WEIGHTS,true));
  assert.deepEqual(pool.snapshot().weightRules,rules);
  applySavedWeights(live,pool,rules,false,true);
  assert.deepEqual(loadDefaultWeights(live),DEFAULT_WEIGHTS);
  assert.equal(loadDefaultWeights(video).ordinary,3);
  assert.equal(JSON.parse(readFileSync(video,'utf8')).ordinary,3);
 }finally{rmSync(dir,{recursive:true,force:true});}
});
