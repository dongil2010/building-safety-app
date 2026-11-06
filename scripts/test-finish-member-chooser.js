#!/usr/bin/env node
'use strict';

/**
 * t583u/t584u: 마감재 기둥/벽체/보/슬래브는 바탕 선택 단추.
 * 자식 팝업에서 타일·도장·마감을 고르면 합친 이름만 저장. 취소는 이전 값·부모 창 유지.
 * 맨몸 바탕은 재사용 목록에 안 넣고, 결함/원인 칩은 마감 재료 기준.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { extractFunction } = require('./lib-extract-fn');

const root = path.join(__dirname, '..');
const chooser = require(path.join(root, 'js/shared/finish-member-chooser.js'));
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8').replace(/\r\n/g, '\n');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'styles.css'), 'utf8');

assert.deepStrictEqual(chooser.BASES, ['기둥', '벽체', '보', '슬래브']);
assert.deepStrictEqual(chooser.MATERIALS, ['타일', '도장', '마감재']);
assert.strictEqual(chooser.combine('기둥', '타일'), '기둥 타일');
assert.strictEqual(chooser.combine('벽체', '도장'), '벽체 도장');
assert.strictEqual(chooser.combine('보', '마감재'), '보 마감재');
assert.strictEqual(chooser.combine('슬래브', '타일'), '슬래브 타일');
assert.strictEqual(chooser.combine('기둥', '미장'), '', '팝업 재료만 합침');
assert.ok(chooser.isBase('기둥') && chooser.isBase('벽체') && !chooser.isBase('기둥 타일'));
assert.deepStrictEqual(chooser.parse('기둥 타일'), { base: '기둥', material: '타일', label: '기둥 타일' });
assert.strictEqual(chooser.parse('기둥 미장'), null);
assert.ok(chooser.hasFinishContext('기둥 타일') && chooser.hasFinishContext('벽체 도장'));
assert.ok(!chooser.hasFinishContext('기둥'));

assert.ok(html.includes('id="quickFinishBaseChips"'));
assert.ok(html.includes('js/shared/finish-member-chooser.js?v='));
assert.ok(html.indexOf('js/shared/finish-member-chooser.js') < html.indexOf('src="app.js'));
assert.ok(/bsa-finish-chooser-overlay/.test(css));
assert.ok(/quickFinishBaseChips/.test(app) && /data-finish-base/.test(app));
assert.ok(/shouldKeepDefectModalForTarget[\s\S]{0,900}BsaFinishMemberChooser/.test(app)
    || /BsaFinishMemberChooser[\s\S]{0,200}shouldKeepDefectModalForTarget/.test(app)
    || /#bsaFinishMemberChooser/.test(app));
assert.ok(/tryCloseTopOverlayForBack[\s\S]{0,600}BsaFinishMemberChooser/.test(app));
assert.ok(/isFinishMemberBaseName\(name\)/.test(app));
assert.ok(!/js\/core\/company-vocab\.js/.test(fs.readFileSync(path.join(root, 'js/shared/finish-member-chooser.js'), 'utf8')));

function crackApi() {
    const src = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
    const names = [
        'normalizeComponentKey', 'getCrackKindsForComponent', 'getDefectTypePresetForRaw', 'getDefectTypePresetFor'
    ];
    const prelude = [
        "const WALL_CRACK_KINDS=['수직균열','수평균열','경사균열','망상균열'];",
        "const COLUMN_CRACK_KINDS=['수직균열','U자형균열'];",
        "const BEAM_CRACK_KINDS=['수직균열','수평균열'];",
        "const COMPANY_TILE_DEFECTS=['상태양호','균열','들뜸','파손','탈락','박락','이격','줄눈 손상','백태','오염','기타'];",
        "const EXT_PAINT_DEFECTS=['상태양호','균열','변색/오염','박리/탈락','부풀음','기타'];",
        "const COMPANY_FINISH_DEFECTS=['상태양호','균열','들뜸','파손','박락','탈락','이격','철근노출','백태','오염','처짐','누수흔적','도장열화','기타'];",
        "const SPRAY_FINISH_DEFECTS=['상태양호','박락'];",
        "const CEILING_FINISH_DEFECTS=['상태양호','들뜸/탈락'];",
        "const RC_COLUMN_DEFECTS=['상태양호','수직균열','철근노출','기타'];",
        "const componentDefectPreset={ '기둥': RC_COLUMN_DEFECTS };",
        "const categoryDefectPreset={ '마감재':['상태양호','균열','기타'], '구조체':['상태양호','균열'] };",
        "const DEFECT_TYPE_ALLOW=['상태양호','기타','균열','들뜸','파손','탈락','박락','이격','줄눈 손상','백태','오염','변색/오염','박리/탈락','부풀음','처짐','누수흔적','도장열화','철근노출'];",
        "let _defectTypeAllowSet=null;"
    ].join('\n');
    return new Function(prelude + '\n' + names.map((n) => extractFunction(src, 'function ' + n + '(')).join('\n')
        + '\nreturn { getCrackKindsForComponent, getDefectTypePresetForRaw, getDefectTypePresetFor };')();
}

const d = crackApi();
assert.strictEqual(d.getCrackKindsForComponent('기둥 타일'), null, '기둥 타일은 RC 방향균열 아님');
assert.strictEqual(d.getCrackKindsForComponent('벽체 도장'), null);
assert.strictEqual(d.getCrackKindsForComponent('보 마감재'), null);
assert.strictEqual(d.getCrackKindsForComponent('슬래브 타일'), null);
assert.strictEqual(d.getCrackKindsForComponent('기둥 미장'), null);
assert.ok(Array.isArray(d.getCrackKindsForComponent('기둥')), '구조체 맨몸 기둥은 기존 균열 칩');
assert.ok(d.getDefectTypePresetForRaw('마감재', '기둥 타일').includes('들뜸'));
assert.ok(!d.getDefectTypePresetForRaw('마감재', '기둥 타일').includes('철근노출')
    || d.getDefectTypePresetForRaw('마감재', '기둥 타일') !== d.getDefectTypePresetForRaw('구조체', '기둥'));
assert.ok(d.getDefectTypePresetForRaw('마감재', '벽체 도장').includes('박리/탈락')
    || d.getDefectTypePresetForRaw('마감재', '벽체 도장').includes('변색/오염'));
assert.ok(d.getDefectTypePresetForRaw('마감재', '보 마감재').includes('들뜸'));
assert.notDeepStrictEqual(d.getDefectTypePresetForRaw('마감재', '기둥 타일'), d.getDefectTypePresetForRaw('구조체', '기둥'));

(function popupConfirmCancel() {
    function makeNode(tag) {
        const node = {
            tagName: String(tag).toUpperCase(),
            attrs: {},
            children: [],
            className: '',
            id: '',
            classList: { contains(c) { return String(node.className || '').split(/\s+/).includes(c); } },
            style: {},
            parentNode: null,
            textContent: '',
            _html: '',
            listeners: {},
            setAttribute(k, v) {
                node.attrs[k] = String(v);
                if (k === 'id') node.id = String(v);
                if (k === 'class') node.className = String(v);
            },
            getAttribute(k) { return node.attrs[k] != null ? node.attrs[k] : null; },
            appendChild(c) { node.children.push(c); c.parentNode = node; return c; },
            addEventListener(type, fn) {
                node.listeners[type] = node.listeners[type] || [];
                node.listeners[type].push(fn);
            },
            querySelector(sel) { return node.querySelectorAll(sel)[0] || null; },
            querySelectorAll(sel) {
                const all = [];
                (function walk(n) { all.push(n); (n.children || []).forEach(walk); })(node);
                if (sel.startsWith('.')) return all.filter((n) => n.classList.contains(sel.slice(1)));
                if (sel.startsWith('#')) return all.filter((n) => n.id === sel.slice(1));
                const m = sel.match(/^\[([^=\]]+)(?:="([^"]*)")?\]$/);
                if (m) return all.filter((n) => n.attrs[m[1]] && (m[2] == null || n.attrs[m[1]] === m[2]));
                return [];
            }
        };
        Object.defineProperty(node, 'innerHTML', {
            get() { return node._html; },
            set(html) {
                node._html = String(html);
                node.children = [];
                const card = makeNode('div');
                card.setAttribute('class', 'bsa-finish-chooser-card');
                const title = makeNode('div');
                title.setAttribute('class', 'bsa-finish-chooser-title');
                const choices = makeNode('div');
                choices.setAttribute('class', 'bsa-finish-chooser-choices');
                const actions = makeNode('div');
                actions.setAttribute('class', 'bsa-finish-chooser-actions');
                const cancel = makeNode('button');
                cancel.setAttribute('class', 'bsa-finish-chooser-cancel');
                cancel.textContent = '취소';
                actions.appendChild(cancel);
                card.appendChild(title);
                card.appendChild(choices);
                card.appendChild(actions);
                node.appendChild(card);
            }
        });
        return node;
    }
    const bodyKids = [];
    const fakeBody = {
        appendChild(el) { bodyKids.push(el); el.parentNode = fakeBody; return el; },
        removeChild(el) {
            const i = bodyKids.indexOf(el);
            if (i >= 0) bodyKids.splice(i, 1);
            el.parentNode = null;
            return el;
        }
    };
    const prevDoc = global.document;
    global.document = {
        body: fakeBody,
        createElement(tag) { return makeNode(tag); },
        addEventListener() {},
        removeEventListener() {}
    };
    const confirmed = [];
    const cancelled = [];
    chooser.open({
        base: '기둥',
        previousValue: '천장 마감재',
        onConfirm: (v) => confirmed.push(v),
        onCancel: (v) => cancelled.push(v)
    });
    assert.ok(chooser.isOpen(), '팝업 열림');
    const overlay = bodyKids[0];
    assert.strictEqual(overlay.id, 'bsaFinishMemberChooser');
    const tile = overlay.querySelector('[data-material="타일"]');
    assert.ok(tile, '타일 단추');
    (tile.listeners.click || []).forEach((fn) => fn({
        preventDefault() {}, stopPropagation() {}, stopImmediatePropagation() {}
    }));
    assert.deepStrictEqual(confirmed, ['기둥 타일']);
    assert.deepStrictEqual(cancelled, []);

    confirmed.length = 0;
    chooser.open({
        base: '벽체',
        previousValue: '기둥 타일',
        onConfirm: (v) => confirmed.push(v),
        onCancel: (v) => cancelled.push(v)
    });
    const overlay2 = bodyKids[bodyKids.length - 1];
    const cancelBtn = overlay2.querySelector('.bsa-finish-chooser-cancel');
    (cancelBtn.listeners.click || []).forEach((fn) => fn({
        preventDefault() {}, stopPropagation() {}, stopImmediatePropagation() {}
    }));
    assert.deepStrictEqual(confirmed, []);
    assert.deepStrictEqual(cancelled, ['기둥 타일'], '취소는 이전 값 유지');
    global.document = prevDoc;
})();

console.log('test-finish-member-chooser: ok');
