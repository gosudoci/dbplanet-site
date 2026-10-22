// DB PLANET 메인 페이지 — 몰입형 인트로(WebGL) · 스크롤 연출 · 대시보드 카운터 · 전후 비교 · 폼
(() => {
  'use strict';

  // ── 설정
  const CONFIG = {
    // 'auto' | 'high' | 'low' | 'static' — 주소 뒤에 ?intro=static 처럼 붙여 바꿔 볼 수 있다
    introQuality: new URLSearchParams(location.search).get('intro') || 'auto',
    revealMotion: true
  };

  // ── 몰입형 영역 에셋
  const INTRO_ASSETS = {
    // Magnific로 만든 행성 텍스처 (흑요석 · 진주빛 가스 행성 · 은빛 위성 · 우리 행성 = 달)
    planet: 'assets/intro/planet-obsidian.webp',
    tex1: 'assets/intro/planet-pearl.webp', tex2: 'assets/intro/planet-moon.webp',
    nrm1: 'assets/intro/planet-pearl-normal.webp', nrm2: 'assets/intro/planet-moon-normal.webp',
    c1: 'assets/intro/planet-moon-hero.webp', c1n: 'assets/intro/planet-moon-hero-normal.webp'
  };
  // 작업 사례 3D 패널용 미디어 · 상세 링크 (index.html의 작업 사례 순서와 같다). videoUrl이 있으면 패널에서 재생된다.
  const WORKS_MEDIA = [
    { videoUrl: '', posterUrl: '', link: '#' },
    { videoUrl: '', posterUrl: '', link: '#' },
    { videoUrl: '', posterUrl: '', link: '#' }
  ];
  const WORKS_ALL_LINK = '#';

  // ── 챕터: 각 챕터가 자기 스크롤 길이(vh)를 갖고, 전체 길이는 합으로 자동 계산.
  //    챕터 안의 모든 수치(textOut, field, text, sink, camera/corona 키의 t)는 그 챕터의 진행도 0~1 기준.
  //    pin: false 챕터(퇴장 전환)는 고정이 풀린 뒤 캔버스가 위로 밀려나는 구간 — 항상 맨 끝에 둔다.
  // 서비스 궤도 카메라: 우리 행성을 중심으로 리그째 회전 → 행성은 화면 오른쪽, 텍스트는 왼쪽에 고정된 채 궤도를 돈다
  const orbitKey = (t, th) => {
    const P = [-5.3, -2.35, 19], rot = (o) => [P[0] + o[0] * Math.cos(th) + o[2] * Math.sin(th), P[1] + o[1], P[2] - o[0] * Math.sin(th) + o[2] * Math.cos(th)];
    const d = rot([-1.2, 0.35, 3.8]), m = rot([0, -0.9, 6.5]);
    const k = { x: d[0], y: d[1], z: d[2], yaw: th, par: 0.4, px: m[0], py: m[1], pz: m[2], pyaw: th };
    if (t != null) k.t = t; return k;
  };
  const segKeys = (seg, fn) => { const len = (1 - seg.start) / seg.count, out = []; for (let i = 0; i < seg.count; i++) { const k = fn(i); out.push({ t: seg.start + len * (i + seg.move), ...k }, { t: seg.start + len * (i + 1) - 0.001, ...k }); } return out; };
  const CASE_ANCHORS = [[-13, -1.5, 15], [-17, -3, 11], [-21, -1, 14]];
  const CHAPTERS = [
    { id: 'intro', name: '인트로', vh: 120, textOut: [0, 0.48],
      camera: [{ t: 0, x: 0, y: -0.6, z: 7 }, { t: 1, x: 0, y: -0.5, z: 13 }],
      corona: [{ t: 0, spread: 1, leak: 0.35, intensity: 1 }, { t: 1, spread: 2.6, leak: 1, intensity: 1.3 }] },
    { id: 'problem', name: '문제', vh: 330,
      camera: [{ t: 0.07, x: -3.4, y: -2.2, z: 16 }, { t: 0.31, x: -4.2, y: -2.5, z: 21 }, { t: 0.82, x: -6, y: -3, z: 34 }],
      corona: [{ t: 1, spread: 2.8, leak: 1, intensity: 1.5 }],
      field: { reveal: [0, 0.308], lit: [0.308, 0.538], first: [0.923, 1] },
      text: { title: [0.077, 0.538], body: [0.308, 0.538], concerns: [0.538, 0.923], stagger: 0.077 } },
    { id: 'name', name: '이름', vh: 300, anchor: 's3', anchorAt: 0.6,
      camera: [{ t: 0.36, x: -5.77, y: -2.3, z: 20.66, yaw: 0, par: 0.3, px: -5.3, py: -2.87, pz: 23.1, pyaw: 0 },
               { t: 0.9, x: -6.24, y: -2.3, z: 20.45, yaw: -0.3, par: 0.3, px: -6.51, py: -2.87, pz: 22.92, pyaw: -0.3 }],
      stream: { start: [0.25, 0.48], ourLight: [0.48, 0.75], glow: [0.5, 0.75], orbit: [0.76, 0.98] },
      text: { db: [0.25, 1], planets: [0.5, 1], closing: [0.78, 1] } },
    { id: 'service', name: '서비스', vh: 500, anchor: 's4', anchorSeg: 0,
      segments: { start: 0.1, count: 5, move: 0.4 }, text: { intro: [0, 0.11] },
      camera: [orbitKey(0.15, -0.3), ...segKeys({ start: 0.1, count: 5, move: 0.4 }, i => orbitKey(null, -0.3 - i * 0.5))] },
    { id: 'works', name: '작업 사례', vh: 380, anchor: 's6', anchorSeg: 0,
      segments: { start: 0.1, count: 3, move: 0.4 }, text: { intro: [0, 0.12] },
      anchors: CASE_ANCHORS, items: WORKS_MEDIA,
      camera: [{ t: 0.1, x: -15, y: -1.2, z: 26, yaw: 0, par: 0.6, px: -15, py: -2, pz: 36, pyaw: 0 },
        ...segKeys({ start: 0.1, count: 3, move: 0.4 }, i => { const A = CASE_ANCHORS[i]; return { x: A[0] + 0.95, y: A[1], z: A[2] + 3.4, yaw: 0, par: 0.25, px: A[0], py: A[1] - 0.75, pz: A[2] + 5.5, pyaw: 0 }; })] },
    { id: 'finale', name: '마무리', vh: 120, sink: [0.7, 1], text: { finale: [0.4, 0.85] },
      camera: [{ t: 0.6, x: -14, y: -6, z: 72, yaw: 0, par: 1, px: -12, py: -6, pz: 115, pyaw: 0 }] },
    { id: 'exit', name: '퇴장 전환', vh: 50, pin: false }
  ];
  const TEXT_FADE_VH = 17.5;
  const SNAP_ENABLED = true;

  const total = CHAPTERS.reduce((a, c) => a + c.vh, 0); let acc = 0, pinned = 0;
  CHAPTERS.forEach(c => { c.range = [acc / total, (acc + c.vh) / total]; acc += c.vh; if (c.pin !== false) pinned += c.vh; });
  const TOTAL_VH = total, PINNED_VH = pinned;
  const CH_BY_ID = Object.fromEntries(CHAPTERS.map(c => [c.id, c]));

  const $ = id => document.getElementById(id);
  const clamp = v => Math.max(0, Math.min(1, v));

  // ── 페이지 상태
  const S = {
    staticMode: false, engine: null, lenis: null, pinST: null, chapterAt: null,
    p: 0, mx: 0, my: 0, fps: 60, lastT: 0, debug: false, submitted: false,
    navShown: false, navCh: null, navIdx: 0, navKey: '', snapping: false, snapTO: 0, lastScrollAt: 0
  };
  let els = {};

  const lenPx = () => S.staticMode ? 0 : TOTAL_VH / 100 * window.innerHeight;
  const pinPx = () => S.staticMode ? 0 : PINNED_VH / 100 * window.innerHeight;

  // ── 스크롤 상태: 헤더 배경 · 모바일 FAB · 대시보드 카운터 시작
  let countersStarted = false, pastHero = null;
  function onScroll() {
    const vh = window.innerHeight;
    // 스냅 애니메이션 도중 바깥에서 순간 이동하면(맨 위로 가기, 찾기 등) 스냅을 취소하고 그 자리를 따른다
    if (S.snapping && S.lenis && Math.abs(window.scrollY - S.lenis.animatedScroll) > vh) {
      S.snapping = false; clearTimeout(S.snapTO); S.lenis.scrollTo(window.scrollY, { immediate: true, force: true });
    }
    const d = $('dash');
    if (d && !countersStarted && d.getBoundingClientRect().top < vh * 0.8) { countersStarted = true; runCounters(); }
    const past = window.scrollY > pinPx() + vh * 0.6;
    if (past !== pastHero) { pastHero = past; $('siteHeader').classList.toggle('is-scrolled', past); }
    updateFab();
    // 마지막 장면: 행성 지평선이 아래에서 떠오른다
    const hz = $('horizonImg');
    if (hz) { const r = hz.parentElement.getBoundingClientRect(), t = clamp((vh - r.top) / (r.height + vh * 0.4)); hz.style.setProperty('--rise', (38 * (1 - t)).toFixed(1) + '%'); }
  }

  // ── 큰 제목 빛 채움: 줄마다 같은 글자 두 겹(아래 은은한 흰색, 위 일식 빛)을 만들고, 보이면 왼쪽부터 채운다
  const FILL_TITLES = '.intro-h1, #probLayer h2, #svcLayer h2, #worksLayer h2, #finLayer h2, #probStatic > h2, #s4 > h2, #worksStatic > h2, #finStatic > h2';
  function setupTitleFill() {
    document.querySelectorAll(FILL_TITLES).forEach(h => {
      const lines = h.innerHTML.split(/<br\s*\/?>/i).map(t => t.trim()).filter(Boolean);
      h.innerHTML = lines.map((t, i) => `<span class="fill-line" style="--i:${i}"><span class="fl-base">${t}</span><span class="fl-fill" aria-hidden="true">${t}</span></span>`).join('<br>');
      h.classList.add('fill-title');
      // 데스크톱: 마우스를 올리면 빛이 다시 왼쪽부터 지나간다
      h.addEventListener('pointerenter', e => { if (e.pointerType === 'mouse') replayFill(h); });
    });
    // 정적 대체 화면의 제목은 화면에 들어올 때 채우고, 완전히 나가면 되돌려 다음에 다시 채운다
    if (typeof IntersectionObserver !== 'undefined') {
      const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) e.target.classList.add('is-lit'); else e.target.classList.remove('is-lit'); }), { threshold: 0.4 });
      document.querySelectorAll('#probStatic > h2, #s4 > h2, #worksStatic > h2, #finStatic > h2').forEach(h => io.observe(h));
    }
    // 첫 화면 제목은 불러온 직후 채운다
    const h1 = document.querySelector('.intro-h1');
    setTimeout(() => { h1.classList.add('is-lit'); h1._ready = true; }, 350);
  }
  function replayFill(h) {
    if (!h.classList.contains('is-lit')) return;
    const fills = h.querySelectorAll('.fl-fill');
    fills.forEach(f => { f.style.transition = 'none'; f.style.setProperty('--p', '0'); });
    void h.offsetWidth;
    fills.forEach(f => { f.style.transition = ''; f.style.removeProperty('--p'); });
  }
  // 고정 장면의 제목: 충분히 보이면 채우고, 사라지면 되돌린다 (가운데에서 깜빡이지 않게 두 문턱을 둔다)
  function syncFill(el, o) {
    const ft = el._ft === undefined ? (el._ft = el.classList.contains('fill-title') ? el : el.querySelector('.fill-title')) : el._ft;
    if (!ft) return;
    if (o > 0.6) ft.classList.add('is-lit'); else if (o < 0.05) ft.classList.remove('is-lit');
  }

  // ── 메시지 카드: 단어 단위로 나눠 두고, 차례로 도착하며 한 단어씩 보인다 (blink 알림 카드 참고)
  function splitWords(el) {
    const words = el.textContent.trim().split(/\s+/);
    el.textContent = '';
    words.forEach((w, i) => { const s = document.createElement('span'); s.className = 'w'; s.textContent = w; el.append(s, i < words.length - 1 ? ' ' : ''); });
    return [...el.querySelectorAll('.w')];
  }
  function typeIn(el, step = 45) {
    const ws = splitWords(el);
    ws.forEach((w, i) => setTimeout(() => w.classList.add('on'), i * step));
    return ws.length * step;
  }
  function setupMessages() {
    const box = $('msgs'); if (!box) return;
    const msgs = [...box.querySelectorAll('.msg')];
    if (!CONFIG.revealMotion || typeof IntersectionObserver === 'undefined' || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    box.classList.add('is-wait');
    const io = new IntersectionObserver(es => {
      if (!es[0].isIntersecting) return; io.disconnect();
      let at = 0;
      msgs.forEach((msg, i) => {
        setTimeout(() => {
          msgs.slice(0, i).forEach(m => m.classList.add('is-old'));
          msg.classList.add('is-in');
          typeIn(msg.querySelector('.msg-text'));
        }, at);
        at += msg.querySelector('.msg-text').textContent.trim().split(/\s+/).length * 45 + 900;
      });
    }, { threshold: 0.35 });
    io.observe(box);
  }


  function updateFab() { $('fab').hidden = !(window.innerWidth < 768 && pastHero && !S.submitted); }

  // ── 스크롤 등장
  function setupReveal() {
    if (!CONFIG.revealMotion || typeof IntersectionObserver === 'undefined') return;

    const io = new IntersectionObserver(es => es.forEach(e => {
      if (e.isIntersecting) { e.target.style.opacity = '1'; e.target.style.transform = 'none'; io.unobserve(e.target); }
    }), { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
    document.querySelectorAll('[data-reveal]').forEach(el => {
      const d = parseInt(el.getAttribute('data-reveal') || '0', 10) || 0;
      el.style.opacity = '0'; el.style.transform = 'translateY(24px)';
      el.style.transition = `opacity .6s ease-out ${d}ms, transform .6s ease-out ${d}ms, box-shadow .3s ease`;
      io.observe(el);
    });
  }

  // ── 대시보드 카운터 · 차트
  function runCounters() {
    const t0 = performance.now(), dur = 1800;
    const bars = Array.from(document.querySelectorAll('.bars .bar'));
    const step = now => {
      const p = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - p, 3);
      $('kRank').textContent = Math.round(48 - 45 * e);
      $('kGrowth').textContent = Math.round(244 * e);
      $('kRoas').textContent = Math.round(861 * e);
      $('rankArea').setAttribute('opacity', e.toFixed(3));
      $('rankLine').setAttribute('stroke-dashoffset', (1 - e).toFixed(3));
      $('rankDot').setAttribute('opacity', e > 0.95 ? '1' : '0');
      bars.forEach(b => { b.style.height = (parseFloat(b.dataset.h) * e).toFixed(1) + '%'; });
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  // ── 전후 비교 슬라이더
  function setupCompare() {
    const box = $('baSlider'), after = $('baAfter'), handle = $('baHandle');
    let drag = false;
    const set = pos => {
      pos = Math.max(3, Math.min(97, pos));
      after.style.clipPath = `inset(0 0 0 ${pos}%)`; handle.style.left = pos + '%';
      box.setAttribute('aria-valuenow', Math.round(pos));
    };
    const fromEvent = e => { const r = box.getBoundingClientRect(); set((e.clientX - r.left) / r.width * 100); };
    box.addEventListener('pointerdown', e => { drag = true; try { box.setPointerCapture(e.pointerId); } catch (_) {} fromEvent(e); });
    box.addEventListener('pointermove', e => { if (drag) fromEvent(e); });
    box.addEventListener('pointerup', () => { drag = false; });
    box.addEventListener('pointercancel', () => { drag = false; });
    box.addEventListener('keydown', e => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      e.preventDefault(); e.stopPropagation();
      set(parseFloat(box.getAttribute('aria-valuenow')) + (e.key === 'ArrowRight' ? 5 : -5));
    });
    set(50);
  }

  // ── 무료 진단 신청 · 뉴스레터
  function setupForms() {
    const form = $('diagForm'), err = $('diagErr');
    form.addEventListener('input', () => {
      err.hidden = true;
      $('rpBrand').textContent = form.elements.brand.value.trim() || '디비헬스';
      $('rpKeyword').textContent = form.elements.keyword.value.split(',')[0].trim() || '유산균';
    });
    form.addEventListener('submit', e => {
      e.preventDefault();
      const v = n => form.elements[n].value.trim();
      if (!v('brand') || !v('keyword') || !v('contact')) { err.textContent = '세 항목을 모두 입력해 주세요.'; err.hidden = false; return; }
      // TODO: 실제 접수 API 연결
      const done = $('diagDone'), text = done.querySelector('.msg-text');
      text.textContent = v('brand') + '의 검색 진단을 시작했어요. 영업일 기준 1일 안에 리포트를 보내드릴게요.';
      form.hidden = true; done.hidden = false; typeIn(text);
      S.submitted = true; updateFab();
    });
    const news = $('newsForm');
    news.addEventListener('submit', e => {
      e.preventDefault();
      // TODO: 실제 구독 API 연결
      news.hidden = true; $('newsDone').hidden = false;
    });
  }

  // ── 모바일 제목 크기
  function fitTitles() {
    const mob = window.innerWidth < 768;
    document.querySelectorAll('[data-mfs]').forEach(el => { if (el.dataset.fs0 == null) el.dataset.fs0 = el.style.fontSize; el.style.fontSize = mob ? el.getAttribute('data-mfs') + 'px' : el.dataset.fs0; });
    if (!mob) return;
    document.querySelectorAll('[data-fit]').forEach(el => {
      let fs = parseFloat(el.getAttribute('data-mfs')) || parseFloat(getComputedStyle(el).fontSize);
      const lines = () => Math.round(el.getBoundingClientRect().height / (fs * 1.2));
      while (lines() > 2 && fs > 24) { fs -= 2; el.style.fontSize = fs + 'px'; }
    });
  }

  // ── 몰입형 영역
  const waitFor = (fn, ms) => new Promise(res => { const t0 = performance.now(); const chk = () => { if (fn()) return res(true); if (performance.now() - t0 > ms) return res(false); setTimeout(chk, 50); }; chk(); });

  function segInfo(ch, lp) { const G = ch.segments, len = (1 - G.start) / G.count, x = (lp - G.start) / len; if (x < 0) return { idx: -1, t: 0, k: 0 }; const idx = Math.min(G.count - 1, Math.floor(x)), t = Math.min(1, x - idx); return { idx, t, k: Math.min(1, t / G.move) }; }
  function holdP(ch, i) { const G = ch.segments, len = (1 - G.start) / G.count, l = G.start + len * (i + G.move + (1 - G.move) / 2); return ch.range[0] + l * (ch.range[1] - ch.range[0]); }
  function goSeg(ch, i) {
    if (!ch || !ch.segments || i < 0 || i >= ch.segments.count) return;
    const top = holdP(ch, i) * lenPx(); S.snapping = true; clearTimeout(S.snapTO); S.snapTO = setTimeout(() => { S.snapping = false; }, 1600);
    if (S.lenis) S.lenis.scrollTo(top, { duration: 0.7, onComplete: () => { S.snapping = false; } }); else window.scrollTo({ top, behavior: 'smooth' });
  }
  function stageVals(p, a, b, d) {
    const e = clamp((p - a) / d), x = clamp((p - (b - d)) / d);
    return x > 0 ? { o: 1 - x, y: -32 * x, b: 10 * x } : { o: e, y: 32 * (1 - e), b: 10 * (1 - e) };
  }
  function setStyle(el, o, tf, b) {
    const k = o.toFixed(3) + tf + b.toFixed(1); if (el._k === k) return; el._k = k;
    el.style.opacity = o.toFixed(3); el.style.transform = tf; el.style.filter = b > 0.05 ? 'blur(' + b.toFixed(1) + 'px)' : '';
    el.style.visibility = o > 0.001 ? 'visible' : 'hidden';
  }

  function onAnchor(e) {
    const a = e.target.closest && e.target.closest('a[href^="#"]'); if (!a) return;
    const id = a.getAttribute('href'); if (id === '#') { e.preventDefault(); return; } if (!id || id.length < 2) return;
    let top;
    const chA = !S.staticMode && CHAPTERS.find(c => c.anchor && '#' + c.anchor === id);
    if (chA) {
      top = (chA.segments ? holdP(chA, chA.anchorSeg || 0) : chA.range[0] + (chA.range[1] - chA.range[0]) * (chA.anchorAt ?? 0.5)) * lenPx();
    } else if (id === '#next-chapter') {
      const next = CHAPTERS[1], st = $('probStatic');
      top = S.staticMode || !next ? (st ? st.getBoundingClientRect().top + window.scrollY : window.innerHeight) : next.range[0] * lenPx();
    } else {
      const el = $(id.slice(1)); if (!el) return;
      top = id === '#s1' ? 0 : el.getBoundingClientRect().top + window.scrollY;
    }
    e.preventDefault();
    if (S.lenis) S.lenis.scrollTo(top, { duration: 1.6 }); else window.scrollTo({ top, behavior: 'smooth' });
  }

  function onKey(e) {
    const typing = e.target.closest && e.target.closest('input,textarea,[contenteditable="true"],[role="slider"]');
    if ((e.key === 'ArrowRight' || e.key === 'ArrowLeft') && S.navShown && !typing) { e.preventDefault(); goSeg(S.navCh, (S.navIdx || 0) + (e.key === 'ArrowRight' ? 1 : -1)); return; }
    if ((e.key === 'd' || e.key === 'D') && !e.metaKey && !e.ctrlKey && !e.altKey && !typing) {
      S.debug = !S.debug; $('introDebug').style.display = S.debug ? 'block' : 'none';
    }
  }

  async function initImmersive() {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const lowEnd = (navigator.hardwareConcurrency || 8) <= 2 || (navigator.deviceMemory || 8) <= 2;
    let gl = false; try { const c = document.createElement('canvas'); gl = !!(c.getContext('webgl2') || c.getContext('webgl')); } catch (e) {}
    els = {
      exit: Array.from(document.querySelectorAll('[data-exit]')),
      stage: Array.from(document.querySelectorAll('[data-stage]')),
      cards: Array.from(document.querySelectorAll('[data-concern]')),
      lines: [0, 1, 2].map(i => $('probLine' + i)),
      seg: { service: Array.from(document.querySelectorAll('[data-seg="service"]')), works: Array.from(document.querySelectorAll('[data-seg="works"]')) },
      dots: Array.from(document.querySelectorAll('[data-dot]')),
      enter: Array.from(document.querySelectorAll('[data-enter]'))
    };
    // 하단 내비 PREV/NEXT 라벨은 각 단계 제목에서 읽는다
    els.titles = { service: els.seg.service.map(el => el.querySelector('h3').textContent), works: els.seg.works.map(el => el.querySelector('h3').textContent) };
    $('chAll').setAttribute('href', WORKS_ALL_LINK);
    $('chPrev').addEventListener('click', () => goSeg(S.navCh, (S.navIdx || 0) - 1));
    $('chNext').addEventListener('click', () => goSeg(S.navCh, (S.navIdx || 0) + 1));
    window.addEventListener('pointermove', e => { S.mx = e.clientX / window.innerWidth * 2 - 1; S.my = e.clientY / window.innerHeight * 2 - 1; }, { passive: true });
    window.addEventListener('keydown', onKey);
    document.addEventListener('click', onAnchor, true);

    if (reduce || lowEnd || !gl || CONFIG.introQuality === 'static') return applyStatic();
    const libs = await waitFor(() => window.gsap && window.ScrollTrigger && window.Lenis, 8000);
    if (!libs) return applyStatic();
    const g = window.gsap; g.registerPlugin(window.ScrollTrigger);
    S.lenis = new window.Lenis({ lerp: 0.1, smoothWheel: true });
    S.lenis.on('scroll', window.ScrollTrigger.update);
    S.lenis.on('scroll', () => { S.lastScrollAt = performance.now(); });
    g.ticker.add(time => { S.lenis.raf(time * 1000); if (!S.staticMode) tick(); });
    g.ticker.lagSmoothing(0);
    S.pinST = window.ScrollTrigger.create({ trigger: $('introStage'), start: 'top top', end: () => '+=' + Math.round(pinPx()), pin: true, pinSpacing: true, invalidateOnRefresh: true });
    // 제목은 첫 프레임부터 보이고 살짝 떠오르기만 한다. 나머지는 1.2초 안에 도착
    const h1 = els.enter.filter(el => el.tagName === 'H1'), rest = els.enter.filter(el => el.tagName !== 'H1');
    g.from(h1, { y: 20, duration: 0.9, ease: 'power3.out' });
    g.fromTo(rest, { opacity: 0, y: 24 }, { opacity: 1, y: 0, duration: 0.8, ease: 'power3.out', stagger: 0.09, delay: 0.15 });
    onScroll();
    try {
      const mod = await import(new URL('intro/intro-engine.js', document.baseURI).href);
      S.chapterAt = mod.chapterAt;
      S.engine = await mod.createIntro({ canvas: $('introCanvas'), chapters: CHAPTERS, quality: CONFIG.introQuality, assets: INTRO_ASSETS });
      $('introCanvas').style.opacity = '1';
      $('introFallback').style.opacity = '0';
    } catch (err) { console.warn('[intro] WebGL 초기화 실패 — 정적 대체 화면으로 전환', err); applyStatic(true); }
  }

  function applyStatic(teardown) {
    S.staticMode = true;
    if (teardown && S.pinST) { S.pinST.kill(true); S.pinST = null; }
    if (window.gsap) window.gsap.killTweensOf(els.enter);
    els.enter.forEach(el => { el.style.opacity = '1'; el.style.transform = 'none'; el.style.filter = 'none'; });
    els.exit.forEach(el => { el.style.opacity = ''; el.style.transform = ''; el.style.filter = ''; });
    ['probLayer', 'nameLayer', 'svcLayer', 'worksLayer', 'finLayer', 'chNav', 'introCanvas'].forEach(id => { $(id).style.display = 'none'; });
    ['probStatic', 's3', 's4', 'worksStatic', 'finStatic'].forEach(id => $(id).classList.add('is-on'));
    $('introFallback').style.opacity = '1';
    $('introSink').style.opacity = '0';
    if (window.ScrollTrigger) window.ScrollTrigger.refresh();
    fitTitles();
    onScroll();
  }

  let lastMobile = null, lastShort = null, lastW = 0, lastTx = -1, lastSink = -1, introStart = null;
  function layoutCards(mobile) {
    lastMobile = mobile;
    const ul = $('probCards');
    Object.assign(ul.style, mobile
      ? { inset: 'auto 0 104px 0', padding: '0 20px', display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '10px' }
      : { inset: '0', padding: '0', display: 'block' });
    els.cards.forEach(el => { el.style.position = mobile ? 'relative' : 'absolute'; el.style.whiteSpace = mobile ? 'normal' : 'nowrap'; el.style.fontSize = mobile ? '16px' : ''; el._k = null; });
    els.lines.forEach(l => l.setAttribute('opacity', '0'));
    [['svcBlock', 'left'], ['worksBlock', 'right']].forEach(([id, side]) => {
      const el = $(id);
      Object.assign(el.style, mobile ? { left: '20px', right: '20px', top: '46%', bottom: '128px', width: 'auto' }
        : side === 'left' ? { left: 'var(--margin)', right: 'auto', top: '96px', bottom: '150px', width: 'min(560px,42vw)' }
        : { right: 'var(--margin)', left: 'auto', top: '96px', bottom: '150px', width: 'min(560px,40vw)' });
      const short = window.innerHeight < 700;
      el.querySelectorAll('[data-segwrap]').forEach(w => { w.style.justifyContent = mobile ? 'flex-end' : short && side === 'right' ? 'flex-start' : 'center'; });
      if (side === 'right') el.querySelectorAll('[data-seg="works"]').forEach(a => {
        a.style.gap = short ? '12px' : '20px';
        const dl = a.querySelector('dl'); if (dl) dl.style.gap = short ? '6px 14px' : '10px 16px';
      });
    });
    ['chPrevT', 'chNextT'].forEach(id => { $(id).style.display = mobile ? 'none' : ''; });
    Object.assign($('nameBlock').style, mobile
      ? { left: '20px', right: '20px', top: 'auto', bottom: '88px', transform: 'none', width: 'auto', gap: '22px' }
      : { left: 'var(--margin)', right: 'auto', top: '96px', bottom: '32px', transform: 'none', justifyContent: 'center', width: 'min(600px,44vw)', gap: window.innerHeight < 640 ? '20px' : '40px' });
  }

  function tick() {
    const now = performance.now(), dt = Math.min(0.05, Math.max(0.001, (now - (S.lastT || now - 16)) / 1000)); S.lastT = now;
    S.fps += (1 / dt - S.fps) * 0.05;
    const vh = window.innerHeight, W = window.innerWidth, len = lenPx() || 1, target = clamp(window.scrollY / len);
    if (W !== lastW) { lastW = W; fitTitles(); }
    // 스크롤이 순간 이동하면(새로고침 위치 복원, 주소의 #, 스크립트 이동) 따라가지 않고 바로 맞춘다
    if (Math.abs(target - (S.lastTarget ?? target)) * TOTAL_VH / 100 > 1.5) S.p = target; S.lastTarget = target;
    S.p += (target - S.p) * (1 - Math.pow(0.915, dt * 60)); if (Math.abs(target - S.p) < 0.0002) S.p = target;
    const p = S.p, CH = CHAPTERS;
    const cp = ch => clamp((p - ch.range[0]) / (ch.range[1] - ch.range[0]));
    const intro = CH[0], prob = CH_BY_ID.problem;

    // 인트로 문구 퇴장: 실제 스크롤 위치 기준이라 맨 위로 돌아오면 바로 다시 보인다
    const introT = clamp((target - intro.range[0]) / (intro.range[1] - intro.range[0]));
    const tx = clamp((introT - intro.textOut[0]) / (intro.textOut[1] - intro.textOut[0]));
    if (tx !== lastTx) {
      lastTx = tx;
      els.exit.forEach(el => {
        const l = clamp(tx * 1.3 - (parseFloat(el.getAttribute('data-exit')) || 0) * 0.1);
        el.style.opacity = String(1 - l); el.style.transform = l ? 'translate3d(0,' + (-56 * l).toFixed(1) + 'px,0)' : ''; el.style.filter = l ? 'blur(' + (12 * l).toFixed(1) + 'px)' : '';
        el.style.visibility = l >= 1 ? 'hidden' : '';
        const h1 = el.querySelector('.intro-h1');
        if (h1 && h1._ready) { if (l >= 0.98) h1.classList.remove('is-lit'); else if (l < 0.02) h1.classList.add('is-lit'); }
      });
    }
    // 챕터별 단계 텍스트
    els.stage.forEach(el => {
      const ch = CH_BY_ID[el.getAttribute('data-chapter') || 'problem'], r = ch && ch.text && ch.text[el.getAttribute('data-stage')]; if (!r) return;
      const v = stageVals(cp(ch), r[0], r[1], TEXT_FADE_VH / ch.vh);
      setStyle(el, v.o, v.y ? 'translate3d(0,' + v.y.toFixed(1) + 'px,0)' : '', v.b);
      syncFill(el, v.o);
      if (el.hasAttribute('data-pe')) el.style.pointerEvents = v.o > 0.5 ? 'auto' : 'none';
    });
    // 고민 문장 카드: 앵커 행성 옆에 붙고 연결선을 그린다
    if (prob && prob.text) {
      const T = prob.text, lp = cp(prob), d = TEXT_FADE_VH / prob.vh, stag = T.stagger ?? 0.077;
      const mobile = W < 768, shortH = vh < 640; if (mobile !== lastMobile || shortH !== lastShort) { lastShort = shortH; layoutCards(mobile); }
      const anc = S.engine ? S.engine.anchors() : [];
      $('probCards').previousElementSibling.style.visibility = !mobile && lp > T.concerns[0] && lp < T.concerns[1] ? 'visible' : 'hidden';
      els.cards.forEach((el, i) => {
        const v = stageVals(lp, T.concerns[0] + i * stag, T.concerns[1], d), line = els.lines[i], a = anc[i];
        if (mobile || !a) { setStyle(el, v.o, 'translate3d(0,' + v.y.toFixed(1) + 'px,0)', v.b); return; }
        if (v.o <= 0.001) { setStyle(el, 0, el.style.transform, 0); line.setAttribute('opacity', '0'); return; }
        const cw = el.offsetWidth, chh = el.offsetHeight, side = a.x < W * 0.5 ? 1 : -1, gap = 56;
        let left = side > 0 ? a.x + a.r + gap : a.x - a.r - gap - cw;
        left = Math.max(24, Math.min(W - cw - 24, left));
        const top = Math.max(88, Math.min(vh - chh - 24, a.y - chh / 2)), cy = top + chh / 2 + v.y;
        setStyle(el, v.o, 'translate3d(' + left.toFixed(1) + 'px,' + (top + v.y).toFixed(1) + 'px,0)', v.b);
        line.setAttribute('x1', (a.x + side * a.r * 1.08).toFixed(1)); line.setAttribute('y1', a.y.toFixed(1));
        line.setAttribute('x2', (side > 0 ? left : left + cw).toFixed(1)); line.setAttribute('y2', cy.toFixed(1));
        line.setAttribute('opacity', a.on ? v.o.toFixed(3) : '0');
      });
    }
    // 구간형 챕터(서비스·작업 사례): 단계 텍스트 · 공용 내비 · 스냅
    let navCh = null, navSi = null;
    CH.filter(c => c.segments).forEach(ch => {
      const lp = cp(ch), si = segInfo(ch, lp), d = TEXT_FADE_VH / ch.vh, endFade = 1 - clamp((lp - (1 - d)) / d);
      (els.seg[ch.id] || []).forEach(el => {
        const i = +el.getAttribute('data-idx'); let o = 0;
        if (lp > 0 && lp < 1) { if (si.idx === i) o = clamp((si.t - 0.15) / 0.25); else if (si.idx - 1 === i) o = 1 - clamp(si.t / 0.2); }
        o *= endFade;
        setStyle(el, o, o < 1 ? 'translate3d(0,' + (16 * (1 - o)).toFixed(1) + 'px,0)' : '', 0);
        const tt = el.querySelector('[data-blur]'); if (tt) { const b = (1 - o) * 10; tt.style.filter = b > 0.05 ? 'blur(' + b.toFixed(1) + 'px)' : ''; }
        el.style.pointerEvents = o > 0.5 ? 'auto' : 'none';
      });
      if (lp > ch.segments.start - 0.02 && lp < 1 - d) { navCh = ch; navSi = si; }
    });
    const nav = $('chNav');
    const showNav = !!navCh; if (showNav !== S.navShown) { S.navShown = showNav; nav.style.opacity = showNav ? '1' : '0'; nav.style.pointerEvents = showNav ? 'auto' : 'none'; }
    if (navCh) {
      const idx = Math.max(0, navSi.idx), n = navCh.segments.count, key = navCh.id + idx; S.navCh = navCh; S.navIdx = idx;
      if (key !== S.navKey) {
        S.navKey = key;
        const titles = els.titles[navCh.id], isW = navCh.id === 'works', last = idx >= n - 1;
        els.dots.forEach((dt, i) => { dt.style.display = i < n ? 'block' : 'none'; dt.style.background = i === idx ? '#FFFFFF' : 'rgba(255,255,255,0.28)'; dt.style.width = i === idx ? '20px' : '6px'; });
        const pb = $('chPrev'), nb = $('chNext'), cen = $('chCenter'), all = $('chAll');
        $('chPrevT').textContent = idx > 0 ? titles[idx - 1] : ''; $('chNextT').textContent = !last ? titles[idx + 1] : '';
        pb.disabled = idx <= 0; pb.style.opacity = idx <= 0 ? '0.35' : '1';
        nb.disabled = last; nb.style.opacity = last ? '0.35' : '1';
        nb.style.display = isW && last ? 'none' : 'flex'; all.style.display = isW && last ? 'inline-flex' : 'none';
        cen.style.display = isW ? 'inline-flex' : 'none'; if (isW) cen.setAttribute('href', WORKS_MEDIA[idx].link || '#');
      }
    }
    if (SNAP_ENABLED && S.lenis && !S.snapping && now - S.lastScrollAt > 150 && S.chapterAt) {
      const tch = S.chapterAt(CH, target);
      if (tch && tch.segments) {
        const si = segInfo(tch, clamp((target - tch.range[0]) / (tch.range[1] - tch.range[0])));
        if (si.idx >= 0 && si.t > 0.003 && si.t < tch.segments.move) { const to = si.t < tch.segments.move * 0.5 ? si.idx - 1 : si.idx; if (to >= 0) goSeg(tch, to); }
      }
    }
    // 마무리 → 다음 섹션 색으로 가라앉기
    const sc = CH.find(c => c.sink), sk = sc ? clamp((cp(sc) - sc.sink[0]) / (sc.sink[1] - sc.sink[0])) : 0, se = sk * sk * (3 - 2 * sk);
    if (se !== lastSink) { lastSink = se; const sk = $('introSink'); sk.style.opacity = se.toFixed(3); sk.style.visibility = se > 0 ? 'visible' : 'hidden'; }
    const visible = window.scrollY < pinPx() + vh + 4;
    if (S.engine && visible) {
      if (introStart == null) introStart = now;
      const iv = Math.min(1, (now - introStart) / 2600); S.engine.setIntro(1 - Math.pow(1 - iv, 3));
      S.engine.frame(dt, p, S.mx, S.my);
    }
    if (S.debug) {
      const cur = S.chapterAt ? S.chapterAt(CH, p) : CH[0];
      $('introDebug').textContent = 'chapter  ' + cur.name + '  ' + cp(cur).toFixed(3) + '\nprogress ' + p.toFixed(3) + '  (target ' + target.toFixed(3) + ')\nfps      ' + Math.round(S.fps) + '\nwebgl    ' + (S.engine ? (visible ? 'render' : 'paused') : 'fallback');
    }
  }

  function init() {
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', () => { if (S.staticMode) fitTitles(); onScroll(); });
    setupCompare();
    setupForms();
    setupTitleFill();
    setupReveal();
    setupMessages();
    initImmersive();
    onScroll();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
