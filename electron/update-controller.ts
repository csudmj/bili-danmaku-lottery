import type {UpdateState} from '../shared/project.ts';

export interface UpdatePort {
    on(event: string, callback: (...args: any[]) => void): unknown;
    checkForUpdates(): Promise<unknown>;
    downloadUpdate(): Promise<unknown>;
    quitAndInstall(silent: boolean, restart: boolean): void;
}
export class UpdateController {
    private value: UpdateState;
    private running = false;
    private port: UpdatePort;
    private changed: (state: UpdateState) => void;
    constructor(port: UpdatePort, changed: (state: UpdateState) => void, supported: boolean) {
        this.port=port;this.changed=changed;
        this.value = supported ? {status:'idle'} : {status:'unsupported',message:'自动更新适用于 Windows 安装版。请从 GitHub 下载 Setup 安装包并安装。'};
        port.on('update-available', info => this.set({status:'available',version:info.version}));
        port.on('update-not-available', () => this.set({status:'current',message:'当前已是最新正式版'}));
        port.on('download-progress', progress => this.set({...this.value,status:'downloading',percent:Math.max(0,Math.min(100,Number(progress.percent)||0))}));
        port.on('update-downloaded', info => this.set({status:'downloaded',version:info.version,percent:100}));
        port.on('error', () => this.fail());
    }
    get() {return {...this.value};}
    private set(value: UpdateState) {this.value=value;this.changed(this.get());}
    private fail() {this.set({status:'error',message:'更新请求失败：请检查 GitHub 网络连接；仓库还未发布正式版本或缺少 latest.yml 时也会出现此提示。可稍后重试或打开下载页。'});}
    async check() {
        if (this.running || ['unsupported','downloaded'].includes(this.value.status)) return this.get();
        this.running=true;this.set({status:'checking'});
        try {await this.port.checkForUpdates();} catch {this.fail();}
        finally {this.running=false;}
        return this.get();
    }
    async download() {
        if(this.running || this.value.status!=='available') throw new Error('请先检查并确认有可用新版本');
        this.running=true;this.set({...this.value,status:'downloading',percent:0});
        try {await this.port.downloadUpdate();} catch {this.fail();}
        finally {this.running=false;}
        return this.get();
    }
    install() {
        if(this.running || this.value.status!=='downloaded') throw new Error('更新尚未下载完成');
        this.port.quitAndInstall(false,true);
    }
}
