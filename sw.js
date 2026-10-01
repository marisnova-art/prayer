/* 기도문 · Prayer — Service Worker
   - 앱 화면(index.html): 네트워크 우선 → 오프라인이면 저장본
   - 아이콘·배경 이미지(같은 출처): 캐시 우선 + 뒤에서 갱신
   - 글꼴·라이브러리·성경 데이터(CDN): 캐시 우선 + 뒤에서 갱신
   - Supabase(데이터 저장·동기화)는 절대 가로채지 않음                          */
const VERSION = 'prayer-v1.0.0';
const SHELL = `${VERSION}-shell`;
const RUNTIME = `${VERSION}-runtime`;
const CDN = `${VERSION}-cdn`;
const CDN_MAX = 160;      // CDN 캐시 최대 항목 수
const RUNTIME_MAX = 120;  // 배경 이미지 등 최대 항목 수

const SHELL_FILES = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png',
  './icons/favicon-32.png',
  './icons/icon.svg'
];

const CDN_HOSTS = ['cdn.jsdelivr.net', 'fonts.googleapis.com', 'fonts.gstatic.com'];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(SHELL)
      .then(c => c.addAll(SHELL_FILES.map(u => new Request(u, { cache: 'reload' }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => !k.startsWith(VERSION)).map(k => caches.delete(k)));
    if (self.registration.navigationPreload) {
      try { await self.registration.navigationPreload.enable(); } catch (_) {}
    }
    await self.clients.claim();
  })());
});

self.addEventListener('message', event => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

async function trim(cacheName, max){
  const c = await caches.open(cacheName);
  const keys = await c.keys();
  for (let i = 0; i < keys.length - max; i++) await c.delete(keys[i]);
}

function cacheable(res){
  // 정상 응답만 저장 (404 등은 저장하지 않아 배경 이미지 탐색이 그대로 동작)
  return res && (res.ok || res.type === 'opaque');
}

async function networkFirstPage(event){
  const cache = await caches.open(SHELL);
  try {
    const preload = event.preloadResponse ? await event.preloadResponse : null;
    const res = preload || await fetch(event.request);
    if (res && res.ok) cache.put('./index.html', res.clone());
    return res;
  } catch (_) {
    return (await cache.match('./index.html')) ||
           (await cache.match('./')) ||
           new Response('<h1>오프라인입니다</h1><p>인터넷에 연결된 뒤 다시 열어 주세요.</p>',
             { headers: { 'Content-Type': 'text/html; charset=utf-8' }, status: 503 });
  }
}

async function staleWhileRevalidate(event, cacheName, max){
  const cache = await caches.open(cacheName);
  const hit = await cache.match(event.request);
  const net = fetch(event.request).then(res => {
    if (cacheable(res)) {
      cache.put(event.request, res.clone()).then(() => trim(cacheName, max)).catch(() => {});
    }
    return res;
  }).catch(() => null);
  if (hit) { event.waitUntil(net); return hit; }
  const res = await net;
  return res || Response.error();
}

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Supabase·외부 API·확장 프로그램 등은 그대로 통과
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return;
  if (url.hostname.endsWith('supabase.co') || url.hostname.endsWith('supabase.in')) return;

  // 앱 화면
  if (req.mode === 'navigate' && url.origin === self.location.origin) {
    event.respondWith(networkFirstPage(event));
    return;
  }

  // 글꼴·라이브러리·성경 데이터
  if (CDN_HOSTS.includes(url.hostname)) {
    event.respondWith(staleWhileRevalidate(event, CDN, CDN_MAX));
    return;
  }

  // 같은 출처 정적 파일 (아이콘, 배경 이미지 폴더 등)
  if (url.origin === self.location.origin) {
    if (url.pathname.endsWith('/sw.js')) return;
    // 오늘의 기도문 JSON 등 데이터 파일은 항상 최신으로
    if (/\.json$/i.test(url.pathname)) return;
    event.respondWith(staleWhileRevalidate(event, RUNTIME, RUNTIME_MAX));
  }
});
