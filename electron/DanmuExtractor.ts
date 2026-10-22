import zlib from 'zlib';
import {EventEmitter} from 'events';

class DanmuExtractor extends EventEmitter {
    getDmMsg(data: Buffer, depth = 0): void {
        if (depth > 8) return;
        let offset = 0;
        while (offset + 16 <= data.length) {
            const length = data.readUInt32BE(offset);
            const header = data.readUInt16BE(offset + 4);
            if (header < 16 || length < header || offset + length > data.length) return;
            const protocol = data.readUInt16BE(offset + 6);
            const operation = data.readUInt32BE(offset + 8);
            const body = data.subarray(offset + header, offset + length);
            offset += length;
            try {
                if (protocol === 2 || protocol === 3) {
                    const options = {maxOutputLength: 16 * 1024 * 1024};
                    const unpacked = protocol === 2 ? zlib.inflateSync(body, options) : zlib.brotliDecompressSync(body, options);
                    this.getDmMsg(unpacked, depth + 1);
                } else if (operation === 5 || operation === 8) {
                    this.emit(operation === 8 ? 'AuthData' : 'MsgData', JSON.parse(body.toString()));
                }
            } catch {
                // Ignore malformed frames without crashing the desktop app.
            }
        }
    }
}

export default DanmuExtractor;
