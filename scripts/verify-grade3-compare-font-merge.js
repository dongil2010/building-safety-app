#!/usr/bin/env node
/**
 * Verify mergeGrade3CompareStampHeader (= photo-album merger) remaps
 * priority-compare stamp charPr correctly, and exterior prefix is O.
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const os = require('os');

const REPO = process.env.BSA_REPO || '/workspace/bsa-repo';
const appJs = fs.readFileSync(path.join(REPO, 'app.js'), 'utf8');

function assert(cond, msg) {
  if (!cond) {
    console.error('FAIL:', msg);
    process.exit(1);
  }
  console.log('OK:', msg);
}

const prefixFnMatch = appJs.match(/function getGrade3FloorPrefix\(floorCode\) \{[\s\S]*?\n    \}/);
assert(prefixFnMatch, 'getGrade3FloorPrefix present');
assert(/return 'O'/.test(prefixFnMatch[0]), "exterior returns 'O'");
assert(!/return 'A'/.test(prefixFnMatch[0]), "no exterior return 'A'");
const getGrade3FloorPrefix = new Function(
  'floorCode',
  prefixFnMatch[0].replace(/^function getGrade3FloorPrefix\(floorCode\) \{/, '').replace(/\n    \}$/, '')
);
assert(getGrade3FloorPrefix('EXT') === 'O', 'EXT → O');
assert(getGrade3FloorPrefix('EXT_1') === 'O', 'EXT_1 → O');
assert(getGrade3FloorPrefix('외부') === 'O', '외부 → O');
assert(getGrade3FloorPrefix('1F') === '1', '1F → 1');
assert(getGrade3FloorPrefix('B1F') === 'B1', 'B1F → B1');
assert(getGrade3FloorPrefix('ROOF') === 'R', 'ROOF → R');

assert(
  /const mergeGrade3CompareStampHeader = \(mainHdr, stampHdr, stampParas\) => \{\s*return mergeGrade3PhotoAlbumStampHeader/.test(appJs),
  'compare merge delegates to photo-album merge'
);

const mergeStart = appJs.indexOf('const mergeGrade3PhotoAlbumStampHeader = (mainHdr, stampHdr, stampParas) => {');
assert(mergeStart >= 0, 'photo-album merge found');
let depth = 0;
const braceStart = appJs.indexOf('{', mergeStart);
let end = -1;
for (let j = braceStart; j < appJs.length; j++) {
  if (appJs[j] === '{') depth++;
  else if (appJs[j] === '}') {
    depth--;
    if (depth === 0) { end = j + 1; break; }
  }
}
assert(end > 0, 'photo-album merge body closed');
const mergeSrc =
  'const mergeGrade3PhotoAlbumStampHeader = ' +
  appJs.slice(mergeStart + 'const mergeGrade3PhotoAlbumStampHeader = '.length, end);
const mergeGrade3PhotoAlbumStampHeader = new Function(
  mergeSrc + '\nreturn mergeGrade3PhotoAlbumStampHeader;'
)();

function unzipHeader(hwpxPath, destDir) {
  fs.mkdirSync(destDir, { recursive: true });
  execSync(`unzip -qo "${hwpxPath}" -d "${destDir}"`);
  return fs.readFileSync(path.join(destDir, 'Contents/header.xml'), 'utf8');
}
function unzipSection(destDir) {
  const p0 = path.join(destDir, 'Contents/section0.xml');
  const p1 = path.join(destDir, 'Contents/section1.xml');
  return fs.readFileSync(fs.existsSync(p1) ? p1 : p0, 'utf8');
}
function parseCharPr(hdr) {
  const out = {};
  const re = /<hh:charPr id="(\d+)"([^>]*)>([\s\S]*?)<\/hh:charPr>/g;
  let m;
  while ((m = re.exec(hdr))) {
    out[m[1]] = {
      height: (m[2].match(/height="(\d+)"/) || [])[1],
      hangul: (m[3].match(/hangul="(\d+)"/) || [])[1]
    };
  }
  return out;
}
function hangulFonts(hdr) {
  const faces = {};
  const m = hdr.match(/<hh:fontface\b[^>]*lang="HANGUL"[^>]*>([\s\S]*?)<\/hh:fontface>/i);
  if (!m) return faces;
  for (const fm of m[1].matchAll(/<hh:font\b([^>]*)>/g)) {
    const id = (fm[1].match(/\bid="(\d+)"/) || [])[1];
    const face = (fm[1].match(/\bface="([^"]*)"/) || [])[1];
    if (id && face) faces[id] = face;
  }
  return faces;
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'g3cmp-'));
const cmpDir = path.join(tmp, 'cmp');
const surDir = path.join(tmp, 'sur');
const regDir = path.join(tmp, 'reg');
const stampHdr = unzipHeader(path.join(REPO, 'templates/hwpx_priority_compare_grade3.hwpx'), cmpDir);
const stampSec = unzipSection(cmpDir);
const mainHdr = unzipHeader(path.join(REPO, 'templates/hwpx_survey_template_grade3.hwpx'), surDir);
const regHdr = unzipHeader(path.join(REPO, 'templates/hwpx_survey_template_grade3_regular.hwpx'), regDir);

const stampChars = parseCharPr(stampHdr);
const stampFonts = hangulFonts(stampHdr);
assert(stampChars['0'] && stampChars['0'].height === '1000', 'stamp charPr0 height 1000');
assert(stampFonts[stampChars['0'].hangul] === '함초롬바탕', 'stamp charPr0 함초롬바탕');
assert(stampChars['10'] && stampChars['10'].height === '850', 'stamp charPr10 height 850');
assert(stampFonts[stampChars['10'].hangul] === '굴림', 'stamp charPr10 굴림');

const regChars = parseCharPr(regHdr);
assert(regChars['10'] && regChars['10'].height === '2700', 'regular host charPr10 is 2700 (collision case)');

function mergeWithXmlFragment(main, stamp, fragmentXml) {
  global.XMLSerializer = function () {};
  global.XMLSerializer.prototype.serializeToString = (n) => (n && n.__xml) || fragmentXml;
  try {
    return mergeGrade3PhotoAlbumStampHeader(main, stamp, [{ __xml: fragmentXml }]);
  } finally {
    delete global.XMLSerializer;
  }
}

const resultReg = mergeWithXmlFragment(regHdr, stampHdr, stampSec);
assert(resultReg.remapAttrs && resultReg.remapAttrs.charPrIDRef, 'remap has charPrIDRef');
const map = resultReg.remapAttrs.charPrIDRef;
assert(map['0'] && map['10'], 'stamp charPr 0 and 10 remapped');
assert(map['0'] !== '0', 'charPr 0 remapped away from host 0');
assert(map['10'] !== '10', 'charPr 10 remapped away from host 10');

const outChars = parseCharPr(resultReg.header);
const outFonts = hangulFonts(resultReg.header);
const c0 = outChars[map['0']];
const c10 = outChars[map['10']];
assert(c0 && c0.height === '1000', `remapped 0 height=1000 (got ${c0 && c0.height})`);
assert(outFonts[c0.hangul] === '함초롬바탕', `remapped 0 face 함초롬바탕 (got ${outFonts[c0.hangul]})`);
assert(c10 && c10.height === '850', `remapped 10 height=850 (got ${c10 && c10.height})`);
assert(outFonts[c10.hangul] === '굴림', `remapped 10 face 굴림 (got ${outFonts[c10.hangul]})`);

const resultSur = mergeWithXmlFragment(mainHdr, stampHdr, stampSec);
const map2 = resultSur.remapAttrs.charPrIDRef;
const out2 = parseCharPr(resultSur.header);
const fonts2 = hangulFonts(resultSur.header);
assert(out2[map2['10']].height === '850', 'precise: remapped 10 height 850');
assert(fonts2[out2[map2['0']].hangul] === '함초롬바탕', 'precise: remapped 0 함초롬바탕');

console.log('\nAll checks passed.');
