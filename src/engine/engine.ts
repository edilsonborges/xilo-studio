// Módulos 3 e 4: monta a cena Three.js de cada SceneDef e renderiza o frame
// correspondente a um instante `t` do áudio.
//
// render(t) não guarda estado entre chamadas além do cache da cena montada:
// personagens, partículas e câmera são recalculados só a partir de `t`, então
// avançar ou voltar na timeline mostra sempre o mesmo frame para o mesmo t.

import * as THREE from 'three';
import type { SceneDef, SceneGraphJSON } from '../types';
import { clamp, hashString } from '../util';
import { computeCameraPose } from './camera';
import { createCharacter, poseCharacter, type CharacterRig } from './character';
import { createEnvironment, type EnvironmentObject } from './environment';
import { createProp, type PropObject } from './props';
import { disposeTree } from './toon';

export const FRAME_WIDTH = 1080;
export const FRAME_HEIGHT = 1920;

const MAX_POINT_LIGHTS = 3;
const BED_SNAP_DISTANCE = 1.3;

interface BuiltCharacter {
  rig: CharacterRig;
  start: THREE.Vector3;
  end: THREE.Vector3;
  moves: boolean;
  facing: number;
  restHeight: number;
  animation: SceneDef['characters'][number]['animation'];
  id: string;
}

interface BuiltScene {
  def: SceneDef;
  scene: THREE.Scene;
  environment: EnvironmentObject;
  characters: BuiltCharacter[];
  props: PropObject[];
}

export class SceneEngine {
  readonly canvas: HTMLCanvasElement;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly camera: THREE.PerspectiveCamera;
  private scenes: SceneDef[] = [];
  private built: BuiltScene | null = null;
  private readonly fallbackScene = new THREE.Scene();

  constructor() {
    this.canvas = document.createElement('canvas');
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      // o compositor 2D copia este canvas com drawImage logo após o render
      preserveDrawingBuffer: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(1);
    this.renderer.setSize(FRAME_WIDTH, FRAME_HEIGHT, false);
    this.renderer.shadowMap.enabled = true;
    // filtro mínimo: a borda da sombra fica dura, como pede o cel-shading
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.NoToneMapping;

    this.camera = new THREE.PerspectiveCamera(50, FRAME_WIDTH / FRAME_HEIGHT, 0.1, 500);
    this.fallbackScene.background = new THREE.Color('#1b1512');
  }

  setSceneGraph(graph: SceneGraphJSON): void {
    this.disposeBuilt();
    this.scenes = graph.scenes;
  }

  get sceneCount(): number {
    return this.scenes.length;
  }

  /** Cena ativa em `t`: a última que já começou. */
  sceneIndexAt(t: number): number {
    let index = -1;
    for (let i = 0; i < this.scenes.length; i++) {
      if (this.scenes[i].startTime <= t + 1e-6) index = i;
      else break;
    }
    return this.scenes.length ? Math.max(0, index) : -1;
  }

  sceneAt(t: number): SceneDef | null {
    const i = this.sceneIndexAt(t);
    return i >= 0 ? this.scenes[i] : null;
  }

  render(t: number): void {
    const index = this.sceneIndexAt(t);
    if (index < 0) {
      this.renderer.render(this.fallbackScene, this.camera);
      return;
    }
    const def = this.scenes[index];
    if (!this.built || this.built.def !== def) {
      this.disposeBuilt();
      this.built = this.build(def, index);
    }
    const built = this.built;
    const span = Math.max(0.001, def.endTime - def.startTime);
    const progress = clamp((t - def.startTime) / span, 0, 1);

    built.environment.update(t);
    for (const prop of built.props) prop.update?.(t);

    let follow: { start: THREE.Vector3; current: THREE.Vector3 } | undefined;
    for (const c of built.characters) {
      const root = c.rig.root;
      // deslocamento linear: combina com o ciclo de passos em velocidade constante
      root.position.lerpVectors(c.start, c.end, c.moves ? progress : 0);
      root.rotation.y = c.facing;
      poseCharacter(c.rig, c.animation, t, { restHeight: c.restHeight });
      if (def.camera.movement === 'follow_character' && def.camera.target === c.id) {
        follow = { start: c.start, current: root.position.clone() };
      }
    }

    const pose = computeCameraPose(def.camera, progress, follow);
    this.camera.position.copy(pose.position);
    this.camera.position.y = Math.max(0.3, this.camera.position.y);
    this.camera.lookAt(pose.lookAt);
    this.renderer.render(built.scene, this.camera);
  }

  private build(def: SceneDef, index: number): BuiltScene {
    const scene = new THREE.Scene();
    const seed = hashString(`${def.id}:${index}`);
    const environment = createEnvironment(def.environment.preset, def.environment, seed);
    scene.add(environment.group);
    scene.fog = environment.fog;
    scene.background = new THREE.Color(def.environment.fogColor);

    let lights = 0;
    const props = def.props.map((p, i) => {
      const allowLight = p.type === 'lantern' && lights < MAX_POINT_LIGHTS;
      if (allowLight) lights++;
      const prop = createProp(p.type, p.position, p.scale, p.color, {
        rotationY: p.rotationY,
        palette: environment.palette,
        seed: ((seed + i * 7919) % 1000) / 100,
        allowLight,
      });
      scene.add(prop.group);
      return prop;
    });

    const beds = props.filter((p) => p.restHeight !== undefined);
    const characters = def.characters.map((c): BuiltCharacter => {
      const rig = createCharacter(c);
      scene.add(rig.root);
      const start = new THREE.Vector3(...c.position);
      const end = c.targetPosition ? new THREE.Vector3(...c.targetPosition) : start.clone();
      const moves = start.distanceTo(end) > 0.05;

      let restHeight = 0;
      if (c.animation === 'sleep') {
        const bed = beds.find((b) => b.group.position.distanceTo(start) < BED_SNAP_DISTANCE);
        if (bed) {
          restHeight = bed.restHeight ?? 0;
          // alinha o corpo com a cama, senão ele fica atravessado
          start.copy(bed.group.position);
          end.copy(start);
          rig.root.userData.bedYaw = bed.group.rotation.y;
        }
      }
      return { rig, start, end, moves, facing: 0, restHeight, animation: c.animation, id: c.id };
    });

    // para onde cada um olha: na direção em que anda, ou meio virado para o vizinho
    for (const c of characters) {
      if (c.animation === 'sleep') {
        c.moves = false;
        c.facing = (c.rig.root.userData.bedYaw as number | undefined) ?? 0;
        continue;
      }
      if (c.moves) {
        c.facing = Math.atan2(c.end.x - c.start.x, c.end.z - c.start.z);
        continue;
      }
      let nearest: BuiltCharacter | null = null;
      for (const other of characters) {
        if (other === c) continue;
        if (!nearest || other.start.distanceTo(c.start) < nearest.start.distanceTo(c.start)) {
          nearest = other;
        }
      }
      if (nearest && nearest.start.distanceTo(c.start) < 5) {
        const toOther = Math.atan2(nearest.start.x - c.start.x, nearest.start.z - c.start.z);
        // 0 é de frente para a câmera; vira só parte do caminho para o rosto continuar visível
        c.facing = clamp(toOther, -Math.PI / 2, Math.PI / 2) * 0.55;
      }
    }

    return { def, scene, environment, characters, props };
  }

  private disposeBuilt(): void {
    if (!this.built) return;
    disposeTree(this.built.scene);
    this.built = null;
  }

  dispose(): void {
    this.disposeBuilt();
    this.renderer.dispose();
  }
}
