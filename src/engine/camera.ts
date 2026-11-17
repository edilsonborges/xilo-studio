// Módulo 4: câmera em função do progresso da cena (0 a 1). Sem estado: o
// mesmo progresso devolve sempre a mesma pose.

import * as THREE from 'three';
import type { CameraDef, Vec3 } from '../types';
import { easeInOut, lerp } from '../util';

export interface CameraPose {
  position: THREE.Vector3;
  lookAt: THREE.Vector3;
}

export interface FollowTarget {
  /** posição do personagem no início da cena */
  start: THREE.Vector3;
  /** posição do personagem agora */
  current: THREE.Vector3;
}

const v = (a: Vec3): THREE.Vector3 => new THREE.Vector3(a[0], a[1], a[2]);

const ORBIT_DEFAULT_SWEEP = 0.8;

export function computeCameraPose(def: CameraDef, progress: number, follow?: FollowTarget, t = 0): CameraPose {
  const e = easeInOut(progress);
  const start = v(def.startPos);
  const end = v(def.endPos);
  const look = v(def.lookAt);

  switch (def.movement) {
    case 'static':
      return { position: start, lookAt: look };

    case 'zoom_in':
    case 'zoom_out':
      return { position: start.lerp(end, e), lookAt: look };

    case 'pan_left':
    case 'pan_right': {
      // travelling lateral: o alvo acompanha metade do deslocamento, o que dá paralaxe
      const delta = end.clone().sub(start);
      return {
        position: start.clone().addScaledVector(delta, e),
        lookAt: look.addScaledVector(delta, e * 0.5),
      };
    }

    case 'orbit': {
      // gira em torno do alvo, do ângulo de startPos ao de endPos
      const a = start.clone().sub(look);
      const b = end.clone().sub(look);
      const r0 = Math.hypot(a.x, a.z);
      const r1 = Math.hypot(b.x, b.z);
      const ang0 = Math.atan2(a.x, a.z);
      let sweep = Math.atan2(b.x, b.z) - ang0;
      if (sweep > Math.PI) sweep -= Math.PI * 2;
      if (sweep < -Math.PI) sweep += Math.PI * 2;
      if (Math.abs(sweep) < 0.05 || r1 < 0.1) sweep = ORBIT_DEFAULT_SWEEP;
      const radius = r1 < 0.1 ? r0 : lerp(r0, r1, e);
      const angle = ang0 + sweep * e;
      return {
        position: new THREE.Vector3(
          look.x + Math.sin(angle) * radius,
          look.y + lerp(a.y, r1 < 0.1 ? a.y : b.y, e),
          look.z + Math.cos(angle) * radius,
        ),
        lookAt: look,
      };
    }

    case 'crane_up':
    case 'crane_down': {
      // grua: sobe (ou desce) e o olhar acompanha um pouco, revelando o cenário
      const lift = def.movement === 'crane_up' ? 0.9 : -0.6;
      return { position: start.lerp(end, e), lookAt: look.add(new THREE.Vector3(0, lift * e, 0)) };
    }

    case 'handheld': {
      // câmera na mão: tremor suave feito de senos, igual a cada vez que t se repete
      const shake = new THREE.Vector3(
        0.07 * Math.sin(t * 1.9) + 0.03 * Math.sin(t * 5.3),
        0.05 * Math.sin(t * 2.3 + 1) + 0.02 * Math.sin(t * 6.1),
        0.04 * Math.sin(t * 1.4 + 2),
      );
      return {
        position: start.lerp(end, e).add(shake),
        lookAt: look.add(shake.clone().multiplyScalar(0.4)),
      };
    }

    case 'follow_character': {
      if (!follow) return { position: start, lookAt: look };
      // mantém o enquadramento inicial e desloca tudo junto com o personagem
      const travel = follow.current.clone().sub(follow.start);
      return {
        position: start.add(travel),
        lookAt: new THREE.Vector3(follow.current.x, follow.current.y + 1.15, follow.current.z),
      };
    }
  }
}
