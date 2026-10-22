import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseRoom,readRoom,saveRoom} from '../shared/room-preference.ts';
test('room preference starts empty, survives reopening and can be cleared',()=>{
    const data=new Map();const storage={getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k)};
    assert.equal(readRoom(storage),'');assert.equal(saveRoom(storage,'123456'),true);
    assert.equal(readRoom(storage),'123456');saveRoom(storage,'');assert.equal(readRoom(storage),'');
    saveRoom(storage,'999');assert.equal(saveRoom(storage,'invalid'),false);assert.equal(readRoom(storage),'999');
});
test('room links ignore tracking digits and reject unrelated domains',()=>{
    assert.equal(parseRoom('https://live.bilibili.com/123456?live_from=82002&spm_id=333.1007'),'123456');
    assert.equal(parseRoom(' 12345 '),'12345');assert.equal(parseRoom('https://live.bilibili.com.evil.test/123'),null);
    assert.equal(parseRoom('https://live.bilibili.com/abc123'),null);assert.equal(parseRoom('javascript:123'),null);
});
test('unavailable storage does not crash startup or editing',()=>{
    const storage={getItem(){throw Error();},setItem(){throw Error();},removeItem(){throw Error();}};
    assert.equal(readRoom(storage),'');assert.equal(saveRoom(storage,'123'),false);
});
