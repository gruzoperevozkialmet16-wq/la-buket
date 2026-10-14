// 3D-сцена первого экрана: парящая галерея из фотографий букетов
// (скруглённые изогнутые карточки с мягкими тенями) и переливающиеся лепестки.
// Карточки следуют за курсором с параллаксом, разлетаются при прокрутке, по клику открывают букет.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const lerp = (a, b, t) => a + (b - a) * t;
const clamp01 = (x) => Math.min(1, Math.max(0, x));
const easeOut = (t) => 1 - Math.pow(1 - clamp01(t), 4);

// Раскладка карточек относительно центра галереи: x, y, z, масштаб, наклон
const LAYOUT = [
  [0.0, 0.05, 0.7, 1.25, 0.0],
  [-1.42, 0.95, -0.5, 0.84, 0.12],
  [1.38, 1.05, -0.25, 0.9, -0.1],
  [-1.3, -1.0, -0.15, 0.82, 0.08],
  [1.5, -0.95, 0.15, 0.95, -0.12],
  [0.15, 1.95, -1.5, 0.66, 0.05],
  [-0.05, -2.05, -1.3, 0.68, -0.04],
  [2.65, 0.1, -1.7, 0.74, -0.2],
  [-2.05, 1.95, -2.2, 0.58, 0.2],
];

const cardVertex = /* glsl */ `
  uniform float uTime;
  uniform float uHover;
  uniform float uPhase;
  varying vec2 vUv;
  void main() {
    vUv = uv;
    vec3 p = position;
    // лёгкий изгиб «страницы» и волна при наведении
    p.z -= p.x * p.x * 0.18;
    p.z += sin(p.y * 3.0 + uTime * 1.6 + uPhase) * 0.025 * (0.4 + uHover * 2.0);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  }`;

const cardFragment = /* glsl */ `
  uniform sampler2D uMap;
  uniform float uImgAspect;
  uniform float uCardAspect;
  uniform float uHover;
  uniform float uAlpha;
  varying vec2 vUv;
  float roundBox(vec2 p, vec2 b, float r) {
    vec2 q = abs(p) - b + r;
    return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
  }
  void main() {
    // object-fit: cover
    vec2 uv = vUv - 0.5;
    if (uImgAspect > uCardAspect) uv.x *= uCardAspect / uImgAspect;
    else uv.y *= uImgAspect / uCardAspect;
    uv *= 1.0 - uHover * 0.06;
    vec4 tex = texture2D(uMap, uv + 0.5);
    vec2 p = (vUv - 0.5) * vec2(uCardAspect, 1.0);
    float d = roundBox(p, vec2(uCardAspect * 0.5, 0.5), 0.07);
    float mask = 1.0 - smoothstep(-0.004, 0.002, d);
    // тонкая светлая рамка
    float rim = smoothstep(-0.018, -0.006, d) * mask;
    vec3 col = mix(tex.rgb, vec3(1.0), rim * 0.55);
    gl_FragColor = vec4(col, mask * uAlpha);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }`;

function shadowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(64, 64, 8, 64, 64, 64);
  grd.addColorStop(0, 'rgba(70, 40, 40, 0.55)');
  grd.addColorStop(1, 'rgba(70, 40, 40, 0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}

function petalGeometry() {
  const g = new THREE.PlaneGeometry(1, 1, 10, 10);
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const u = pos.getX(i) + 0.5;
    const v = pos.getY(i) + 0.5;
    const across = 2 * u - 1;
    const width = Math.sqrt(Math.max(0, 1 - ((v - 0.6) / 0.6) ** 2)) + 0.02;
    pos.setXYZ(i, across * width * 0.45, v - 0.5 - 0.15 * v ** 3 * across * across, -0.35 * across * across * width + 0.25 * v * v);
  }
  g.computeVertexNormals();
  return g;
}

function floatingPetals(count) {
  const mat = new THREE.MeshPhysicalMaterial({
    color: '#f2b3bd',
    roughness: 0.25,
    metalness: 0.05,
    iridescence: 1,
    iridescenceIOR: 1.35,
    iridescenceThicknessRange: [200, 700],
    sheen: 1,
    sheenColor: new THREE.Color('#ffe6ea'),
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.85,
  });
  const mesh = new THREE.InstancedMesh(petalGeometry(), mat, count);
  const data = Array.from({ length: count }, () => ({
    x: (Math.random() - 0.5) * 11,
    y: (Math.random() - 0.5) * 7,
    z: -Math.random() * 3 + 1.2,
    s: 0.09 + Math.random() * 0.14,
    vy: 0.08 + Math.random() * 0.14,
    spin: new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(1.6),
    phase: Math.random() * 10,
  }));
  const dummy = new THREE.Object3D();
  function update(time, dt, spread) {
    for (let i = 0; i < count; i++) {
      const p = data[i];
      p.y -= p.vy * dt;
      if (p.y < -3.8) {
        p.y = 3.8;
        p.x = (Math.random() - 0.5) * 11;
      }
      dummy.position.set(p.x * (1 + spread * 0.4) + Math.sin(time * 0.5 + p.phase) * 0.35, p.y, p.z + spread * 1.5);
      dummy.rotation.set(time * p.spin.x + p.phase, time * p.spin.y, time * p.spin.z);
      dummy.scale.setScalar(p.s);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  }
  return { mesh, update };
}

/**
 * @param {HTMLCanvasElement} canvas
 * @param {{id: string, image: string}[]} items  фото для карточек (берутся хиты каталога)
 * @param {(id: string) => void} onPick  клик по карточке
 */
export function initHero(canvas, items, onPick) {
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  } catch {
    canvas.closest('.hero')?.classList.add('no-webgl');
    return null;
  }
  const isSmall = window.innerWidth < 760;
  // полная плотность пикселей экрана (на телефонах 3x), иначе фото выглядят мыльными
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 3));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.add(new THREE.AmbientLight('#fff4ee', 0.8));
  const key = new THREE.DirectionalLight('#ffffff', 1.6);
  key.position.set(2, 3, 4);
  scene.add(key);

  const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 60);
  camera.position.set(0, 0, 7);

  const gallery = new THREE.Group();
  scene.add(gallery);

  const loader = new THREE.TextureLoader();
  const shadowTex = shadowTexture();
  const CARD_W = 1.1;
  const CARD_H = 1.375;
  const cardGeo = new THREE.PlaneGeometry(CARD_W, CARD_H, 24, 24);
  const shadowGeo = new THREE.PlaneGeometry(CARD_W * 1.5, CARD_H * 1.45);

  // на телефоне — 5 крупных карточек вместо 9 мелких
  const count = Math.min(window.innerWidth < 900 ? 5 : LAYOUT.length, items.length);
  const cards = LAYOUT.slice(0, count).map((l, i) => {
    const item = items[i];
    const uniforms = {
      uMap: { value: null },
      uImgAspect: { value: 0.9 },
      uCardAspect: { value: CARD_W / CARD_H },
      uTime: { value: 0 },
      uHover: { value: 0 },
      uAlpha: { value: 0 },
      uPhase: { value: i * 1.7 },
    };
    const mesh = new THREE.Mesh(cardGeo, new THREE.ShaderMaterial({
      uniforms, vertexShader: cardVertex, fragmentShader: cardFragment, transparent: true, side: THREE.DoubleSide,
    }));
    mesh.visible = false;
    loader.load(item.image, (tex) => {
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
      tex.minFilter = THREE.LinearMipmapLinearFilter;
      tex.magFilter = THREE.LinearFilter;
      tex.generateMipmaps = true;
      uniforms.uMap.value = tex;
      uniforms.uImgAspect.value = tex.image.width / tex.image.height;
      mesh.visible = true;
    });
    const shadow = new THREE.Mesh(shadowGeo, new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false, opacity: 0 }));
    shadow.position.set(0.08, -0.16, -0.12);
    const holder = new THREE.Group();
    holder.add(shadow, mesh);
    mesh.userData.index = i;
    gallery.add(holder);
    return {
      holder, mesh, shadow, uniforms, id: item.id,
      home: new THREE.Vector3(l[0], l[1], l[2]), scale: l[3], tilt: l[4],
      delay: 0.15 + i * 0.09, hover: 0, phase: i * 1.3,
    };
  });

  const petals = floatingPetals(isSmall ? 14 : 26);
  scene.add(petals.mesh);

  const base = { x: 0, y: 0, scale: 1 };
  function resize() {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    const narrow = window.innerWidth < 900 || w / h < 1.05;
    camera.position.z = 7;
    const halfW = Math.tan((camera.fov * Math.PI) / 360) * camera.position.z * (w / h);
    base.x = narrow ? -0.05 : Math.min(3.4, halfW * 0.47);
    base.y = narrow ? -0.1 : 0;
    base.scale = narrow ? Math.min(1, (halfW * 2) / 4.6) : 0.74;
    camera.updateProjectionMatrix();
  }
  resize();
  window.addEventListener('resize', resize);

  const mouse = { x: 0, y: 0, tx: 0, ty: 0, px: -10, py: -10 };
  window.addEventListener('pointermove', (e) => {
    mouse.tx = (e.clientX / window.innerWidth) * 2 - 1;
    mouse.ty = (e.clientY / window.innerHeight) * 2 - 1;
    const r = canvas.getBoundingClientRect();
    mouse.px = ((e.clientX - r.left) / r.width) * 2 - 1;
    mouse.py = -((e.clientY - r.top) / r.height) * 2 + 1;
  });

  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  function pick() {
    pointer.set(mouse.px, mouse.py);
    raycaster.setFromCamera(pointer, camera);
    const hit = raycaster.intersectObjects(cards.map((c) => c.mesh))[0];
    return hit ? cards[hit.object.userData.index] : null;
  }
  const hero = canvas.closest('.hero');
  const canHover = window.matchMedia('(hover: hover)').matches;
  hero.addEventListener('click', (e) => {
    if (e.target.closest('a, button')) return;
    const r = canvas.getBoundingClientRect();
    mouse.px = ((e.clientX - r.left) / r.width) * 2 - 1;
    mouse.py = -((e.clientY - r.top) / r.height) * 2 + 1;
    const c = pick();
    if (c && onPick) onPick(c.id);
  });

  let visible = true;
  new IntersectionObserver(([entry]) => (visible = entry.isIntersecting)).observe(canvas);

  const clock = new THREE.Clock();
  const start = performance.now();

  function frame() {
    requestAnimationFrame(frame);
    if (!visible) return;
    const dt = Math.min(clock.getDelta(), 0.05);
    const time = clock.elapsedTime;
    const since = reduce ? 10 : (performance.now() - start) / 1000;
    const scrollT = clamp01(window.scrollY / window.innerHeight);

    mouse.x = lerp(mouse.x, mouse.tx, 0.06);
    mouse.y = lerp(mouse.y, mouse.ty, 0.06);

    const hovered = canHover ? pick() : null;
    hero.style.cursor = hovered ? 'pointer' : '';

    gallery.position.set(base.x, base.y + scrollT * 0.6, 0);
    gallery.scale.setScalar(base.scale);
    gallery.rotation.y = mouse.x * 0.22 - 0.08;
    gallery.rotation.x = mouse.y * 0.12;

    for (const c of cards) {
      const t = easeOut((since - c.delay) / 1.6);
      c.hover = lerp(c.hover, hovered === c ? 1 : 0, 0.1);
      const float = Math.sin(time * 0.7 + c.phase) * 0.06;
      const spread = 1 + scrollT * 0.9;
      c.holder.position.set(
        c.home.x * spread + mouse.x * c.home.z * 0.12,
        c.home.y * spread + float - mouse.y * c.home.z * 0.08,
        lerp(-9, c.home.z, t) + scrollT * (2.2 + c.home.z) + c.hover * 0.35
      );
      c.holder.rotation.set(
        lerp(0.9, 0, t) + mouse.y * 0.05,
        lerp(-1.2, 0, t) - c.home.x * 0.07,
        c.tilt * 0.25 + Math.sin(time * 0.4 + c.phase) * 0.02
      );
      c.holder.scale.setScalar(c.scale * (1 + c.hover * 0.06));
      c.uniforms.uTime.value = time;
      c.uniforms.uHover.value = c.hover;
      c.uniforms.uAlpha.value = t * (1 - scrollT * 0.7);
      c.shadow.material.opacity = c.mesh.visible ? t * 0.5 * (1 - scrollT) : 0;
    }

    petals.update(time, dt, scrollT);
    renderer.render(scene, camera);
  }
  frame();
  return { renderer };
}
