// 평가 탭 입력표: 부재 수 칸에 +1 버튼 없음, 숫자패드 입력 유지
const fs=require('fs'),path=require('path'),assert=require('assert');
const src=fs.readFileSync(path.join(__dirname,'..','app.js'),'utf8');
const i=src.indexOf('function renderEvalTab('); assert(i>0,'renderEvalTab 없음');
const body=src.slice(i,i+20000);
assert(!/eval-in-plus/.test(src),'+1 버튼 코드가 남아 있음');
assert(!/>\+1<\/button>/.test(body),'+1 버튼 마크업이 남아 있음');
assert(/data-num-keypad class="form-control eval-in/.test(body),'숫자패드 입력 없음');
assert(/data-key="\$\{it\.key\}"/.test(body),'항목별 입력 없음');
console.log('test-eval-tab-source: ok');
