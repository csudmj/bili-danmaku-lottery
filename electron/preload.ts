import {ipcRenderer, contextBridge} from 'electron'

const listeners = new Map<string, Map<Parameters<typeof ipcRenderer.on>[1], Parameters<typeof ipcRenderer.on>[1]>>();
function removeListener(channel: string, listener: Parameters<typeof ipcRenderer.on>[1]) {
    const wrapped = listeners.get(channel)?.get(listener);
    if (wrapped) ipcRenderer.removeListener(channel, wrapped);
    listeners.get(channel)?.delete(listener);
}

// --------- Expose some API to the Renderer process ---------
contextBridge.exposeInMainWorld('ipcRenderer', {
    on(...args: Parameters<typeof ipcRenderer.on>) {
        const [channel, listener] = args
        removeListener(channel, listener);
        const wrapped: Parameters<typeof ipcRenderer.on>[1] = (event, ...values) => listener(event, ...values);
        if (!listeners.has(channel)) listeners.set(channel, new Map());
        listeners.get(channel)!.set(listener, wrapped);
        ipcRenderer.on(channel, wrapped);
    },
    off(...args: Parameters<typeof ipcRenderer.off>) {
        const [channel, ...omit] = args
        removeListener(channel, omit[0])
    },
    send(...args: Parameters<typeof ipcRenderer.send>) {
        const [channel, ...omit] = args
        return ipcRenderer.send(channel, ...omit)
    },
    invoke(...args: Parameters<typeof ipcRenderer.invoke>) {
        const [channel, ...omit] = args
        return ipcRenderer.invoke(channel, ...omit)
    },
    // 这个是自己加的，用于移除事件监听（vite-electron 居然没有这个）
    removeListener(...args: Parameters<typeof ipcRenderer.removeListener>) {
        const [channel, ...omit] = args
        removeListener(channel, omit[0])
    }

    // You can expose other APTs you need here.
    // ...
})
