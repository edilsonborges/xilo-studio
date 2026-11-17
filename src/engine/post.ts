// Pós-processamento dos visuais 3D: uma passada única na GPU sobre o quadro já
// renderizado. Cada efeito é ligado por um uniform; o ruído usa o tempo do
// vídeo como semente, então o mesmo instante gera sempre o mesmo quadro.

import * as THREE from 'three';
import type { PostLook } from './styles';

const vertexShader = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

const fragmentShader = /* glsl */ `
  uniform sampler2D tDiffuse;
  uniform vec2 uRes;
  uniform float uTime;
  uniform float uSat, uCon, uBri, uSepia, uGray, uTintAmt;
  uniform vec3 uTint;
  uniform float uPoster;
  uniform int uPalN;
  uniform vec3 uPal[4];
  uniform float uDither;
  uniform float uHalf, uHalfAmt, uScreen, uHatch, uHatchScale;
  uniform float uPixel, uScan, uChroma, uWobble, uGrain, uPaper, uWeave, uVig;
  uniform float uGlow, uSoften, uEdges, uEdgeW, uEdgeGlow, uGrid, uFlicker, uHasPaperColor;
  uniform vec3 uEdgeColor, uPaperColor;
  varying vec2 vUv;

  float hash(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }
  float vnoise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
               mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
  }
  float fbm(vec2 p) {
    float v = 0.0, a = 0.5;
    for (int i = 0; i < 4; i++) { v += a * vnoise(p); p *= 2.03; a *= 0.5; }
    return v;
  }
  float luma(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }
  float bayer2(vec2 a) { a = floor(a); return fract(a.x / 2.0 + a.y * a.y * 0.75); }
  float bayer4(vec2 a) { return bayer2(0.5 * a) * 0.25 + bayer2(a); }
  // o render target guarda cor linear; os efeitos trabalham em sRGB
  vec3 samp(vec2 uv) { return pow(max(texture2D(tDiffuse, uv).rgb, 0.0), vec3(1.0 / 2.2)); }

  void main() {
    vec2 px = vUv * uRes;
    vec2 uv = vUv;
    vec2 texel = 1.0 / uRes;

    if (uWobble > 0.0) {
      float line = floor(px.y / 3.0);
      float jump = step(0.985, hash(vec2(line, floor(uTime * 8.0))));
      uv.x += uWobble * (0.0015 * sin(line * 0.07 + uTime * 3.0) + 0.004 * jump);
    }
    if (uPixel > 1.0) uv = (floor(uv * uRes / uPixel) + 0.5) * uPixel / uRes;

    vec3 c = samp(uv);
    if (uChroma > 0.0) {
      vec2 o = vec2(uChroma * texel.x, 0.0);
      c.r = samp(uv + o).r;
      c.b = samp(uv - o).b;
    }
    if (uSoften > 0.0) {
      vec3 b = vec3(0.0);
      float r = 3.5 * (1.0 + uSoften * 2.0);
      for (int i = 0; i < 8; i++) {
        float a = float(i) * 0.785398;
        b += samp(uv + vec2(cos(a), sin(a)) * texel * r);
      }
      c = mix(c, b / 8.0, uSoften * 0.75);
    }
    if (uGlow > 0.0) {
      vec3 g = vec3(0.0);
      for (int i = 0; i < 12; i++) {
        float a = float(i) * 0.5236;
        g += max(samp(uv + vec2(cos(a), sin(a)) * texel * 14.0) - 0.55, 0.0);
      }
      c += g / 12.0 * uGlow * 2.2;
    }

    // contornos pela variação de luz (Sobel)
    float edge = 0.0;
    if (uEdges > 0.0) {
      vec2 d = texel * uEdgeW;
      float tl = luma(samp(uv + vec2(-d.x, d.y))), t = luma(samp(uv + vec2(0.0, d.y))), tr = luma(samp(uv + d));
      float l = luma(samp(uv - vec2(d.x, 0.0))), r = luma(samp(uv + vec2(d.x, 0.0)));
      float bl = luma(samp(uv - d)), bt = luma(samp(uv - vec2(0.0, d.y))), br = luma(samp(uv + vec2(d.x, -d.y)));
      float gx = -tl - 2.0 * l - bl + tr + 2.0 * r + br;
      float gy = tl + 2.0 * t + tr - bl - 2.0 * bt - br;
      edge = smoothstep(0.1, 0.32, length(vec2(gx, gy)));
    }
    vec3 original = c;

    // correção de cor
    c += uBri;
    c = (c - 0.5) * uCon + 0.5;
    c = mix(vec3(luma(c)), c, uSat);
    if (uSepia > 0.0) {
      vec3 s = vec3(dot(c, vec3(0.393, 0.769, 0.189)), dot(c, vec3(0.349, 0.686, 0.168)), dot(c, vec3(0.272, 0.534, 0.131)));
      c = mix(c, s, uSepia);
    }
    if (uGray > 0.0) c = mix(c, vec3(luma(c)), uGray);
    if (uTintAmt > 0.0) c = mix(c, c * uTint * 1.25, uTintAmt);
    c = clamp(c, 0.0, 1.0);
    float base = luma(c);

    if (uPoster > 1.0) c = floor(c * uPoster + 0.5) / uPoster;

    if (uHasPaperColor > 0.5) {
      c = uPaperColor * (uGrid > 0.0 ? 1.0 : 0.84 + 0.16 * base);
    }

    // retícula colorida (HQ, pop art)
    if (uHalf > 0.0) {
      mat2 rot = mat2(0.7071, -0.7071, 0.7071, 0.7071);
      vec2 f = fract(rot * px / uHalf) - 0.5;
      float rad = sqrt(1.0 - base) * 0.62;
      float dotMask = 1.0 - smoothstep(rad - 0.08, rad + 0.08, length(f));
      c = mix(c * 1.1, c * 0.42, dotMask * uHalfAmt);
    }
    // retícula de mangá: claros brancos, meios-tons pontilhados, escuros pretos
    if (uScreen > 0.0) {
      vec2 f = fract(px / 5.0) - 0.5;
      float dotMask = 1.0 - smoothstep(0.22, 0.3, length(f));
      float tone = base > 0.66 ? 1.0 : base > 0.3 ? 1.0 - dotMask * (1.4 - base * 1.5) : 0.08;
      c = mix(c, vec3(tone), uScreen);
    }
    // hachura: uma direção nos meios-tons, cruzada nos escuros
    if (uHatch > 0.0) {
      float h1 = abs(fract((px.x + px.y) / uHatchScale) - 0.5);
      float h2 = abs(fract((px.x - px.y) / uHatchScale) - 0.5);
      float ink = step(h1, 0.5 * (1.0 - smoothstep(0.35, 0.85, base))) * 0.9;
      ink = max(ink, step(h2, 0.45 * (1.0 - smoothstep(0.15, 0.5, base))) * 0.9);
      c = mix(c, c * (1.0 - ink), uHatch);
    }
    // redução a uma paleta pela luminância
    if (uPalN > 0) {
      float l4 = luma(c);
      if (uDither > 0.0) l4 += (bayer4(px / max(uPixel, 1.0)) - 0.5) / float(uPalN) * uDither;
      int idx = int(clamp(floor(l4 * float(uPalN)), 0.0, float(uPalN - 1)));
      vec3 pc = uPal[0];
      for (int i = 1; i < 4; i++) { if (i == idx) pc = uPal[i]; }
      c = pc;
    }

    if (uEdges > 0.0) {
      vec3 edgeColor = uEdgeGlow > 0.5 ? clamp(original * 1.9 + 0.25, 0.0, 1.0) : uEdgeColor;
      c = mix(c, edgeColor, edge * uEdges);
    }
    if (uGrid > 0.0) {
      float g = max(step(fract(px.x / 48.0), 0.025), step(fract(px.y / 48.0), 0.025));
      c = mix(c, uEdgeColor, g * 0.16 * uGrid);
    }
    if (uPaper > 0.0) {
      float n = fbm(px / 120.0) * 0.65 + fbm(px / 6.0) * 0.35;
      c = c * (1.0 - uPaper * 0.18) + uPaper * 0.26 * vec3(0.98, 0.95, 0.88) * n;
      // tinta forte falha onde o papel é mais áspero (carimbo, giz)
      if (uPaper > 0.5 && luma(c) < 0.5) {
        c = mix(c, vec3(0.93, 0.89, 0.8), step(0.8, vnoise(px / 2.5)) * (uPaper - 0.5));
      }
    }
    if (uWeave > 0.0) {
      float w = sin(px.x * 0.9) * sin(px.y * 0.9);
      c *= 1.0 + uWeave * 0.06 * w + uWeave * 0.07 * (vnoise(px / 3.0) - 0.5);
    }
    if (uGrain > 0.0) c += (hash(px + floor(uTime * 24.0) * 17.0) - 0.5) * uGrain * 0.35;
    if (uScan > 0.0) c *= 1.0 - uScan * 0.5 * (0.5 + 0.5 * sin(px.y * 2.094));
    if (uVig > 0.0) c *= 1.0 - uVig * smoothstep(0.35, 0.85, distance(vUv, vec2(0.5)));
    if (uFlicker > 0.0) {
      float dip = step(0.93, hash(vec2(floor(uTime * 10.0), 3.0)));
      c *= 1.0 - uFlicker * (0.12 + 0.12 * sin(uTime * 21.0)) - uFlicker * 0.3 * dip;
    }
    gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
  }
`;

/** O shader trabalha em sRGB: a cor vai como está no hex, sem a conversão para linear do THREE.Color. */
function srgb(hex: string | undefined, fallback = '#ffffff', out = new THREE.Vector3()): THREE.Vector3 {
  const value = /^#[0-9a-f]{6}$/i.test(hex ?? '') ? hex! : fallback;
  const n = parseInt(value.slice(1), 16);
  return out.set(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}

/** Com todos os efeitos desligados, a passada é pulada (mesmo custo de antes). */
export function isIdentity(post: PostLook): boolean {
  return Object.keys(post).length === 0;
}

export class StylePass {
  readonly target: THREE.WebGLRenderTarget;
  private readonly material: THREE.ShaderMaterial;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  active = false;

  constructor(width: number, height: number) {
    this.target = new THREE.WebGLRenderTarget(width, height, { samples: 4, type: THREE.HalfFloatType });
    this.material = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
      uniforms: {
        tDiffuse: { value: this.target.texture },
        uRes: { value: new THREE.Vector2(width, height) },
        uTime: { value: 0 },
        uSat: { value: 1 }, uCon: { value: 1 }, uBri: { value: 0 }, uSepia: { value: 0 }, uGray: { value: 0 },
        uTint: { value: new THREE.Vector3(1, 1, 1) }, uTintAmt: { value: 0 },
        uPoster: { value: 0 },
        uPalN: { value: 0 },
        uPal: { value: [0, 1, 2, 3].map(() => new THREE.Vector3()) },
        uDither: { value: 0 },
        uHalf: { value: 0 }, uHalfAmt: { value: 0 }, uScreen: { value: 0 }, uHatch: { value: 0 }, uHatchScale: { value: 7 },
        uPixel: { value: 0 }, uScan: { value: 0 }, uChroma: { value: 0 }, uWobble: { value: 0 },
        uGrain: { value: 0 }, uPaper: { value: 0 }, uWeave: { value: 0 }, uVig: { value: 0 },
        uGlow: { value: 0 }, uSoften: { value: 0 },
        uEdges: { value: 0 }, uEdgeW: { value: 1 }, uEdgeGlow: { value: 0 }, uEdgeColor: { value: new THREE.Vector3() },
        uGrid: { value: 0 }, uFlicker: { value: 0 },
        uHasPaperColor: { value: 0 }, uPaperColor: { value: new THREE.Vector3(1, 1, 1) },
      },
    });
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.material);
    quad.frustumCulled = false;
    this.scene.add(quad);
  }

  setLook(post: PostLook): void {
    this.active = !isIdentity(post);
    const u = this.material.uniforms;
    u.uSat.value = post.saturation ?? 1;
    u.uCon.value = post.contrast ?? 1;
    u.uBri.value = post.brightness ?? 0;
    u.uSepia.value = post.sepia ?? 0;
    u.uGray.value = post.grayscale ?? 0;
    srgb(post.tint, '#ffffff', u.uTint.value as THREE.Vector3);
    u.uTintAmt.value = post.tint ? post.tintAmount ?? 0.3 : 0;
    u.uPoster.value = post.posterize ?? 0;
    const palette = (post.palette ?? []).slice(0, 4);
    u.uPalN.value = palette.length;
    palette.forEach((hex, i) => srgb(hex, '#000000', (u.uPal.value as THREE.Vector3[])[i]));
    u.uDither.value = post.dither ?? 0;
    u.uHalf.value = post.halftone ?? 0;
    u.uHalfAmt.value = post.halftoneAmount ?? 0.5;
    u.uScreen.value = post.screentone ?? 0;
    u.uHatch.value = post.hatching ?? 0;
    u.uHatchScale.value = post.hatchScale ?? 7;
    u.uPixel.value = post.pixelate ?? 0;
    u.uScan.value = post.scanlines ?? 0;
    u.uChroma.value = post.chroma ?? 0;
    u.uWobble.value = post.wobble ?? 0;
    u.uGrain.value = post.grain ?? 0;
    u.uPaper.value = post.paper ?? 0;
    u.uWeave.value = post.weave ?? 0;
    u.uVig.value = post.vignette ?? 0;
    u.uGlow.value = post.glow ?? 0;
    u.uSoften.value = post.soften ?? 0;
    u.uEdges.value = post.edges ?? 0;
    u.uEdgeW.value = post.edgeWidth ?? 1;
    u.uEdgeGlow.value = post.edgeColor === 'glow' ? 1 : 0;
    srgb(post.edgeColor === 'glow' ? undefined : post.edgeColor, '#000000', u.uEdgeColor.value as THREE.Vector3);
    u.uGrid.value = post.grid ?? 0;
    u.uFlicker.value = post.flicker ?? 0;
    u.uHasPaperColor.value = post.paperColor ? 1 : 0;
    srgb(post.paperColor, '#ffffff', u.uPaperColor.value as THREE.Vector3);
  }

  /** Desenha o quadro do render target no canvas, com os efeitos do visual. */
  render(renderer: THREE.WebGLRenderer, t: number): void {
    this.material.uniforms.uTime.value = t;
    renderer.setRenderTarget(null);
    renderer.render(this.scene, this.camera);
  }

  dispose(): void {
    this.target.dispose();
    this.material.dispose();
  }
}
