import {test} from 'node:test';
import assert from 'node:assert/strict';
import {LotteryPool} from '../electron/lottery.ts';
import {parseGift} from '../electron/gifts.ts';
import {validWeight,probabilityLabel} from '../shared/weights.ts';

test('decimal weights allocate exact integer tickets',()=>{
    const pool=new LotteryPool();pool.add({uid:1,name:'甲'});pool.add({uid:2,name:'乙'});
    pool.setWeight(1,1.1);pool.setWeight(2,1.2);
    assert.equal(pool.draw(1,max=>{assert.equal(max,230);return 110;})[0].uid,2);
    assert.equal(validWeight(1.001),false);assert.equal(validWeight(NaN),false);
    assert.equal(probabilityLabel(1,100000),' <0.01%'.trim());
});
test('one multi-winner click compensates remaining people once and removes winner rules',()=>{
    const pool=new LotteryPool();
    pool.setPersonalWeights([{uid:1,name:'同名',weight:4},{uid:null,name:'同名',weight:3},{uid:9,name:'未参与',weight:2}]);
    pool.setCompensation({enabled:true,increment:0.1});
    pool.add({uid:1,name:'同名'});pool.add({uid:2,name:'乙'});pool.add({uid:3,name:'同名'});
    let saved;
    pool.draw(2,()=>0,entries=>{saved=entries;});
    assert.equal(pool.snapshot().participants[0].weight,3.1);
    assert.deepEqual(saved,[{uid:9,name:'未参与',weight:2},{uid:3,name:'同名',weight:3.1}]);
    pool.reset();pool.add({uid:3,name:'改名'});assert.equal(pool.snapshot().participants[0].weight,3.1);
});
test('persistence failure rolls back winners, compensation and personal rules',()=>{
    const pool=new LotteryPool();pool.setCompensation({enabled:true,increment:0.1});
    pool.add({uid:1,name:'甲'});pool.add({uid:2,name:'乙'});const before=pool.snapshot();
    assert.throws(()=>pool.draw(1,()=>0,()=>{throw Error('disk full');}),/disk full/);
    assert.deepEqual(pool.snapshot(),before);
    pool.draw(1,()=>0);assert.equal(pool.snapshot().participants[0].weight,1.1);
});
test('disabled compensation does not increase; winner rules still clear; cap is exact',()=>{
    const pool=new LotteryPool();pool.setPersonalWeights([{uid:1,name:'甲',weight:2}]);
    pool.add({uid:1,name:'甲'});pool.add({uid:2,name:'乙'});let saved;
    pool.draw(1,()=>0,e=>{saved=e;});assert.deepEqual(saved,[]);assert.equal(pool.snapshot().participants[0].weight,1);
    pool.add({uid:3,name:'丙'});pool.setWeight(3,9999.99);pool.setCompensation({enabled:true,increment:0.1});
    pool.draw(1,()=>0);assert.equal(pool.snapshot().participants[0].weight,10000);
});
test('gift order is cumulative, ties use original arrival, duplicate events ignored',()=>{
    const pool=new LotteryPool();pool.configure('queue',3);pool.setGiftSort(true);
    pool.add({uid:1,name:'甲'});pool.add({uid:2,name:'乙'});pool.add({uid:3,name:'丙'});
    assert.equal(pool.addGift(99,1000,'outside'),false);
    pool.addGift(2,500,'a');pool.addGift(2,500,'b');pool.addGift(1,1000,'c');
    assert.deepEqual(pool.snapshot().participants.map(p=>p.uid),[1,2,3]);
    assert.equal(pool.addGift(2,500,'b'),false);pool.addGift(3,2000,'d');
    assert.deepEqual(pool.snapshot().participants.map(p=>p.uid),[3,1,2]);
    assert.throws(()=>pool.move(1,3,'before'),/关闭/);
    pool.setGiftSort(false);assert.deepEqual(pool.snapshot().participants.map(p=>p.uid),[1,2,3]);
    assert.equal(pool.addGift(1,9999,'disabled'),false);
    pool.reset();pool.add({uid:1,name:'甲'});assert.equal(pool.snapshot().participants[0].giftAmount,0);
});
test('gift parsing rejects free, combo, invalid and unidentified events',()=>{
    const event={cmd:'SEND_GIFT',data:{coin_type:'gold',uid:10,total_coin:1000,tid:'one',giftId:2}};
    assert.deepEqual(parseGift(event),{uid:10,amount:1000,eventId:'10:one:2'});
    assert.equal(parseGift({...event,cmd:'COMBO_SEND'}),null);
    assert.equal(parseGift({...event,data:{...event.data,coin_type:'silver'}}),null);
    assert.equal(parseGift({...event,data:{...event.data,total_coin:-1}}),null);
    assert.equal(parseGift({...event,data:{...event.data,tid:''}}),null);
});
