/**
 * 보고서 본문 요약 — 작성안 B (report-summary.html 전용)
 *
 * 작성안 A(summary-core.js)는 우리 보고서의 문구와 조사표의 원인추정을 그대로 따른다.
 * 작성안 B는 그와 별개로, 결함 유형·부재·균열폭을 보고 중요도와 원인, 보수방안을 따로 판단한다.
 * 두 안을 나란히 놓고 책임기술자가 고르거나 섞어 쓰라는 용도다.
 *
 * 여기 규칙은 일반적인 구조·유지관리 지식으로 만든 초안이다. 현장을 보지 않고 조사표 글자만으로
 * 판단하므로 최종 판단은 책임기술자가 한다. 균열폭별 공법 구분(0.2mm 이하 표면처리 / 0.3mm 이상
 * 주입 / 비구조 0.3mm 이상 충전)은 보고서 4장 「주요 보수 방법」의 기준을 따랐다.
 */
(function (root) {
    'use strict';

    const core = (root.BSA && root.BSA.reportSummary) || (typeof require === 'function' ? require('./summary-core.js') : null);

    const has = function (d, re) { return re.test(d.content); };
    /** 조사내용이 보를 가리키는가 (「보수부위」의 '보'는 뺀다) */
    const isBeam = function (d) {
        return /(^|[\s\-])보(\(|\s|-|$)|테두리보|철골보/.test(d.content.replace(/보수/g, ''));
    };
    const isColumn = function (d) { return /기둥/.test(d.content); };

    /**
     * 중요도. grade: '상'(안전·내력에 직접 영향, 우선 조치) | '중'(내구성 저하, 계획 보수) | '하'(미관·경미)
     * @returns {{grade: string, score: number, reason: string}}
     */
    function importanceOf(d) {
        const R = function (score, reason) {
            let s = score;
            let why = reason;
            if (d.progress) { s += 20; why += ' 진행 중으로 표시된 결함이라 순위를 올렸다.'; }
            if (d.leak && d.typeKey !== '누수') { s += 10; why += ' 누수가 동반된다.'; }
            return { grade: s >= 68 ? '상' : (s >= 40 ? '중' : '하'), score: s, reason: why };
        };
        if (d.good) return { grade: '-', score: 0, reason: '' };
        const t = d.typeKey;
        const w = d.widthSuspicious ? null : d.width;
        const cat = d.category;

        if (cat === 'structure') {
            if (t === '단면결손') return R(90, '주요 구조부재의 단면이 줄어 내력에 직접 영향을 준다.');
            if (t === '배부름') return R(78, '부재 변형이다. 시공 오차인지 진행성 변형인지 구분이 필요하다.');
            if (t === '철근노출') {
                return R(isBeam(d) || isColumn(d) ? 80 : 74, '철근이 드러나 있어 부식이 진행되면 단면 손실과 피복 박락으로 이어진다.');
            }
            if (t === '재료분리') return R(66, '재료분리(공극) 부위는 피복 성능이 떨어져 철근 부식에 취약하다.');
            if (t === '누수') return R(78, '누수가 계속되면 철근·철골 부식을 촉진한다.');
            if (t === '균열') {
                if (w != null && w >= 0.5) return R(85, '구조체 균열폭이 0.5mm 이상이다.');
                if (has(d, /경사/) && isBeam(d)) return R(74, '보의 경사균열은 전단 균열일 수 있어 원인 확인이 먼저다.');
                if ((isBeam(d) || isColumn(d)) && w != null && w >= 0.3) return R(72, '보·기둥의 균열폭이 0.3mm 이상이다.');
                if (isColumn(d)) return R(62, '기둥 균열은 폭이 작아도 발생 원인을 확인해야 한다.');
                if (isBeam(d)) return R(58, '보 균열은 위치(중앙부·단부)에 따라 휨·전단 영향일 수 있다.');
                if (w != null && w >= 0.3) return R(60, '균열폭이 0.3mm 이상이라 주입 보수 대상이다.');
                if (has(d, /망상/)) return R(28, '표면 건조수축에 의한 망상균열로 내력 영향은 작다.');
                return R(w == null ? 36 : 30, '균열폭 0.3mm 미만의 건조수축성 균열로 보인다.');
            }
            if (t === '백태') return R(55, '균열을 따라 수분이 지나간 흔적이다. 누수 경로가 살아 있다.');
            if (t === '녹 발생') return R(has(d, /접합부|볼트|이음/) ? 70 : 58, '철골 부식이다. 접합부·볼트 부위는 단면 손실이 내력에 바로 영향을 준다.');
            if (t === '내화피복 박락') return R(50, '화재 시 철골의 내화성능이 떨어진다.');
            if (t === '누수흔적') return R(48, '과거 누수 흔적이다. 원인이 해결됐는지 확인이 필요하다.');
            return R(40, '구조부재에 발생한 결함이다.');
        }
        if (cat === 'nonStructure') {
            if (t === '내화피복 박락') return R(50, '화재 시 철골의 내화성능이 떨어진다.');
            if (t === '녹 발생') return R(55, '철골 부재 부식이다.');
            if (t === '균열') {
                if (w != null && w >= 1.0) return R(46, '비구조 벽체이지만 균열폭이 1.0mm 이상으로 커 누수 경로·탈락 우려가 있다.');
                return R(26, '비구조 벽체의 건조수축·접합부 균열로 내력 영향은 없다.');
            }
            if (t === '누수흔적') return R(42, '창호·개구부 주위로 우수가 들어온 흔적이다.');
            return R(24, '비구조 부위의 경미한 결함이다.');
        }
        if (cat === 'public') {
            if (has(d, /덮개/)) return R(68, '덮개가 없는 개구부는 걸림·빠짐 사고 우려가 있다.');
            if (has(d, /난간|시건|점검로|추락/)) return R(70, '이용자 추락·전도 사고와 직결되는 부위다.');
            return R(26, '통행에는 지장이 없는 경미한 결함이다.');
        }
        if (cat === 'interior') {
            if (t === '누수흔적' || t === '오염') return R(42, '상부 누수·결로가 해결되지 않았다는 표시다.');
            if (has(d, /타일/)) return R(40, '벽체 타일은 들뜸·탈락 시 낙하 위험이 있다.');
            return R(24, '내부 마감재의 경미한 결함이다.');
        }
        if (cat === 'exterior') {
            if (has(d, /석재|계단/)) return R(48, '보행 구간의 석재 들뜸은 걸림·낙하 사고 우려가 있다.');
            if (t === '열화') return R(40, '실링재 열화는 외벽 누수의 출발점이 된다.');
            return R(22, '외장 마감의 미관상 결함이다.');
        }
        if (cat === 'attachment') return R(68, '부착물·철골 부재의 고정 결함은 탈락·낙하 사고로 이어진다.');
        return R(30, '');
    }

    /** B안이 보는 원인 */
    function causeOf(d) {
        const t = d.typeKey;
        const c = d.content;
        if (t === '단면결손') return '설비 배관 관통을 위한 현장 천공으로 추정(구조검토 없이 낸 개구)';
        if (t === '배부름') return '타설 시 거푸집 변형에 의한 시공 오차로 추정';
        if (t === '철근노출') {
            if (/천공|배관|파취/.test(c) || /후속|파취|인위/.test(d.cause)) return '후속 공정(설비 배관 등)에서 콘크리트를 파취하여 철근이 노출';
            if (/재료분리|공극/.test(c)) return '타설 시 다짐 부족으로 생긴 공극(재료분리)에 철근이 노출';
            return '피복두께 부족 상태에서 철근이 부식·팽창하여 피복 콘크리트가 박락';
        }
        if (t === '재료분리') return '타설 시 다짐 부족에 의한 재료분리';
        if (t === '누수') return '상부 방수층 손상으로 우수가 균열·이음부를 따라 침투';
        if (t === '백태') return '균열을 통해 침투한 수분이 콘크리트의 석회 성분을 녹여 표면에 석출';
        if (t === '누수흔적') {
            if (/창|개구부/.test(c)) return '창호 주위 실링재 열화로 우수 침투';
            return '상부 배관 누수·결로 또는 상부층 방수 불량';
        }
        if (t === '오염') return '상부 배관 누수·결로 또는 상부층 방수 불량에 따른 2차 오염';
        if (t === '녹 발생') return '수분 유입(누수·결로)과 방청도막 손상에 의한 부식';
        if (t === '내화피복 박락') return '수분·진동에 의한 부착력 저하 또는 후속 공정 중 손상';
        if (t === '균열') {
            if (/포장/.test(c)) return '차량 하중 반복과 온도수축, 노상 침하';
            if (/타일/.test(c)) return '바탕면 균열의 전달 또는 타일 부착 불량';
            if (/ALC/.test(c)) return 'ALC 블록의 건조수축과 상부 구조체 접합부 거동 차이';
            if (/이격/.test(c)) return '이질재료 접합부의 수축·팽창 차이';
            if (/조적|블록|벽체/.test(c) && !d.structural) {
                return /개구부|창|문/.test(c) ? '개구부 모서리 응력집중과 건조수축' : '조적 벽체의 건조수축 및 골조와의 접합부 거동 차이';
            }
            if (/망상/.test(c)) return '초기 양생 부족에 의한 표면 건조수축';
            if (isBeam(d)) {
                if (/경사/.test(c)) return '단부 경사균열은 전단 영향일 수 있음(건조수축 균열과 구분 필요)';
                if (/U자/.test(c)) return '보 하부를 감싸는 U자형은 휨 인장 균열 또는 건조수축 균열';
                return '보 수직균열 — 중앙부에 몰려 있으면 휨 균열, 전 길이에 고르면 건조수축 균열';
            }
            if (isColumn(d)) return '기둥 수평균열 — 타설 이음부(콜드조인트) 또는 휨 영향';
            return '건조수축·온도변화에 의한 체적 변화가 보·벽체에 구속되어 발생';
        }
        if (/석재/.test(c)) return '붙임 모르타르 부착력 저하와 동결융해';
        if (/도장/.test(c)) return '자외선·수분에 의한 도막 열화';
        if (t === '열화') return '경과년수에 따른 실링재 경화·수축';
        if (/볼트\s*누락|나사산/.test(c)) return '시공 누락 또는 규격에 맞지 않는 볼트 사용';
        if (/덮개/.test(c)) return '덮개 미설치(시공 누락)';
        if (/채움/.test(c)) return '조적 벽체 상부 틈새 채움 누락';
        if (t === '파손') return '사용 중 충격 또는 부착 불량';
        return d.cause || '';
    }

    /**
     * 조사표의 원인추정이 결함 유형과 맞지 않아 보이는 경우 그 이유(맞으면 '').
     * A안은 조사표 원인을 그대로 쓰므로, 이 목록은 A안을 쓸 때도 확인할 가치가 있다.
     */
    function reviewCause(d) {
        if (d.good || !d.cause) return '';
        const rec = d.cause;
        const t = d.typeKey;
        const onlyShrink = /건조수축/.test(rec) && !/방수|수분|습기|누수|우수|피복|다짐|타설|시공/.test(rec);
        if ((t === '철근노출' || t === '재료분리') && onlyShrink) {
            return '철근노출·공극은 건조수축으로 생기지 않는다. 피복두께 부족, 다짐 불량, 파취 중 하나로 적는 것이 맞다.';
        }
        if ((t === '누수' || t === '백태') && onlyShrink) {
            return '균열 원인만 적혀 있다. 누수·백태는 수분이 들어온 경로(방수층, 상부 누수)를 함께 적어야 한다.';
        }
        if (t === '녹 발생' && !/수분|누수|우수|습기|방청|녹막이|도장|결로|미시공/.test(rec)) {
            return '부식 원인(수분 유입 경로, 방청 상태)이 적혀 있지 않다.';
        }
        if (t === '균열' && isBeam(d) && /경사/.test(d.content) && onlyShrink) {
            return '보의 경사균열을 건조수축으로만 적었다. 전단 영향 여부를 확인한 뒤 적는 것이 안전하다.';
        }
        if (t === '단면결손' || t === '배부름') {
            return '';
        }
        return '';
    }

    /** B안 보수방안(결함 한 건 기준) */
    function repairOf(d) {
        const t = d.typeKey;
        const c = d.content;
        const w = d.widthSuspicious ? null : d.width;
        if (t === '단면결손') return '구조검토로 잔존 단면의 내력을 확인한 뒤 덧판 보강 등 보강 조치(보수가 아닌 보강 대상)';
        if (t === '배부름') return '변형량을 계측해 기록하고 추적 관찰, 변화가 있으면 구조검토';
        if (t === '철근노출' || t === '재료분리') return '들뜬 콘크리트 제거 → 철근 녹 제거·방청 → 폴리머 시멘트 모르타르로 단면복구';
        if (t === '누수') return '상부 방수층 보수로 수분 유입을 먼저 차단 → 균열부 발포 우레탄 주입 → 백태 제거';
        if (t === '백태') return '수분 유입 경로 차단 후 균열부 습식 에폭시 주입, 백태 제거';
        if (t === '녹 발생') {
            if (d.category === 'attachment') return '녹 제거 후 방청처리, 누락·규격 미달 볼트는 규격품으로 재체결';
            return '녹 제거(표면처리) → 방청도장 → 내화피복 복구, 볼트 접합부는 체결 상태 점검';
        }
        if (t === '내화피복 박락') return '박락부 바탕 정리 후 같은 사양으로 내화피복 재시공(누수 부위는 원인 차단이 먼저)';
        if (t === '균열') {
            if (/포장/.test(c)) return '균열 실링 또는 부분 재포장';
            if (/타일/.test(c)) return '타음 조사로 들뜸 범위를 확인한 뒤 해당 부위 철거·재시공';
            if (/이격/.test(c)) return '이격부 탄성 실링재 충전';
            if (d.category === 'structure') {
                if (isBeam(d) && /경사/.test(c)) return '원인 확인(구조검토) 후 에폭시 주입, 전단 균열이면 보강 검토';
                if (w != null && w >= 0.3) return '에폭시 주입공법(저압·저속 주입)';
                return '표면처리공법, 균열폭 변화 추적 관찰';
            }
            if (w != null && w >= 0.3) return '균열부 U컷 후 탄성 실링재 충전(충전공법)';
            return '표면처리(퍼티·도장)';
        }
        if (t === '누수흔적' || t === '오염') {
            if (/창|개구부/.test(c)) return '창호 주위 실링재 재시공';
            return '상부 누수 원인(배관·방수) 보수 후 마감재 교체';
        }
        if (/석재/.test(c)) return '들뜬 석재 재부착(앵커 또는 에폭시 접착), 보행 구간부터';
        if (/도장/.test(c)) return '기존 도막 제거 후 재도장';
        if (t === '열화') return '기존 실링재 제거 후 재시공';
        if (/볼트\s*누락|나사산/.test(c)) return '볼트 추가 체결, 규격에 맞는 볼트로 교체 후 방청처리';
        if (/덮개/.test(c)) return '덮개 설치';
        if (/난간|시건/.test(c)) return '고정부·시건장치 보수';
        if (/채움/.test(c)) return '벽체 상부 틈새 충전(모르타르 또는 내화 충전재)';
        if (d.category === 'interior') return '손상 부위 철거 후 재시공';
        return '';
    }

    /** 묶는 기준: 구조체 균열은 부재에 따라 의미가 달라 보·기둥·슬래브(벽체)로 나눈다 */
    function typeOf(d) {
        if (d.category === 'structure' && d.typeKey === '균열') {
            if (isBeam(d)) return '균열(보)';
            if (isColumn(d)) return '균열(기둥)';
            return '균열(슬래브·벽체)';
        }
        return d.typeKey;
    }

    /** 묶음(분류+유형) 보수방안. 구조체 균열은 폭에 따라 공법이 갈리므로 기준을 함께 적는다. */
    function repairOfGroup(group) {
        if (group.category === 'structure' && group.baseType === '균열') {
            const widths = group.items.filter(function (d) { return d.width != null && !d.widthSuspicious; })
                .map(function (d) { return d.width; });
            const max = widths.length ? Math.max.apply(null, widths) : null;
            const diagonal = group.items.some(function (d) { return isBeam(d) && /경사/.test(d.content); });
            return (diagonal ? '경사균열은 원인 확인(구조검토) 후 보수 / ' : '')
                + '0.3mm 미만: 표면처리공법 / 0.3mm 이상: 에폭시 주입공법'
                + (max != null ? ' (금회 최대 ' + (Math.round(max * 100) / 100) + 'mm)' : '');
        }
        return repairOf(group.rep);
    }

    /** 주요 점검결과 한 줄: 균열은 구조·비구조 모두 폭을 적고, 진행·누수 표시를 붙인다 */
    function itemText(d) {
        let t = core.itemText(d);
        if (!d.good && d.category !== 'structure' && d.width != null && !d.widthSuspicious) {
            t += ' (균열폭:' + (Math.round(d.width * 100) / 100) + 'mm)';
        }
        if (d.progress) t += ' (진행)';
        return t;
    }

    function byImportance(list) {
        return list.map(function (d, i) { return { d: d, i: i, s: importanceOf(d).score, p: d.photoNos.length ? 1 : 0 }; })
            .sort(function (a, b) { return b.s - a.s || b.p - a.p || a.i - b.i; })
            .map(function (x) { return x.d; });
    }

    /** B안 추천: 사진 유무가 아니라 중요도 순으로 고른다. 같은 유형은 분류당 두 건까지만. */
    function pickDefaults(defects) {
        const sel = {};
        core.CATEGORIES.forEach(function (cat) {
            if (cat.key === 'load') { sel[cat.key] = []; return; }
            const inCat = defects.filter(function (d) { return d.category === cat.key; });
            const bad = byImportance(inCat.filter(function (d) { return !d.good; }));
            const picked = bad.filter(core.isForced);
            const perType = {};
            const seenText = {};
            picked.forEach(function (d) { perType[d.typeKey] = (perType[d.typeKey] || 0) + 1; seenText[itemText(d)] = true; });
            bad.forEach(function (d) {
                if (picked.length >= core.MAX_ITEMS || picked.indexOf(d) >= 0) return;
                if ((perType[d.typeKey] || 0) >= 2 || seenText[itemText(d)]) return;
                perType[d.typeKey] = (perType[d.typeKey] || 0) + 1;
                seenText[itemText(d)] = true;
                picked.push(d);
            });
            if (!picked.length) {
                const good = inCat.filter(function (d) { return d.good; })
                    .sort(function (a, b) { return b.photoNos.length - a.photoNos.length; });
                if (good[0]) picked.push(good[0]);
            }
            sel[cat.key] = picked.map(function (d) { return d.id; });
        });
        return sel;
    }

    /**
     * core.buildGroups(…, typeOf)가 만든 묶음에 B안의 원인·보수방안·중요도를 입힌다.
     * 대표 항목은 묶음에서 가장 중요한 것으로 한다(중요도·원인·조치가 같은 결함을 가리키도록).
     */
    function applyToGroups(groups) {
        groups.forEach(function (g) {
            const top = byImportance(g.items)[0];
            g.rep = top;
            g.importance = importanceOf(top);
            g.cause = causeOf(top);
            const r = repairOfGroup(g);
            g.repair = { short: r, long: r };
        });
        return groups;
    }

    function buildOpinion(catKey, groups, meta) {
        const cat = core.CATEGORIES.filter(function (c) { return c.key === catKey; })[0];
        const name = (meta && meta.buildingName) || '대상 건축물';
        const round = (meta && meta.roundLabel) ? meta.roundLabel + ' ' : '';
        const lines = ['․ ' + name + '에 대하여 실시한 ' + round + '점검 중 ' + cat.short + '에 대한 점검 결과는 다음과 같다.'];
        const mine = groups.filter(function (g) { return g.category === catKey && g.selected; })
            .sort(function (a, b) { return b.importance.score - a.importance.score; });
        if (!mine.length) {
            lines.push('- ' + cat.short + '에서 보수가 필요한 결함은 확인되지 않음.');
            return lines.join('\n');
        }
        mine.forEach(function (g) {
            lines.push('- [중요도 ' + g.importance.grade + '] ' + g.rep.content + ' (' + g.location + '): '
                + g.cause + '. → ' + g.repair.short + '.');
        });
        return lines.join('\n');
    }

    /** 보수 우선순위 제안: 묶음을 중요도 순으로 */
    function buildPriorityRows(groups) {
        return groups.slice().sort(function (a, b) { return b.importance.score - a.importance.score; })
            .map(function (g, i) {
                return {
                    key: 'prio|' + g.key,
                    cells: [String(i + 1), g.importance.grade, core.categoryLabel(g.category), g.rep.content,
                        g.location + ' (' + g.items.length + '건)', g.importance.reason, g.repair.short]
                };
            });
    }

    function listCauseReviews(defects) {
        const out = [];
        (defects || []).forEach(function (d) {
            const why = reviewCause(d);
            if (why) out.push({ d: d, why: why });
        });
        return out;
    }

    const api = {
        importanceOf: importanceOf,
        causeOf: causeOf,
        reviewCause: reviewCause,
        repairOf: repairOf,
        repairOfGroup: repairOfGroup,
        itemText: itemText,
        typeOf: typeOf,
        byImportance: byImportance,
        pickDefaults: pickDefaults,
        applyToGroups: applyToGroups,
        buildOpinion: buildOpinion,
        buildPriorityRows: buildPriorityRows,
        listCauseReviews: listCauseReviews
    };

    root.BSA = root.BSA || {};
    root.BSA.reportSummaryAlt = api;
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
})(typeof window !== 'undefined' ? window : globalThis);
