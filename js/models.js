// Procedural weapon models, skin textures and inventory icons.
import * as THREE from 'three';
import { SKINS } from './data.js';

const texCache = new Map();

export function canvasTexture(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

// Small deterministic RNG so a skin's pattern looks the same every time.
function seeded(seed) {
  let s = 0;
  for (let i = 0; i < seed.length; i++) s = (s * 31 + seed.charCodeAt(i)) >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function drawPattern(g, w, h, skin) {
  const rnd = seeded(skin.id);
  g.fillStyle = skin.c1;
  g.fillRect(0, 0, w, h);
  switch (skin.pattern) {
    case 'stripes': {
      g.fillStyle = skin.c2;
      g.save(); g.translate(w / 2, h / 2); g.rotate(-0.6);
      for (let x = -w; x < w; x += 28) g.fillRect(x, -h, 12, h * 2);
      g.restore();
      break;
    }
    case 'camo': {
      for (let i = 0; i < 46; i++) {
        g.fillStyle = i % 3 === 0 ? skin.accent : skin.c2;
        g.globalAlpha = 0.85;
        g.beginPath();
        g.ellipse(rnd() * w, rnd() * h, 8 + rnd() * 22, 5 + rnd() * 12, rnd() * 3, 0, 6.3);
        g.fill();
      }
      g.globalAlpha = 1;
      break;
    }
    case 'checker': {
      g.fillStyle = skin.c2;
      const n = 8, s = w / n;
      for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if ((x + y) % 2) g.fillRect(x * s, y * s, s, s);
      break;
    }
    case 'dots': {
      g.fillStyle = skin.c2;
      for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) {
        g.beginPath(); g.arc(16 + x * 32, 16 + y * 32, 8, 0, 6.3); g.fill();
      }
      break;
    }
    case 'suits': {
      const suits = ['♠', '♥', '♦', '♣'];
      g.font = 'bold 30px serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      let k = 0;
      for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) {
        g.fillStyle = (k % 2) ? skin.accent : skin.c2;
        g.fillText(suits[(k++ + y) % 4], 16 + x * 32, 17 + y * 32);
      }
      break;
    }
    case 'gold': {
      const grad = g.createLinearGradient(0, 0, w, h);
      grad.addColorStop(0, skin.c1); grad.addColorStop(0.45, '#fff3c0');
      grad.addColorStop(0.55, skin.c1); grad.addColorStop(1, skin.c2);
      g.fillStyle = grad; g.fillRect(0, 0, w, h);
      g.globalAlpha = 0.12; g.strokeStyle = '#000';
      for (let y = 0; y < h; y += 3) { g.beginPath(); g.moveTo(0, y + rnd() * 2); g.lineTo(w, y + rnd() * 2); g.stroke(); }
      g.globalAlpha = 1;
      g.fillStyle = skin.c2; g.fillRect(0, h * 0.42, w, h * 0.16);
      break;
    }
    case 'neon': {
      g.strokeStyle = skin.c2; g.lineWidth = 5; g.shadowColor = skin.c2; g.shadowBlur = 14;
      for (let i = 0; i < 5; i++) {
        g.beginPath();
        const y = 14 + i * 26;
        g.moveTo(0, y); g.lineTo(w * 0.3, y); g.lineTo(w * 0.45, y + 12); g.lineTo(w, y + 12);
        g.stroke();
      }
      g.shadowBlur = 0;
      break;
    }
    default: break; // solid
  }
}

function skinMaterials(skin) {
  if (!skin) {
    return {
      body: new THREE.MeshStandardMaterial({ color: 0x4a4e58, metalness: 0.35, roughness: 0.45 }),
      accent: new THREE.MeshStandardMaterial({ color: 0x6a4a2c, metalness: 0.05, roughness: 0.8 }),
    };
  }
  let tex = texCache.get(skin.id);
  if (!tex) {
    tex = canvasTexture(128, 128, (g, w, h) => drawPattern(g, w, h, skin));
    texCache.set(skin.id, tex);
  }
  const body = new THREE.MeshStandardMaterial({ map: tex, metalness: 0.25, roughness: 0.5 });
  if (skin.pattern === 'gold') {
    // no environment map in this game, so fake the sheen with a little self-illumination
    body.metalness = 0.45; body.roughness = 0.28;
    body.emissive = new THREE.Color(skin.c1); body.emissiveMap = tex; body.emissiveIntensity = 0.22;
  }
  if (skin.pattern === 'neon') {
    body.emissive = new THREE.Color(skin.c2);
    body.emissiveMap = tex;
    body.emissiveIntensity = 1.4;
  }
  const accent = new THREE.MeshStandardMaterial({
    color: new THREE.Color(skin.accent), metalness: 0.2, roughness: 0.55,
  });
  return { body, accent };
}

const DARK = new THREE.MeshStandardMaterial({ color: 0x23252b, metalness: 0.4, roughness: 0.45 });
const GLASS = new THREE.MeshStandardMaterial({ color: 0x224466, metalness: 0.9, roughness: 0.1, emissive: 0x0a1a2a });

function box(parent, mat, sx, sy, sz, x, y, z, rx = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), mat);
  m.position.set(x, y, z);
  m.rotation.x = rx;
  parent.add(m);
  return m;
}
// Cylinder lying along the Z axis.
function tube(parent, mat, r, len, x, y, z, seg = 10) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, seg), mat);
  m.rotation.x = Math.PI / 2;
  m.position.set(x, y, z);
  parent.add(m);
  return m;
}

const BUILDERS = {
  pistol(g, m) {
    box(g, m.body, 0.034, 0.042, 0.2, 0, 0.04, -0.08);
    box(g, DARK, 0.03, 0.03, 0.15, 0, 0.008, -0.06);
    box(g, m.accent, 0.03, 0.105, 0.046, 0, -0.05, 0.0, 0.22);
    box(g, DARK, 0.008, 0.012, 0.012, 0, 0.066, 0.01);
    box(g, DARK, 0.006, 0.012, 0.008, 0, 0.066, -0.17);
    tube(g, DARK, 0.009, 0.02, 0, 0.042, -0.185);
    return [0, 0.042, -0.2];
  },
  smg(g, m) {
    box(g, m.body, 0.046, 0.072, 0.3, 0, 0.03, -0.1);
    tube(g, DARK, 0.012, 0.12, 0, 0.035, -0.3);
    tube(g, DARK, 0.02, 0.06, 0, 0.035, -0.36);
    box(g, DARK, 0.028, 0.15, 0.04, 0, -0.08, -0.12, 0.08);
    box(g, m.accent, 0.03, 0.09, 0.04, 0, -0.045, 0.02, 0.25);
    box(g, m.accent, 0.03, 0.045, 0.16, 0, 0.035, 0.12);
    box(g, DARK, 0.012, 0.03, 0.012, 0, 0.082, -0.02);
    box(g, DARK, 0.008, 0.03, 0.008, 0, 0.082, -0.22);
    return [0, 0.035, -0.4];
  },
  shotgun(g, m) {
    box(g, m.body, 0.05, 0.07, 0.3, 0, 0.03, -0.05);
    tube(g, DARK, 0.016, 0.52, 0, 0.05, -0.44);
    tube(g, DARK, 0.014, 0.42, 0, 0.016, -0.4);
    box(g, m.accent, 0.056, 0.046, 0.16, 0, 0.012, -0.36);
    box(g, m.accent, 0.04, 0.07, 0.24, 0, 0.0, 0.2, -0.16);
    box(g, m.accent, 0.03, 0.08, 0.04, 0, -0.035, 0.06, 0.4);
    box(g, DARK, 0.006, 0.014, 0.008, 0, 0.072, -0.68);
    return [0, 0.05, -0.7];
  },
  ar(g, m) {
    box(g, m.body, 0.046, 0.076, 0.34, 0, 0.03, -0.06);
    box(g, m.accent, 0.05, 0.056, 0.26, 0, 0.03, -0.36);
    tube(g, DARK, 0.011, 0.22, 0, 0.035, -0.6);
    tube(g, DARK, 0.016, 0.05, 0, 0.035, -0.71);
    box(g, DARK, 0.028, 0.17, 0.05, 0, -0.09, -0.12, 0.35);
    box(g, m.accent, 0.03, 0.09, 0.04, 0, -0.045, 0.06, 0.3);
    box(g, m.accent, 0.04, 0.075, 0.22, 0, 0.012, 0.22, -0.08);
    box(g, DARK, 0.008, 0.045, 0.01, 0, 0.082, -0.52);
    return [0, 0.035, -0.74];
  },
  sniper(g, m) {
    box(g, m.body, 0.046, 0.07, 0.42, 0, 0.03, -0.06);
    tube(g, DARK, 0.012, 0.62, 0, 0.04, -0.56);
    tube(g, DARK, 0.02, 0.08, 0, 0.04, -0.88);
    tube(g, DARK, 0.03, 0.28, 0, 0.115, -0.06, 14);
    tube(g, GLASS, 0.027, 0.004, 0, 0.115, 0.082, 14);
    box(g, DARK, 0.014, 0.03, 0.02, 0, 0.078, 0.02);
    box(g, DARK, 0.014, 0.03, 0.02, 0, 0.078, -0.14);
    box(g, m.accent, 0.044, 0.09, 0.3, 0, 0.0, 0.28, -0.05);
    box(g, m.accent, 0.032, 0.08, 0.04, 0, -0.04, 0.08, 0.35);
    box(g, DARK, 0.03, 0.07, 0.07, 0, -0.035, -0.08);
    box(g, m.accent, 0.05, 0.04, 0.24, 0, 0.012, -0.34);
    return [0, 0.04, -0.93];
  },
  lmg(g, m) {
    box(g, m.body, 0.06, 0.09, 0.42, 0, 0.03, -0.08);
    box(g, m.accent, 0.095, 0.1, 0.1, -0.012, -0.065, -0.12);
    tube(g, DARK, 0.015, 0.42, 0, 0.04, -0.5);
    tube(g, DARK, 0.022, 0.07, 0, 0.04, -0.74);
    box(g, DARK, 0.056, 0.05, 0.2, 0, 0.03, -0.38);
    box(g, DARK, 0.008, 0.04, 0.01, 0, 0.095, -0.5);
    box(g, m.accent, 0.032, 0.09, 0.04, 0, -0.05, 0.08, 0.3);
    box(g, m.accent, 0.046, 0.085, 0.24, 0, 0.015, 0.25, -0.05);
    box(g, DARK, 0.008, 0.14, 0.008, 0.03, -0.04, -0.6, 0.2);
    box(g, DARK, 0.008, 0.14, 0.008, -0.03, -0.04, -0.6, 0.2);
    return [0, 0.04, -0.78];
  },
  revolver(g, m) {
    box(g, m.body, 0.03, 0.04, 0.22, 0, 0.05, -0.16);
    box(g, m.body, 0.03, 0.06, 0.1, 0, 0.03, -0.02);
    tube(g, m.body, 0.03, 0.062, 0, 0.035, -0.04, 6);
    box(g, DARK, 0.02, 0.016, 0.16, 0, 0.022, -0.16);
    box(g, m.accent, 0.032, 0.11, 0.05, 0, -0.045, 0.04, 0.35);
    box(g, DARK, 0.008, 0.02, 0.016, 0, 0.074, 0.03);
    box(g, DARK, 0.006, 0.016, 0.008, 0, 0.078, -0.26);
    return [0, 0.05, -0.28];
  },
};

// Returns a group with the gun pointing along -Z and `userData.muzzle` (local Vector3).
export function buildWeaponModel(weaponId, skin = null) {
  const g = new THREE.Group();
  const mats = skinMaterials(typeof skin === 'string' ? SKINS[skin] : skin);
  const muzzle = (BUILDERS[weaponId] || BUILDERS.pistol)(g, mats);
  g.userData.muzzle = new THREE.Vector3(...muzzle);
  g.userData.ownMaterials = [mats.body, mats.accent];
  return g;
}

export function disposeWeaponModel(g) {
  g.traverse(o => { if (o.geometry) o.geometry.dispose(); });
  (g.userData.ownMaterials || []).forEach(m => m.dispose());
}

// --- Icons -----------------------------------------------------------------
// Renders each weapon/skin once with a tiny offscreen renderer and caches a data URL.
let iconRenderer = null, iconScene = null, iconCam = null, iconFailed = false;
const iconCache = new Map();

function ensureIconRenderer() {
  if (iconRenderer || iconFailed) return;
  try {
    iconRenderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, preserveDrawingBuffer: true });
    iconRenderer.setPixelRatio(1);
    iconRenderer.setSize(320, 160);
    iconScene = new THREE.Scene();
    iconScene.add(new THREE.AmbientLight(0xffffff, 1.3));
    const d = new THREE.DirectionalLight(0xffffff, 2.4);
    d.position.set(3, 2, 1.5);
    iconScene.add(d);
    const d2 = new THREE.DirectionalLight(0xffd9a0, 1.2);
    d2.position.set(2, -1, -2);
    iconScene.add(d2);
    iconCam = new THREE.OrthographicCamera(-1, 1, 0.5, -0.5, 0.1, 10);
  } catch (e) {
    iconFailed = true;
    iconRenderer = null;
  }
}

export function weaponIcon(weaponId, skinId = null) {
  const key = weaponId + '|' + (skinId || '');
  if (iconCache.has(key)) return iconCache.get(key);
  ensureIconRenderer();
  if (!iconRenderer) return '';
  const model = buildWeaponModel(weaponId, skinId);
  iconScene.add(model);
  const bb = new THREE.Box3().setFromObject(model);
  const size = bb.getSize(new THREE.Vector3());
  const c = bb.getCenter(new THREE.Vector3());
  // Fit the side profile (Z across, Y up) into a 2:1 frame with a little padding.
  const halfW = Math.max(size.z / 2, size.y) * 1.12;
  iconCam.left = -halfW; iconCam.right = halfW;
  iconCam.top = halfW / 2; iconCam.bottom = -halfW / 2;
  iconCam.updateProjectionMatrix();
  iconCam.position.set(c.x + 3, c.y + 0.25, c.z - 0.5);
  iconCam.lookAt(c);
  iconRenderer.render(iconScene, iconCam);
  const url = iconRenderer.domElement.toDataURL('image/png');
  iconScene.remove(model);
  disposeWeaponModel(model);
  iconCache.set(key, url);
  return url;
}
