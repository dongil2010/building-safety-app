'use strict';

/**
 * 테스트용 최소 zip 리더. 한글 파일(.hwpx)은 zip이다.
 *
 * 브라우저는 JSZip을 CDN으로 쓰지만 Node 테스트에는 없어서, 패키지를 늘리지 않고
 * 내장 zlib로 읽는다. 저장(0)·deflate(8) 두 방식만 지원한다 — 한글이 쓰는 건 이 둘뿐이다.
 */
const fs = require('fs');
const zlib = require('zlib');

function readZip(filePath) {
    const buf = fs.readFileSync(filePath);

    // 끝에서부터 중앙 디렉터리 끝 레코드(EOCD, 0x06054b50)를 찾는다
    let eocd = -1;
    for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i -= 1) {
        if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
    }
    if (eocd < 0) throw new Error('zip 끝 레코드를 못 찾았다: ' + filePath);

    const count = buf.readUInt16LE(eocd + 10);
    let p = buf.readUInt32LE(eocd + 16);
    const entries = new Map();

    for (let n = 0; n < count; n += 1) {
        if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error('중앙 디렉터리가 깨졌다: ' + filePath);
        const method = buf.readUInt16LE(p + 10);
        const compSize = buf.readUInt32LE(p + 20);
        const nameLen = buf.readUInt16LE(p + 28);
        const extraLen = buf.readUInt16LE(p + 30);
        const commentLen = buf.readUInt16LE(p + 32);
        const localOffset = buf.readUInt32LE(p + 42);
        const name = buf.toString('utf8', p + 46, p + 46 + nameLen);
        p += 46 + nameLen + extraLen + commentLen;

        // 로컬 헤더의 이름·추가필드 길이는 중앙 디렉터리와 다를 수 있어 따로 읽는다
        const lNameLen = buf.readUInt16LE(localOffset + 26);
        const lExtraLen = buf.readUInt16LE(localOffset + 28);
        const dataStart = localOffset + 30 + lNameLen + lExtraLen;
        const raw = buf.subarray(dataStart, dataStart + compSize);

        entries.set(name, { method, raw });
    }

    return {
        names() { return Array.from(entries.keys()); },
        has(name) { return entries.has(name); },
        read(name) {
            const e = entries.get(name);
            if (!e) return null;
            if (e.method === 0) return Buffer.from(e.raw);
            if (e.method === 8) return zlib.inflateRawSync(e.raw);
            throw new Error('지원하지 않는 압축 방식 ' + e.method + ': ' + name);
        },
        text(name) {
            const b = this.read(name);
            return b ? b.toString('utf8') : null;
        }
    };
}

module.exports = { readZip };
