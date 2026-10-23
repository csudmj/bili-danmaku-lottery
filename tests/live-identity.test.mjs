import {test} from 'node:test';
import assert from 'node:assert/strict';
import {LotteryPool} from '../electron/lottery.ts';

const rules={ordinary:1,fan:2,captain:5,admiral:8,governor:10};
const medal={name:'粉丝牌',level:1,anchorUid:99};
test('repeat live entry upgrades identity in place without adding entries or reviving excluded users',()=>{
 const pool=new LotteryPool();pool.setWeightRules(rules,false);pool.add({uid:1,name:'观众',guardLevel:0,hasRoomMedal:false});
 assert.equal(pool.refreshIdentity({uid:1,name:'观众',medal,hasRoomMedal:true}),true);
 assert.equal(pool.snapshot().participants[0].weight,2);
 pool.refreshIdentity({uid:1,name:'观众',guardLevel:3});
 assert.equal(pool.snapshot().participants[0].weight,5);
 assert.equal(pool.snapshot().total,1);assert.equal(pool.snapshot().participants[0].joinedOrder,1);
 pool.refreshIdentity({uid:1,name:'观众',guardLevel:null});
 assert.equal(pool.snapshot().participants[0].guardLevel,3);
 pool.refreshIdentity({uid:1,name:'观众',guardLevel:0,medal:null,hasRoomMedal:false});
 assert.equal(pool.snapshot().participants[0].weight,1);
 pool.draw(1,()=>0);assert.equal(pool.refreshIdentity({uid:1,name:'观众',guardLevel:1}),false);
 assert.equal(pool.add({uid:1,name:'观众'}),false);
 pool.add({uid:2,name:'移除'});pool.remove(2);
 assert.equal(pool.refreshIdentity({uid:2,name:'移除',guardLevel:3}),false);
 assert.equal(pool.add({uid:2,name:'移除'}),false);
});
test('identity refresh respects personal/manual weights and preserves full queue positions and gifts',()=>{
 const pool=new LotteryPool();pool.setWeightRules(rules,false);
 pool.setPersonalWeights([{uid:1,name:'专属',weight:7}]);pool.add({uid:1,name:'专属'});
 pool.refreshIdentity({uid:1,name:'专属',guardLevel:1,hasRoomMedal:true});assert.equal(pool.snapshot().participants[0].weight,7);
 pool.setWeight(1,9);pool.refreshIdentity({uid:1,name:'专属',guardLevel:3});assert.equal(pool.snapshot().participants[0].weight,9);
 pool.reset();pool.configure('queue',1);pool.add({uid:2,name:'排队'});pool.setGiftSort(true);pool.addGift(2,1000,'gift');
 pool.refreshIdentity({uid:2,name:'排队',guardLevel:3,medal,hasRoomMedal:true});
 const person=pool.snapshot().participants[0];assert.equal(person.guardLevel,3);assert.equal(person.giftAmount,1000);assert.equal(person.joinedOrder,1);assert.equal(person.weight,1);
});
