// PlayStation-era rendering: everything is drawn into a small render target, vertices snap to a
// coarse grid (the classic polygon wobble), and the final image is dithered down to 15-bit colour.
import * as THREE from 'three';

// Shared by every material in the game; updated when the internal resolution changes.
export const snapUniform = { value: new THREE.Vector2(160, 120) };

// Patch all built-in materials once so their projected vertices snap to the low-res grid.
export function installVertexSnap() {
  THREE.Material.prototype.onBeforeCompile = function (shader) {
    if (!shader.vertexShader.includes('#include <project_vertex>')) return;
    shader.uniforms.uPsxSnap = snapUniform;
    shader.vertexShader = 'uniform vec2 uPsxSnap;\n' + shader.vertexShader.replace(
      '#include <project_vertex>',
      `#include <project_vertex>
      if (gl_Position.w > 0.0) {
        vec2 psxNdc = gl_Position.xy / gl_Position.w;
        gl_Position.xy = (floor(psxNdc * uPsxSnap + 0.5) / uPsxSnap) * gl_Position.w;
      }`,
    );
  };
}

export class PsxPipeline {
  constructor(renderer) {
    this.renderer = renderer;
    this.target = new THREE.WebGLRenderTarget(320, 240, {
      type: THREE.HalfFloatType, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: true,
    });
    this.material = new THREE.ShaderMaterial({
      uniforms: { tDiffuse: { value: this.target.texture }, uExposure: { value: 1.25 } },
      depthTest: false, depthWrite: false, toneMapped: false,
      vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader: `
        uniform sampler2D tDiffuse; uniform float uExposure; varying vec2 vUv;
        float bayer2(vec2 a) { a = floor(a); return fract(a.x / 2.0 + a.y * a.y * 0.75); }
        float bayer4(vec2 a) { return bayer2(0.5 * a) * 0.25 + bayer2(a); }
        void main() {
          vec3 c = texture2D(tDiffuse, vUv).rgb * uExposure;
          c = clamp((c * (2.51 * c + 0.03)) / (c * (2.43 * c + 0.59) + 0.14), 0.0, 1.0);  // filmic curve
          c = pow(c, vec3(1.0 / 2.2));
          float d = bayer4(gl_FragCoord.xy) - 0.5;
          c = floor(c * 31.0 + 0.5 + d) / 31.0;                                          // 5 bits per channel
          gl_FragColor = vec4(c, 1.0);
        }`,
    });
    this.scene = new THREE.Scene();
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.material);
    this.quad.frustumCulled = false;
    this.scene.add(this.quad);
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  }

  // `lines` is the vertical resolution (240 = PSX). Width follows the window's aspect ratio.
  setSize(windowW, windowH, lines) {
    const h = lines, w = Math.max(160, Math.round(h * Math.min(windowW / windowH, 2.4)));
    this.renderer.setSize(w, h, false);
    this.target.setSize(w, h);
    snapUniform.value.set(w / 2.6, h / 2.6);
  }

  begin() {
    this.renderer.setRenderTarget(this.target);
    this.renderer.clear();
  }

  end() {
    this.renderer.setRenderTarget(null);
    this.renderer.render(this.scene, this.camera);
  }
}
