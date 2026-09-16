import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { isAllowedStorageUrl } from '../cloudflare-worker/storage-url-allowlist.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const workerSrc = readFileSync(path.join(here, '..', 'cloudflare-worker', 'ocr-proxy.js'), 'utf8');

assert.strictEqual(
    isAllowedStorageUrl('https://firebasestorage.googleapis.com/v0/b/building-safety-app-46821.firebasestorage.app/o/companies%2Fx.jpg?alt=media&token=abc'),
    true
);
assert.strictEqual(
    isAllowedStorageUrl('https://building-safety-app-46821.firebasestorage.app/v0/b/x/o/companies%2Fx.jpg'),
    true
);
assert.strictEqual(isAllowedStorageUrl('https://vision.googleapis.com/v1/images:annotate'), false);
assert.strictEqual(isAllowedStorageUrl('https://example.com/secret'), false);

assert.ok(workerSrc.includes("action === 'proxyStorage'"));
assert.ok(workerSrc.includes("action === 'ping'"));
assert.ok(workerSrc.includes("Authorization = 'Firebase '"));
assert.ok(!/Authorization: 'Bearer /.test(workerSrc));
assert.ok(workerSrc.includes('return new Response(upstream.body'));

console.log('ok storage-url-allowlist + worker source checks');
