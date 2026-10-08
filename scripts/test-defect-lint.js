#!/usr/bin/env node
'use strict';

/**
 * 결함 입력 확인(js/core/defect-lint.js) 테스트.
 * 2026-10-08 광주교회 보고서를 만들다 나온 잘못된 입력들이 기준이다.
 */
const assert = require('assert');
const lint = require('../js/core/defect-lint.js');

const codes = (d) => lint.lintDefect(d).map((i) => i.code);

// ── 체크 오류 ──
assert.deepStrictEqual(codes({ component: '블록벽체', defectType: '수직균열', category: '구조체', size: '1.2/1.8', crackMeasures: [{ width: '1.2', length: '1.8', join: '/' }] }),
    ['masonry-structural'], '블록벽체가 구조체로 체크됨');
assert.deepStrictEqual(codes({ component: 'ALC 블록', defectType: '수직균열', category: '', size: '' }), ['masonry-structural'], '구분이 비어 있으면 구조체로 나간다');
assert.deepStrictEqual(codes({ component: '조적벽체', defectType: '수평균열', category: '비구조체' }), [], '비구조체로 체크돼 있으면 정상');
assert.deepStrictEqual(codes({ component: '벽체 타일', defectType: '균열', category: '구조체' }), ['finish-structural'], '마감재가 구조체로 체크됨');
assert.deepStrictEqual(codes({ component: '천장 마감재', defectType: '오염', category: '마감재' }), []);
assert.deepStrictEqual(codes({ component: '보도블록', defectType: '파손', category: '구조체' }), [], '바닥 블록은 벽체가 아니다');
assert.deepStrictEqual(codes({ component: '슬래브', defectType: '균열', category: '구조체', size: '0.3/1.6', crackMeasures: [{ width: '0.3', length: '1.6', join: '/' }] }), [], '정상 입력');

// ── 이상한 균열폭 ──
assert.deepStrictEqual(codes({
    component: '슬래브', defectType: '균열 및 백태', category: '구조체', size: '50.1/3.5, 0.1~0.2/3.5',
    crackMeasures: [{ width: '50.1', length: '3.5', join: '/' }, { width: '0.1~0.2', length: '3.5', join: '/' }]
}), ['width-too-large'], '균열폭 50.1mm');
assert.deepStrictEqual(codes({
    component: '슬래브', defectType: '균열', category: '구조체', size: '5.0/0.8', crackMeasures: [{ width: '5.0', length: '0.8', join: '/' }]
}), ['width-large-structural'], '구조체 균열폭 5mm 이상');
assert.deepStrictEqual(codes({
    component: 'ALC블록', defectType: '수직균열', category: '비구조체', size: 'Cw:5.0~10.0', crackMeasures: [{ width: '5.0~10.0', length: '', join: '/' }]
}), [], '비구조 ALC 블록의 5~10mm 균열은 있을 수 있는 값');

// 망상균열 범위를 폭/길이로 넣음 (광주교회 지하1층 #19: "Cw:0.2, 2.0/2.0")
const mesh = {
    component: '슬래브', defectType: '망상균열', category: '구조체', size: 'Cw:0.2, 2.0/2.0',
    crackMeasures: [{ width: '0.2', length: '', join: '/' }, { width: '2.0', length: '2.0', join: '/' }]
};
assert.deepStrictEqual(codes(mesh), ['mesh-as-length']);
assert.ok(/면적/.test(lint.lintDefect(mesh)[0].message));
// 면적(×)으로 바르게 넣으면 걸리지 않는다
assert.deepStrictEqual(codes({
    component: '슬래브', defectType: '망상균열', category: '구조체', size: 'Cw:0.2, 2.0x2.0',
    crackMeasures: [{ width: '0.2', length: '', join: '/' }, { width: '2.0', length: '2.0', join: 'x' }]
}), [], '면적으로 넣은 범위는 균열폭이 아니다');

// 한 결함 안의 폭 차이
assert.deepStrictEqual(codes({
    component: '슬래브', defectType: '균열', category: '구조체', size: '0.2/1.5, 2.5/1.5',
    crackMeasures: [{ width: '0.2', length: '1.5', join: '/' }, { width: '2.5', length: '1.5', join: '/' }]
}), ['width-spread']);
assert.deepStrictEqual(codes({
    component: '슬래브', defectType: '균열', category: '구조체', size: '0.3/1.0, 0.4/2.2',
    crackMeasures: [{ width: '0.3', length: '1.0', join: '/' }, { width: '0.4', length: '2.2', join: '/' }]
}), [], '비슷한 폭 여러 개는 정상');

// 균열이 아닌 결함의 규모는 폭으로 보지 않는다
assert.deepStrictEqual(codes({ component: '보', defectType: '철근노출', category: '구조체', size: '50.0/0.8', crackMeasures: [{ width: '50.0', length: '0.8', join: '/' }] }), []);
// 상태양호는 보지 않는다
assert.deepStrictEqual(codes({ component: '블록벽체', defectType: '상태양호', category: '구조체' }), []);

// 측정 행이 없는 옛 데이터
assert.deepStrictEqual(codes({ component: '슬래브', defectType: '균열', category: '구조체', size: '32.5/2.0', crackWidth: '32.5' }), ['width-too-large']);
assert.deepStrictEqual(codes({ component: '슬래브', defectType: '망상균열', category: '구조체', size: '2.0*2.0', crackWidth: '2.0' }), [], '규모가 면적이면 폭 글자도 폭이 아니다');

// 목록
const list = lint.lintDefects([
    { id: 'a', component: '슬래브', defectType: '균열', category: '구조체', size: '0.3/1.6', crackMeasures: [{ width: '0.3', length: '1.6', join: '/' }] },
    { id: 'b', component: '블록벽체', defectType: '수직균열', category: '구조체', size: '55/1.8', crackMeasures: [{ width: '55', length: '1.8', join: '/' }] },
    mesh
]);
assert.strictEqual(list.length, 2);
assert.strictEqual(list[0].defect.id, 'b');
assert.deepStrictEqual(list[0].issues.map((i) => i.code), ['masonry-structural', 'width-too-large'], '한 결함에 두 가지가 다 걸릴 수 있다');

console.log('test-defect-lint: ok');
