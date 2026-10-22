// DB PLANET — 몰입형 영역 WebGL 엔진 (인트로 일식 · 문제 행성 무리 · 이름 빛의 흐름)
// 챕터 추가: main.js의 CHAPTERS에 {vh, ...}를 끼워 넣는다. timeline()이 각 챕터에 range(전체 진행도 구간)를 붙여 넘겨주며,
// 카메라·코로나 키(챕터 진행도 t)는 전체 기준으로 합쳐 단조 3차 보간되므로 챕터 경계에서도 속도가 끊기지 않는다.
// 카메라 키: x,y,z,yaw(라디안), par(마우스 패럴랙스 배율). px/py/pz/pyaw는 세로 화면(모바일) 전용 값.
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';

const NOISE = `
float hash(vec2 p){p=fract(p*vec2(123.34,456.21));p+=dot(p,p+45.32);return fract(p.x*p.y);}
float noise(vec2 p){vec2 i=floor(p),f=fract(p);vec2 u=f*f*(3.-2.*f);
 return mix(mix(hash(i),hash(i+vec2(1.,0.)),u.x),mix(hash(i+vec2(0.,1.)),hash(i+vec2(1.,1.)),u.x),u.y);}
float fbm(vec2 p){float v=0.,a=.5;for(int i=0;i<OCT;i++){v+=a*noise(p);p=p*2.03+vec2(1.7,9.2);a*=.5;}return v;}
`;
const VERT_UV = `varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`;
const VERT_FS = `varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}`;

const clamp01 = v => Math.max(0, Math.min(1, v));
const smooth = v => { v = clamp01(v); return v * v * (3 - 2 * v); };
const range = (p, a, b) => smooth((p - a) / (b - a));

function buildTrack(chapters, field, defaults = {}) {
  const keys = [];
  chapters.forEach(ch => (ch[field] || []).forEach(k => keys.push({ ...defaults, ...k, p: ch.range[0] + k.t * (ch.range[1] - ch.range[0]) })));
  keys.sort((a, b) => a.p - b.p);
  const names = new Set(); keys.forEach(k => Object.keys(k).forEach(n => { if (n !== 't' && n !== 'p' && typeof k[n] === 'number') names.add(n); }));
  names.forEach(n => keys.forEach((k, i) => { if (typeof k[n] !== 'number') { let j = 1; while (true) { const a = keys[i - j], b = keys[i + j]; if (a && typeof a[n] === 'number') { k[n] = a[n]; break; } if (b && typeof b[n] === 'number') { k[n] = b[n]; break; } if (!a && !b) break; j++; } } }));
  keys.names = [...names];
  return keys;
}
// 단조 3차 보간(PCHIP): 키 사이에서 넘침(overshoot) 없이 속도가 이어진다
function slope(keys, i, n) {
  const d = j => (keys[j + 1][n] - keys[j][n]) / (keys[j + 1].p - keys[j].p || 1e-6), last = keys.length - 1;
  if (i <= 0) return d(0); if (i >= last) return d(last - 1);
  const a = d(i - 1), b = d(i); if (a * b <= 0) return 0;
  const h0 = keys[i].p - keys[i - 1].p, h1 = keys[i + 1].p - keys[i].p, w1 = 2 * h1 + h0, w2 = h1 + 2 * h0;
  return (w1 + w2) / (w1 / a + w2 / b);
}
function sampleTrack(keys, p) {
  if (!keys.length) return {};
  if (keys.length === 1 || p <= keys[0].p) return keys[0];
  if (p >= keys[keys.length - 1].p) return keys[keys.length - 1];
  let i = 1; while (keys[i].p < p) i++;
  const k1 = keys[i - 1], k2 = keys[i], hh = k2.p - k1.p || 1e-6, t = (p - k1.p) / hh, t2 = t * t, t3 = t2 * t, o = {};
  for (const n of keys.names || Object.keys(k2)) {
    if (typeof k2[n] !== 'number' || n === 'p' || n === 't') continue;
    const m1 = slope(keys, i - 1, n), m2 = slope(keys, i, n);
    o[n] = (2 * t3 - 3 * t2 + 1) * k1[n] + (t3 - 2 * t2 + t) * hh * m1 + (-2 * t3 + 3 * t2) * k2[n] + (t3 - t2) * hh * m2;
  }
  return o;
}
export function segInfo(ch, lp) { const S = ch && ch.segments; if (!S) return { idx: -1, t: 0, k: 0 }; const len = (1 - S.start) / S.count, x = (lp - S.start) / len; if (x < 0) return { idx: -1, t: 0, k: 0 }; const idx = Math.min(S.count - 1, Math.floor(x)), t = Math.min(1, x - idx); return { idx, t, k: Math.min(1, t / S.move) }; }
export function chapterAt(chapters, p) { let ch = chapters[0]; for (const c of chapters) if (p >= c.range[0]) ch = c; return ch; }
const local = (ch, p) => ch ? clamp01((p - ch.range[0]) / (ch.range[1] - ch.range[0])) : 0;

function rng(seed) { return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

export async function createIntro({ canvas, chapters, quality = 'auto', assets = {} }) {
  const mobile = matchMedia('(max-width: 767px), (pointer: coarse)').matches;
  const low = quality === 'low' || (quality === 'auto' && mobile);
  const Q = {
    dpr: Math.min(window.devicePixelRatio || 1, low ? 1.25 : 1.75), stars: low ? 260 : 520, oct: low ? 3 : 5,
    seg: low ? [64, 40] : [128, 80], fseg: low ? [32, 20] : [48, 32], planets: low ? 18 : 42, litCount: low ? 3 : 4, bloomDiv: low ? 4 : 2,
    packets: low ? 80 : 160, shell: low ? 1800 : 4200
  };
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Q.dpr); renderer.setClearColor(0x05070d, 1);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(35, 1, 0.05, 400);
  camera.rotation.order = 'YXZ';
  const DEF = `#define OCT ${Q.oct}\n`;
  const U = { uTime: { value: 0 }, uIntro: { value: 0 }, uLightDir: { value: new THREE.Vector2(0.62, 0.78).normalize() } };
  const LIGHT_POS = new THREE.Vector3(0.7, 0.9, -0.6);
  const disposables = [];
  const track = o => { disposables.push(o); return o; };
  const camBase = buildTrack(chapters, 'camera', { yaw: 0, par: 1 }), coronaKeys = buildTrack(chapters, 'corona');
  let camL = camBase, camP = camBase;
  const prob = chapters.find(c => c.id === 'problem'), F = (prob && prob.field) || null;
  const nameCh = chapters.find(c => c.id === 'name'), S = (nameCh && nameCh.stream) || null;

  // ── 배경
  const bgMat = track(new THREE.ShaderMaterial({
    uniforms: { uTime: U.uTime, uIntro: U.uIntro, uTex: { value: null }, uHasTex: { value: 0 } }, vertexShader: VERT_UV, depthWrite: false,
    fragmentShader: DEF + NOISE + `uniform float uTime,uIntro,uHasTex;uniform sampler2D uTex;varying vec2 vUv;
void main(){vec3 base=vec3(.016,.02,.032);vec3 col;
 if(uHasTex>.5){col=texture2D(uTex,vUv).rgb*.35;}
 else{float n=fbm(vUv*vec2(3.2,1.8)+vec2(uTime*.003,0.));
  col=base+vec3(.55,.58,.66)*pow(n,4.)*.05;}
 float v=smoothstep(1.1,.2,length(vUv-.5)*1.6);col*=mix(.5,1.,v);
 gl_FragColor=vec4(col*(.3+.7*uIntro),1.);}`
  }));
  const bg = new THREE.Mesh(track(new THREE.PlaneGeometry(1200, 700)), bgMat); // 카메라가 돌아도 가장자리가 보이지 않게 넉넉히 bg.position.z = -90; bg.frustumCulled = false; scene.add(bg);

  // ── 별 먼지
  const N = Q.stars, pos = new Float32Array(N * 3), size = new Float32Array(N), ph = new Float32Array(N), R0 = rng(7);
  for (let i = 0; i < N; i++) {
    pos[i * 3] = (R0() - 0.5) * 190; pos[i * 3 + 1] = (R0() - 0.5) * 110; pos[i * 3 + 2] = -25 - R0() * 55;
    size[i] = R0() < 0.92 ? 0.6 + R0() * 1.2 : 2 + R0() * 2.2; ph[i] = R0() * 6.283;
  }
  const starGeo = track(new THREE.BufferGeometry());
  starGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  starGeo.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
  starGeo.setAttribute('aPhase', new THREE.BufferAttribute(ph, 1));
  const starMat = track(new THREE.ShaderMaterial({
    uniforms: { uTime: U.uTime, uIntro: U.uIntro, uPR: { value: Q.dpr } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: `attribute float aSize,aPhase;uniform float uTime,uPR;varying float vA;
void main(){vec4 mv=modelViewMatrix*vec4(position,1.);gl_Position=projectionMatrix*mv;gl_PointSize=aSize*uPR*clamp(64./-mv.z,.6,1.8);vA=.55+.45*sin(uTime*1.3+aPhase*3.);}`,
    fragmentShader: `uniform float uIntro;varying float vA;void main(){float d=length(gl_PointCoord-.5);float a=smoothstep(.5,0.,d);gl_FragColor=vec4(vec3(.86,.88,.93)*a*vA*uIntro*.45,1.);}`
  }));
  const stars = new THREE.Points(starGeo, starMat); stars.frustumCulled = false; scene.add(stars);

  // ── 일식 행성 + 코로나
  const eclipse = new THREE.Group(); scene.add(eclipse);
  const planetMat = track(new THREE.ShaderMaterial({
    uniforms: { uIntro: U.uIntro, uLightDir: U.uLightDir, uRim: { value: 1 }, uTex: { value: null }, uHasTex: { value: 0 } },
    vertexShader: `varying vec3 vN,vV;varying vec2 vUv;void main(){vUv=uv;vN=normalize(normalMatrix*normal);vec4 mv=modelViewMatrix*vec4(position,1.);vV=normalize(-mv.xyz);gl_Position=projectionMatrix*mv;}`,
    fragmentShader: DEF + NOISE + `uniform float uIntro,uRim,uHasTex;uniform vec2 uLightDir;uniform sampler2D uTex;varying vec3 vN,vV;varying vec2 vUv;
void main(){vec3 N=normalize(vN),V=normalize(vV);float ndv=max(dot(N,V),0.);float fres=pow(1.-ndv,3.5);
 float side=max(dot(normalize(N.xy+1e-5),uLightDir),0.);
 vec3 alb=uHasTex>.5?texture2D(uTex,vUv).rgb:vec3(.25+.75*fbm(vUv*vec2(18.,9.)))*vec3(.55,.6,.75);
 float lit=pow(side,3.)*pow(1.-ndv,1.6)*uRim;
 vec3 rimCol=mix(vec3(.62,.64,.72),vec3(.95,.95,.97),pow(side,5.));
 vec3 col=alb*(.02+lit*.55)+rimCol*fres*(.18+1.5*pow(side,2.2))*uRim;
 col*=uIntro;gl_FragColor=vec4(1.-exp(-col*1.25),1.);}`
  }));
  const sphere = new THREE.Mesh(track(new THREE.SphereGeometry(1, Q.seg[0], Q.seg[1])), planetMat);
  sphere.rotation.z = 0.35; eclipse.add(sphere);
  const CS = 10.0;
  const coronaMat = track(new THREE.ShaderMaterial({
    uniforms: { uTime: U.uTime, uIntro: U.uIntro, uLightDir: U.uLightDir, uSpread: { value: 1 }, uLeak: { value: 0.35 }, uIntensity: { value: 1 } },
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, vertexShader: VERT_UV,
    fragmentShader: DEF + NOISE + `uniform float uTime,uIntro,uSpread,uLeak,uIntensity;uniform vec2 uLightDir;varying vec2 vUv;
void main(){vec2 p=(vUv-.5)*${CS.toFixed(1)};float r=length(p);float d=max(r-1.,0.);float ang=atan(p.y,p.x);
 float s=fbm(vec2(ang*2.5+uTime*.02,d*3.-uTime*.06));float s2=fbm(vec2(ang*7.-uTime*.03,d*6.));
 float inner=exp(-d/(.05*uSpread));float mid=exp(-d/(.3*uSpread))*(.8+.35*s);float outer=exp(-d/(1.1*uSpread))*.2*(.8+.4*s2);
 float facing=max(dot(p/max(r,1e-4),uLightDir),0.);
 float leak=pow(facing,4.)*exp(-d/(.1+.16*uLeak))*uLeak*1.1;
 float hue=uTime*.035+.1*sin(ang+.6)+.05*cos(2.*ang);
 vec3 col=.78+.2*cos(6.2831853*(hue+vec3(0.,.33,.67)));
 col=mix(vec3(.9,.91,.94),col,.75);
 vec3 c=col*(inner*1.05+mid*.7+outer)*(.55+.6*facing)+col*leak*.9;
 c*=smoothstep(.985,1.,r)*smoothstep(${(CS * 0.5).toFixed(1)},${(CS * 0.36).toFixed(2)},r)*uIntro*uIntensity;
 gl_FragColor=vec4(1.-exp(-c),1.);}`
  }));
  const corona = new THREE.Mesh(track(new THREE.PlaneGeometry(CS, CS)), coronaMat);
  corona.renderOrder = 2; eclipse.add(corona);

  // ── 행성 무리 (구체 지오메트리 1개 공유, 화면 밖은 frustum culling으로 생략)
  const texU = {
    uT0: { value: null }, uT1: { value: null }, uT2: { value: null }, uT3: { value: null }, uN1: { value: null }, uN2: { value: null }, uN3: { value: null },
    uHas: { value: new THREE.Vector4(0, 0, 0, 0) }, uHasN: { value: new THREE.Vector2(0, 0) }, uHasC: { value: new THREE.Vector2(0, 0) }
  };
  const fieldVert = `varying vec3 vWN,vWP;varying vec2 vUv;void main(){vUv=uv;vWN=normalize(mat3(modelMatrix)*normal);vec4 wp=modelMatrix*vec4(position,1.);vWP=wp.xyz;gl_Position=projectionMatrix*viewMatrix*wp;}`;
  const fieldFrag = DEF + NOISE + `uniform sampler2D uT0,uT1,uT2,uT3,uN1,uN2,uN3;uniform vec4 uHas;uniform vec2 uHasN,uHasC;
uniform vec3 uLightPos,uTint,uW,uRimCol;uniform float uReveal,uLit,uFirst,uSoft,uUvOff,uUseC,uGlow,uSweep,uVein;
varying vec3 vWN,vWP;varying vec2 vUv;
void main(){vec2 uv=vec2(vUv.x+uUvOff,vUv.y);
 vec3 a0=uHas.x>.5?texture2D(uT0,uv).rgb:vec3(.3+.6*fbm(uv*vec2(16.,8.)));
 vec3 a1=uHas.y>.5?texture2D(uT1,uv).rgb:a0;vec3 a2=uHas.z>.5?texture2D(uT2,uv).rgb:a0;
 vec3 alb=(a0*uW.x+a1*uW.y+a2*uW.z)*uTint;
 vec3 c3=uHasC.x>.5?texture2D(uT3,uv).rgb:alb;float lum=dot(c3,vec3(.3,.45,.25));vec3 c3l=vec3(smoothstep(.16,.78,lum))*vec3(.98,.98,1.);alb=mix(alb,c3l*.95,uUseC);
 vec3 N0=normalize(vWN);vec3 N=N0;vec3 nm=vec3(0.,0.,1.);float wn=0.;
 if(uHasN.x>.5){nm+=(texture2D(uN1,uv).xyz*2.-1.)*uW.y*(1.-uUseC);wn+=uW.y;}
 if(uHasN.y>.5){nm+=(texture2D(uN2,uv).xyz*2.-1.)*uW.z*.5*(1.-uUseC);wn+=uW.z;}
 if(uHasC.y>.5){nm+=(texture2D(uN3,uv).xyz*2.-1.)*uUseC;wn+=uUseC;}
 if(wn>0.){vec3 T=normalize(cross(vec3(0.,1.,0.),N0)+1e-4);vec3 B=cross(N0,T);vec3 n2=normalize(nm);N=normalize(T*n2.x*.6+B*n2.y*.6+N0*max(n2.z,.2));}
 vec3 V=normalize(cameraPosition-vWP),L=normalize(uLightPos-vWP);
 float nl0=dot(N0,L),ndl=max(dot(N,L),0.),ndv=max(dot(N0,V),0.);
 float fres=pow(1.-ndv,mix(4.,1.6,uSoft));float facing=smoothstep(-.25,.7,nl0);
 vec3 sil=vec3(.052,.066,.118)*(.7+.6*dot(alb,vec3(.33)));
 vec3 irid=.8+.2*cos(6.2831853*(fres*1.3+nl0*.25+vec3(0.,.33,.67)));
 vec3 rimC=mix(uRimCol,irid,.6);
 vec3 rim=rimC*fres*facing*.09*mix(1.,.45,uSoft);
 float sweep=smoothstep(1.-1.1*uSweep,1.15-1.1*uSweep,nl0);
 float ndlM=smoothstep(-.08,.75,dot(N,L));float limb=mix(1.,.62+.38*pow(ndv,.5),uUseC);
 float ndlU=mix(ndl,ndlM,uUseC);
 vec3 lit=(alb*ndlU*mix(1.9,1.1,uUseC)*limb+rimC*fres*pow(ndlU,.8)*mix(1.1,.35,uUseC))*uLit*sweep;
 vec3 glow=(rimC*fres*facing*1.3+alb*ndl*.35)*uGlow;
 float vein=smoothstep(.06,.4,c3.b-max(c3.r,c3.g))*.9;
 vec3 veinC=vec3(.62,.72,1.)*vein*smoothstep(0.,.5,ndl)*sweep*uVein*uUseC*.8;
 vec3 first=vec3(.9,.94,1.)*pow(1.-ndv,6.)*pow(max(nl0,0.),4.)*uFirst*3.;
 vec3 col=(sil+rim)*uReveal+lit+glow+veinC+first;
 gl_FragColor=vec4(1.-exp(-col*1.15),1.);}`;
  const fieldGeo = track(new THREE.SphereGeometry(1, Q.fseg[0], Q.fseg[1]));
  const field = [], anchors = [];
  let ours = null;
  const OUR_POS = new THREE.Vector3(-5.3, -2.35, 19), OUR_R = 0.42;
  const ARRIVE = new THREE.Vector3(-0.7, 0.35, -0.62).normalize(); // 최종 카메라 기준 옆·약간 뒤에서 → 초승달~반달
  const svc = chapters.find(c => c.id === 'service'), cases = chapters.find(c => c.id === 'works'), fin = chapters.find(c => c.id === 'finale');
  const CASE_A = ((cases && cases.anchors) || []).map(a => new THREE.Vector3(...a));
  const CASE_P = CASE_A.map(a => a.clone().add(new THREE.Vector3(1.5, 0.3, -1.8)));
  const AVOID = [...CASE_A.map(q => [q, 3]), ...CASE_A.map(q => [q.clone().add(new THREE.Vector3(0.95, 0, 3.4)), 2.2]), ...CASE_P.map(q => [q, 2.6])];
  const rn = new THREE.Vector3(0.15, 1, 0.45).normalize();
  const ru = new THREE.Vector3(1, 0, 0).addScaledVector(rn, -rn.x).normalize(), rv = new THREE.Vector3().crossVectors(rn, ru);
  const RR = OUR_R * 2.1;
  const RIM4 = [[0.95, 0.95, 0.97], [0.66, 0.74, 0.92], [0.88, 0.78, 0.74], [0.8, 0.82, 0.88]];
  if (F) {
    const R = rng(20261012);
    const camAt = z => { const f = clamp01((z - 7) / 27); return new THREE.Vector3(-6 * f * f, -0.6 - 2.4 * f, z); };
    const mk = (o) => {
      const mat = track(new THREE.ShaderMaterial({
        uniforms: {
          ...texU, uLightPos: { value: o.light || LIGHT_POS }, uTint: { value: o.tint }, uW: { value: o.w }, uRimCol: { value: o.rimCol || new THREE.Vector3(0.42, 0.52, 1) },
          uReveal: { value: 0 }, uLit: { value: 0 }, uFirst: { value: 0 }, uSoft: { value: 0 }, uUvOff: { value: R() },
          uUseC: { value: o.useC ? 1 : 0 }, uGlow: { value: 0 }, uSweep: { value: 1 }, uVein: { value: 0 }
        },
        vertexShader: fieldVert, fragmentShader: fieldFrag
      }));
      const m = new THREE.Mesh(fieldGeo, mat);
      m.position.copy(o.pos); m.scale.setScalar(o.r);
      m.rotation.set(R() * 0.6 - 0.3, R() * 6.28, R() * 0.6 - 0.3);
      m.visible = false; scene.add(m);
      const rec = { mesh: m, mat, r: o.r, kind: o.kind, spin: (0.006 + R() * 0.02) * (R() < 0.5 ? -1 : 1), delay: o.delay ?? R(), idx: o.idx ?? -1 };
      field.push(rec); return rec;
    };
    const variety = () => {
      const w = new THREE.Vector3(R(), R(), R()); w.divideScalar(w.x + w.y + w.z);
      const h = 0.92 + R() * 0.16; return { w, tint: new THREE.Vector3(h * (0.9 + R() * 0.1), h, h * (1 + R() * 0.12)) };
    };
    // 빛나는 대형 행성 (검색에서 보이는 대형 브랜드)
    [[-7.5, 4.6, 2, 2.3], [1.5, 6.2, -4, 2.8], [8.5, 3.4, 5, 1.7], [-1.5, 2.8, 9, 1.35]].slice(0, Q.litCount)
      .forEach(([x, y, z, r], i) => mk({ pos: new THREE.Vector3(x, y, z), r, kind: 'lit', idx: i, ...variety() }));
    // 고민 문장 앵커 행성
    [[-12, -3, 8, 1.0], [-1.5, -5, 10, 0.8], [6, -3.5, 6, 0.9]].forEach(([x, y, z, r]) => anchors.push(mk({ pos: new THREE.Vector3(x, y, z), r, kind: 'anchor', ...variety() })));
    // 우리 행성 (문제 챕터 끝 첫 빛 → 이름 챕터 주인공)
    ours = mk({ pos: OUR_POS.clone(), r: OUR_R, kind: 'ours', useC: true, light: OUR_POS.clone().addScaledVector(ARRIVE, 30), rimCol: new THREE.Vector3(0.86, 0.88, 0.94), ...variety() });
    // 달의 바다(어두운 무늬)가 빛을 받는 쪽에 오도록 방향을 고정하고, 아주 천천히만 돈다
    ours.mesh.rotation.set(0, 0, 0); ours.mat.uniforms.uUvOff.value = 0.4; ours.spin = 0.003;
    // 이름 챕터: 저마다의 빛을 받는 주변 행성 (흰색·블루·퍼플·실버)
    const glowCols = [[0.95, 0.95, 0.97], [0.66, 0.74, 0.92], [0.88, 0.78, 0.74], [0.8, 0.82, 0.88], [0.7, 0.8, 0.95], [0.86, 0.8, 0.9]];
    [[-7.6, -1.2, 15, 0.35], [-9.5, -3.6, 12, 0.55], [-6.8, -0.2, 11, 0.4], [-11, -1.8, 8, 0.7], [-8.2, -3.9, 13, 0.3], [-4.2, -4.4, 12.5, 0.32]].slice(0, low ? 4 : 6)
      .forEach(([x, y, z, r], i) => mk({ pos: new THREE.Vector3(x, y, z), r, kind: 'glow', idx: i, rimCol: new THREE.Vector3(...glowCols[i]), ...variety() }));
    // 케이스 행성 (서비스를 거쳐 이미 빛나는 브랜드)
    CASE_P.forEach((q, i) => mk({ pos: q, r: 1.1, kind: 'case', idx: i, rimCol: new THREE.Vector3(...RIM4[i % 4]), ...variety() }));
    // 나머지 어두운 행성
    let guard = 0;
    while (field.length < Q.planets && guard++ < 5000) {
      const r = 0.25 + Math.pow(R(), 1.8) * 1.5;
      const p = new THREE.Vector3(-30 + R() * 50, -14 + R() * 24, -26 + R() * 50);
      if (p.length() < 3.5 + r) continue;
      if (p.z > 6) { const c = camAt(p.z); if (Math.hypot(p.x - c.x, p.y - c.y) < r + 3.2) continue; }
      if (p.z > 17 && Math.hypot(p.x + 5.9, p.y + 2.6) < r + 2.2) continue;
      if (p.distanceTo(OUR_POS) < r + 2.6) continue;
      if (AVOID.some(([q, rr]) => p.distanceTo(q) < r + rr)) continue;
      if (field.some(f => f.mesh.position.distanceTo(p) < r + f.r + 0.6)) continue;
      mk({ pos: p, r, kind: 'dark', rimCol: new THREE.Vector3(...RIM4[Math.floor(R() * 4)]), ...variety() });
    }
    const C0 = new THREE.Vector3(-6, -2, 8); let md = 1; field.forEach(f => { f.dc = f.mesh.position.distanceTo(C0); md = Math.max(md, f.dc); }); field.forEach(f => { f.dn = f.dc / md; });
  }

  // ── 이름 챕터: 데이터 빛의 입자 흐름 (Points 1개) + 궤도선
  let streamMat = null, orbitMat = null;
  if (S && ours) {
    const P0 = new THREE.Vector3(0.6, 1.0, -0.3), P3 = OUR_POS.clone().addScaledVector(ARRIVE, OUR_R * 1.02);
    const P1 = new THREE.Vector3(-2.5, 6, 7), P2 = OUR_POS.clone().addScaledVector(ARRIVE, 3.2);
    const K = 8, NS = 7, total = Q.packets * K + NS;
    const aT = new Float32Array(total), aK = new Float32Array(total), aS = new Float32Array(total), aSeed = new Float32Array(total), R2 = rng(99);
    let n = 0;
    for (let i = 0; i < Q.packets; i++) for (let k = 0; k < K; k++) { aT[n] = i / Q.packets; aK[n] = k / (K - 1); aS[n] = 0; aSeed[n] = R2(); n++; }
    for (let s = 0; s < NS; s++) { aT[n] = (s + 1) / (NS + 1); aK[n] = 0; aS[n] = 1; aSeed[n] = R2(); n++; }
    const g = track(new THREE.BufferGeometry());
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(total * 3), 3));
    g.setAttribute('aT', new THREE.BufferAttribute(aT, 1)); g.setAttribute('aK', new THREE.BufferAttribute(aK, 1));
    g.setAttribute('aS', new THREE.BufferAttribute(aS, 1)); g.setAttribute('aSeed', new THREE.BufferAttribute(aSeed, 1));
    streamMat = track(new THREE.ShaderMaterial({
      uniforms: { uTime: U.uTime, uPR: { value: Q.dpr }, uP0: { value: P0 }, uP1: { value: P1 }, uP2: { value: P2 }, uP3: { value: P3 },
        uC: { value: OUR_POS }, uU: { value: ru }, uV: { value: rv }, uR: { value: RR }, uFront: { value: 0 }, uMorph: { value: 0 }, uAlpha: { value: 0 } },
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      vertexShader: `attribute float aT,aK,aS,aSeed;uniform vec3 uP0,uP1,uP2,uP3,uC,uU,uV;uniform float uTime,uPR,uR,uFront,uMorph;varying float vB;varying vec3 vCol;
vec3 bez(float t){float s=1.-t;return s*s*s*uP0+3.*s*s*t*uP1+3.*s*t*t*uP2+t*t*t*uP3;}
vec3 ring(float t){float a=t*6.2831853;return uC+uR*(cos(a)*uU+sin(a)*uV);}
void main(){vec3 p;float sz;
 if(aS>.5){float u=aT;p=bez(u)+(fract(aSeed*vec3(1.,7.,13.))-.5)*.7;float pass=uFront-u;
  vB=(exp(-pass*pass*500.)*1.8+step(0.,pass)*.22)*step(-.03,pass)*(1.-uMorph)*(.7+.3*sin(uTime*2.+aSeed*20.));vCol=vec3(.9,.94,1.);sz=3.6;}
 else{float head=fract(aT+uTime*.045);float u=head-aK*.006;float vis=step(0.,u)*step(u,uFront);
  vec3 pb=bez(clamp(u,0.,1.));vec3 pr=ring(fract(aT+uTime*.012)-aK*.01);p=mix(pb,pr,uMorph);
  vB=(1.-aK*.85)*mix(vis*smoothstep(0.,.03,u),1.,uMorph);vCol=mix(vec3(1.),vec3(.35,.5,1.),aK);sz=mix(3.,1.3,aK);}
 vec4 mv=modelViewMatrix*vec4(p,1.);gl_Position=projectionMatrix*mv;gl_PointSize=clamp(sz*uPR*(8./-mv.z),1.,sz*uPR*1.8);}`,
      fragmentShader: `uniform float uAlpha;varying float vB;varying vec3 vCol;void main(){float d=length(gl_PointCoord-.5);float a=smoothstep(.5,0.,d);a*=a;gl_FragColor=vec4(vCol*a*vB*uAlpha,1.);}`
    }));
    const pts = new THREE.Points(g, streamMat); pts.frustumCulled = false; scene.add(pts);
    const SEG = 256, op = new Float32Array((SEG + 1) * 3), ou = new Float32Array(SEG + 1);
    for (let i = 0; i <= SEG; i++) {
      const a = i / SEG * Math.PI * 2, v = OUR_POS.clone().addScaledVector(ru, Math.cos(a) * RR).addScaledVector(rv, Math.sin(a) * RR);
      op[i * 3] = v.x; op[i * 3 + 1] = v.y; op[i * 3 + 2] = v.z; ou[i] = i / SEG;
    }
    const og = track(new THREE.BufferGeometry());
    og.setAttribute('position', new THREE.BufferAttribute(op, 3)); og.setAttribute('aU', new THREE.BufferAttribute(ou, 1));
    orbitMat = track(new THREE.ShaderMaterial({
      uniforms: { uDraw: { value: 0 } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      vertexShader: `attribute float aU;varying float vU;void main(){vU=aU;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
      fragmentShader: `uniform float uDraw;varying float vU;void main(){if(vU>uDraw)discard;float head=smoothstep(uDraw-.04,uDraw,vU)*step(uDraw,.999);gl_FragColor=vec4(vec3(.62,.72,1.)*(.55+head*.8)*smoothstep(0.,.02,uDraw),1.);}`
    }));
    const orbit = new THREE.Line(og, orbitMat); orbit.frustumCulled = false; scene.add(orbit);
  }

  // ── 데이터 입자 껍질: 우리 행성을 감싼 점구름. 이름 챕터에서 나타나 사례 챕터에서 사라진다
  let shellMat = null;
  if (ours) {
    const NP = Q.shell, sp = new Float32Array(NP * 3), sz = new Float32Array(NP), R3 = rng(31);
    for (let i = 0; i < NP; i++) {
      const pole = R3() < 0.45, u = R3() * 2 - 1;
      const y = pole ? Math.sign(u) * (1 - Math.pow(R3(), 2.2) * 0.45) : u, a = R3() * Math.PI * 2, rr = Math.sqrt(1 - y * y);
      sp.set([rr * Math.cos(a), y, rr * Math.sin(a)], i * 3); sz[i] = 0.6 + R3() * 1.1;
    }
    const sg = track(new THREE.BufferGeometry());
    sg.setAttribute('position', new THREE.BufferAttribute(sp, 3)); sg.setAttribute('aSize', new THREE.BufferAttribute(sz, 1));
    shellMat = track(new THREE.ShaderMaterial({
      uniforms: { uTime: U.uTime, uPR: { value: Q.dpr }, uAlpha: { value: 0 } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      vertexShader: `attribute float aSize;uniform float uTime,uPR;varying float vF;
void main(){float t=uTime*.06;vec3 p=vec3(position.x*cos(t)-position.z*sin(t),position.y,position.x*sin(t)+position.z*cos(t));
 vec4 mv=modelViewMatrix*vec4(p,1.);vec3 n=normalize(mat3(modelViewMatrix)*p);vF=.35+.65*smoothstep(-.2,.6,n.z);
 gl_Position=projectionMatrix*mv;gl_PointSize=aSize*uPR*clamp(6./-mv.z,.5,2.2);}`,
      fragmentShader: `uniform float uAlpha;varying float vF;void main(){float d=length(gl_PointCoord-.5);float a=smoothstep(.5,.1,d);gl_FragColor=vec4(vec3(.92,.94,1.)*a*vF*uAlpha,1.);}`
    }));
    const shell = new THREE.Points(sg, shellMat); shell.position.copy(OUR_POS); shell.scale.setScalar(OUR_R * 1.55); shell.frustumCulled = false; scene.add(shell);
  }

  // ── 텍스처 (실패 시 노이즈 유지)
  const loader = new THREE.TextureLoader();
  const load = (url, cb) => url && loader.load(url, tex => { tex.colorSpace = THREE.NoColorSpace; tex.wrapS = THREE.RepeatWrapping; disposables.push(tex); cb(tex); }, undefined, () => console.info('[intro] 에셋 로드 실패, 노이즈로 대체:', url));
  load(assets.bg, t => { t.wrapS = THREE.ClampToEdgeWrapping; bgMat.uniforms.uTex.value = t; bgMat.uniforms.uHasTex.value = 1; });
  load(assets.planet, t => { planetMat.uniforms.uTex.value = t; planetMat.uniforms.uHasTex.value = 1; texU.uT0.value = t; texU.uHas.value.x = 1; });
  load(assets.tex1, t => { texU.uT1.value = t; texU.uHas.value.y = 1; });
  load(assets.tex2, t => { texU.uT2.value = t; texU.uHas.value.z = 1; });
  load(assets.nrm1, t => { texU.uN1.value = t; texU.uHasN.value.x = 1; });
  load(assets.nrm2, t => { texU.uN2.value = t; texU.uHasN.value.y = 1; });
  load(assets.c1, t => { texU.uT3.value = t; texU.uHasC.value.x = 1; });
  load(assets.c1n, t => { texU.uN3.value = t; texU.uHasC.value.y = 1; });

  // ── 서비스 궤도 정거장
  let stationGeo = null;
  if (svc && ours) {
    const ST = [0, 1, 2, 3, 4].map(i => i / 5 + 0.04), sp = new Float32Array(ST.length * 3), sb = new Float32Array(ST.length);
    ST.forEach((t, i) => { const a = t * Math.PI * 2, v = OUR_POS.clone().addScaledVector(ru, Math.cos(a) * RR).addScaledVector(rv, Math.sin(a) * RR); sp.set([v.x, v.y, v.z], i * 3); });
    stationGeo = track(new THREE.BufferGeometry());
    stationGeo.setAttribute('position', new THREE.BufferAttribute(sp, 3)); stationGeo.setAttribute('aB', new THREE.BufferAttribute(sb, 1));
    const sm = track(new THREE.ShaderMaterial({ uniforms: { uPR: { value: Q.dpr } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      vertexShader: `attribute float aB;uniform float uPR;varying float vB;void main(){vB=aB;vec4 mv=modelViewMatrix*vec4(position,1.);gl_Position=projectionMatrix*mv;gl_PointSize=(10.+aB*16.)*uPR*clamp(4./-mv.z,.4,1.6);}`,
      fragmentShader: `varying float vB;void main(){float d=length(gl_PointCoord-.5);float core=smoothstep(.12,0.,d);float halo=smoothstep(.5,0.,d)*.35;gl_FragColor=vec4(mix(vec3(.55,.65,1.),vec3(1.),core)*(core+halo)*vB,1.);}` }));
    const pts = new THREE.Points(stationGeo, sm); pts.frustumCulled = false; scene.add(pts);
  }
  // ── 케이스 영상 패널: 후처리(톤·bloom·그레인)에서 제외하려고 별도 씬에 두고 합성 뒤에 그린다
  const overlay = new THREE.Scene(), panels = [];
  if (CASE_A.length) {
    const items = cases.items || [];
    const pg = track(new THREE.PlaneGeometry(0.9, 1.6)); // 평평한 휴대폰 화면 (예전엔 양끝을 뒤로 휘게 했음)
    CASE_A.forEach((A, i) => {
      const it = items[i] || {};
      const mat = track(new THREE.ShaderMaterial({ uniforms: { uTex: { value: null }, uHasTex: { value: 0 }, uLit: { value: 0 }, uOn: { value: 0 }, uTime: U.uTime, uSize: { value: new THREE.Vector2(0.9, 1.6) }, uSeed: { value: i * 1.7 } },
        vertexShader: VERT_UV, depthTest: false, depthWrite: false, transparent: true,
        fragmentShader: `uniform sampler2D uTex;uniform float uHasTex,uLit,uOn,uTime,uSeed;uniform vec2 uSize;varying vec2 vUv;
void main(){vec2 p=(vUv-.5)*uSize;vec2 q=abs(p)-(uSize*.5-vec2(.11));float sd=length(max(q,0.))+min(max(q.x,q.y),0.)-.11;if(sd>0.)discard;
 vec3 col;if(uHasTex>.5){col=texture2D(uTex,vUv).rgb;}else{float g=vUv.y+.08*sin(uTime*.4+vUv.x*3.+uSeed);col=mix(vec3(.07,.08,.1),mix(vec3(.62,.66,.74),vec3(.78,.75,.8),vUv.x),smoothstep(0.,1.3,g))*.55;}
 col*=mix(.26,1.,uLit);float edge=smoothstep(-.014,0.,sd);col=mix(col,vec3(1.),edge*(.3+.55*uLit));
 gl_FragColor=vec4(col,uOn);}` }));
      const mesh = new THREE.Mesh(pg, mat); mesh.position.copy(A); mesh.visible = false; overlay.add(mesh);
      const glowMat = track(new THREE.ShaderMaterial({ uniforms: { uLit: { value: 0 } }, vertexShader: VERT_UV, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
        fragmentShader: `uniform float uLit;varying vec2 vUv;void main(){vec2 p=(vUv-.5)*vec2(1.5,2.3);float d=length(max(abs(p)-vec2(.36,.72),0.));float g=exp(-d*7.)*uLit*.6;gl_FragColor=vec4(mix(vec3(.7,.74,.82),vec3(.82,.78,.84),vUv.x)*g*.7,1.);}` }));
      const glow = new THREE.Mesh(track(new THREE.PlaneGeometry(1.5, 2.3)), glowMat); glow.position.copy(A).add(new THREE.Vector3(0, 0, -0.1)); glow.visible = false; scene.add(glow);
      const pn = { mesh, mat, glow, glowMat, base: A.clone(), video: null, vtex: null, poster: null, playing: false, userPlay: false };
      if (it.posterUrl) load(it.posterUrl, t => { t.wrapS = THREE.ClampToEdgeWrapping; pn.poster = t; if (!pn.playing) { mat.uniforms.uTex.value = t; mat.uniforms.uHasTex.value = 1; } });
      if (it.videoUrl) {
        const v = document.createElement('video'); v.src = it.videoUrl; v.muted = true; v.loop = true; v.playsInline = true; v.crossOrigin = 'anonymous'; v.preload = 'metadata'; v.setAttribute('playsinline', ''); v.setAttribute('muted', '');
        pn.video = v; pn.vtex = track(new THREE.VideoTexture(v)); pn.vtex.colorSpace = THREE.NoColorSpace;
      }
      panels.push(pn);
    });
  }
  const v3b = new THREE.Vector3();

  // ── 후처리: bloom(밝은 부분만) + 그레인
  const fsCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1), fsScene = new THREE.Scene();
  const fsQuad = new THREE.Mesh(track(new THREE.PlaneGeometry(2, 2)), null); fsQuad.frustumCulled = false; fsScene.add(fsQuad);
  const rtScene = track(new THREE.WebGLRenderTarget(1, 1, { depthBuffer: true, samples: renderer.capabilities.isWebGL2 && !low ? 4 : 0 }));
  const rtA = track(new THREE.WebGLRenderTarget(1, 1, { depthBuffer: false })), rtB = track(new THREE.WebGLRenderTarget(1, 1, { depthBuffer: false }));
  const POST = { threshold: 0.5, knee: 0.2, strength: 0.5, grain: 0.03 };
  const brightMat = track(new THREE.ShaderMaterial({ uniforms: { uTex: { value: null }, uTh: { value: POST.threshold }, uKnee: { value: POST.knee } }, vertexShader: VERT_FS, depthTest: false, depthWrite: false,
    fragmentShader: `uniform sampler2D uTex;uniform float uTh,uKnee;varying vec2 vUv;void main(){vec3 c=texture2D(uTex,vUv).rgb;float l=max(c.r,max(c.g,c.b));float w=smoothstep(uTh,uTh+uKnee,l);gl_FragColor=vec4(c*w,1.);}` }));
  const blurMat = track(new THREE.ShaderMaterial({ uniforms: { uTex: { value: null }, uDir: { value: new THREE.Vector2() } }, vertexShader: VERT_FS, depthTest: false, depthWrite: false,
    fragmentShader: `uniform sampler2D uTex;uniform vec2 uDir;varying vec2 vUv;void main(){vec3 c=texture2D(uTex,vUv).rgb*.227;
 c+=(texture2D(uTex,vUv+uDir*1.385).rgb+texture2D(uTex,vUv-uDir*1.385).rgb)*.316;c+=(texture2D(uTex,vUv+uDir*3.231).rgb+texture2D(uTex,vUv-uDir*3.231).rgb)*.07;gl_FragColor=vec4(c,1.);}` }));
  const compMat = track(new THREE.ShaderMaterial({ uniforms: { uScene: { value: rtScene.texture }, uBloom: { value: rtA.texture }, uStrength: { value: POST.strength }, uGrain: { value: POST.grain }, uTime: U.uTime }, vertexShader: VERT_FS, depthTest: false, depthWrite: false,
    fragmentShader: `uniform sampler2D uScene,uBloom;uniform float uStrength,uGrain,uTime;varying vec2 vUv;
float h(vec2 p){return fract(sin(dot(p,vec2(12.9898,78.233)))*43758.5453);}
void main(){vec3 c=texture2D(uScene,vUv).rgb+texture2D(uBloom,vUv).rgb*uStrength;c=min(c,vec3(1.));
 float g=h(vUv*vec2(1920.,1080.)+fract(uTime*13.7)*100.)-.5;c+=g*uGrain;gl_FragColor=vec4(c,1.);}` }));
  const pass = (mat, target) => { fsQuad.material = mat; renderer.setRenderTarget(target); renderer.render(fsScene, fsCam); };

  let w = 1, h = 1;
  const res = new THREE.Vector2();
  const resize = () => {
    const el = canvas.parentElement || canvas; w = el.clientWidth || innerWidth; h = el.clientHeight || innerHeight;
    renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
    const pw = Math.round(w * Q.dpr), ph2 = Math.round(h * Q.dpr);
    rtScene.setSize(pw, ph2);
    const bw = Math.max(1, Math.round(pw / Q.bloomDiv)), bh = Math.max(1, Math.round(ph2 / Q.bloomDiv));
    rtA.setSize(bw, bh); rtB.setSize(bw, bh); res.set(1 / bw, 1 / bh);
    const K = Math.max(1, 0.78 / (w / h));
    camL = camBase.map(k => ({ ...k, z: k.z * K })); camL.names = camBase.names;
    camP = camBase.map(k => ({ ...k, x: k.px ?? k.x, y: k.py ?? k.y, z: k.pz ?? k.z * K, yaw: k.pyaw ?? k.yaw })); camP.names = camBase.names;
  };
  const ro = new ResizeObserver(resize); ro.observe(canvas.parentElement || canvas); resize();

  let time = 0, pmx = 0, pmy = 0;
  const v3 = new THREE.Vector3(), anchorOut = anchors.map(() => ({ x: 0, y: 0, r: 0, on: false }));
  function frame(dt, p, mx = 0, my = 0) {
    time += dt; U.uTime.value = time;
    const k = 1 - Math.pow(0.94, dt * 60); pmx += (mx - pmx) * k; pmy += (my - pmy) * k;
    const cam = sampleTrack(w / h < 1 ? camP : camL, p), co = sampleTrack(coronaKeys, p);
    const par = cam.par ?? 1;
    camera.position.set(cam.x + pmx * 0.22 * par, cam.y - pmy * 0.12 * par, cam.z);
    camera.rotation.set(0, cam.yaw || 0, 0);
    camera.updateMatrixWorld();
    coronaMat.uniforms.uSpread.value = co.spread ?? 1;
    coronaMat.uniforms.uLeak.value = co.leak ?? 0.35;
    coronaMat.uniforms.uIntensity.value = co.intensity ?? 1;
    planetMat.uniforms.uRim.value = 0.8 + 0.6 * (co.leak ?? 0.35);
    sphere.rotation.y += dt * 0.025;
    if (F) {
      const lp = local(prob, p), np = local(nameCh, p), lsv = local(svc, p), lc = local(cases, p), lf = local(fin, p);
      const dimLit = S ? 1 - 0.35 * range(np, S.glow[0], S.glow[1]) : 1;
      for (const f of field) {
        const u = f.mat.uniforms, dist = camera.position.distanceTo(f.mesh.position);
        let reveal = range(lp, F.reveal[0] + f.delay * 0.09, F.reveal[1]) * smooth((dist - f.r - 0.6) / 2.4);
        if (f.kind === 'ours') reveal = range(lp, F.reveal[0] + f.delay * 0.09, F.reveal[1]);
        u.uReveal.value = reveal;
        u.uSoft.value = f.kind === 'ours' ? 0 : smooth((10 - dist) / 7);
        if (f.kind === 'lit') u.uLit.value = range(lp, F.lit[0] + f.idx * 0.054, F.lit[0] + f.idx * 0.054 + 0.077) * dimLit;
        if (f.kind === 'ours') {
          u.uFirst.value = range(lp, F.first[0], F.first[1]);
          if (S) { const sw = range(np, S.ourLight[0], S.ourLight[1]); const si = segInfo(svc, lsv), prog = !svc ? 0 : lsv >= 1 ? 5 : Math.max(0, si.idx + si.k); u.uLit.value = range(np, S.ourLight[0] - 0.02, S.ourLight[0] + 0.06) * (1 + 0.03 * prog); u.uSweep.value = sw + 0.12 * prog; u.uVein.value = sw * (1 + 0.15 * prog); }
        }
        if (f.kind === 'glow' && S) {
          const n = 6, a = S.glow[0] + (f.idx / n) * (S.glow[1] - S.glow[0]) * 0.7;
          u.uGlow.value = range(np, a, a + 0.08);
        }
        if (f.kind === 'case') { reveal = range(lc, 0, 0.08); u.uReveal.value = reveal; u.uLit.value = reveal; }
        if (fin && f.kind !== 'lit' && f.kind !== 'case' && f.kind !== 'ours') { const a = 0.2 + (1 - (f.dn ?? 0.5)) * 0.38; u.uGlow.value = Math.max(u.uGlow.value, range(lf, a, a + 0.12)); }
        f.mesh.visible = reveal > 0.001 || u.uLit.value > 0.001 || u.uGlow.value > 0.001;
        f.mesh.rotation.y += dt * f.spin;
      }
      anchors.forEach((a, i) => {
        v3.copy(a.mesh.position).project(camera);
        const dist = camera.position.distanceTo(a.mesh.position), o = anchorOut[i];
        o.x = (v3.x + 1) / 2 * w; o.y = (1 - v3.y) / 2 * h; o.on = v3.z < 1;
        o.r = a.r / (dist * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))) * h / 2;
      });
      if (stationGeo) {
        const si = segInfo(svc, lsv), on = range(lsv, 0, 0.1), arr = stationGeo.attributes.aB.array;
        for (let i = 0; i < arr.length; i++) arr[i] = on * (lsv >= 1 ? 0.55 : si.idx < 0 ? 0.18 : i < si.idx ? 0.55 : i === si.idx ? 0.3 + 0.7 * si.k : 0.18);
        stationGeo.attributes.aB.needsUpdate = true;
      }
      if (panels.length) {
        const ci = segInfo(cases, lc), on = range(lc, 0, 0.1) * (1 - 0.6 * range(lf, 0.5, 0.9));
        const activeIdx = lc > 0 && lc < 1 && ci.k > 0.5 ? ci.idx : -1;
        panels.forEach((pn, i) => {
          let act = 0; if (ci.idx === i) act = ci.k; else if (ci.idx - 1 === i) act = 1 - smooth(ci.t / 0.3);
          if (lc >= 1) act = i === panels.length - 1 ? 1 - range(lf, 0, 0.3) : 0;
          pn.mat.uniforms.uLit.value = act; pn.mat.uniforms.uOn.value = on; pn.glowMat.uniforms.uLit.value = act * on;
          pn.mesh.position.copy(pn.base).add(v3b.set(0, 0, 0.15 * act));
          pn.mesh.visible = pn.glow.visible = on > 0.001;
          if (pn.video) {
            const want = i === activeIdx && (!mobile || pn.userPlay);
            if (want && !pn.playing) { pn.video.play().catch(() => {}); pn.playing = true; pn.mat.uniforms.uTex.value = pn.vtex; pn.mat.uniforms.uHasTex.value = 1; }
            else if (!want && pn.playing) { pn.video.pause(); pn.playing = false; if (pn.poster) pn.mat.uniforms.uTex.value = pn.poster; else pn.mat.uniforms.uHasTex.value = 0; }
          }
        });
      }
      if (shellMat && S) shellMat.uniforms.uAlpha.value = 0.9 * range(np, 0.04, 0.24) * (1 - 0.55 * range(np, S.ourLight[0], S.ourLight[1])) * (1 - range(lc, 0, 0.1));
      if (streamMat) {
        streamMat.uniforms.uFront.value = range(np, S.start[0], S.start[1]);
        streamMat.uniforms.uMorph.value = range(np, S.orbit[0], S.orbit[1]);
        streamMat.uniforms.uAlpha.value = np > S.start[0] ? 1 : 0;
        orbitMat.uniforms.uDraw.value = range(np, S.orbit[0], S.orbit[1]);
      }
    }
    renderer.setRenderTarget(rtScene); renderer.render(scene, camera);
    brightMat.uniforms.uTex.value = rtScene.texture; pass(brightMat, rtA);
    blurMat.uniforms.uTex.value = rtA.texture; blurMat.uniforms.uDir.value.set(res.x, 0); pass(blurMat, rtB);
    blurMat.uniforms.uTex.value = rtB.texture; blurMat.uniforms.uDir.value.set(0, res.y); pass(blurMat, rtA);
    blurMat.uniforms.uTex.value = rtA.texture; blurMat.uniforms.uDir.value.set(res.x * 2.2, 0); pass(blurMat, rtB);
    blurMat.uniforms.uTex.value = rtB.texture; blurMat.uniforms.uDir.value.set(0, res.y * 2.2); pass(blurMat, rtA);
    pass(compMat, null);
    if (panels.some(pn => pn.mesh.visible)) { renderer.autoClear = false; renderer.setRenderTarget(null); renderer.clearDepth(); renderer.render(overlay, camera); renderer.autoClear = true; }
  }

  return {
    frame, resize,
    anchors: () => anchorOut,
    setIntro(v) { U.uIntro.value = v; },
    playCase(i) { if (panels[i]) panels[i].userPlay = true; },
    dispose() { panels.forEach(pn => pn.video && pn.video.pause()); ro.disconnect(); disposables.forEach(d => d.dispose && d.dispose()); renderer.dispose(); }
  };
}
