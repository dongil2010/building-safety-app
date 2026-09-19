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

console.log('test-firestore-read-guards: ok');
