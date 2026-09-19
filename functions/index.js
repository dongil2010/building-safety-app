'use strict';

// ============================================================================
// 회사 소속을 Firebase Auth custom claims에 심는 서버 코드
//
// 왜 필요한가:
//   firestore.rules / storage.rules 의 isCompanyMember()가 요청마다
//   exists(companies/{companyId}/members/{uid}) 를 탔다.
//   규칙 안의 exists()/get()도 문서 읽기로 과금되고, 실시간 리스너는 스냅샷이
//   갱신될 때마다 규칙을 다시 평가하므로 층 문서 1건마다 members 문서가 같이
//   과금됐다(사진 Storage GET도 마찬가지).
//   토큰 안의 클레임을 먼저 보면 이 조회가 통째로 사라진다.
//
// 보안:
//   custom claims는 Admin SDK로만 쓸 수 있다. 클라이언트는 자기 토큰의
//   companyId를 위조할 수 없다. 규칙은 token.companyId == {companyId} 경로
//   파라미터를 비교하므로, A사 토큰으로 B사 문서를 열 수 없다.
//
// 배포:
//   firebase deploy --only functions
//   (Blaze 요금제 필요 — 이 프로젝트는 이미 Blaze)
// ============================================================================

const functions = require('firebase-functions/v1');
const admin = require('firebase-admin');

admin.initializeApp();

const CLAIM_COMPANY = 'companyId';
const CLAIM_ROLE = 'role';

// GitHub Pages(현장 Android WebView가 여는 주소)와 로컬 개발 서버만 허용
const ALLOWED_ORIGINS = [
    'https://dongil2010.github.io',
    'http://localhost:8000',
    'http://127.0.0.1:8000'
];

/**
 * 실제로 바뀔 때만 setCustomUserClaims를 호출한다.
 * 불필요한 호출은 토큰을 계속 무효화시켜 클라이언트가 매번 재발급을 받게 만든다.
 * @returns {Promise<boolean>} 클레임이 바뀌었으면 true
 */
async function applyCompanyClaims(uid, companyId, role) {
    const user = await admin.auth().getUser(uid);
    const existing = user.customClaims || {};
    const nextCompany = companyId || null;
    const nextRole = companyId ? (role || 'member') : null;

    if ((existing[CLAIM_COMPANY] || null) === nextCompany &&
        (existing[CLAIM_ROLE] || null) === nextRole) {
        return false;
    }

    // 다른 claim(있다면)은 건드리지 않는다
    const next = Object.assign({}, existing);
    if (nextCompany) {
        next[CLAIM_COMPANY] = nextCompany;
        next[CLAIM_ROLE] = nextRole;
    } else {
        delete next[CLAIM_COMPANY];
        delete next[CLAIM_ROLE];
    }
    await admin.auth().setCustomUserClaims(uid, next);
    return true;
}

/**
 * members 문서가 진실의 근원이다. 이 문서를 읽어 클레임을 맞춘다.
 * 회사 생성·가입 승인·거절·추방·탈퇴가 전부 이 문서의 생성/삭제로 끝나므로
 * 클라이언트 흐름을 하나도 고치지 않고 모든 시점을 덮는다.
 */
exports.onCompanyMemberWrite = functions.firestore
    .document('companies/{companyId}/members/{uid}')
    .onWrite(async (change, context) => {
        const companyId = context.params.companyId;
        const uid = context.params.uid;

        if (!change.after.exists) {
            // 삭제(거절·추방·탈퇴). 지금 클레임이 이 회사를 가리킬 때만 지운다.
            // 다른 회사로 이미 옮겼다면 그 클레임을 건드리면 안 된다.
            try {
                const user = await admin.auth().getUser(uid);
                const claims = user.customClaims || {};
                if (claims[CLAIM_COMPANY] === companyId) {
                    await applyCompanyClaims(uid, null, null);
                }
            } catch (err) {
                // 계정 자체가 지워진 경우(탈퇴) — 정리할 클레임도 없다
                if (err && err.code !== 'auth/user-not-found') throw err;
            }
            return null;
        }

        const role = (change.after.data() || {}).role || 'member';
        await applyCompanyClaims(uid, companyId, role);
        return null;
    });

/**
 * 트리거는 "앞으로 바뀌는 것"만 덮는다.
 * 이미 members 문서가 있는 기존 사용자는 트리거가 영영 안 돌기 때문에
 * 로그인할 때 이 엔드포인트로 한 번 맞춰준다.
 *
 * 호출자가 보낸 companyId를 믿지 않는다. 토큰의 uid로 서버가 직접 확인한다.
 * POST, Authorization: Bearer <idToken>
 */
exports.syncCompanyClaims = functions.https.onRequest(async (req, res) => {
    const origin = req.headers.origin;
    if (origin && ALLOWED_ORIGINS.indexOf(origin) !== -1) {
        res.set('Access-Control-Allow-Origin', origin);
        res.set('Vary', 'Origin');
    }
    res.set('Access-Control-Allow-Headers', 'Authorization, Content-Type');
    res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');

    if (req.method === 'OPTIONS') {
        res.status(204).send('');
        return;
    }
    if (req.method !== 'POST') {
        res.status(405).json({ error: 'method-not-allowed' });
        return;
    }

    const header = req.headers.authorization || '';
    const match = header.match(/^Bearer\s+(.+)$/i);
    if (!match) {
        res.status(401).json({ error: 'missing-token' });
        return;
    }

    let uid;
    try {
        const decoded = await admin.auth().verifyIdToken(match[1]);
        uid = decoded.uid;
    } catch (err) {
        res.status(401).json({ error: 'invalid-token' });
        return;
    }

    try {
        const db = admin.firestore();
        const userSnap = await db.collection('users').doc(uid).get();
        const companyId = userSnap.exists ? (userSnap.data() || {}).companyId : null;

        if (!companyId) {
            const changed = await applyCompanyClaims(uid, null, null);
            res.json({ ok: true, changed: changed, companyId: null, role: null });
            return;
        }

        // users 문서는 본인이 쓸 수 있으므로 그것만 믿으면 안 된다.
        // 실제 승인 기록인 members 문서로 다시 확인한다.
        const memberSnap = await db
            .collection('companies').doc(companyId)
            .collection('members').doc(uid).get();

        if (!memberSnap.exists) {
            const changed = await applyCompanyClaims(uid, null, null);
            res.json({ ok: true, changed: changed, companyId: null, role: null });
            return;
        }

        const role = (memberSnap.data() || {}).role || 'member';
        const changed = await applyCompanyClaims(uid, companyId, role);
        res.json({ ok: true, changed: changed, companyId: companyId, role: role });
    } catch (err) {
        console.error('syncCompanyClaims 실패:', err);
        res.status(500).json({ error: 'internal' });
    }
});
