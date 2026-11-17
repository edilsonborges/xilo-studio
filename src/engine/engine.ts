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
import { StylePass } from './post';
import { DEFAULT_RENDER_STYLE, type RenderStyle } from './styles';
import { disposeTree, setMaterialLook } from './toon';

export const FRAME_WIDTH = 1080;
export const FRAME_HEIGHT = 1920;

const MAX_POINT_LIGHTS = 4;
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
  /** veículo, cavalo ou assento onde o personagem está */
  seatedOn?: BuiltProp;
}

interface BuiltProp {
  object: PropObject;
  start: THREE.Vector3;
  end: THREE.Vector3;
  moves: boolean;
  distance: number;
  baseYaw: number;
}

interface BuiltScene {
  def: SceneDef;
  scene: THREE.Scene;
  environment: EnvironmentObject;
  characters: BuiltCharacter[];
  props: BuiltProp[];
}

const SEAT_SNAP_DISTANCE = 1.6;
const tmp = new THREE.Vector3();

export class SceneEngine {
  readonly canvas: HTMLCanvasElement;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly camera: THREE.PerspectiveCamera;
  private scenes: SceneDef[] = [];
  private built: BuiltScene | null = null;
  private readonly fallbackScene = new THREE.Scene();
  private readonly pass: StylePass;
  private style: RenderStyle = DEFAULT_RENDER_STYLE;

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
    this.pass = new StylePass(FRAME_WIDTH, FRAME_HEIGHT);
    this.setStyle(DEFAULT_RENDER_STYLE);
  }

  /** Troca o visual: materiais e contornos mudam, então a cena é remontada. */
  setStyle(style: RenderStyle): void {
    this.style = style;
    setMaterialLook(style.material);
    this.pass.setLook(style.post);
    this.disposeBuilt();
  }

  get styleId(): string {
    return this.style.id;
  }

  private draw(scene: THREE.Scene, t: number): void {
    if (!this.pass.active) {
      this.renderer.setRenderTarget(null);
      this.renderer.render(scene, this.camera);
      return;
    }
    this.renderer.setRenderTarget(this.pass.target);
    this.renderer.render(scene, this.camera);
    this.pass.render(this.renderer, t);
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
      this.draw(this.fallbackScene, t);
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
    // veículos e animais andam em velocidade constante, de position a targetPosition
    for (const p of built.props) {
      const group = p.object.group;
      group.position.lerpVectors(p.start, p.end, p.moves ? progress : 0);
      p.object.update?.(t, { moving: p.moves && progress < 1, distance: p.moves ? p.distance * progress : 0 });
    }

    let follow: { start: THREE.Vector3; current: THREE.Vector3 } | undefined;
    for (const c of built.characters) {
      const root = c.rig.root;
      let seatHeight: number | undefined;
      let moving = false;
      if (c.seatedOn?.object.seat) {
        // vai junto com o veículo/assento: posição do assento no mundo
        const group = c.seatedOn.object.group;
        const [sx, sy, sz] = c.seatedOn.object.seat.position;
        tmp.set(sx, 0, sz).multiply(group.scale).applyAxisAngle(THREE.Object3D.DEFAULT_UP, group.rotation.y);
        root.position.copy(group.position).add(tmp);
        root.rotation.y = group.rotation.y;
        seatHeight = (sy * group.scale.y) / root.scale.y;
        moving = c.seatedOn.moves && progress < 1;
      } else {
        // deslocamento linear: combina com o ciclo de passos em velocidade constante
        root.position.lerpVectors(c.start, c.end, c.moves ? progress : 0);
        root.rotation.y = c.facing;
      }
      poseCharacter(c.rig, c.animation, t, { restHeight: c.restHeight, seatHeight, moving });
      if (def.camera.movement === 'follow_character' && def.camera.target === c.id) {
        follow = { start: c.seatedOn ? c.seatedOn.start.clone().add(tmp) : c.start, current: root.position.clone() };
      }
    }

    const pose = computeCameraPose(def.camera, progress, follow, t);
    this.camera.position.copy(pose.position);
    this.camera.position.y = Math.max(0.3, this.camera.position.y);
    this.camera.lookAt(pose.lookAt);
    // os materiais da cena são do visual atual (setStyle remonta a cena)
    setMaterialLook(this.style.material);
    this.draw(built.scene, t);
  }

  private build(def: SceneDef, index: number): BuiltScene {
    setMaterialLook(this.style.material);
    const scene = new THREE.Scene();
    const seed = hashString(`${def.id}:${index}`);
    const environment = createEnvironment(def.environment.preset, def.environment, seed);
    scene.add(environment.group);
    scene.fog = environment.fog;
    scene.background = environment.fog.color.clone();

    let lights = 0;
    const props = def.props.map((p, i): BuiltProp => {
      const object = createProp(p.type, p.position, p.scale, p.color, {
        rotationY: p.rotationY,
        palette: environment.palette,
        seed: ((seed + i * 7919) % 1000) / 100,
        allowLight: lights < MAX_POINT_LIGHTS,
        night: environment.night,
      });
      if (object.usedLight) lights++;
      scene.add(object.group);
      const start = new THREE.Vector3(...p.position);
      const end = p.targetPosition ? new THREE.Vector3(...p.targetPosition) : start.clone();
      const moves = start.distanceTo(end) > 0.05;
      // quem anda olha para onde vai
      if (moves) object.group.rotation.y = Math.atan2(end.x - start.x, end.z - start.z);
      return { object, start, end, moves, distance: start.distanceTo(end), baseYaw: object.group.rotation.y };
    });
    const propById = new Map<string, BuiltProp>();
    def.props.forEach((p, i) => { if (p.id) propById.set(p.id, props[i]); });

    const beds = props.filter((p) => p.object.restHeight !== undefined);
    const seats = props.filter((p) => p.object.seat?.pose === 'sit' && !p.moves);
    const characters = def.characters.map((c): BuiltCharacter => {
      const rig = createCharacter(c);
      scene.add(rig.root);
      const start = new THREE.Vector3(...c.position);
      const end = c.targetPosition ? new THREE.Vector3(...c.targetPosition) : start.clone();
      const built: BuiltCharacter = { rig, start, end, moves: start.distanceTo(end) > 0.05, facing: 0, restHeight: 0, animation: c.animation, id: c.id };

      const mount = c.mount ? propById.get(c.mount) : undefined;
      if (mount?.object.seat) {
        built.seatedOn = mount;
        built.moves = false;
        // em cima de um veículo, a pose é a do assento (dirigir, montar, sentar); conversar continua valendo
        if (c.animation !== 'talk') built.animation = mount.object.seat.pose;
      } else if (c.animation === 'sit' || c.animation === 'drive' || c.animation === 'ride') {
        const seat = seats.find((s) => s.start.distanceTo(start) < SEAT_SNAP_DISTANCE);
        if (seat) built.seatedOn = seat;
        if (c.animation !== 'sit' && !seat) built.animation = 'sit';
      } else if (c.animation === 'sleep') {
        const bed = beds.find((b) => b.start.distanceTo(start) < BED_SNAP_DISTANCE);
        if (bed) {
          built.restHeight = bed.object.restHeight ?? 0;
          // alinha o corpo com a cama, senão ele fica atravessado
          start.copy(bed.start);
          end.copy(start);
          rig.root.userData.bedYaw = bed.object.group.rotation.y;
        }
      }
      return built;
    });

    // para onde cada um olha: na direção em que anda, ou meio virado para o vizinho
    for (const c of characters) {
      if (c.seatedOn) continue;
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
    this.pass.dispose();
    this.renderer.dispose();
  }
}
