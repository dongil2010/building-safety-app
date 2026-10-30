#!/usr/bin/env node
'use strict';
/**
 * 2026-10-30 회사 결함표 용어(엑셀 173개) — js/core/company-vocab.js 변환 규칙과 app.js 목록·가져오기 연결.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const v = require(path.join(root, 'js', 'core', 'company-vocab.js'));

const conv = (category, component, defectType, cause) => v.convertImportRow({ category, component, defectType, cause });
const eq = (r, comp, type) => { assert.strictEqual(r.component, comp); assert.strictEqual(r.defectType, type); };

// 마감재: 바탕 부재 + 마감 → 부재 칸, 결함은 결함만
eq(conv('마감재', '벽체', '타일 파손'), '벽체 타일', '파손');
eq(conv('마감재', '기둥', '타일 들뜸'), '기둥 타일', '들뜸');
eq(conv('마감재', '바닥', '타일균열'), '바닥 타일', '균열');
eq(conv('마감재', '보', '뿜칠 상태양호'), '보 뿜칠', '상태양호');
eq(conv('마감재', '보', '뿜칠상태 양호'), '보 뿜칠', '상태양호');
eq(conv('마감재', '보', '뿜칠양호'), '보 뿜칠', '상태양호');
eq(conv('마감재', '슬래브', '뿜칠박락'), '슬래브 뿜칠', '박락');
eq(conv('마감재', '부재', '천장 마감재 오염'), '천장 마감재', '오염');
eq(conv('마감재', '부재', '천장마감재 처짐'), '천장 마감재', '처짐');
eq(conv('마감재', '상부 슬래브', '천장 마감재 누수흔적'), '천장 마감재', '누수흔적');
eq(conv('마감재', '부대시설', '외벽 마감재 상태양호'), '외벽 마감재', '상태양호');
eq(conv('마감재', '보', '철골 보 뿜칠 상태양호'), '철골 보 뿜칠', '상태양호');
eq(conv('마감재', '기둥', '-보 접합부 뿜칠 상태양호'), '기둥-보 접합부 뿜칠', '상태양호');
eq(conv('마감재', '부재', '부재 접합부 뿜칠 상태 양호'), '접합부 뿜칠', '상태양호');
// 비구조체: 조사내용 앞의 부재·항목 이름을 부재로
eq(conv('비구조체', '부재', '환기창 상태양호'), '환기창', '상태양호');
eq(conv('비구조체', '부재', '점검로 상태양호'), '점검로', '상태양호');
eq(conv('비구조체', '벽체', '내림벽체 수직균열'), '내림벽체', '수직균열');
eq(conv('비구조체', '기둥-벽체', '접합부 수직이격'), '기둥-벽체 접합부', '수직이격');
eq(conv('비구조체', '보', '보 접합부 상태양호'), '보 접합부', '상태양호');
// 쪼갤 것이 없으면 그대로
eq(conv('비구조체', '벽체', '수직균열'), '벽체', '수직균열');
eq(conv('비구조체', '벽체', '수직·수평균열'), '벽체', '수직·수평균열');
eq(conv('비구조체', '벽체', '보수부위 재균열'), '벽체', '보수부위 재균열');
// 구조체는 부재·조사내용을 건드리지 않음
eq(conv('구조체', '기둥', '보 접합부 수직균열'), '기둥', '보 접합부 수직균열');
assert.strictEqual(conv('구조체', '기둥', '수직균열').split, false);

// 원인 표기 통일
assert.strictEqual(v.normalizeCause('시공 미흡'), '시공미흡');
assert.strictEqual(v.normalizeCause('개구부 주변 응력집중'), '개구부 주위 응력집중');
assert.strictEqual(v.normalizeCause('개구부 응력집중'), '개구부 주위 응력집중');
assert.strictEqual(v.normalizeCause('주변 부재의 구속'), '주변부재의 구속');
assert.strictEqual(v.normalizeCause('건조수축 및 재료적특성'), '건조수축 및 재료적 특성');
assert.strictEqual(v.normalizeCause('경과 년 수 증대에 따른 노후화'), '경과년수 증대에 따른 노후화');
assert.strictEqual(v.normalizeCause('경과년수 증대로 인한 노후화'), '경과년수 증대에 따른 노후화');
assert.strictEqual(v.normalizeCause('관리 미흡'), '관리미흡');
assert.strictEqual(v.normalizeCause('시공 미흡, 경과 년 수 증대에 따른 노후화'), '시공미흡, 경과년수 증대에 따른 노후화');
assert.strictEqual(v.normalizeCause('시공미흡, 시공 미흡'), '시공미흡');
assert.strictEqual(v.normalizeCause('상부 배관 누수 추정'), '상부 배관 누수 추정', '모르는 원인은 그대로');
assert.strictEqual(v.normalizeCause('-'), '-');
assert.strictEqual(conv('구조체', '기둥', '수직균열', '시공 미흡').cause, '시공미흡');

// app.js 목록·연결
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const presetBlk = app.slice(app.indexOf('const DEFECT_COMPONENT_PRESET = {'), app.indexOf('};', app.indexOf('const DEFECT_COMPONENT_PRESET = {')));
const listOf = (cat) => {
    const m = presetBlk.match(new RegExp(`'${cat}': \\[([\\s\\S]*?)\\]`));
    return m ? (m[1].match(/'([^']+)'/g) || []).map((s) => s.slice(1, -1)) : [];
};
const ns = listOf('비구조체');
const fin = listOf('마감재');
['벽체', '조적벽체', '기둥', '보(G)', '보(B)', '슬래브', '바닥', '환기창', '점검로', '배수로', '바닥 포장', '치장벽돌', '내림벽체', '부대시설'].forEach((n) => assert.ok(ns.includes(n), '비구조체에 ' + n));
['벽체 타일', '기둥 타일', '바닥 타일', '뿜칠', '내화피복', '외벽 마감재', '지붕 마감재', '천장 마감재', '보 뿜칠', '슬래브 뿜칠', '벽체', '기둥', '슬래브', '바닥'].forEach((n) => assert.ok(fin.includes(n), '마감재에 ' + n));
assert.ok(!ns.includes('보') && !fin.includes('보'), '그냥 「보」는 목록에 없음(지정 필요 유지)');
// 예전 이름도 그대로 남아 있음(저장된 결함 호환)
['조적벽체', '칸막이벽', 'ALC벽', '창호', '난간', '중량물'].forEach((n) => assert.ok(ns.includes(n)));
['외장타일', '외장석재', '도장', '수장', '바닥타일', '바닥마감'].forEach((n) => assert.ok(fin.includes(n)));
assert.ok(/const C_MISM_JOINT = '이질재료 접합부 거동차이';/.test(app));
assert.ok(/const C_MANAGE = '관리미흡';/.test(app));
assert.ok(/companyVocab\.convertImportRow\(/.test(app), '엑셀 가져오기에서 변환');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
assert.ok(html.indexOf('js/core/company-vocab.js') > 0 && html.indexOf('js/core/company-vocab.js') < html.indexOf('src="app.js'), 'app.js보다 먼저 불러옴');
console.log('test-company-vocab: ok');
