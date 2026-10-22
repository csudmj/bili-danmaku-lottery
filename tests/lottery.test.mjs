import {test} from 'node:test';
import assert from 'node:assert/strict';
import {LotteryPool} from '../electron/lottery.ts';

test('shared pool rejects invalid IDs, deduplicates and never redraws a winner', () => {
    const pool = new LotteryPool();
    for (const uid of [0, -1, NaN, 1.5]) assert.equal(pool.add({uid, name:'观众'}), false);
    for (let uid = 1; uid <= 10; uid++) assert.equal(pool.add({uid, name:`观众${uid}`}), true);
    const winners = [...pool.draw(3, () => 0), ...pool.draw(7, maximum => maximum - 1)];
    assert.equal(new Set(winners.map(p => p.uid)).size, 10);
    assert.equal(pool.add(winners[0]), false);
    assert.equal(pool.snapshot().participants.length, 0);
    assert.equal(pool.snapshot().total, 10);
    assert.equal(pool.snapshot().drawNumber, 2);
});
test('reset before or after a draw clears history and permits the same viewer again', () => {
    for (const drawFirst of [false, true]) {
        const pool = new LotteryPool();
        pool.add({uid:1, name:'观众'});
        if (drawFirst) pool.draw(1);
        pool.reset();
        assert.deepEqual(pool.snapshot(), {participants:[], winners:[], latestWinners:[], drawNumber:0, total:0, mode:'lottery', queueLimit:20, removedCount:0});
        assert.equal(pool.add({uid:1, name:'观众'}), true);
    }
});
test('failed draw is atomic and window snapshots cannot modify authoritative data', () => {
    const pool = new LotteryPool();
    const person = {uid:1, name:'观众', medal:{name:'牌子',level:3,anchorUid:9}};
    pool.add(person); person.medal.name = '被修改';
    const before = pool.snapshot();
    for (const count of [0,2,NaN,1.5]) assert.throws(() => pool.draw(count));
    assert.throws(() => pool.draw(1, () => 2));
    assert.deepEqual(pool.snapshot(), before);
    before.participants[0].name = '被修改';
    const selected = pool.draw(1); selected[0].name = '被修改';
    assert.equal(pool.snapshot().latestWinners[0].name, '观众');
    assert.equal(pool.snapshot().winners[0].medal.name, '牌子');
});
