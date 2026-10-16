'use strict';
// 2026-10-16 양호 판정: 상태양호·보수완료류 = 양호, 보수요망류 = 결함
const assert = require('assert');
const path = require('path');
const G = require(path.join(__dirname, '..', 'js', 'core', 'good-type.js'));
const yes = ['상태양호', '상태 양호', '접합부 상태양호', '보수완료', '보수 완료', '보수됨', '보수 됨', '보수함', '보수 함', '보수했음', '보수하였음', ' 보수완료 ', '균열 보수완료'];
const no = ['', null, '균열', '누수', '보수요망', '보수 요망', '우선보수', '우선 보수', '보수필요', '보수 필요', '보수예정', '보수 예정', '미보수', '보수 중', '재보수', '보수 필요함', '양호하지 않음'];
yes.forEach((t) => assert.strictEqual(G.isGoodDefectText(t), true, 'should be good: ' + t));
no.forEach((t) => assert.strictEqual(G.isGoodDefectText(t), false, 'should NOT be good: ' + t));
assert.strictEqual(G.isGoodDefectList('상태양호, 보수됨'), true);
assert.strictEqual(G.isGoodDefectList('균열, 보수완료'), false);
// 부재 수 자동 집계도 같은 규칙
const MC = require(path.join(__dirname, '..', 'js', 'core', 'member-count.js'));
if (MC && typeof MC.isGoodType === 'function') {
    assert.strictEqual(MC.isGoodType('보수 됨'), true);
    assert.strictEqual(MC.isGoodType('보수요망'), false);
}
console.log('test-good-type: ok');
