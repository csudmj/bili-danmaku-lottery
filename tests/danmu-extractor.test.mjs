import {test} from 'node:test';
import assert from 'node:assert/strict';
import {deflateSync, brotliCompressSync} from 'node:zlib';
import DanmuExtractor from '../electron/DanmuExtractor.ts';

function frame(body, op = 5, protocol = 0) {
    const payload = Buffer.isBuffer(body) ? body : Buffer.from(JSON.stringify(body));
    const header = Buffer.alloc(16);
    header.writeUInt32BE(16 + payload.length);
    header.writeUInt16BE(16, 4);
    header.writeUInt16BE(protocol, 6);
    header.writeUInt32BE(op, 8);
    return Buffer.concat([header, payload]);
}
test('authentication and concatenated compressed messages are decoded', () => {
    const decoder = new DanmuExtractor();
    const messages = [], auth = [];
    decoder.on('MsgData', msg => messages.push(msg));
    decoder.on('AuthData', msg => auth.push(msg));
    const first = {cmd: 'DANMU_MSG', info: [[], '抽奖', [123, '观众']]};
    const second = {cmd: 'DANMU_MSG', info: [[], '关键词', [456, '观众2']]};
    decoder.getDmMsg(Buffer.concat([
        frame({code: 0}, 8),
        frame(deflateSync(Buffer.concat([frame(first), frame(second)])), 5, 2),
        frame(brotliCompressSync(frame(first)), 5, 3),
    ]));
    assert.deepEqual(auth, [{code: 0}]);
    assert.deepEqual(messages, [first, second, first]);
});
test('truncated, zero-length and corrupt compressed frames cannot crash the app', () => {
    const decoder = new DanmuExtractor();
    let received = 0;
    decoder.on('MsgData', () => received++);
    for (const data of [Buffer.alloc(16), Buffer.alloc(4), frame({x: 1}).subarray(0, 18), frame(Buffer.from('invalid'), 5, 2)]) {
        assert.doesNotThrow(() => decoder.getDmMsg(data));
    }
    decoder.getDmMsg(frame({valid: true}));
    assert.equal(received, 1);
});
