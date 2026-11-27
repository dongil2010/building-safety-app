/**
 * 도면 편집기 (2026-11-24)
 * - 도면 점검 화면의 「도면 편집」 단추로 여는 전체 화면 편집 창.
 * - 지금 층 도면 그림 위에 벽체·문·창문·기둥·집기 샘플을 놓고, 기존 선(벽·문 등)은 지우개·영역 지우기(흰색)로 지운다.
 * - 그린 것은 모두 개체(되돌리기·이동·크기·회전 가능)로 들고 있다가 「저장」 때 도면 그림에 합쳐 그 층 도면을 바꾼다.
 * - 좌표는 마킹과 같은 기준(floorPlanRef, 보통 긴 변 4000) → 저장해도 마킹이 그 자리에 그대로 남는다.
 * - 저장은 app.js의 BSA.drawingEditorBridge.save(「파일로 교체」와 같은 길: 기기·클라우드·고해상도 티어).
 */
(function () {
    'use strict';

    var Z_INDEX = 20000; // 앱 창(12000)보다 위, 알림(100000)·로딩(100001)·확인창보다 아래

    // ---------- 샘플(기호) ----------
    // 각 기호는 가운데가 (0,0)인 w×h 상자 안에 그린다. lw = 기본 선 굵기(도면 좌표).
    function strokeRect(ctx, x, y, w, h) { ctx.strokeRect(x, y, w, h); }
    function fillWhiteRect(ctx, x, y, w, h) { ctx.save(); ctx.fillStyle = '#fff'; ctx.fillRect(x, y, w, h); ctx.restore(); }
    function line(ctx, x1, y1, x2, y2) { ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); }
    function hatch(ctx, x, y, w, h, gap, clipFn) {
        ctx.save();
        ctx.beginPath();
        if (clipFn) clipFn(); else ctx.rect(x, y, w, h);
        ctx.clip();
        ctx.beginPath();
        for (var t = -h; t < w; t += gap) {
            ctx.moveTo(x + t, y + h);
            ctx.lineTo(x + t + h, y);
        }
        ctx.lineWidth = ctx.lineWidth * 0.6;
        ctx.stroke();
        ctx.restore();
    }
    /** 문 아래(벽 쪽) 흰 띠: 기존 벽선을 문 폭만큼 지운다 */
    function doorCut(ctx, o, w, h) {
        if (!(o.cut > 0)) return;
        fillWhiteRect(ctx, -w / 2, h / 2 - o.cut / 2, w, o.cut);
    }

    /**
     * 문짝(2026-11-26): 예전엔 선 굵기 1.6배 한 줄 → 확대하면 시커먼 막대, DXF에선 폭 준 굵은 선이 됐다.
     * 이제 문짝 두께(o.leaf, 도면 좌표)만큼의 가는 테두리 상자 — 0이면 가는 한 줄. 속성 칸 「문짝 두께」로 조절.
     * dir = 1이면 x에서 오른쪽(안쪽)으로, -1이면 왼쪽으로 두께를 준다.
     */
    function doorLeaf(ctx, o, x, h, lw, dir) {
        var t = Math.max(0, +o.leaf || 0);
        ctx.lineWidth = lw * 0.7;
        if (t > 0) {
            var x0 = dir > 0 ? x : x - t;
            fillWhiteRect(ctx, x0, -h / 2, t, h);
            strokeRect(ctx, x0, -h / 2, t, h);
        } else {
            line(ctx, x, h / 2, x, -h / 2);
        }
    }

    var SYMBOLS = {
        door1: {
            label: '여닫이문', group: '문', size: [1.8, 1.8], cut: true, leaf: 0.08,
            draw: function (ctx, o, w, h, lw) {
                doorCut(ctx, o, w, h);
                ctx.lineWidth = lw * 0.7;
                ctx.beginPath();
                ctx.ellipse(-w / 2, h / 2, w, h, 0, -Math.PI / 2, 0);
                ctx.stroke();
                doorLeaf(ctx, o, -w / 2, h, lw, 1);
            }
        },
        door2: {
            label: '양여닫이문', group: '문', size: [3, 1.5], cut: true, leaf: 0.08,
            draw: function (ctx, o, w, h, lw) {
                doorCut(ctx, o, w, h);
                ctx.lineWidth = lw * 0.7;
                ctx.beginPath(); ctx.ellipse(-w / 2, h / 2, w / 2, h, 0, -Math.PI / 2, 0); ctx.stroke();
                ctx.beginPath(); ctx.ellipse(w / 2, h / 2, w / 2, h, 0, Math.PI, Math.PI * 1.5); ctx.stroke();
                doorLeaf(ctx, o, -w / 2, h, lw, 1);
                doorLeaf(ctx, o, w / 2, h, lw, -1);
            }
        },
        doorSlide: {
            label: '미서기문', group: '문', size: [2.4, 0.4],
            draw: function (ctx, o, w, h, lw) {
                fillWhiteRect(ctx, -w / 2, -h / 2, w, h);
                ctx.lineWidth = lw;
                var pw = w * 0.55;
                strokeRect(ctx, -w / 2, -h / 2, pw, h / 2);
                strokeRect(ctx, w / 2 - pw, 0, pw, h / 2);
                ctx.lineWidth = lw * 0.6;
                line(ctx, -w / 2, -h / 2, -w / 2, h / 2);
                line(ctx, w / 2, -h / 2, w / 2, h / 2);
            }
        },
        window: {
            label: '창문', group: '창', size: [3, 0.4],
            draw: function (ctx, o, w, h, lw) {
                fillWhiteRect(ctx, -w / 2, -h / 2, w, h);
                ctx.lineWidth = lw;
                strokeRect(ctx, -w / 2, -h / 2, w, h);
                ctx.lineWidth = lw * 0.6;
                line(ctx, -w / 2, -h / 6, w / 2, -h / 6);
                line(ctx, -w / 2, h / 6, w / 2, h / 6);
            }
        },
        windowSlide: {
            label: '미서기창', group: '창', size: [3, 0.4],
            draw: function (ctx, o, w, h, lw) {
                fillWhiteRect(ctx, -w / 2, -h / 2, w, h);
                ctx.lineWidth = lw;
                strokeRect(ctx, -w / 2, -h / 2, w, h);
                ctx.lineWidth = lw * 0.6;
                line(ctx, -w / 2, -h / 8, w * 0.08, -h / 8);
                line(ctx, -w * 0.08, h / 8, w / 2, h / 8);
            }
        },
        colSq: {
            label: '각기둥', group: '기둥', size: [1.2, 1.2],
            draw: function (ctx, o, w, h, lw) {
                fillWhiteRect(ctx, -w / 2, -h / 2, w, h);
                ctx.lineWidth = lw;
                hatch(ctx, -w / 2, -h / 2, w, h, Math.max(w, h) / 6);
                strokeRect(ctx, -w / 2, -h / 2, w, h);
            }
        },
        colSqSolid: {
            label: '각기둥(채움)', group: '기둥', size: [1.2, 1.2],
            draw: function (ctx, o, w, h, lw) {
                ctx.save(); ctx.fillStyle = '#111'; ctx.fillRect(-w / 2, -h / 2, w, h); ctx.restore();
            }
        },
        colRound: {
            label: '원기둥', group: '기둥', size: [1.2, 1.2],
            draw: function (ctx, o, w, h, lw) {
                var clip = function () { ctx.ellipse(0, 0, w / 2, h / 2, 0, 0, Math.PI * 2); };
                ctx.save(); ctx.fillStyle = '#fff'; ctx.beginPath(); clip(); ctx.fill(); ctx.restore();
                ctx.lineWidth = lw;
                hatch(ctx, -w / 2, -h / 2, w, h, Math.max(w, h) / 6, clip);
                ctx.beginPath(); clip(); ctx.stroke();
            }
        },
        stairs: {
            label: '계단', group: '집기', size: [6, 2.4],
            draw: function (ctx, o, w, h, lw) {
                fillWhiteRect(ctx, -w / 2, -h / 2, w, h);
                ctx.lineWidth = lw;
                strokeRect(ctx, -w / 2, -h / 2, w, h);
                ctx.lineWidth = lw * 0.6;
                var n = Math.max(4, Math.round(w / (h / 2.6)));
                for (var i = 1; i < n; i++) { var x = -w / 2 + (w * i) / n; line(ctx, x, -h / 2, x, h / 2); }
                ctx.lineWidth = lw * 0.8;
                line(ctx, -w / 2 + w * 0.06, 0, w / 2 - w * 0.06, 0);
                var ah = Math.min(h * 0.18, w * 0.06);
                line(ctx, w / 2 - w * 0.06, 0, w / 2 - w * 0.06 - ah, -ah * 0.7);
                line(ctx, w / 2 - w * 0.06, 0, w / 2 - w * 0.06 - ah, ah * 0.7);
            }
        },
        ev: {
            label: '승강기', group: '집기', size: [2.6, 2.6],
            draw: function (ctx, o, w, h, lw) {
                fillWhiteRect(ctx, -w / 2, -h / 2, w, h);
                ctx.lineWidth = lw;
                strokeRect(ctx, -w / 2, -h / 2, w, h);
                ctx.lineWidth = lw * 0.6;
                line(ctx, -w / 2, -h / 2, w / 2, h / 2);
                line(ctx, w / 2, -h / 2, -w / 2, h / 2);
            }
        },
        desk: {
            label: '책상', group: '집기', size: [2.4, 1.2],
            draw: function (ctx, o, w, h, lw) {
                fillWhiteRect(ctx, -w / 2, -h / 2, w, h);
                ctx.lineWidth = lw * 0.8;
                strokeRect(ctx, -w / 2, -h / 2, w, h);
                ctx.lineWidth = lw * 0.5;
                strokeRect(ctx, w / 2 - w * 0.3, -h / 2 + h * 0.08, w * 0.24, h * 0.84);
            }
        },
        chair: {
            label: '의자', group: '집기', size: [0.9, 0.9],
            draw: function (ctx, o, w, h, lw) {
                fillWhiteRect(ctx, -w / 2, -h / 2, w, h);
                ctx.lineWidth = lw * 0.7;
                strokeRect(ctx, -w / 2 + w * 0.08, -h / 2 + h * 0.22, w * 0.84, h * 0.78);
                strokeRect(ctx, -w / 2, -h / 2, w, h * 0.2);
            }
        },
        table: {
            label: '회의탁자', group: '집기', size: [5, 3],
            draw: function (ctx, o, w, h, lw) {
                ctx.lineWidth = lw * 0.7;
                var tw = w * 0.78, th = h * 0.5;
                var cs = Math.min(h * 0.18, w * 0.1);
                var n = Math.max(2, Math.floor(tw / (cs * 1.8)));
                for (var i = 0; i < n; i++) {
                    var cx = -tw / 2 + (tw * (i + 0.5)) / n;
                    fillWhiteRect(ctx, cx - cs / 2, -h / 2, cs, cs); strokeRect(ctx, cx - cs / 2, -h / 2, cs, cs);
                    fillWhiteRect(ctx, cx - cs / 2, h / 2 - cs, cs, cs); strokeRect(ctx, cx - cs / 2, h / 2 - cs, cs, cs);
                }
                fillWhiteRect(ctx, -tw / 2, -th / 2, tw, th);
                ctx.lineWidth = lw * 0.9;
                strokeRect(ctx, -tw / 2, -th / 2, tw, th);
            }
        },
        bed: {
            label: '침대', group: '집기', size: [2.2, 4],
            draw: function (ctx, o, w, h, lw) {
                fillWhiteRect(ctx, -w / 2, -h / 2, w, h);
                ctx.lineWidth = lw * 0.8;
                strokeRect(ctx, -w / 2, -h / 2, w, h);
                ctx.lineWidth = lw * 0.6;
                strokeRect(ctx, -w / 2 + w * 0.12, -h / 2 + h * 0.04, w * 0.76, h * 0.14);
                line(ctx, -w / 2, -h / 2 + h * 0.3, w / 2, -h / 2 + h * 0.3);
                line(ctx, -w / 2, -h / 2 + h * 0.3, -w / 2 + w * 0.35, -h / 2 + h * 0.42);
            }
        },
        toilet: {
            label: '변기', group: '집기', size: [0.9, 1.4],
            draw: function (ctx, o, w, h, lw) {
                ctx.lineWidth = lw * 0.7;
                fillWhiteRect(ctx, -w * 0.45, -h / 2, w * 0.9, h * 0.26);
                strokeRect(ctx, -w * 0.45, -h / 2, w * 0.9, h * 0.26);
                ctx.save(); ctx.fillStyle = '#fff';
                ctx.beginPath(); ctx.ellipse(0, h * 0.14, w * 0.42, h * 0.34, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore();
                ctx.beginPath(); ctx.ellipse(0, h * 0.14, w * 0.42, h * 0.34, 0, 0, Math.PI * 2); ctx.stroke();
                ctx.beginPath(); ctx.ellipse(0, h * 0.18, w * 0.26, h * 0.22, 0, 0, Math.PI * 2); ctx.stroke();
            }
        },
        sink: {
            label: '세면대', group: '집기', size: [1.3, 1],
            draw: function (ctx, o, w, h, lw) {
                fillWhiteRect(ctx, -w / 2, -h / 2, w, h);
                ctx.lineWidth = lw * 0.7;
                strokeRect(ctx, -w / 2, -h / 2, w, h);
                ctx.beginPath(); ctx.ellipse(0, h * 0.06, w * 0.36, h * 0.32, 0, 0, Math.PI * 2); ctx.stroke();
                ctx.beginPath(); ctx.arc(0, -h * 0.34, Math.min(w, h) * 0.05, 0, Math.PI * 2); ctx.stroke();
            }
        },
        sofa: {
            label: '소파', group: '집기', size: [4, 1.8],
            draw: function (ctx, o, w, h, lw) {
                fillWhiteRect(ctx, -w / 2, -h / 2, w, h);
                ctx.lineWidth = lw * 0.8;
                strokeRect(ctx, -w / 2, -h / 2, w, h);
                ctx.lineWidth = lw * 0.6;
                var aw = Math.min(w * 0.12, h * 0.35);
                strokeRect(ctx, -w / 2, -h / 2, w, h * 0.28);
                strokeRect(ctx, -w / 2, -h / 2 + h * 0.28, aw, h * 0.72);
                strokeRect(ctx, w / 2 - aw, -h / 2 + h * 0.28, aw, h * 0.72);
                line(ctx, 0, -h / 2 + h * 0.28, 0, h / 2);
            }
        },
        cabinet: {
            label: '수납장', group: '집기', size: [2.4, 0.9],
            draw: function (ctx, o, w, h, lw) {
                fillWhiteRect(ctx, -w / 2, -h / 2, w, h);
                ctx.lineWidth = lw * 0.8;
                strokeRect(ctx, -w / 2, -h / 2, w, h);
                ctx.lineWidth = lw * 0.5;
                line(ctx, -w / 2, -h / 2, w / 2, h / 2);
                line(ctx, w / 2, -h / 2, -w / 2, h / 2);
            }
        },
        sink2: {
            label: '싱크대', group: '집기', size: [3.6, 1.0],
            draw: function (ctx, o, w, h, lw) {
                fillWhiteRect(ctx, -w / 2, -h / 2, w, h);
                ctx.lineWidth = lw * 0.8;
                strokeRect(ctx, -w / 2, -h / 2, w, h);
                ctx.lineWidth = lw * 0.6;
                var bw = Math.min(w * 0.3, h * 1.1);
                strokeRect(ctx, -bw / 2, -h / 2 + h * 0.15, bw, h * 0.7);
                ctx.beginPath(); ctx.arc(w * 0.3, 0, h * 0.14, 0, Math.PI * 2); ctx.stroke();
                ctx.beginPath(); ctx.arc(w * 0.3 + h * 0.36, 0, h * 0.14, 0, Math.PI * 2); ctx.stroke();
            }
        },
        wipe: {
            label: '영역 지우기', group: '_', size: [2, 2], noIcon: true,
            draw: function (ctx, o, w, h) { fillWhiteRect(ctx, -w / 2, -h / 2, w, h); }
        }
    };
    var GROUP_ORDER = ['문', '창', '기둥', '집기'];

    // ---------- 상태 ----------
    var S = null; // 열려 있는 동안만 값이 있다
    var _lastSize = {}; // 기호 종류별 마지막 크기(같은 문을 여러 개 놓을 때 같은 크기)
    var _lastLeaf = {}; // 문 종류별 마지막 문짝 두께

    function newState(info, img) {
        var long = Math.max(info.refW, info.refH);
        return {
            info: info,
            img: img,
            unit: long / 100,
            // 선 굵기 단위: 긴 변 4000 기준 1px. 예전 기본(2px)은 원래 도면 선보다 굵어 보였다(2026-11-24)
            lwUnit: long / 4000,
            lw: Math.max(0.5, long / 4000),
            objs: [],
            undo: [],
            redo: [],
            tool: 'select',
            sel: -1,
            view: { scale: 1, ox: 0, oy: 0 },
            angleStep: 15, // 끌어 그릴 때 각도 붙이기(0 = 자유). Shift를 누르면 반대로
            eraserSize: Math.max(4, long / 250),
            wallTh: Math.max(6, long / 250),
            wallFill: 'white',
            drag: null,
            pointers: new Map(),
            pinch: null,
            spaceDown: false,
            hover: null,
            dirtyFrame: false,
            savedJson: '[]'
        };
    }

    // ---------- DOM ----------
    var root, canvas, ctx2d, propsEl, statusEl, titleEl;

    function injectCss() {
        if (document.getElementById('bsaDrawingEditorCss')) return;
        var css = [
            '#bsaDrawingEditor{position:fixed;inset:0;z-index:' + Z_INDEX + ';display:flex;flex-direction:column;background:#e2e8f0;color:#0f172a;font-family:inherit;user-select:none;-webkit-user-select:none;}',
            '#bsaDrawingEditor[hidden]{display:none;}',
            '#bsaDrawingEditor .bde-top{display:flex;align-items:center;gap:6px;flex-wrap:wrap;padding:6px 10px;background:#0f172a;color:#f8fafc;}',
            '#bsaDrawingEditor .bde-title{font-weight:700;font-size:14px;margin-right:6px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:40vw;}',
            '#bsaDrawingEditor .bde-top .bde-sp{flex:1;}',
            '#bsaDrawingEditor button.bde-b{border:1px solid #334155;background:#1e293b;color:#f8fafc;border-radius:7px;padding:6px 10px;font-size:13px;cursor:pointer;white-space:nowrap;}',
            '#bsaDrawingEditor button.bde-b:hover{background:#334155;}',
            '#bsaDrawingEditor button.bde-b:disabled{opacity:.4;cursor:default;}',
            '#bsaDrawingEditor button.bde-save{background:#2563eb;border-color:#3b82f6;font-weight:700;}',
            '#bsaDrawingEditor button.bde-save:hover{background:#1d4ed8;}',
            '#bsaDrawingEditor .bde-opt{display:flex;align-items:center;gap:4px;font-size:12px;color:#cbd5e1;white-space:nowrap;}',
            '#bsaDrawingEditor .bde-opt input[type=range]{width:80px;}',
            '#bsaDrawingEditor .bde-opt select{font-size:12px;border-radius:5px;padding:2px;}',
            '#bsaDrawingEditor .bde-opt .bde-val{min-width:26px;font-variant-numeric:tabular-nums;color:#f8fafc;}',
            '#bsaDrawingEditor .bde-body{flex:1;min-height:0;display:flex;}',
            '#bsaDrawingEditor .bde-side{width:176px;flex:none;overflow-y:auto;background:#fff;border-right:1px solid #cbd5e1;padding:6px;}',
            '#bsaDrawingEditor .bde-gt{font-size:11px;font-weight:700;color:#64748b;margin:8px 2px 4px;}',
            '#bsaDrawingEditor .bde-grid{display:grid;grid-template-columns:1fr 1fr;gap:4px;}',
            '#bsaDrawingEditor .bde-tool{display:flex;flex-direction:column;align-items:center;gap:2px;border:1px solid #e2e8f0;background:#f8fafc;border-radius:8px;padding:4px 2px;font-size:11px;cursor:pointer;color:#0f172a;}',
            '#bsaDrawingEditor .bde-tool canvas{width:52px;height:36px;}',
            '#bsaDrawingEditor .bde-tool .bde-ic{font-size:18px;line-height:36px;height:36px;}',
            '#bsaDrawingEditor .bde-tool.on{border-color:#2563eb;background:#dbeafe;box-shadow:0 0 0 1px #2563eb inset;}',
            '#bsaDrawingEditor .bde-stage{flex:1;min-width:0;position:relative;overflow:hidden;touch-action:none;}',
            '#bsaDrawingEditor .bde-stage canvas{position:absolute;inset:0;width:100%;height:100%;display:block;}',
            '#bsaDrawingEditor .bde-props{position:absolute;right:10px;top:10px;background:#fff;border:1px solid #cbd5e1;border-radius:10px;padding:8px 10px;box-shadow:0 6px 20px rgba(15,23,42,.18);font-size:12px;display:flex;flex-direction:column;gap:6px;min-width:190px;}',
            '#bsaDrawingEditor .bde-props[hidden]{display:none;}',
            '#bsaDrawingEditor .bde-props .bde-row{display:flex;align-items:center;gap:4px;flex-wrap:wrap;}',
            '#bsaDrawingEditor .bde-props input[type=number]{width:64px;font-size:12px;padding:2px 4px;border:1px solid #cbd5e1;border-radius:5px;}',
            '#bsaDrawingEditor .bde-props input[type=text]{width:140px;font-size:12px;padding:2px 4px;border:1px solid #cbd5e1;border-radius:5px;}',
            '#bsaDrawingEditor .bde-props button{border:1px solid #cbd5e1;background:#f1f5f9;border-radius:6px;padding:3px 7px;font-size:12px;cursor:pointer;}',
            '#bsaDrawingEditor .bde-props button.bde-del{color:#b91c1c;border-color:#fca5a5;background:#fef2f2;}',
            '#bsaDrawingEditor .bde-status{position:absolute;left:10px;bottom:8px;background:rgba(15,23,42,.78);color:#f8fafc;font-size:12px;padding:4px 9px;border-radius:7px;pointer-events:none;max-width:calc(100% - 20px);}',
            '#bsaDrawingEditor .bde-busy{position:absolute;inset:0;background:rgba(15,23,42,.45);display:flex;align-items:center;justify-content:center;color:#fff;font-size:15px;font-weight:700;}',
            '#bsaDrawingEditor .bde-busy[hidden]{display:none;}',
            '@media (max-width:760px){',
            '#bsaDrawingEditor .bde-body{flex-direction:column-reverse;}',
            '#bsaDrawingEditor .bde-side{width:auto;height:96px;border-right:0;border-top:1px solid #cbd5e1;overflow-x:auto;overflow-y:hidden;display:flex;gap:6px;align-items:flex-start;white-space:nowrap;}',
            '#bsaDrawingEditor .bde-gt{display:none;}',
            '#bsaDrawingEditor .bde-grid{display:flex;gap:4px;}',
            '#bsaDrawingEditor .bde-tool{width:62px;flex:none;}',
            '#bsaDrawingEditor .bde-title{max-width:60vw;}',
            '#bsaDrawingEditor .bde-props{left:8px;right:8px;top:8px;min-width:0;}',
            '}'
        ].join('\n');
        var st = document.createElement('style');
        st.id = 'bsaDrawingEditorCss';
        st.textContent = css;
        document.head.appendChild(st);
    }

    var BASIC_TOOLS = [
        { id: 'select', label: '선택·이동', ic: '↖' },
        { id: 'erase', label: '지우개', ic: '⌫' },
        { id: 'wipe', label: '영역 지우기', ic: '▭' },
        { id: 'wall', label: '벽체', ic: '▬' },
        { id: 'line', label: '선', ic: '╱' },
        { id: 'text', label: '글자', ic: 'T' }
    ];

    function buildDom() {
        injectCss();
        root = document.createElement('div');
        root.id = 'bsaDrawingEditor';
        root.hidden = true;
        root.innerHTML =
            '<div class="bde-top">' +
            '  <span class="bde-title"></span>' +
            '  <button type="button" class="bde-b" data-act="undo" title="되돌리기 (Ctrl+Z)">↶ 되돌리기</button>' +
            '  <button type="button" class="bde-b" data-act="redo" title="다시 하기 (Ctrl+Y)">↷</button>' +
            '  <button type="button" class="bde-b" data-act="fit" title="화면에 맞추기">맞춤</button>' +
            '  <label class="bde-opt" title="벽체·선을 끌 때 이 각도 단위로 붙입니다(자유 = 아무 각도). Shift를 누르면 반대로. 그린 뒤 속성 칸에서 각도를 숫자로 바꿀 수 있습니다">각도 <select data-opt="angleStep"><option value="0">자유</option><option value="15">15°</option><option value="45">45°</option><option value="90">90°</option></select></label>' +
            '  <label class="bde-opt" title="지우개 굵기">지우개 <input type="range" data-opt="eraser" min="1" max="60"></label>' +
            '  <label class="bde-opt" title="벽체 두께 — 벽을 골라 두었으면 그 벽도 바뀝니다(문 아래 벽 뚫기 폭도 이 값)">벽 두께 <input type="range" data-opt="wallTh" min="1" max="40"><span class="bde-val" data-val="wallTh"></span></label>' +
            '  <label class="bde-opt" title="선 굵기(벽 테두리·선·샘플) — 고른 개체가 있으면 그것도 바뀝니다">선 굵기 <input type="range" data-opt="lw" min="1" max="16"><span class="bde-val" data-val="lw"></span></label>' +
            '  <label class="bde-opt">벽 속 <select data-opt="wallFill"><option value="white">비움</option><option value="hatch">빗금</option><option value="solid">채움</option></select></label>' +
            '  <span class="bde-sp"></span>' +
            '  <button type="button" class="bde-b bde-save" data-act="save">저장 (점검 도면에 반영)</button>' +
            '  <button type="button" class="bde-b" data-act="close">닫기</button>' +
            '</div>' +
            '<div class="bde-body">' +
            '  <div class="bde-side"></div>' +
            '  <div class="bde-stage"><canvas></canvas>' +
            '    <div class="bde-props" hidden></div>' +
            '    <div class="bde-status"></div>' +
            '    <div class="bde-busy" hidden>저장 중…</div>' +
            '  </div>' +
            '</div>';
        document.body.appendChild(root);
        titleEl = root.querySelector('.bde-title');
        canvas = root.querySelector('.bde-stage canvas');
        ctx2d = canvas.getContext('2d');
        propsEl = root.querySelector('.bde-props');
        statusEl = root.querySelector('.bde-status');

        var side = root.querySelector('.bde-side');
        var html = '<div class="bde-gt">기본</div><div class="bde-grid">';
        BASIC_TOOLS.forEach(function (t) {
            html += '<button type="button" class="bde-tool" data-tool="' + t.id + '" title="' + t.label + '"><span class="bde-ic">' + t.ic + '</span>' + t.label + '</button>';
        });
        html += '</div>';
        GROUP_ORDER.forEach(function (g) {
            html += '<div class="bde-gt">' + g + '</div><div class="bde-grid">';
            Object.keys(SYMBOLS).forEach(function (k) {
                var sym = SYMBOLS[k];
                if (sym.group !== g) return;
                html += '<button type="button" class="bde-tool" data-tool="sym:' + k + '" title="' + sym.label + ' 놓기 — 도면을 누르면 그 자리에 놓입니다"><canvas width="104" height="72" data-icon="' + k + '"></canvas>' + sym.label + '</button>';
            });
            html += '</div>';
        });
        side.innerHTML = html;
        side.querySelectorAll('canvas[data-icon]').forEach(drawIcon);

        root.addEventListener('click', onRootClick);
        root.querySelectorAll('[data-opt]').forEach(function (el) {
            el.addEventListener('input', onOptChange);
            el.addEventListener('change', onOptChange);
        });
        canvas.addEventListener('pointerdown', onPointerDown);
        canvas.addEventListener('pointermove', onPointerMove);
        canvas.addEventListener('pointerup', onPointerUp);
        canvas.addEventListener('pointercancel', onPointerUp);
        canvas.addEventListener('wheel', onWheel, { passive: false });
        canvas.addEventListener('contextmenu', function (e) { e.preventDefault(); });
        canvas.addEventListener('dblclick', onDblClick);
        window.addEventListener('resize', function () { if (S) { resizeCanvas(); requestDraw(); } });
        window.addEventListener('keydown', onKeyDown, true);
        window.addEventListener('keyup', onKeyUp, true);
        propsEl.addEventListener('input', onPropInput);
        propsEl.addEventListener('click', onPropClick);
    }

    function drawIcon(cv) {
        var k = cv.getAttribute('data-icon');
        var sym = SYMBOLS[k];
        var c = cv.getContext('2d');
        c.clearRect(0, 0, cv.width, cv.height);
        var sw = sym.size[0], sh = sym.size[1];
        var s = Math.min((cv.width - 16) / sw, (cv.height - 16) / sh);
        c.save();
        c.translate(cv.width / 2, cv.height / 2);
        c.scale(s, s);
        c.strokeStyle = '#0f172a';
        c.fillStyle = '#0f172a';
        var o = { k: k, cut: 0, leaf: sym.leaf || 0 };
        sym.draw(c, o, sw, sh, 2.2 / s);
        c.restore();
    }

    // ---------- 좌표 ----------
    function toDoc(clientX, clientY) {
        var r = canvas.getBoundingClientRect();
        var v = S.view;
        return { x: (clientX - r.left - v.ox) / v.scale, y: (clientY - r.top - v.oy) / v.scale };
    }
    function resizeCanvas() {
        var r = canvas.getBoundingClientRect();
        var dpr = window.devicePixelRatio || 1;
        canvas.width = Math.max(1, Math.round(r.width * dpr));
        canvas.height = Math.max(1, Math.round(r.height * dpr));
    }
    function fitView() {
        var r = canvas.getBoundingClientRect();
        var pad = 24;
        var s = Math.min((r.width - pad * 2) / S.info.refW, (r.height - pad * 2) / S.info.refH);
        if (!(s > 0)) s = 0.1;
        S.view.scale = s;
        S.view.ox = (r.width - S.info.refW * s) / 2;
        S.view.oy = (r.height - S.info.refH * s) / 2;
        requestDraw();
    }
    function zoomAt(clientX, clientY, factor) {
        var r = canvas.getBoundingClientRect();
        var v = S.view;
        var fit = Math.min(r.width / S.info.refW, r.height / S.info.refH);
        var ns = Math.max(fit * 0.3, Math.min(fit * 80, v.scale * factor));
        var px = clientX - r.left, py = clientY - r.top;
        v.ox = px - ((px - v.ox) * ns) / v.scale;
        v.oy = py - ((py - v.oy) * ns) / v.scale;
        v.scale = ns;
        requestDraw();
    }

    // ---------- 그리기 ----------
    function requestDraw() {
        if (!S || S.dirtyFrame) return;
        S.dirtyFrame = true;
        requestAnimationFrame(function () {
            if (!S) return;
            S.dirtyFrame = false;
            draw();
        });
    }

    function drawObj(c, o, lw) {
        c.save();
        c.strokeStyle = '#000';
        c.fillStyle = '#000';
        c.lineCap = 'round';
        c.lineJoin = 'round';
        if (o.t === 'erase') {
            c.strokeStyle = '#fff';
            c.lineWidth = o.w;
            c.beginPath();
            o.pts.forEach(function (p, i) { if (i) c.lineTo(p[0], p[1]); else c.moveTo(p[0], p[1]); });
            if (o.pts.length === 1) c.lineTo(o.pts[0][0] + 0.01, o.pts[0][1]);
            c.stroke();
        } else if (o.t === 'line') {
            c.lineWidth = o.lw || lw;
            line(c, o.x1, o.y1, o.x2, o.y2);
        } else if (o.t === 'wall') {
            var dx = o.x2 - o.x1, dy = o.y2 - o.y1;
            var len = Math.hypot(dx, dy) || 1;
            var nx = (-dy / len) * (o.th / 2), ny = (dx / len) * (o.th / 2);
            var poly = function () {
                c.beginPath();
                c.moveTo(o.x1 + nx, o.y1 + ny); c.lineTo(o.x2 + nx, o.y2 + ny);
                c.lineTo(o.x2 - nx, o.y2 - ny); c.lineTo(o.x1 - nx, o.y1 - ny); c.closePath();
            };
            c.fillStyle = o.fill === 'solid' ? '#333' : '#fff';
            poly(); c.fill();
            c.lineWidth = o.lw || lw;
            if (o.fill === 'hatch') {
                c.save(); poly(); c.clip();
                var minX = Math.min(o.x1, o.x2) - o.th, maxX = Math.max(o.x1, o.x2) + o.th;
                var minY = Math.min(o.y1, o.y2) - o.th, maxY = Math.max(o.y1, o.y2) + o.th;
                hatch(c, minX, minY, maxX - minX, maxY - minY, Math.max(o.th * 0.8, lw * 3));
                c.restore();
            }
            c.lineCap = 'butt';
            poly(); c.stroke();
        } else if (o.t === 'sym') {
            var sym = SYMBOLS[o.k];
            if (sym) {
                c.translate(o.x, o.y);
                c.rotate(((o.rot || 0) * Math.PI) / 180);
                if (o.flip) c.scale(-1, 1);
                c.lineCap = 'butt';
                sym.draw(c, o, o.w, o.h, o.lw || lw);
            }
        } else if (o.t === 'text') {
            c.translate(o.x, o.y);
            c.rotate(((o.rot || 0) * Math.PI) / 180);
            c.font = '600 ' + o.size + 'px "Malgun Gothic", "Apple SD Gothic Neo", sans-serif';
            c.textAlign = 'center';
            c.textBaseline = 'middle';
            c.fillText(o.text, 0, 0);
        }
        c.restore();
    }

    /**
     * 선 굵기를 늘 px(= 화면 1픽셀)로 고정하는 캔버스 대리(2026-11-26).
     * 흰색 선(지우개 자국)은 지우는 폭이라 그대로 둔다.
     */
    function hairlineCtx(c, px) {
        return new Proxy(c, {
            get: function (t, k) { var val = t[k]; return typeof val === 'function' ? val.bind(t) : val; },
            set: function (t, k, val) {
                if (k === 'lineWidth') {
                    var ss = String(t.strokeStyle).toLowerCase();
                    if (ss !== '#ffffff' && ss !== '#fff' && ss !== 'white') val = px;
                }
                t[k] = val;
                return true;
            }
        });
    }

    function draw() {
        var c = ctx2d;
        var dpr = window.devicePixelRatio || 1;
        if (canvas.width !== Math.round(canvas.getBoundingClientRect().width * dpr)) resizeCanvas();
        c.setTransform(1, 0, 0, 1, 0, 0);
        c.fillStyle = '#cbd5e1';
        c.fillRect(0, 0, canvas.width, canvas.height);
        var v = S.view;
        c.setTransform(dpr * v.scale, 0, 0, dpr * v.scale, dpr * v.ox, dpr * v.oy);
        c.fillStyle = '#fff';
        c.fillRect(0, 0, S.info.refW, S.info.refH);
        c.imageSmoothingEnabled = true;
        c.imageSmoothingQuality = 'high';
        // DXF 층은 바탕도 캐드 선으로(확대해도 선명) — 안 되면 그림
        var DV = window.BSA && window.BSA.dxfView;
        var vecDrawn = false;
        if (S.dxf && DV && typeof DV.drawOnCanvas === 'function') {
            try { vecDrawn = DV.drawOnCanvas(c, S.dxf.model, S.info.refW, S.info.refH, { requestRedraw: requestDraw }); } catch (_e) { vecDrawn = false; }
            c.setTransform(dpr * v.scale, 0, 0, dpr * v.scale, dpr * v.ox, dpr * v.oy);
        }
        if (!vecDrawn) c.drawImage(S.img, 0, 0, S.info.refW, S.info.refH);
        // 화면에서는 그린 선을 모두 1픽셀(확대해도 안 굵어짐) — 캐드 바탕선과 같게. 저장(그림·DXF)은 원래 굵기 그대로
        var hc = hairlineCtx(c, 1 / v.scale);
        S.objs.forEach(function (o) { drawObj(hc, o, S.lw); });
        if (S.drag && S.drag.preview) drawObj(hc, S.drag.preview, S.lw);
        drawOverlay(c);
        updateButtons();
    }

    /** 선택 표시·손잡이·지우개 미리보기(화면 크기 기준 굵기) */
    function drawOverlay(c) {
        var px = 1 / S.view.scale;
        var o = S.objs[S.sel];
        if (o) {
            c.save();
            c.strokeStyle = '#2563eb';
            c.lineWidth = 1.5 * px;
            c.setLineDash([5 * px, 4 * px]);
            if (o.t === 'sym' || o.t === 'text') {
                var b = objBox(o);
                c.translate(o.x, o.y);
                c.rotate(((o.rot || 0) * Math.PI) / 180);
                c.strokeRect(-b.w / 2, -b.h / 2, b.w, b.h);
                c.setLineDash([]);
                if (o.t === 'sym') {
                    handleDot(c, b.w / 2, b.h / 2, px, '#2563eb');
                    line(c, 0, -b.h / 2, 0, -b.h / 2 - 22 * px);
                    handleDot(c, 0, -b.h / 2 - 22 * px, px, '#16a34a');
                }
            } else if (o.t === 'line' || o.t === 'wall') {
                c.setLineDash([]);
                handleDot(c, o.x1, o.y1, px, '#2563eb');
                handleDot(c, o.x2, o.y2, px, '#2563eb');
            } else if (o.t === 'erase') {
                var bb = eraseBounds(o);
                c.strokeRect(bb.x, bb.y, bb.w, bb.h);
            }
            c.restore();
        }
        if (S.hover && (S.tool === 'erase')) {
            c.save();
            c.strokeStyle = '#ef4444';
            c.lineWidth = 1.2 * px;
            c.beginPath();
            c.arc(S.hover.x, S.hover.y, S.eraserSize / 2, 0, Math.PI * 2);
            c.stroke();
            c.restore();
        }
        if (S.snapMark) {
            c.save();
            c.strokeStyle = '#f59e0b';
            c.lineWidth = 2 * px;
            c.strokeRect(S.snapMark.x - 6 * px, S.snapMark.y - 6 * px, 12 * px, 12 * px);
            c.restore();
        }
    }
    function handleDot(c, x, y, px, color) {
        c.save();
        c.setLineDash([]);
        c.fillStyle = '#fff';
        c.strokeStyle = color;
        c.lineWidth = 2 * px;
        c.beginPath();
        c.arc(x, y, 7 * px, 0, Math.PI * 2);
        c.fill();
        c.stroke();
        c.restore();
    }

    // ---------- 개체 판정 ----------
    function objBox(o) {
        if (o.t === 'text') {
            ctx2d.save();
            ctx2d.font = '600 ' + o.size + 'px "Malgun Gothic", "Apple SD Gothic Neo", sans-serif';
            var w = ctx2d.measureText(o.text).width;
            ctx2d.restore();
            return { w: Math.max(w, o.size * 0.6), h: o.size * 1.2 };
        }
        return { w: o.w, h: o.h };
    }
    function eraseBounds(o) {
        var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        o.pts.forEach(function (p) {
            minX = Math.min(minX, p[0]); maxX = Math.max(maxX, p[0]);
            minY = Math.min(minY, p[1]); maxY = Math.max(maxY, p[1]);
        });
        return { x: minX - o.w / 2, y: minY - o.w / 2, w: maxX - minX + o.w, h: maxY - minY + o.w };
    }
    function toLocal(o, p) {
        var a = (-(o.rot || 0) * Math.PI) / 180;
        var dx = p.x - o.x, dy = p.y - o.y;
        return { x: dx * Math.cos(a) - dy * Math.sin(a), y: dx * Math.sin(a) + dy * Math.cos(a) };
    }
    function segDist(p, x1, y1, x2, y2) {
        var dx = x2 - x1, dy = y2 - y1;
        var L = dx * dx + dy * dy;
        var t = L ? Math.max(0, Math.min(1, ((p.x - x1) * dx + (p.y - y1) * dy) / L)) : 0;
        return Math.hypot(p.x - (x1 + t * dx), p.y - (y1 + t * dy));
    }
    function hitObj(o, p, tol) {
        if (o.t === 'sym' || o.t === 'text') {
            var b = objBox(o);
            var l = toLocal(o, p);
            return Math.abs(l.x) <= b.w / 2 + tol && Math.abs(l.y) <= b.h / 2 + tol;
        }
        if (o.t === 'line') return segDist(p, o.x1, o.y1, o.x2, o.y2) <= (o.lw || S.lw) / 2 + tol;
        if (o.t === 'wall') return segDist(p, o.x1, o.y1, o.x2, o.y2) <= o.th / 2 + tol;
        if (o.t === 'erase') {
            for (var i = 0; i < o.pts.length; i++) {
                var a = o.pts[i], b2 = o.pts[Math.min(i + 1, o.pts.length - 1)];
                if (segDist(p, a[0], a[1], b2[0], b2[1]) <= o.w / 2 + tol) return true;
            }
        }
        return false;
    }
    function hitTest(p) {
        var tol = 6 / S.view.scale;
        for (var i = S.objs.length - 1; i >= 0; i--) if (hitObj(S.objs[i], p, tol)) return i;
        return -1;
    }
    /** 선택된 개체의 손잡이: 'resize' | 'rotate' | 'p1' | 'p2' | null */
    function hitHandle(p) {
        var o = S.objs[S.sel];
        if (!o) return null;
        var r = 11 / S.view.scale;
        if (o.t === 'sym') {
            var l = toLocal(o, p);
            if (Math.hypot(l.x - o.w / 2, l.y - o.h / 2) <= r) return 'resize';
            if (Math.hypot(l.x, l.y - (-o.h / 2 - 22 / S.view.scale)) <= r) return 'rotate';
        } else if (o.t === 'line' || o.t === 'wall') {
            if (Math.hypot(p.x - o.x1, p.y - o.y1) <= r) return 'p1';
            if (Math.hypot(p.x - o.x2, p.y - o.y2) <= r) return 'p2';
        }
        return null;
    }

    /** 끝점 붙이기: 다른 벽·선 끝점 가까이면 그 점으로 */
    function snapPoint(p, skipIdx) {
        var best = null, bd = 12 / S.view.scale;
        S.objs.forEach(function (o, i) {
            if (i === skipIdx || (o.t !== 'wall' && o.t !== 'line')) return;
            [[o.x1, o.y1], [o.x2, o.y2]].forEach(function (q) {
                var d = Math.hypot(p.x - q[0], p.y - q[1]);
                if (d < bd) { bd = d; best = { x: q[0], y: q[1] }; }
            });
        });
        S.snapMark = best;
        return best || p;
    }
    function orthoPoint(a, p, shift) {
        var deg = S.angleStep || 0;
        if (shift) deg = deg ? 0 : 45; // Shift: 붙이기 켜짐 ↔ 끔
        if (!deg) return p;
        var dx = p.x - a.x, dy = p.y - a.y;
        var ang = Math.atan2(dy, dx);
        var step = (deg * Math.PI) / 180;
        var sa = Math.round(ang / step) * step;
        var len = Math.hypot(dx, dy) * Math.cos(ang - sa);
        return { x: a.x + Math.cos(sa) * len, y: a.y + Math.sin(sa) * len };
    }

    // ---------- 되돌리기 ----------
    function snapshot() { return JSON.stringify(S.objs); }
    function pushUndo(snap) {
        S.undo.push(snap || snapshot());
        if (S.undo.length > 200) S.undo.shift();
        S.redo = [];
    }
    function doUndo() {
        if (!S.undo.length) return;
        S.redo.push(snapshot());
        S.objs = JSON.parse(S.undo.pop());
        S.sel = -1;
        renderProps();
        requestDraw();
    }
    function doRedo() {
        if (!S.redo.length) return;
        S.undo.push(snapshot());
        S.objs = JSON.parse(S.redo.pop());
        S.sel = -1;
        renderProps();
        requestDraw();
    }
    function isDirty() { return S && snapshot() !== S.savedJson; }

    // ---------- 도구 ----------
    function setTool(t) {
        S.tool = t;
        root.querySelectorAll('.bde-tool').forEach(function (b) { b.classList.toggle('on', b.getAttribute('data-tool') === t); });
        canvas.style.cursor = t === 'select' ? 'default' : (t === 'erase' ? 'none' : 'crosshair');
        var tips = {
            select: '개체를 눌러 고르고 끌어서 옮깁니다. 빈 곳을 끌면 화면 이동, 휠·두 손가락으로 확대. Delete 삭제, R 회전, F 뒤집기, Ctrl+D 복제',
            erase: '끌어서 기존 도면 선을 흰색으로 지웁니다 (굵기는 위 「지우개」)',
            wipe: '사각형으로 끌어 그 안의 기존 선(벽·문 등)을 한 번에 지웁니다',
            wall: '시작점에서 끝점까지 끌어 벽체를 그립니다 (두께·벽 속은 위 설정, 끝점은 다른 벽 끝에 붙음)',
            line: '끌어서 선을 그립니다',
            text: '글자를 넣을 곳을 누르세요 (실 이름 등)'
        };
        if (t.indexOf('sym:') === 0) {
            var sym = SYMBOLS[t.slice(4)];
            statusEl.textContent = (sym ? sym.label : '') + ' — 도면을 누르면 놓입니다. 놓은 뒤 파란 점으로 크기, 초록 점으로 회전 (R 90° 회전, F 좌우 뒤집기)';
        } else {
            statusEl.textContent = tips[t] || '';
        }
        requestDraw();
    }

    function placeSymbol(k, p) {
        var sym = SYMBOLS[k];
        var size = _lastSize[k] || [sym.size[0] * S.unit, sym.size[1] * S.unit];
        var o = { t: 'sym', k: k, x: p.x, y: p.y, w: size[0], h: size[1], rot: 0, flip: false, lw: S.lw };
        if (sym.cut) o.cut = S.wallTh * 2; // 누른 점이 벽선에서 조금 벗어나도 뚫리게 넉넉히(속성 「벽 뚫기」로 조절)
        if (sym.leaf) o.leaf = _lastLeaf[k] != null ? _lastLeaf[k] : sym.leaf * S.unit; // 문짝 두께(속성 「문짝 두께」)
        var prev = S.objs[S.sel];
        if (prev && prev.t === 'sym' && prev.k === k) { o.rot = prev.rot; o.flip = prev.flip; }
        if (sym.cut) {
            // 문은 누른 점이 문틀(아래 변) 가운데 — 벽 위를 누르면 그 벽이 문 폭만큼 뚫린다
            var a = ((o.rot || 0) * Math.PI) / 180;
            o.x = p.x + Math.sin(a) * (o.h / 2);
            o.y = p.y - Math.cos(a) * (o.h / 2);
        }
        pushUndo();
        S.objs.push(o);
        S.sel = S.objs.length - 1;
        renderProps();
        requestDraw();
    }

    async function addText(p) {
        var txt = typeof window.appPrompt === 'function'
            ? await window.appPrompt('넣을 글자 — 한글·영문·숫자·기호 모두 됩니다 (예: 사무실, Room-1, ※점검구, 12㎡)', '')
            : window.prompt('넣을 글자', '');
        if (!S || txt == null) return;
        txt = String(txt).trim();
        if (!txt) return;
        pushUndo();
        S.objs.push({ t: 'text', x: p.x, y: p.y, text: txt, size: S.unit * 1.2, rot: 0 });
        S.sel = S.objs.length - 1;
        renderProps();
        requestDraw();
    }

    // ---------- 포인터 ----------
    function onPointerDown(e) {
        if (!S) return;
        canvas.setPointerCapture(e.pointerId);
        S.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (S.pointers.size === 2) {
            // 두 손가락: 하던 그리기는 취소하고 확대·이동
            if (S.drag && S.drag.undoSnap && S.drag.kind !== 'pan') {
                S.objs = JSON.parse(S.drag.undoSnap);
                S.undo.pop();
            }
            S.drag = null;
            var pts = Array.from(S.pointers.values());
            S.pinch = { d: Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y), cx: (pts[0].x + pts[1].x) / 2, cy: (pts[0].y + pts[1].y) / 2 };
            requestDraw();
            return;
        }
        if (S.pointers.size > 2) return;
        var p = toDoc(e.clientX, e.clientY);
        if (e.button === 1 || e.button === 2 || S.spaceDown) {
            S.drag = { kind: 'pan', sx: e.clientX, sy: e.clientY, ox: S.view.ox, oy: S.view.oy };
            return;
        }
        var t = S.tool;
        // 선택된 개체 손잡이는 어느 도구에서나 먼저(놓자마자 크기·회전 조절)
        var h = (t === 'select' || t.indexOf('sym:') === 0) ? hitHandle(p) : null;
        if (h) {
            S.drag = { kind: 'handle', h: h, start: p, orig: JSON.parse(JSON.stringify(S.objs[S.sel])), undoSnap: snapshot() };
            pushUndo(S.drag.undoSnap);
            return;
        }
        if (t === 'select' || t.indexOf('sym:') === 0) {
            var idx = hitTest(p);
            if (t.indexOf('sym:') === 0 && idx !== S.sel) idx = -1; // 놓기 도구에서는 방금 고른 것만 옮기고 나머지는 새로 놓기
            if (idx >= 0) {
                S.sel = idx;
                renderProps();
                S.drag = { kind: 'move', start: p, orig: JSON.parse(JSON.stringify(S.objs[idx])), undoSnap: snapshot() };
                pushUndo(S.drag.undoSnap);
                requestDraw();
                return;
            }
            if (t === 'select') {
                S.sel = -1;
                renderProps();
                S.drag = { kind: 'pan', sx: e.clientX, sy: e.clientY, ox: S.view.ox, oy: S.view.oy };
                requestDraw();
                return;
            }
            placeSymbol(t.slice(4), p);
            return;
        }
        if (t === 'text') { addText(p); return; }
        if (t === 'erase') {
            S.drag = { kind: 'erase', preview: { t: 'erase', w: S.eraserSize, pts: [[p.x, p.y]] } };
            requestDraw();
            return;
        }
        if (t === 'wipe') {
            S.drag = { kind: 'wipe', start: p, preview: { t: 'sym', k: 'wipe', x: p.x, y: p.y, w: 0, h: 0, rot: 0 } };
            return;
        }
        if (t === 'wall' || t === 'line') {
            var a = snapPoint(p, -1);
            var base = t === 'wall'
                ? { t: 'wall', x1: a.x, y1: a.y, x2: a.x, y2: a.y, th: S.wallTh, fill: S.wallFill, lw: S.lw }
                : { t: 'line', x1: a.x, y1: a.y, x2: a.x, y2: a.y, lw: S.lw };
            S.drag = { kind: 'draw', start: a, preview: base };
            requestDraw();
        }
    }

    function onPointerMove(e) {
        if (!S) return;
        if (S.pointers.has(e.pointerId)) S.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
        var p = toDoc(e.clientX, e.clientY);
        S.hover = p;
        if (S.pinch && S.pointers.size === 2) {
            var pts = Array.from(S.pointers.values());
            var d = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
            var cx = (pts[0].x + pts[1].x) / 2, cy = (pts[0].y + pts[1].y) / 2;
            S.view.ox += cx - S.pinch.cx;
            S.view.oy += cy - S.pinch.cy;
            if (S.pinch.d > 0 && d > 0) zoomAt(cx, cy, d / S.pinch.d);
            S.pinch = { d: d, cx: cx, cy: cy };
            requestDraw();
            return;
        }
        var g = S.drag;
        if (!g) { if (S.tool === 'erase') requestDraw(); return; }
        if (g.kind === 'pan') {
            S.view.ox = g.ox + (e.clientX - g.sx);
            S.view.oy = g.oy + (e.clientY - g.sy);
        } else if (g.kind === 'move') {
            var o = S.objs[S.sel], dx = p.x - g.start.x, dy = p.y - g.start.y;
            if (o.t === 'sym' || o.t === 'text') { o.x = g.orig.x + dx; o.y = g.orig.y + dy; }
            else if (o.t === 'line' || o.t === 'wall') {
                o.x1 = g.orig.x1 + dx; o.y1 = g.orig.y1 + dy; o.x2 = g.orig.x2 + dx; o.y2 = g.orig.y2 + dy;
            } else if (o.t === 'erase') {
                o.pts = g.orig.pts.map(function (q) { return [q[0] + dx, q[1] + dy]; });
            }
        } else if (g.kind === 'handle') {
            var ob = S.objs[S.sel];
            if (g.h === 'resize') {
                var l = toLocal(g.orig, p);
                var nw = Math.max(S.unit * 0.1, Math.abs(l.x) * 2);
                var nh = Math.max(S.unit * 0.1, Math.abs(l.y) * 2);
                if (e.shiftKey) { var r0 = g.orig.w / g.orig.h; if (nw / nh > r0) nh = nw / r0; else nw = nh * r0; }
                ob.w = nw; ob.h = nh;
                _lastSize[ob.k] = [nw, nh];
                renderProps();
            } else if (g.h === 'rotate') {
                var ang = (Math.atan2(p.y - ob.y, p.x - ob.x) * 180) / Math.PI + 90;
                if (!e.shiftKey) ang = Math.round(ang / 15) * 15;
                ob.rot = ((ang % 360) + 360) % 360;
                renderProps();
            } else {
                var other = g.h === 'p1' ? { x: ob.x2, y: ob.y2 } : { x: ob.x1, y: ob.y1 };
                var q = snapPoint(p, S.sel);
                if (q === p) q = orthoPoint(other, p, e.shiftKey);
                if (g.h === 'p1') { ob.x1 = q.x; ob.y1 = q.y; } else { ob.x2 = q.x; ob.y2 = q.y; }
                renderProps();
            }
        } else if (g.kind === 'erase') {
            var last = g.preview.pts[g.preview.pts.length - 1];
            if (Math.hypot(p.x - last[0], p.y - last[1]) > 1 / S.view.scale) g.preview.pts.push([p.x, p.y]);
        } else if (g.kind === 'wipe') {
            g.preview.x = (g.start.x + p.x) / 2;
            g.preview.y = (g.start.y + p.y) / 2;
            g.preview.w = Math.abs(p.x - g.start.x);
            g.preview.h = Math.abs(p.y - g.start.y);
        } else if (g.kind === 'draw') {
            var q2 = snapPoint(p, -1);
            if (q2 === p) q2 = orthoPoint(g.start, p, e.shiftKey);
            g.preview.x2 = q2.x; g.preview.y2 = q2.y;
            statusEl.textContent = '각도 ' + fmt(segAngle(g.preview)) + '° · 길이 ' + fmt(segLen(g.preview)) + ' (Shift: 각도 붙이기 ' + (S.angleStep ? '끔' : '켬') + ')';
        }
        requestDraw();
    }

    function onPointerUp(e) {
        if (!S) return;
        S.pointers.delete(e.pointerId);
        if (S.pinch) { if (S.pointers.size < 2) S.pinch = null; return; }
        var g = S.drag;
        S.drag = null;
        S.snapMark = null;
        if (!g) return;
        var minLen = 3 / S.view.scale;
        if (g.kind === 'move' || g.kind === 'handle') {
            if (snapshot() === g.undoSnap) S.undo.pop(); // 실제로 바뀐 것이 없으면 되돌리기 기록 안 함
        } else if (g.kind === 'erase') {
            pushUndo();
            S.objs.push(g.preview);
        } else if (g.kind === 'wipe') {
            if (g.preview.w > minLen && g.preview.h > minLen) {
                pushUndo();
                S.objs.push(g.preview);
            }
        } else if (g.kind === 'draw') {
            var pv = g.preview;
            if (Math.hypot(pv.x2 - pv.x1, pv.y2 - pv.y1) > minLen) {
                pushUndo();
                S.objs.push(pv);
                S.sel = S.objs.length - 1; // 바로 두께·각도·길이를 고칠 수 있게
            }
        }
        renderProps();
        requestDraw();
    }

    function onWheel(e) {
        if (!S) return;
        e.preventDefault();
        zoomAt(e.clientX, e.clientY, Math.exp(-e.deltaY * 0.0015));
    }

    function onDblClick(e) {
        if (!S) return;
        var o = S.objs[S.sel];
        if (o && o.t === 'text') editText(o);
    }

    async function editText(o) {
        var txt = typeof window.appPrompt === 'function'
            ? await window.appPrompt('글자 고치기', o.text)
            : window.prompt('글자 고치기', o.text);
        if (!S || txt == null || !String(txt).trim()) return;
        pushUndo();
        o.text = String(txt).trim();
        renderProps();
        requestDraw();
    }

    // ---------- 선택 개체 속성 ----------
    function fmt(n) { return Math.round(n * 10) / 10; }
    /** 선·벽 각도(도, 오른쪽 0°·위로 +) / 길이 / 시작점 기준으로 다시 놓기 */
    function segAngle(o) {
        var a = (-Math.atan2(o.y2 - o.y1, o.x2 - o.x1) * 180) / Math.PI;
        if (a <= -179.95) a = 180; // -180 ~ 180 (오른쪽 아래로 15°면 -15°)
        return Math.abs(a) < 0.05 ? 0 : a;
    }
    function segLen(o) { return Math.hypot(o.x2 - o.x1, o.y2 - o.y1); }
    function setSeg(o, deg, len) {
        var r = (-deg * Math.PI) / 180;
        len = Math.max(1, len);
        o.x2 = o.x1 + Math.cos(r) * len;
        o.y2 = o.y1 + Math.sin(r) * len;
    }
    function renderProps() {
        var o = S && S.objs[S.sel];
        if (!o) { propsEl.hidden = true; propsEl.innerHTML = ''; return; }
        var name = o.t === 'sym' ? (SYMBOLS[o.k] ? SYMBOLS[o.k].label : o.k)
            : ({ wall: '벽체', line: '선', erase: '지우개 자국', text: '글자' })[o.t];
        var h = '<div class="bde-row"><b>' + name + '</b></div>';
        if (o.t === 'sym') {
            h += '<div class="bde-row">폭 <input type="number" data-p="w" value="' + fmt(o.w) + '"> 높이 <input type="number" data-p="h" value="' + fmt(o.h) + '"></div>';
            h += '<div class="bde-row">회전 <input type="number" data-p="rot" value="' + fmt(o.rot || 0) + '">° <button data-a="rotL">⟲90</button><button data-a="rotR">⟳90</button>' +
                (o.k !== 'wipe' ? '<button data-a="flip">좌우 뒤집기</button>' : '') + '</div>';
            if (SYMBOLS[o.k] && SYMBOLS[o.k].cut) {
                h += '<div class="bde-row" title="문 아래쪽 기존 벽선을 문 폭만큼 흰색으로 지웁니다. 0이면 끔">벽 뚫기 <input type="number" data-p="cut" value="' + fmt(o.cut || 0) + '"></div>';
            }
            if (SYMBOLS[o.k] && SYMBOLS[o.k].leaf) {
                h += '<div class="bde-row" title="문짝(여닫는 판) 두께. 0이면 가는 한 줄">문짝 두께 <input type="number" step="0.5" min="0" data-p="leaf" value="' + fmt(o.leaf || 0) + '"></div>' +
                    '<div class="bde-row"><button data-a="leaf:0">한 줄</button><button data-a="leaf:0.08">얇게</button><button data-a="leaf:0.16">보통</button><button data-a="leaf:0.3">두껍게</button></div>';
            }
            if (o.k !== 'wipe') {
                h += '<div class="bde-row" title="이 기호의 선 굵기">선 굵기 <input type="number" step="0.5" min="0.1" data-p="lw" value="' + fmt(o.lw || S.lw) + '"></div>';
            }
        } else if (o.t === 'wall' || o.t === 'line') {
            if (o.t === 'wall') h += '<div class="bde-row">두께 <input type="number" step="1" min="0.5" data-p="th" value="' + fmt(o.th) + '"></div>';
            h += '<div class="bde-row" title="시작점(첫 점)을 기준으로 돌리고 늘립니다. 각도는 오른쪽이 0°, 위로 갈수록 +">각도 <input type="number" step="1" data-p="ang" value="' + fmt(segAngle(o)) + '">° 길이 <input type="number" step="1" min="1" data-p="len" value="' + fmt(segLen(o)) + '"></div>';
            h += '<div class="bde-row">' + (o.t === 'wall' ? '테두리 ' : '') + '굵기 <input type="number" step="0.5" min="0.1" data-p="lw" value="' + fmt(o.lw || S.lw) + '"> <button data-a="ang:0">─ 0°</button><button data-a="ang:90">│ 90°</button></div>';
        }
        if (o.t === 'wall') {
            h += '<div class="bde-row">벽 속 <button data-a="fill:white">비움</button><button data-a="fill:hatch">빗금</button><button data-a="fill:solid">채움</button></div>';
        } else if (o.t === 'text') {
            h += '<div class="bde-row"><input type="text" data-p="text" value="' + String(o.text).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;') + '"></div>';
            h += '<div class="bde-row">크기 <input type="number" data-p="size" value="' + fmt(o.size) + '"> 회전 <input type="number" data-p="rot" value="' + fmt(o.rot || 0) + '">°</div>';
            h += '<div class="bde-row"><button data-a="tsize:0.7">작게</button><button data-a="tsize:1.2">보통</button><button data-a="tsize:2">크게</button><button data-a="rotL">⟲90</button><button data-a="rotR">⟳90</button></div>';
        }
        h += '<div class="bde-row"><button data-a="dup">복제</button><button data-a="front">맨 앞</button><button data-a="del" class="bde-del">삭제</button></div>';
        propsEl.innerHTML = h;
        propsEl.hidden = false;
    }
    var _propUndoArmed = false;
    function onPropInput(e) {
        var el = e.target;
        var key = el.getAttribute('data-p');
        var o = S && S.objs[S.sel];
        if (!key || !o) return;
        if (!_propUndoArmed) { pushUndo(); _propUndoArmed = true; setTimeout(function () { _propUndoArmed = false; }, 800); }
        if (key === 'text') { if (el.value.trim()) o.text = el.value; }
        else {
            var v = parseFloat(el.value);
            if (!isFinite(v)) return;
            if (key === 'ang' || key === 'len') { setSeg(o, key === 'ang' ? v : segAngle(o), key === 'len' ? v : segLen(o)); requestDraw(); return; }
            if (key === 'rot') v = ((v % 360) + 360) % 360;
            else if (key === 'cut' || key === 'leaf') v = Math.max(0, v);
            else if (key === 'lw') v = Math.max(0.1, v);
            else v = Math.max(0.5, v);
            o[key] = v;
            if (key === 'th') { S.wallTh = v; syncOptInputs(); }
            if (key === 'lw') { S.lw = v; syncOptInputs(); }
            if (o.t === 'sym' && (key === 'w' || key === 'h')) _lastSize[o.k] = [o.w, o.h];
            if (o.t === 'sym' && key === 'leaf') _lastLeaf[o.k] = v;
        }
        requestDraw();
    }
    function onPropClick(e) {
        var b = e.target.closest('button[data-a]');
        if (!b) return;
        act(b.getAttribute('data-a'));
    }
    function act(a) {
        var o = S.objs[S.sel];
        if (!o) return;
        if (a === 'del') {
            pushUndo();
            S.objs.splice(S.sel, 1);
            S.sel = -1;
        } else if (a === 'dup') {
            pushUndo();
            var c = JSON.parse(JSON.stringify(o));
            var d = S.unit * 0.8;
            if (c.t === 'sym' || c.t === 'text') { c.x += d; c.y += d; }
            else if (c.t === 'line' || c.t === 'wall') { c.x1 += d; c.y1 += d; c.x2 += d; c.y2 += d; }
            else if (c.t === 'erase') c.pts = c.pts.map(function (q) { return [q[0] + d, q[1] + d]; });
            S.objs.push(c);
            S.sel = S.objs.length - 1;
        } else if (a === 'front') {
            pushUndo();
            S.objs.splice(S.sel, 1);
            S.objs.push(o);
            S.sel = S.objs.length - 1;
        } else if (a === 'rotL' || a === 'rotR') {
            if (o.t !== 'sym' && o.t !== 'text') return;
            pushUndo();
            o.rot = (((o.rot || 0) + (a === 'rotR' ? 90 : -90)) % 360 + 360) % 360;
        } else if (a === 'flip') {
            if (o.t !== 'sym') return;
            pushUndo();
            o.flip = !o.flip;
        } else if (a.indexOf('ang:') === 0) {
            if (o.t !== 'wall' && o.t !== 'line') return;
            pushUndo();
            setSeg(o, Number(a.slice(4)), segLen(o));
        } else if (a.indexOf('tsize:') === 0) {
            if (o.t !== 'text') return;
            pushUndo();
            o.size = Number(a.slice(6)) * S.unit;
        } else if (a.indexOf('leaf:') === 0) {
            if (o.t !== 'sym' || !(SYMBOLS[o.k] && SYMBOLS[o.k].leaf)) return;
            pushUndo();
            o.leaf = Number(a.slice(5)) * S.unit;
            _lastLeaf[o.k] = o.leaf;
        } else if (a.indexOf('fill:') === 0) {
            if (o.t !== 'wall') return;
            pushUndo();
            o.fill = a.slice(5);
        }
        renderProps();
        requestDraw();
    }

    // ---------- 위쪽 단추·설정 ----------
    function onRootClick(e) {
        var tb = e.target.closest('[data-tool]');
        if (tb && S) { setTool(tb.getAttribute('data-tool')); return; }
        var ab = e.target.closest('[data-act]');
        if (!ab || !S) return;
        var a = ab.getAttribute('data-act');
        if (a === 'undo') doUndo();
        else if (a === 'redo') doRedo();
        else if (a === 'fit') fitView();
        else if (a === 'save') save();
        else if (a === 'close') close();
    }
    function onOptChange(e) {
        if (!S) return;
        var el = e.target;
        var k = el.getAttribute('data-opt');
        var o = S.objs[S.sel];
        if (k === 'angleStep') S.angleStep = Number(el.value) || 0;
        else if (k === 'eraser') S.eraserSize = (S.unit / 10) * Number(el.value);
        else if (k === 'wallTh') {
            S.wallTh = (S.unit / 20) * Number(el.value);
            // 벽을 골라 두었으면 그 벽 두께도 같이(예전엔 새로 그릴 벽에만 먹어서 「두께 조절이 안 된다」)
            if (o && o.t === 'wall') { armOptUndo(); o.th = S.wallTh; renderProps(); }
        } else if (k === 'lw') {
            S.lw = (S.lwUnit / 2) * Number(el.value);
            if (o && (o.t === 'wall' || o.t === 'line' || o.t === 'sym')) { armOptUndo(); o.lw = S.lw; renderProps(); }
        } else if (k === 'wallFill') {
            S.wallFill = el.value;
            if (o && o.t === 'wall' && e.type === 'change') { pushUndo(); o.fill = S.wallFill; renderProps(); }
        }
        updateOptVals();
        requestDraw();
    }
    var _optUndoArmed = false;
    function armOptUndo() {
        if (_optUndoArmed) return;
        pushUndo();
        _optUndoArmed = true;
        setTimeout(function () { _optUndoArmed = false; }, 800);
    }
    function updateOptVals() {
        var a = root.querySelector('[data-val="wallTh"]'), b = root.querySelector('[data-val="lw"]');
        if (a) a.textContent = String(fmt(S.wallTh));
        if (b) b.textContent = String(fmt(S.lw));
    }
    function syncOptInputs() {
        root.querySelector('[data-opt="angleStep"]').value = String(S.angleStep || 0);
        root.querySelector('[data-opt="eraser"]').value = String(Math.round(S.eraserSize / (S.unit / 10)));
        root.querySelector('[data-opt="wallTh"]').value = String(Math.round(S.wallTh / (S.unit / 20)));
        root.querySelector('[data-opt="lw"]').value = String(Math.round(S.lw / (S.lwUnit / 2)));
        root.querySelector('[data-opt="wallFill"]').value = S.wallFill;
        updateOptVals();
    }
    function updateButtons() {
        var u = root.querySelector('[data-act="undo"]');
        var r = root.querySelector('[data-act="redo"]');
        if (u) u.disabled = !S.undo.length;
        if (r) r.disabled = !S.redo.length;
    }

    // ---------- 키보드 ----------
    function isTypingTarget(t) {
        return t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
    }
    function onKeyDown(e) {
        if (!S || root.hidden) return;
        if (window.appDialog && window.appDialog.isOpen && window.appDialog.isOpen()) return;
        var typing = isTypingTarget(e.target);
        var k = e.key;
        var mod = e.ctrlKey || e.metaKey;
        var handled = true;
        if (typing) {
            // 속성 칸에 쓰는 중: 앱 단축키만 막고 글자는 그대로
            if (k === 'Escape') e.target.blur();
            e.stopImmediatePropagation();
            return;
        }
        if (mod && (k === 'z' || k === 'Z') && !e.shiftKey) doUndo();
        else if (mod && (k === 'y' || k === 'Y' || ((k === 'z' || k === 'Z') && e.shiftKey))) doRedo();
        else if (mod && (k === 'd' || k === 'D')) act('dup');
        else if (mod && (k === 's' || k === 'S')) save();
        else if (k === 'Delete' || k === 'Backspace') act('del');
        else if (!mod && (k === 'r' || k === 'R')) act(e.shiftKey ? 'rotL' : 'rotR');
        else if (!mod && (k === 'f' || k === 'F')) act('flip');
        else if (k === 'Escape') {
            if (S.sel >= 0) { S.sel = -1; renderProps(); requestDraw(); }
            else if (S.tool !== 'select') setTool('select');
            else close();
        } else if (k === ' ') { S.spaceDown = true; canvas.style.cursor = 'grab'; }
        else if (k === '0' && !mod) fitView();
        else handled = false;
        e.stopImmediatePropagation(); // 편집기가 열려 있는 동안 도면 점검 화면 단축키는 쉬게 한다
        if (handled) e.preventDefault();
    }
    function onKeyUp(e) {
        if (!S || root.hidden) return;
        if (e.key === ' ') { S.spaceDown = false; setTool(S.tool); }
    }

    // ---------- 내보내기·저장 ----------
    function exportDataUrl() {
        var W = S.info.refW, H = S.info.refH;
        var nat = Math.max(S.img.naturalWidth || 0, S.img.naturalHeight || 0);
        var long = Math.max(W, H);
        // 바탕 그림이 더 선명하면 2배로 내보낸다. 긴 변이 정확히 4000일 때만 — 4000 티어로 줄였을 때 지금 좌표 기준과
        // 같은 크기가 나와야 마킹이 1픽셀도 안 밀린다.
        var k = (long === 4000 && nat >= long * 1.6 && W * H * 4 <= 40000000) ? 2 : 1;
        var cv = document.createElement('canvas');
        cv.width = W * k;
        cv.height = H * k;
        var c = cv.getContext('2d');
        c.fillStyle = '#fff';
        c.fillRect(0, 0, cv.width, cv.height);
        c.imageSmoothingEnabled = true;
        c.imageSmoothingQuality = 'high';
        c.drawImage(S.img, 0, 0, cv.width, cv.height);
        c.scale(k, k);
        // 저장 그림도 그린 선은 모두 1픽셀(그림 픽셀 기준, 2026-11-26)
        var hc = hairlineCtx(c, 1 / k);
        S.objs.forEach(function (o) { drawObj(hc, o, S.lw); });
        var url = cv.toDataURL('image/jpeg', 0.92);
        cv.width = cv.height = 1;
        return url;
    }

    /** DXF 층: 개체를 기록용 캔버스로 그려 캐드 선 자료를 고치고, 옛 좌표계 그대로 벡터 PDF를 다시 만든다 */
    async function buildDxfPdfFile() {
        var V = window.BSA && window.BSA.drawingEditVector;
        var P = window.BSA && window.BSA.dxfToPdf;
        if (!V || !P) throw new Error('DXF 편집 모듈이 없습니다. 새로고침(Ctrl+F5) 뒤 다시 해 주세요.');
        var d = S.dxf, meta = d.meta;
        var W = S.info.refW, H = S.info.refH;
        var R = V.createRecorder(V.pxToPtMatrix(W, H, meta.pageW, meta.pageH));
        // 그린 선은 모두 기본 굵기 = 캐드 가는 선(폭 없는 폴리선 → 화면·PDF 1픽셀). 지우개(흰 선)는 폭 그대로
        var hr = hairlineCtx(R.ctx, S.lw);
        S.objs.forEach(function (o) { drawObj(hr, o, S.lw); });
        var k = Math.sqrt((meta.pageW / W) * (meta.pageH / H));
        var res = V.buildEditedFlat(d.model, meta, R.events, { baseLwPt: S.lw * k });
        var out = await P.convertFlatToPdf(res.flat, { fit: meta, lineWidth: d.model.lw, src: meta.src, unit: meta.unit });
        if (typeof console !== 'undefined' && console.info) console.info('[도면 편집] DXF 벡터 저장', res.stats, out.info);
        return new File([out.bytes], d.pdfName, { type: 'application/pdf', lastModified: Date.now() });
    }

    async function save() {
        if (!S || S.saving) return;
        var bridge = window.BSA && window.BSA.drawingEditorBridge;
        if (!bridge) return;
        if (!S.objs.length) { window.showToast && window.showToast('바뀐 것이 없습니다.', 'info'); return; }
        var msg = S.dxf
            ? ('이 층(' + S.info.floorLabel + ') DXF 도면을 고친 내용으로 바꿀까요?\n\n' +
                '· 벡터 그대로 저장됩니다 — 지운 곳은 캐드 선이 잘리고, 그린 것은 캐드 선으로 들어갑니다.\n' +
                '· 확대 선명도·DXF 출력(원래 캐드 좌표)도 그대로입니다.\n' +
                '· 마킹 ' + S.info.markingCount + '개는 위치 그대로 남습니다.')
            : ('이 층(' + S.info.floorLabel + ') 점검 도면을 편집한 그림으로 바꿀까요?\n\n' +
                '· 마킹 ' + S.info.markingCount + '개는 위치 그대로 남습니다.\n' +
                '· 다른 기기·보고서에도 바뀐 도면이 쓰입니다.' +
                (S.info.hasPdf ? '\n· 원래 PDF 도면은 그림 도면으로 바뀝니다(벡터 PDF 출력 대신 그림으로 나감).' : ''));
        var ok = typeof window.appConfirm === 'function'
            ? await window.appConfirm(msg, { title: '도면 저장', okText: '저장' })
            : window.confirm(msg);
        if (!ok || !S) return;
        S.saving = true;
        var busy = root.querySelector('.bde-busy');
        busy.hidden = false;
        try {
            await new Promise(function (r) { setTimeout(r, 30); });
            var payload = S.dxf ? { pdfFile: await buildDxfPdfFile() } : exportDataUrl();
            var res = await bridge.save(S.info.buildingId, S.info.floorCode, payload);
            S.savedJson = snapshot();
            window.showToast && window.showToast(res && res.uploaded
                ? '편집한 도면을 저장했습니다. 점검 도면에 반영됐습니다.'
                : '편집한 도면을 이 기기에 저장했습니다. (서버 올리기는 연결되면 다시 시도)', res && res.uploaded ? 'success' : 'warning', 5000);
            hide();
        } catch (err) {
            console.error('[도면 편집] 저장 실패', err);
            window.showToast && window.showToast('도면 저장 실패: ' + (err && err.message ? err.message : err), 'error', 6000);
        } finally {
            if (S) S.saving = false;
            busy.hidden = true;
        }
    }

    async function close() {
        if (!S) return;
        if (isDirty()) {
            var ok = typeof window.appConfirm === 'function'
                ? await window.appConfirm('저장하지 않은 편집이 있습니다. 버리고 닫을까요?', { title: '도면 편집', okText: '버리고 닫기', danger: true })
                : window.confirm('저장하지 않은 편집이 있습니다. 버리고 닫을까요?');
            if (!ok) return;
        }
        hide();
    }
    function hide() {
        var wasDxf = !!(S && S.dxf);
        if (root) root.hidden = true;
        S = null;
        document.documentElement.style.overflow = '';
        // 벡터 그리기 캐시를 편집기와 같이 썼다 — 결함위치도가 새로 그리게
        var DV = window.BSA && window.BSA.dxfView;
        if (wasDxf && DV && typeof DV.resetCache === 'function') DV.resetCache();
        if (wasDxf && typeof window.drawCanvas === 'function') { try { window.drawCanvas({ immediate: true }); } catch (_e) { /* 다음 그리기 때 */ } }
    }

    // ---------- 열기 ----------
    function loadImage(url) {
        return new Promise(function (resolve, reject) {
            var im = new Image();
            if (/^https?:/i.test(url)) im.crossOrigin = 'anonymous';
            im.onload = function () { resolve(im); };
            im.onerror = function () { reject(new Error('그림을 읽지 못했습니다')); };
            im.src = url;
        });
    }
    /** 내보낼 때 캔버스가 막히지 않는지(다른 주소 그림이면 toDataURL이 안 됨) */
    function canExport(im) {
        try {
            var c = document.createElement('canvas');
            c.width = c.height = 2;
            c.getContext('2d').drawImage(im, 0, 0, 2, 2);
            c.toDataURL();
            return true;
        } catch (_e) { return false; }
    }

    async function open() {
        if (S) return;
        var bridge = window.BSA && window.BSA.drawingEditorBridge;
        if (!bridge) { window.showToast && window.showToast('도면 편집을 불러오지 못했습니다. 새로고침 후 다시 해 주세요.', 'error'); return; }
        var info;
        try {
            window.showLoading && window.showLoading('편집할 도면 불러오는 중…');
            info = await bridge.load();
            var img = null;
            for (var i = 0; i < info.candidates.length && !img; i++) {
                try {
                    var im = await loadImage(info.candidates[i]);
                    if (canExport(im)) img = im;
                } catch (_e) { /* 다음 후보 */ }
            }
            if (!img) throw new Error('도면 그림을 불러오지 못했습니다.');
            if (!root) buildDom();
            S = newState(info, img);
            S.dxf = info.dxf || null;
        } catch (err) {
            window.showToast && window.showToast(err && err.message ? err.message : String(err), 'warning', 5000);
            return;
        } finally {
            window.hideLoading && window.hideLoading();
        }
        titleEl.textContent = '도면 편집 — ' + (info.buildingName ? info.buildingName + ' · ' : '') + info.floorLabel + (S.dxf ? ' · DXF 벡터' : '');
        titleEl.title = titleEl.textContent;
        root.hidden = false;
        document.documentElement.style.overflow = 'hidden';
        propsEl.hidden = true;
        syncOptInputs();
        resizeCanvas();
        fitView();
        setTool('select');
    }

    function bindButton() {
        var btn = document.getElementById('btnEditFloorDrawing');
        if (btn && !btn._bdeBound) {
            btn._bdeBound = true;
            btn.addEventListener('click', function () { open(); });
        }
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bindButton); else bindButton();

    window.BSA = window.BSA || {};
    window.BSA.drawingEditor = {
        open: open,
        isOpen: function () { return !!S; },
        symbols: SYMBOLS,
        _state: function () { return S; }
    };
})();
