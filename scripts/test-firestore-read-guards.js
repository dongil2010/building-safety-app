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

// --- 회귀 방지: 층 스냅샷 캐시를 다른 층에 쓰면 결함이 층끼리 섞인다 (2026-09-19 사고) ---
//
// lease 분리(4번) 때 preloaded 출처가 leaseInfo.serverData(그 동기화 안에서 그 층 문서를
// 잠그며 읽은 값 = 자기 완결)에서 _lastFloorSnapData(리스너 캐시 = 수명이 따로 돎)로 바뀌었다.
// 층을 바꾸면 currentFloor는 즉시 바뀌지만 리스너 재구독은 비동기라, 그 사이 캐시는 아직
// 이전 층 것이다. 그대로 쓰면 이전 층 결함이 새 층에 병합돼 새 층 문서로 업로드된다.
// 실제로 현장 데이터가 섞였다. _listeningFloorPath로 캐시 주인을 확인해야 한다.
assert.match(
    app,
    /const cacheBelongsToThisFloor = !!\(floorRefForKey[\s\S]{0,200}_listeningFloorPath === floorRefForKey\.path/,
    '층 preloaded 캐시는 _listeningFloorPath로 주인 층을 확인해야 한다 (층끼리 결함 섞임 사고 재발 방지)'
);
assert.match(
    app,
    /const preloaded = \(floorKey === currentKey && cacheBelongsToThisFloor\)/,
    'preloaded는 cacheBelongsToThisFloor 가드를 반드시 통과해야 한다'
);
assert.doesNotMatch(
    app,
    /const preloaded = \(floorKey === currentKey && _lastFloorSnapData && Object\.keys\(_lastFloorSnapData\)\.length\)/,
    '가드 없는 옛 형태로 되돌리지 말 것 — 층 전환 직후 동기화에서 결함이 층끼리 섞인다'
);

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
