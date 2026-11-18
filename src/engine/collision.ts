// Varredura contínua da caixa ao longo da trajetória. O resultado é calculado
// na montagem da cena, inclusive quando o primeiro quadro já nasce numa parede.
import { Box3, Ray, Vector3 } from 'three';

export function constrainTravel(start: Vector3, end: Vector3, body: Box3, obstacles: Box3[], occupiedStarts: Box3[] = []): number {
  const offset = end.clone().sub(start);
  const distance = offset.length();
  if (distance === 0 || (!obstacles.length && !occupiedStarts.length)) return 1;
  const direction = offset.clone().normalize();
  const localMin = body.min.clone().sub(start);
  const localMax = body.max.clone().sub(start);
  const expand = (wall: Box3) => new Box3(
    wall.min.clone().sub(localMax), wall.max.clone().sub(localMin),
  ).expandByScalar(0.015);
  const walls = obstacles.map(expand);
  const occupied = [...walls, ...occupiedStarts.map(expand)];

  // Sai de uma sobreposição inicial pelo lado da via. Deslocamos o percurso
  // inteiro para manter a orientação e o vínculo entre passageiro e veículo.
  if (occupied.some(wall => wall.containsPoint(start))) {
    const side = new Vector3(direction.z, 0, -direction.x).normalize();
    if (!side.lengthSq()) side.set(1, 0, 0);
    const escape = (axis: Vector3) => {
      const point = start.clone();
      for (;;) {
        const wall = occupied.find(box => box.containsPoint(point));
        if (!wall) return point;
        new Ray(point.clone(), axis).intersectBox(wall, point);
        point.addScaledVector(axis, 0.001);
      }
    };
    const right = escape(side);
    const left = escape(side.negate());
    start.copy(start.distanceToSquared(right) < start.distanceToSquared(left) ? right : left);
    end.copy(start).add(offset);
  }

  const ray = new Ray(start, direction);
  const hit = new Vector3();
  let limit = distance;
  for (const wall of walls) {
    if (ray.intersectBox(wall, hit)) limit = Math.min(limit, start.distanceTo(hit));
  }
  return limit / distance;
}

// Um trajeto pode parar numa parede ou mudar de velocidade numa deixa do
// personagem. Dentro de cada trecho, a velocidade relativa é constante.
export interface MotionBody {
  path: { start: Vector3; end: Vector3; travelLimit: number };
  bounds: Box3; // caixa mundial no início do trajeto
  progress: (time: number) => number; // tempo normalizado da cena
  cues: number[];
}

function firstContact(a: MotionBody, b: MotionBody, since: number): number | undefined {
  const marks = [...new Set([since, 1, ...a.cues, ...b.cues])].filter(t => t >= since && t <= 1).sort((x, y) => x - y);
  const da = a.path.end.clone().sub(a.path.start);
  const db = b.path.end.clone().sub(b.path.start);
  const expanded = new Box3(b.bounds.min.clone().sub(a.bounds.max), b.bounds.max.clone().sub(a.bounds.min));
  const relative = (time: number) => da.clone().multiplyScalar(Math.min(a.progress(time), a.path.travelLimit))
    .addScaledVector(db, -Math.min(b.progress(time), b.path.travelLimit));
  for (let i = 1; i < marks.length; i++) {
    const from = marks[i - 1];
    const to = marks[i];
    const times = [from, to];
    for (const body of [a, b]) {
      const p = body.progress(from);
      const q = body.progress(to);
      const limit = body.path.travelLimit;
      if (p < limit && limit < q) times.push(from + (to - from) * (limit - p) / (q - p));
    }
    times.sort((x, y) => x - y);
    for (let j = 1; j < times.length; j++) {
      const start = relative(times[j - 1]);
      const delta = relative(times[j]).sub(start);
      const distance = delta.length();
      if (distance < 1e-9) continue;
      const hit = new Ray(start, delta.divideScalar(distance)).intersectBox(expanded, new Vector3());
      if (!hit) continue;
      const fraction = hit.distanceTo(start) / distance;
      if (fraction > 1) continue;
      const t = times[j - 1] + (times[j] - times[j - 1]) * fraction;
      if (a.progress(t) < a.path.travelLimit - 1e-9 || b.progress(t) < b.path.travelLimit - 1e-9) return t;
    }
  }
}

// Resolve primeiro o contato mais cedo. Um veículo já parado continua sendo
// obstáculo para quem vem atrás. Só a montagem da cena executa este cálculo.
export function stopAtContacts(bodies: MotionBody[]): void {
  let since = 0;
  for (;;) {
    let earliest = Infinity;
    let pair: MotionBody[] = [];
    for (const [i, a] of bodies.entries()) {
      for (let j = i + 1; j < bodies.length; j++) {
        const b = bodies[j];
        if (a.progress(since) >= a.path.travelLimit && b.progress(since) >= b.path.travelLimit) continue;
        const t = firstContact(a, b, since);
        if (t !== undefined && t < earliest) {
          earliest = t;
          pair = [a, b];
        }
      }
    }
    if (!pair.length) return;
    for (const body of pair) body.path.travelLimit = Math.min(body.path.travelLimit, body.progress(earliest));
    since = earliest;
  }
}
