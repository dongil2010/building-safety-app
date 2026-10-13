// 회사 관리(이름 바꾸기·삭제(비활성)·관리자 지정/해제) 보안 규칙 — Firestore 에뮬레이터 전용(실제 데이터 안 건드림)
// 실행: npx firebase emulators:exec --only firestore --project demo-bsa "node scripts/rules/test-company-admin-rules.mjs"
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { readFileSync } from 'node:fs';
import { doc, getDoc, setDoc, updateDoc, deleteDoc } from 'firebase/firestore';

const rulesPath = process.env.RULES || new URL('../../firestore.rules', import.meta.url).pathname;
const env = await initializeTestEnvironment({ projectId: 'demo-bsa', firestore: { rules: readFileSync(rulesPath, 'utf8') } });
await env.withSecurityRulesDisabled(async (c) => {
  const db = c.firestore();
  await setDoc(doc(db, 'companies/c1'), { name: '아인테크', adminUid: 'a1', joinCode: 'AB3K7Q' });
  await setDoc(doc(db, 'companies/c1/members/a1'), { role: 'admin' });
  await setDoc(doc(db, 'companies/c1/members/a2'), { role: 'admin' });
  await setDoc(doc(db, 'companies/c1/members/m1'), { role: 'member' });
  await setDoc(doc(db, 'joinCodes/AB3K7Q'), { companyId: 'c1', companyName: '아인테크' });
  await setDoc(doc(db, 'companies/c2'), { name: '다른회사', adminUid: 'b1', joinCode: 'ZZ2222', disabled: true });
  await setDoc(doc(db, 'companies/c2/members/b1'), { role: 'admin' });
  await setDoc(doc(db, 'companies/c3'), { name: '열린회사', adminUid: 'x1', joinCode: 'YY3333' });
  await setDoc(doc(db, 'users/m1'), { companyId: 'c1', companyName: '아인테크', role: 'member' });
});
const as = (uid) => env.authenticatedContext(uid).firestore(); // 클레임 없이 → members 문서로 판정
const res = [];
async function t(name, p) { try { await p; res.push(['ok', name]); } catch (e) { res.push(['FAIL', name + ' — ' + e.message]); } }

await t('관리자: 가입코드 이름 바꾸기', assertSucceeds(updateDoc(doc(as('a1'), 'joinCodes/AB3K7Q'), { companyName: '(주)동일구조', companyNameLower: '(주)동일구조' })));
await t('관리자: 가입코드 비활성 표시', assertSucceeds(updateDoc(doc(as('a1'), 'joinCodes/AB3K7Q'), { disabled: true, disabledAt: null })));
await t('관리자: 가입코드 회사 연결(companyId) 못 바꿈', assertFails(updateDoc(doc(as('a1'), 'joinCodes/AB3K7Q'), { companyId: 'c3' })));
await t('관리자: 가입코드 지우기 금지', assertFails(deleteDoc(doc(as('a1'), 'joinCodes/AB3K7Q'))));
await t('팀원: 가입코드 이름 못 바꿈', assertFails(updateDoc(doc(as('m1'), 'joinCodes/AB3K7Q'), { companyName: 'x' })));
await t('남의 회사 관리자: 못 바꿈', assertFails(updateDoc(doc(as('b1'), 'joinCodes/AB3K7Q'), { companyName: 'x' })));
await t('관리자: 회사 이름·비활성', assertSucceeds(updateDoc(doc(as('a1'), 'companies/c1'), { name: '(주)동일구조', disabled: false })));
await t('팀원: 회사 문서 못 바꿈', assertFails(updateDoc(doc(as('m1'), 'companies/c1'), { disabled: true })));
await t('관리자: 팀원 → 관리자 지정', assertSucceeds(updateDoc(doc(as('a1'), 'companies/c1/members/m1'), { role: 'admin' })));
await t('관리자: 다른 관리자 해제', assertSucceeds(updateDoc(doc(as('a1'), 'companies/c1/members/m1'), { role: 'member' })));
await t('관리자: 본인 해제 금지(마지막 관리자 방지)', assertFails(updateDoc(doc(as('a1'), 'companies/c1/members/a1'), { role: 'member' })));
await t('팀원: 스스로 관리자 지정 못 함', assertFails(updateDoc(doc(as('m1'), 'companies/c1/members/m1'), { role: 'admin' })));
await t('관리자: 팀원 사용자정보 role·회사이름', assertSucceeds(updateDoc(doc(as('a1'), 'users/m1'), { role: 'admin', companyName: '(주)동일구조' })));
await t('삭제(비활성) 회사에 가입 신청 못 함', assertFails(setDoc(doc(as('u9'), 'companies/c2/pendingRequests/u9'), { name: 'n' })));
await t('열린 회사엔 가입 신청 됨', assertSucceeds(setDoc(doc(as('u9'), 'companies/c3/pendingRequests/u9'), { name: 'n' })));
await t('로그인 안 해도 코드 1건 조회', assertSucceeds(getDoc(doc(env.unauthenticatedContext().firestore(), 'joinCodes/AB3K7Q'))));
await env.cleanup();
for (const [s, n] of res) console.log(s.padEnd(4), n);
const bad = res.filter((r) => r[0] !== 'ok').length;
console.log(bad ? `rules: ${bad} failed` : `rules: all ${res.length} ok`);
process.exit(bad ? 1 : 0);
