#!/usr/bin/env node
'use strict';

/**
 * t571u: 기본 결함→원인 제안에서 명백히 안 맞는 조합만 뺀다.
 * 전역 원인 용어는 유지. 저장된 결함·사용자 커스텀은 건드리지 않음.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const mapping = path.join(__dirname, 'test-defect-cause-mapping.js');

// 매핑 테스트와 같은 추출 env를 쓰려면 그 파일이 api를 만들 때 실행된다.
// 여기서는 app.js 구간을 직접 재사용해 제외 규칙만 확인한다.
const src = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
assert.ok(!fs.readFileSync(path.join(__dirname, '..', 'js/core/company-vocab.js'), 'utf8').includes('shouldDropIncompatibleCause'),
    'company-vocab.js는 수정하지 않음');
assert.ok(src.includes('function shouldDropIncompatibleCause'));
assert.ok(src.includes('function filterIncompatibleDefaultCauses'));
assert.ok(src.includes('STRUCTURAL_ONLY_CAUSES'));

const start = src.indexOf('    const STRUCTURAL_ONLY_CAUSES');
const end = src.indexOf('    function getDefaultCausePresetList(');
assert.ok(start > 0 && end > start, 'helper block');
const helpers = src.slice(start, end);
const fn = new Function(`
    function isLeakCauseKey(key) {
        const k = String(key || '').trim();
        return k === '누수' || k === '누수흔적' || k === '누수 흔적';
    }
    function isEffloCauseKey(key) {
        const k = String(key || '').trim();
        return k === '백태' || k === '백태/유출' || k === '백화';
    }
    ${helpers}
    return { shouldDropIncompatibleCause, filterIncompatibleDefaultCauses, isMoistureRelatedCauseKey };
`);
const api = fn();

// 구조 전용 원인을 마감·비구조 기본 제안에서만 뺌
['내력부족', '철근 부식 팽창', '피복두께 부족'].forEach((c) => {
    assert.strictEqual(api.shouldDropIncompatibleCause('균열', c, '마감재'), true, '마감재/' + c);
    assert.strictEqual(api.shouldDropIncompatibleCause('균열', c, '비구조체'), true, '비구조/' + c);
    assert.strictEqual(api.shouldDropIncompatibleCause('균열', c, '구조체'), false, '구조체/' + c + ' 유지');
});

// 수분 무관 마감 결함에 상부 배관·상부 누수 제안 제거
['마모', '줄눈 손상', '유리 파손·금', '하드웨어 불량', '개폐불량', '작동불량'].forEach((k) => {
    assert.strictEqual(api.shouldDropIncompatibleCause(k, '상부 배관 누수', '마감재'), true, k);
    assert.strictEqual(api.shouldDropIncompatibleCause(k, '상부 누수', '마감재'), true, k);
});

// 수분·들뜸류는 상부 누수 유력 → 유지
['들뜸', '오염', '처짐', '박리/탈락', '누수흔적'].forEach((k) => {
    assert.strictEqual(api.shouldDropIncompatibleCause(k, '상부 배관 누수', '마감재'), false, 'keep moisture ' + k);
});

// 전역으로 유효한 시공미흡은 어떤 결함에서도 지우지 않음
assert.strictEqual(api.shouldDropIncompatibleCause('마모', '시공미흡', '마감재'), false);
assert.strictEqual(api.shouldDropIncompatibleCause('균열', '시공미흡', '구조체'), false);

const kept = api.filterIncompatibleDefaultCauses('마모', ['시공미흡', '상부 배관 누수', '노후화', '내력부족'], '마감재');
assert.deepStrictEqual(kept, ['시공미흡', '노후화']);

console.log('test-incompatible-cause-map: ok');
