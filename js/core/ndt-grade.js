/**
 * 비파괴조사 등급 계산 — 기울기·부재처짐·탄산화.
 *
 * 원래 app.js 클로저 안에만 있어서 통계 탭(js/tabs/stats.js)에서 부를 수 없었다.
 * 통계에 기울기·부동침하·부재처짐 등급을 넣으려면 같은 식을 두 번 쓰게 되는데,
 * 등급 기준이 어긋나면 화면마다 다른 등급이 나오고 그걸 알아채기 어렵다.
 * 그래서 계산식만 여기로 옮기고 app.js는 이걸 부른다.
 *
 * 근거: 시설물의 안전 및 유지관리 실시 세부지침(건축물편)
 *   - 기울기: [표 6.33] 1/750 이상 a, 1/500 b, 1/250 c, 1/150 d, 그 미만 e
 *   - 부재처짐: [표 6.34] L/480 이하 a·b, L/240 c, L/150 d, 초과 e (480/240/150 3단계)
 *   - 탄산화: 탄산화깊이를 피복두께 D로 나눈 비로 평가한다 (0.75D~0.9D 같은 표기)
 */
(function (root) {
    'use strict';

    function isLevelFilled(level) {
        if (level === null || level === undefined || level === '') return false;
        return Number.isFinite(Number(level));
    }

    function groupLevelsComplete(group) {
        var pts = (group && group.points) || [];
        return pts.length > 0 && pts.every(function (p) { return isLevelFilled(p && p.level); });
    }

    /** 기울기: 높이 대비 변위. 1/750 이상이 a. */
    function calcTiltGrade(lengthMm, deltaMm) {
        var h = Number(lengthMm);
        var delta = Math.abs(Number(deltaMm) || 0);
        if (!Number.isFinite(h) || h <= 0 || delta <= 0) return { tiltRatio: '', grade: '' };
        var ratioInv = Math.round(h / delta);
        var grade = 'e등급';
        if (ratioInv >= 750) grade = 'a등급';
        else if (ratioInv >= 500) grade = 'b등급';
        else if (ratioInv >= 250) grade = 'c등급';
        else if (ratioInv >= 150) grade = 'd등급';
        return { tiltRatio: '1/' + ratioInv, grade: grade };
    }

    /**
     * 부재처짐: 경간 L 대비 처짐 δ. 기울기와 달리 480/240/150 3단계뿐이다(360 구간 없음).
     * hasMinorDamage: 균열 등 경미한 손상을 같이 봤으면 L/480 이내여도 a가 아니라 b.
     */
    function calcMemberDispGrade(lengthMm, deltaMm, hasMinorDamage) {
        var l = Number(lengthMm);
        var delta = Math.abs(Number(deltaMm) || 0);
        var bestGrade = hasMinorDamage ? 'b등급' : 'a등급';
        if (!Number.isFinite(l) || l <= 0 || delta <= 0) return { tiltRatio: '', grade: '' };
        var ratioInv = Math.round(l / delta);
        var grade = 'e등급';
        if (ratioInv >= 480) grade = bestGrade;
        else if (ratioInv >= 240) grade = 'c등급';
        else if (ratioInv >= 150) grade = 'd등급';
        return { tiltRatio: '1/' + ratioInv, grade: grade };
    }

    /**
     * 구역(부동침하 또는 부재처짐) 하나의 변위량·등급.
     *
     * group.points[].level은 cm로 입력받는다(입력칸 라벨은 "mm"로 잘못 적혀 있지만 현장
     * 관행이 cm). 등급 함수는 mm를 받으므로 등급 계산 직전에만 ×10 한다. 돌려주는
     * delta/absDelta는 화면 표시용이라 cm 그대로 둔다.
     */
    function calcGroupDisplacement(group) {
        var points = (group && group.points) || [];
        if (!points.length) {
            return { delta: 0, absDelta: 0, tiltRatio: '-', grade: '', incomplete: true };
        }
        if (!groupLevelsComplete(group) || !(Number(group.measureLength) > 0)) {
            return { delta: 0, absDelta: 0, tiltRatio: '-', grade: '', incomplete: true };
        }

        var isMemberDisp = group.category === '부재변위';
        var lengthMm = (group.measureLength || 0) * 1000;
        var lv = function (p) { return Number(p.level); };
        var delta;

        if (isMemberDisp) {
            if (points.length >= 3) {
                var first = lv(points[0]);
                var last = lv(points[points.length - 1]);
                var mid = lv(points[Math.floor(points.length / 2)]);
                delta = (first + last) / 2.0 - mid;
            } else if (points.length === 2) {
                delta = lv(points[0]) - lv(points[1]);
            } else {
                delta = lv(points[0]);
            }
            var absMember = Math.abs(delta);
            var mcalc = calcMemberDispGrade(lengthMm, absMember * 10, group.hasMinorDamage);
            return { delta: delta, absDelta: absMember, tiltRatio: mcalc.tiltRatio, grade: mcalc.grade, incomplete: false };
        }

        var head = points[0];
        var tail = points[points.length - 1];
        delta = (head && tail) ? (lv(head) - lv(tail)) : 0;
        var absTilt = Math.abs(delta);
        var tcalc = calcTiltGrade(lengthMm, absTilt * 10);
        return { delta: delta, absDelta: absTilt, tiltRatio: tcalc.tiltRatio, grade: tcalc.grade, incomplete: false };
    }

    /** 'a등급' / 'a' / 'A등급' 을 전부 'a'로 맞춘다. 못 읽으면 빈 문자열. */
    function gradeLetter(grade) {
        var s = String(grade == null ? '' : grade).trim().toLowerCase();
        if (!s) return '';
        if (s === 'a/b' || s === 'a_or_b') return 'a_or_b';
        var m = s.match(/^([abcde])(등급)?$/);
        return m ? m[1] : '';
    }

    /**
     * 탄산화깊이가 피복두께의 몇 배인지. 세부지침 등급표가 0.5D·0.75D·0.9D·1.0D로
     * 나뉘어 있어서, 이 비를 같이 보여주면 등급 판단이 바로 된다.
     */
    function carbCoverRatio(depthMm, coverMm) {
        var d = Number(depthMm);
        var c = Number(coverMm);
        if (!Number.isFinite(d) || !Number.isFinite(c) || c <= 0 || d < 0) return null;
        return d / c;
    }

    /** 0.7543 → "0.75D". 범위 표기는 stats 쪽에서 둘을 이어 붙인다. */
    function formatCoverRatio(ratio) {
        if (ratio == null || !Number.isFinite(Number(ratio))) return '';
        return Number(ratio).toFixed(2) + 'D';
    }

    var api = {
        isLevelFilled: isLevelFilled,
        groupLevelsComplete: groupLevelsComplete,
        calcTiltGrade: calcTiltGrade,
        calcMemberDispGrade: calcMemberDispGrade,
        calcGroupDisplacement: calcGroupDisplacement,
        gradeLetter: gradeLetter,
        carbCoverRatio: carbCoverRatio,
        formatCoverRatio: formatCoverRatio
    };

    root.BSA = root.BSA || {};
    root.BSA.ndtGrade = api;
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
})(typeof window !== 'undefined' ? window : globalThis);
