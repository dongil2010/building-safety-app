#!/usr/bin/env node
'use strict';

/**
 * scripts/test-*.js 와 test-*.mjs 만 실행한다.
 * Python/HWPX 템플릿 테스트는 CI 환경이 달라서 여기 넣지 않는다.
 */
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const dir = __dirname;
const files = fs.readdirSync(dir)
    .filter((name) => /^test-.*\.(js|mjs)$/.test(name))
    .sort();

if (!files.length) {
    console.error('run-node-tests: no scripts/test-*.js or *.mjs found');
    process.exit(1);
}

let failed = 0;
files.forEach((name) => {
    const file = path.join(dir, name);
    console.log('\n== ' + name);
    const result = spawnSync(process.execPath, [file], { stdio: 'inherit' });
    const code = result.status == null ? 1 : result.status;
    if (code !== 0) {
        failed = 1;
        console.error(name + ' failed with exit ' + code);
    }
});

if (failed) {
    console.error('\nrun-node-tests: FAILED');
    process.exit(1);
}
console.log('\nrun-node-tests: ' + files.length + ' files ok');
