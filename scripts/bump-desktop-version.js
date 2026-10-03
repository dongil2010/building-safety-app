#!/usr/bin/env node
'use strict';

/** package.json 버전 끝자리를 1 올린다. PC 설치 파일을 만들 때마다 호출한다. */
const fs = require('fs');
const path = require('path');

const pkgPath = path.join(__dirname, '..', 'package.json');
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
const parts = String(pkg.version || '1.0.0').split('.').map((n) => parseInt(n, 10) || 0);
while (parts.length < 3) parts.push(0);
parts[2] += 1;
pkg.version = parts.join('.');
fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
console.log('desktop version -> ' + pkg.version);
