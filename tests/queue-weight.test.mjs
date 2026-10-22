import {test} from 'node:test';
import assert from 'node:assert/strict';
import {LotteryPool} from '../electron/lottery.ts';
const person = uid => ({uid,name:`观众${uid}`});
test('queue preserves arrival order, enforces occupancy and opens removed slots', () => {
    const pool = new LotteryPool(); pool.configure('queue',2);
    assert.equal(pool.add(person(7)),true); assert.equal(pool.add(person(3)),true);
    assert.equal(pool.add(person(9)),false); assert.equal(pool.add(person(7)),false);
    assert.deepEqual(pool.snapshot().participants.map(p=>p.uid),[7,3]);
    assert.throws(()=>pool.draw(1)); assert.throws(()=>pool.setWeight(7,5));
    pool.remove(7); assert.equal(pool.add(person(7)),false);
    assert.equal(pool.add(person(9)),true);
    assert.deepEqual(pool.snapshot().participants.map(p=>p.uid),[3,9]);
    assert.equal(pool.snapshot().removedCount,1);
    assert.throws(()=>pool.configure('queue',1));
    assert.throws(()=>pool.configure('lottery',20));
    pool.configure('queue',3); assert.equal(pool.add(person(10)),true);
    pool.reset(); assert.equal(pool.add(person(7)),true);
});
test('weights allocate exact ticket ranges and draw without replacement', () => {
    const counts = {1:0,2:0,3:0};
    for(let ticket=0;ticket<6;ticket++) {
        const pool=new LotteryPool();[1,2,3].forEach(uid=>pool.add(person(uid)));
        pool.setWeight(2,2);pool.setWeight(3,3);
        const [winner]=pool.draw(1,max=>{assert.equal(max,6);return ticket;});
        counts[winner.uid]++;
    }
    assert.deepEqual(counts,{1:1,2:2,3:3});
    const pool=new LotteryPool();[1,2,3].forEach(uid=>pool.add(person(uid)));pool.setWeight(2,9);
    const maxima=[]; const winners=pool.draw(3,max=>{maxima.push(max);return max-1;});
    assert.deepEqual(maxima,[11,10,1]); assert.equal(new Set(winners.map(p=>p.uid)).size,3);
});
test('invalid weights and stale removals cannot corrupt the active pool', () => {
    const pool=new LotteryPool();pool.add({...person(1),weight:999});
    assert.equal(pool.snapshot().participants[0].weight,1);
    for(const w of [0,-1,1.2,10001,Infinity,NaN]) assert.throws(()=>pool.setWeight(1,w));
    assert.throws(()=>pool.setWeight(999,5));pool.remove(1);assert.throws(()=>pool.remove(1));
    assert.equal(pool.add(person(1)),false);assert.throws(()=>pool.draw(1));
    pool.reset();pool.add(person(1));assert.equal(pool.snapshot().participants[0].weight,1);
});
