'use strict';

/**
 * 의존성 없는 작은 zip 읽기/쓰기 (node 전용, 개발 도구·테스트용).
 *
 * 한글(HWPX)은 zip 묶음인데 이 저장소의 node 쪽에는 zip 라이브러리가 없다(브라우저는 CDN의 JSZip).
 * 템플릿을 만들거나 테스트에서 템플릿을 열어 보려면 zip을 읽고 써야 해서 필요한 만큼만 둔다.
 * zip64·암호·분할 압축은 다루지 않는다.
 */
const zlib = require('zlib');

/** @returns {Object<string, Buffer>} 경로 → 내용 (폴더 항목은 뺀다) */
function readZip(buf) {
    let eocd = -1;
    for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 65535); i--) {
        if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
    }
    if (eocd < 0) throw new Error('zip 끝 표시를 찾지 못했다');
    const count = buf.readUInt16LE(eocd + 10);
    let p = buf.readUInt32LE(eocd + 16);
    const out = {};
    for (let n = 0; n < count; n++) {
        if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error('zip 목록이 깨졌다');
        const flags = buf.readUInt16LE(p + 8);
        const method = buf.readUInt16LE(p + 10);
        const compSize = buf.readUInt32LE(p + 20);
        const nameLen = buf.readUInt16LE(p + 28);
        const extraLen = buf.readUInt16LE(p + 30);
        const commentLen = buf.readUInt16LE(p + 32);
        const localOff = buf.readUInt32LE(p + 42);
        const nameBuf = buf.subarray(p + 46, p + 46 + nameLen);
        // 한글이 만든 파일은 UTF-8 표시(0x800) 없이 UTF-8로 이름을 적기도 한다
        const name = nameBuf.toString('utf8');
        p += 46 + nameLen + extraLen + commentLen;
        if (name.endsWith('/')) continue;
        if (flags & 1) throw new Error('암호가 걸린 zip은 읽지 못한다: ' + name);
        const lNameLen = buf.readUInt16LE(localOff + 26);
        const lExtraLen = buf.readUInt16LE(localOff + 28);
        const start = localOff + 30 + lNameLen + lExtraLen;
        const raw = buf.subarray(start, start + compSize);
        if (method === 0) out[name] = Buffer.from(raw);
        else if (method === 8) out[name] = zlib.inflateRawSync(raw);
        else throw new Error('모르는 압축 방식 ' + method + ': ' + name);
    }
    return out;
}

/**
 * @param {Array<{name: string, data: Buffer|string, store?: boolean}>} entries 적힌 순서대로 넣는다
 *   (HWPX는 mimetype을 맨 앞에 무압축으로 둔다)
 */
function writeZip(entries) {
    const locals = [];
    const centrals = [];
    let offset = 0;
    entries.forEach((e) => {
        const data = Buffer.isBuffer(e.data) ? e.data : Buffer.from(e.data, 'utf8');
        const name = Buffer.from(e.name, 'utf8');
        const body = e.store ? data : zlib.deflateRawSync(data, { level: 6 });
        const crc = zlib.crc32(data) >>> 0;
        const local = Buffer.alloc(30);
        local.writeUInt32LE(0x04034b50, 0);
        local.writeUInt16LE(20, 4);
        local.writeUInt16LE(0x0800, 6);
        local.writeUInt16LE(e.store ? 0 : 8, 8);
        local.writeUInt16LE(0, 10);
        local.writeUInt16LE(0x21, 12);
        local.writeUInt32LE(crc, 14);
        local.writeUInt32LE(body.length, 18);
        local.writeUInt32LE(data.length, 22);
        local.writeUInt16LE(name.length, 26);
        local.writeUInt16LE(0, 28);
        locals.push(local, name, body);

        const central = Buffer.alloc(46);
        central.writeUInt32LE(0x02014b50, 0);
        central.writeUInt16LE(20, 4);
        central.writeUInt16LE(20, 6);
        central.writeUInt16LE(0x0800, 8);
        central.writeUInt16LE(e.store ? 0 : 8, 10);
        central.writeUInt16LE(0, 12);
        central.writeUInt16LE(0x21, 14);
        central.writeUInt32LE(crc, 16);
        central.writeUInt32LE(body.length, 20);
        central.writeUInt32LE(data.length, 24);
        central.writeUInt16LE(name.length, 28);
        central.writeUInt32LE(offset, 42);
        centrals.push(central, name);
        offset += 30 + name.length + body.length;
    });
    const centralBuf = Buffer.concat(centrals);
    const end = Buffer.alloc(22);
    end.writeUInt32LE(0x06054b50, 0);
    end.writeUInt16LE(entries.length, 8);
    end.writeUInt16LE(entries.length, 10);
    end.writeUInt32LE(centralBuf.length, 12);
    end.writeUInt32LE(offset, 16);
    return Buffer.concat(locals.concat([centralBuf, end]));
}

module.exports = { readZip: readZip, writeZip: writeZip };
