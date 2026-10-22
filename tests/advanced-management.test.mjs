import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import path from 'node:path';
import {LotteryPool,DEFAULT_WEIGHTS} from '../electron/lottery.ts';
import {parseGuard} from '../electron/eligibility.ts';
import {loadPersonalWeights,savePersonalWeights} from '../electron/personal-weights.ts';

test('five default tiers are 1; explicit identity and room medal determine weight',()=>{
    const pool=new LotteryPool();assert.deepEqual(pool.snapshot().weightRules,DEFAULT_WEIGHTS);
    pool.setWeightRules({captain:4,admiral:6,governor:8,fan:2,ordinary:1},false);
    for(const [uid,guardLevel,hasRoomMedal] of [[1,1,true],[2,2,true],[3,3,true],[4,0,true],[5,0,false],[6,null,true]])pool.add({uid,name:'test',guardLevel,hasRoomMedal});
    assert.deepEqual(pool.snapshot().participants.map(p=>p.weight),[8,6,4,2,1,2]);
    const before=pool.snapshot();assert.throws(()=>pool.setWeightRules({...DEFAULT_WEIGHTS,fan:0},true));assert.deepEqual(pool.snapshot(),before);
});
test('UID entries use names as notes; clearing is not retroactive',()=>{
    const pool=new LotteryPool();pool.setWeightRules({...DEFAULT_WEIGHTS,captain:5},false);
    pool.setPersonalWeights([{uid:1,name:'old nickname',weight:9}]);
    pool.add({uid:1,name:'changed nickname',guardLevel:3});pool.add({uid:2,name:'old nickname',guardLevel:3});
    assert.deepEqual(pool.snapshot().participants.map(p=>p.weight),[9,5]);
    pool.setWeight(1,7);pool.setPersonalWeights([]);assert.equal(pool.snapshot().participants[0].weight,7);
    pool.setWeightRules({...DEFAULT_WEIGHTS,captain:3},false);assert.deepEqual(pool.snapshot().participants.map(p=>p.weight),[7,5]);
    pool.setWeightRules({...DEFAULT_WEIGHTS,captain:3},true);assert.deepEqual(pool.snapshot().participants.map(p=>p.weight),[3,3]);
    pool.setPersonalWeights([{uid:1,name:'',weight:9}]);pool.resetWeights();assert.deepEqual(pool.snapshot().participants.map(p=>p.weight),[1,1]);
    pool.reset();pool.add({uid:1,name:'again'});assert.equal(pool.snapshot().participants[0].weight,9);
});
test('reordering preserves new arrivals, rejects stale targets, and never changes deduplication',()=>{
    const pool=new LotteryPool();pool.configure('queue',5);
    for(const uid of [1,2,3])pool.add({uid,name:String(uid)});
    pool.add({uid:4,name:'arrived during drag'});pool.move(3,1,'before');
    assert.deepEqual(pool.snapshot().participants.map(p=>p.uid),[3,1,2,4]);
    pool.move(3,4,'after');assert.deepEqual(pool.snapshot().participants.map(p=>p.uid),[1,2,4,3]);
    assert.equal(pool.snapshot().queueOrderEdited,true);assert.equal(pool.add({uid:3,name:'duplicate'}),false);
    pool.remove(2);const before=pool.snapshot();assert.throws(()=>pool.move(1,2,'before'));assert.deepEqual(pool.snapshot(),before);
    assert.throws(()=>pool.move(1,3,'invalid'));assert.deepEqual(pool.snapshot(),before);
    pool.reset();assert.equal(pool.snapshot().queueOrderEdited,false);
    pool.configure('lottery',5);assert.throws(()=>pool.move(1,2,'before'));
});
test('guard parsing never borrows another room medal guard level',()=>{
    const info=[[], '', [], [5,'medal','',1,0,0,0,0,0,0,3,1,99]];
    assert.equal(parseGuard(info,100),null);assert.equal(parseGuard(info,99),3);
    info[7]=0;assert.equal(parseGuard(info,99),0);
    for(const level of [1,2,3]){info[7]=level;assert.equal(parseGuard(info,100),level);}
    info[7]=9;assert.equal(parseGuard(info,100),null);assert.equal(parseGuard({},99),null);
});
test('personal list persists, rejects invalid writes atomically, and clears on disk',()=>{
    const base=path.resolve('.build-cache/test-data');mkdirSync(base,{recursive:true});
    const dir=mkdtempSync(path.join(base,'weights-')),file=path.join(dir,'personal.json');
    try{
        assert.deepEqual(loadPersonalWeights(file),[]);
        const entries=[{uid:123,name:'example',weight:8}];savePersonalWeights(file,entries);assert.deepEqual(loadPersonalWeights(file),entries);
        assert.throws(()=>savePersonalWeights(file,[...entries,...entries]));assert.deepEqual(loadPersonalWeights(file),entries);
        savePersonalWeights(file,[]);assert.deepEqual(loadPersonalWeights(file),[]);
        writeFileSync(file,'broken');assert.throws(()=>loadPersonalWeights(file));assert.equal(readFileSync(file,'utf8'),'broken');
    }finally{assert.ok(path.resolve(dir).startsWith(base+path.sep));rmSync(dir,{recursive:true,force:true});}
});

test('name-only rules match all exact names; UID wins and invalid edits are atomic',()=>{
    const pool=new LotteryPool();
    pool.setPersonalWeights([{uid:null,name:'同名观众',weight:4},{uid:2,name:'备注名',weight:9}]);
    for(const [uid,name] of [[1,'同名观众'],[2,'同名观众'],[3,'同名观众'],[4,'同名观众甲']])pool.add({uid,name});
    assert.deepEqual(pool.snapshot().participants.map(p=>p.weight),[4,9,4,1]);
    assert.throws(()=>pool.setPersonalWeights([{uid:null,name:'   ',weight:2}]));
    assert.throws(()=>pool.setPersonalWeights([{uid:null,name:'同名',weight:2},{uid:null,name:' 同名 ',weight:3}]));
    assert.throws(()=>pool.setPersonalWeights([{uid:0,name:'同名',weight:2}]));
    pool.setWeightRules({...DEFAULT_WEIGHTS,ordinary:2},true);
    assert.deepEqual(pool.snapshot().participants.map(p=>p.weight),[4,9,4,2]);
    pool.resetWeights();assert.deepEqual(pool.snapshot().participants.map(p=>p.weight),[1,1,1,1]);
    pool.reset();pool.add({uid:5,name:'同名观众'});assert.equal(pool.snapshot().participants[0].weight,4);
});
