/**
 * Worker Storage 프록시에 허용할 URL.
 * SSRF 방지: Vision/일반 googleapis 가 아니라 Firebase/GCS 객체 다운로드만.
 * app.js 의 클라이언트 검사와 규칙을 맞춰 둔다 (js/core/firebase-storage-assets.js).
 */
export function isAllowedStorageUrl(url) {
  try {
    const u = new URL(url);
    if (u.protocol !== 'https:') return false;
    const h = u.hostname.toLowerCase();
    const path = u.pathname || '';
    if (h === 'firebasestorage.googleapis.com') {
      return path.indexOf('/v0/b/') === 0 && path.indexOf('/o/') !== -1;
    }
    if (h === 'storage.googleapis.com') {
      return path.indexOf('/download/storage/') === 0
        || path.indexOf('/storage/v1/b/') === 0
        || /^\/[^/]+\//.test(path);
    }
    // 신규 버킷 호스트: PROJECT.firebasestorage.app (/o/ 또는 /v0/b/.../o/...)
    if (h.endsWith('.firebasestorage.app') || h === 'firebasestorage.app') {
      return path.indexOf('/o/') !== -1 || path.indexOf('/v0/b/') === 0;
    }
    return false;
  } catch {
    return false;
  }
}
