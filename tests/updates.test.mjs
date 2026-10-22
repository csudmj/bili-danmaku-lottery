import {test} from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {UpdateController} from '../electron/update-controller.ts';
import {PROJECT,PROJECT_LINKS} from '../shared/project.ts';
class Port extends EventEmitter {
    calls=0;installed=0;
    async checkForUpdates(){this.calls++;this.emit('update-available',{version:'1.6.0'});}
    async downloadUpdate(){this.emit('download-progress',{percent:38});this.emit('update-downloaded',{version:'1.6.0'});}
    quitAndInstall(silent,restart){assert.equal(silent,false);assert.equal(restart,true);this.installed++;}
}
test('updates check, download progress and explicit install; no automatic install',async()=>{
    const port=new Port(),history=[];const controller=new UpdateController(port,s=>history.push(s),true);
    assert.throws(()=>controller.install());await controller.check();assert.equal(controller.get().status,'available');
    await controller.download();assert.equal(controller.get().status,'downloaded');assert.equal(port.installed,0);
    await controller.check();assert.equal(port.calls,1);assert.equal(controller.get().status,'downloaded');
    assert.ok(history.some(s=>s.status==='downloading'&&s.percent===38));controller.install();assert.equal(port.installed,1);
});
test('unsupported portable mode, concurrent checks and failed checks are safe',async()=>{
    const port=new Port(),portable=new UpdateController(port,()=>{},false);await portable.check();assert.equal(port.calls,0);await assert.rejects(()=>portable.download());
    let release;port.checkForUpdates=()=>new Promise(r=>release=r);const c=new UpdateController(port,()=>{},true);
    const pending=c.check();assert.equal(c.get().status,'checking');await c.check();release();await pending;
    port.checkForUpdates=async()=>{throw new Error('404 token=secret');};await c.check();assert.equal(c.get().status,'error');assert.ok(!c.get().message.includes('secret'));
    port.checkForUpdates=async()=>port.emit('update-not-available');await c.check();assert.equal(c.get().status,'current');
});
test('all public project destinations belong to the requested repository',()=>{
    assert.equal(PROJECT.url,'https://github.com/csudmj/bili-danmaku-lottery');
    for(const url of Object.values(PROJECT_LINKS))assert.ok(url.startsWith(PROJECT.url));
});
