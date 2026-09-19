#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const app = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
const rules = fs.readFileSync(path.join(__dirname, '..', 'firestore.rules'), 'utf8');

assert.match(app, /getSyncDebounceMs\?\.\(\) \?\? 3000/);
assert.match(app, /scheduleSyncToFirebase\(\{ skipMarkCurrent: true \}\)/);
assert.doesNotMatch(app, /if \(_syncPending\) \{\s*_syncPending = false;\s*syncStateToFirebase\(\);/s);

assert.match(app, /const PHOTO_FETCH_MAX_CONCURRENT = 4;/);
assert.match(app, /const PHOTO_FETCH_MAX_PER_HYDRATE = 24;/);
assert.match(app, /function fetchPhotosDocIfAllowed/);
assert.match(app, /function loadPhotoIdsWithCloudCap/);
assert.match(app, /await loadPhotoIdsWithCloudCap\(d\.photoIds\)/);
assert.match(app, /await fetchPhotosDocIfAllowed\(pid\)/);
assert.match(app, /await fetchPhotosDocIfAllowed\(key\)/);
assert.match(app, /await fetchPhotosDocIfAllowed\(photoId\)/);
assert.match(app, /await fetchPhotosDocIfAllowed\(row\.pid\)/);
assert.doesNotMatch(app, /companyPhotos\.doc\(row\.pid\)\.get\(\)/);

assert.match(app, /function stopPhoneRelayListener/);
assert.match(app, /function hidePhoneRelayModal\(\) \{[\s\S]*stopPhoneRelayListener\(\);/);
assert.match(app, /PHONE_RELAY_MAX_MS = 30 \* 60 \* 1000/);
assert.match(app, /if \(typeof stopPhoneRelayListener === 'function'\) stopPhoneRelayListener\(\);/);

assert.match(rules, /match \/joinCodes\/\{code\} \{[\s\S]*allow get: if true;[\s\S]*allow list: if request\.auth != null;/);
assert.doesNotMatch(rules, /match \/joinCodes\/\{code\} \{[\s\S]*allow read: if true;/);

assert.match(app, /loadAndApplyUserDefectPinPresets\(profile\.uid, profile\.userDocData\)/);
assert.match(app, /userDocData: data/);
assert.match(app, /pendingRequests'\)\.orderBy\('requestedAt', 'desc'\)\.limit\(50\)\.get\(\)/);
assert.match(app, /collection\('members'\)\.limit\(100\)\.get\(\)/);

assert.match(app, /function startSingleTabHeartbeat/);
assert.match(app, /window\._bsaSingleTabHeartbeatStarted/);
assert.match(app, /failed-precondition/);

assert.match(app, /const SYNC_DIRTY_FLOOR_BATCH_MAX = 3;/);
assert.match(app, /pickDirtyFloorsForSyncBatch\(SYNC_DIRTY_FLOOR_BATCH_MAX\)/);
assert.match(app, /function getSyncLeaseDocRef/);
assert.match(app, /collection\('syncLeases'\)\.doc\(/);
assert.match(app, /const leaseRef = getSyncLeaseDocRef\(inspectFloorRef \|\| docRef\);/);
assert.doesNotMatch(app, /leaseInfo\.serverData/);
assert.match(rules, /match \/syncLeases\/\{leaseId\} \{[\s\S]*allow read, write: if isCompanyMember\(companyId\);/);

// --- 6. 규칙 멤버십을 Auth custom claims로 (exists() 과금 제거) ---
const storageRules = fs.readFileSync(path.join(__dirname, '..', 'storage.rules'), 'utf8');

// 클레임을 먼저 보고, 실패할 때만 exists()로 폴백해야 한다.
// ||는 단락 평가라 클레임이 맞으면 exists()가 아예 실행되지 않는다.
assert.match(rules, /function hasCompanyClaim\(companyId\)/);
assert.match(rules, /request\.auth\.token\.companyId == companyId/);
assert.match(
    rules,
    /function isCompanyMember\(companyId\) \{\s*return hasCompanyClaim\(companyId\) \|\| \(/,
    'isCompanyMember는 클레임을 먼저 보고 exists()로 폴백해야 한다'
);
assert.match(
    rules,
    /function isCompanyAdmin\(companyId\) \{\s*return hasCompanyAdminClaim\(companyId\) \|\| \(/,
    'isCompanyAdmin은 클레임을 먼저 보고 get()으로 폴백해야 한다'
);
// 폴백은 반드시 남아 있어야 한다 — 클레임 없는 기존 세션이 잠기면 안 된다
assert.match(rules, /exists\(\/databases\/\$\(database\)\/documents\/companies\/\$\(companyId\)\/members\/\$\(request\.auth\.uid\)\)/);

assert.match(storageRules, /function hasCompanyClaim\(companyId\)/);
assert.match(
    storageRules,
    /function isCompanyMember\(companyId\) \{\s*return hasCompanyClaim\(companyId\) \|\| \(/,
    'storage.rules도 클레임 우선이어야 사진 GET마다 과금되지 않는다'
);
assert.match(storageRules, /firestore\.exists\(/);

// 클레임을 쓰는 쪽은 Admin SDK만 — 클라이언트에 setCustomUserClaims가 있으면 안 된다
const fnSource = fs.readFileSync(path.join(__dirname, '..', 'functions', 'index.js'), 'utf8');
assert.match(fnSource, /setCustomUserClaims/);
assert.match(fnSource, /document\('companies\/\{companyId\}\/members\/\{uid\}'\)/);
assert.match(fnSource, /verifyIdToken/);
assert.doesNotMatch(app, /setCustomUserClaims/);

// 클라이언트는 토큰이 이미 맞으면 네트워크 호출을 하지 않고, 바뀌면 재발급받는다
assert.match(app, /function ensureCompanyAuthClaims/);
assert.match(app, /await ensureCompanyAuthClaims\(profile\.uid, profile\.companyId, profile\.role\)/);
assert.match(app, /getIdToken\(true\)/);

// --- 8. joinCodes 전체 list 축소 ---
assert.match(app, /const JOIN_CODES_DIRECTORY_MAX = 50;/);
assert.match(app, /collection\('joinCodes'\)\.limit\(JOIN_CODES_DIRECTORY_MAX\)\.get\(\)/);
assert.doesNotMatch(app, /db\.collection\('joinCodes'\)\.get\(\)/);
// 미로그인 상태에서 컬렉션 list를 시도하면 permission-denied가 된다
assert.match(app, /function isJoinDirectoryReadable[\s\S]{0,200}auth\.currentUser/);
assert.match(app, /function searchCompaniesForJoin/);
// 6자리 식별코드는 컬렉션을 훑지 않고 문서 1건만 읽는다
assert.match(app, /function lookupCompanyByJoinCode[\s\S]{0,200}collection\('joinCodes'\)\.doc\(code\)\.get\(\)/);

console.log('test-firestore-read-guards: ok');
