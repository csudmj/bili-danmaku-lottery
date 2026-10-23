import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseMedal, isEligible} from '../electron/eligibility.ts';

const info = (light = 1, uid = 99) => [[], '抽奖', [], [5, '测试牌', '主播', 123, 0, '', 0, 0, 0, 0, 0, light, uid]];
test('two modes check medal presence and anchor regardless of light status', () => {
    for (const [medal, expected] of [
        [null, [true, false]],
        [parseMedal(info(1, 100)), [true, false]],
        [parseMedal(info(0)), [true, true]],
        [parseMedal(info()), [true, true]],
    ]) {
        ['off', 'wear'].forEach((rule, i) => {
            assert.equal(isEligible('我要抽奖', '抽奖', medal, rule, 99), expected[i]);
            assert.equal(isEligible('错词', '抽奖', medal, rule, 99), false);
            assert.equal(isEligible('抽奖', '', medal, rule, 99), expected[i]);
        });
    }
});
test('missing light status is accepted but unknown anchor is rejected', () => {
    const raw = info();
    raw[3].length = 11;
    raw[3][12] = 99;
    const medal = parseMedal(raw);
    assert.equal(isEligible('抽奖', '抽奖', medal, 'wear', 99), true);
    assert.equal(isEligible('抽奖', '抽奖', medal, 'wear', 0), false);
    assert.equal(parseMedal(null), null);
    assert.equal(parseMedal([[], '', [], []]), null);
});
test('named medal fields take precedence over legacy fields', () => {
    const raw = info(1);
    raw[0][15] = {user: {medal: {name: '新牌', level: 3, ruid: 100, is_light: 0}}};
    assert.deepEqual(parseMedal(raw), {name: '新牌', level: 3, anchorUid: 100});
});
