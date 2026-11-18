import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Box3, Vector3 } from 'three';
import { constrainTravel, stopAtContacts, type MotionBody } from './collision';

const box = (x: number, z: number, width: number, depth: number) =>
  new Box3(new Vector3(x - width / 2, 0, z - depth / 2), new Vector3(x + width / 2, 3, z + depth / 2));

test('carro para pela dianteira mesmo quando o destino já passou da fachada', () => {
  const start = new Vector3(0, 0, 10);
  const end = new Vector3(0, 0, -20);
  const wall = box(0, 0, 4, 2);
  const car = box(0, 10, 2, 4);
  const limit = constrainTravel(start, end, car, [wall]);
  const front = start.clone().lerp(end, limit).z - 2;
  assert.ok(front > wall.max.z && front < wall.max.z + 0.02);
  assert.equal(constrainTravel(start, end, car, [box(5, 0, 4, 2)]), 1);
});

test('corrige o início dentro de prédios contíguos e preserva o sentido do percurso', () => {
  const start = new Vector3();
  const end = new Vector3(0, 0, -15);
  const walls = [box(0, 0, 5, 5), box(4, 0, 4, 5)];
  const limit = constrainTravel(start, end, box(0, 0, 2, 4), walls);
  assert.equal(limit, 1);
  assert.equal(start.x, end.x);
  for (const wall of walls) assert.equal(wall.intersectsBox(box(start.x, start.z, 2, 4)), false);
});


function driver(from: number, to: number, lane = 0, travelLimit = 1): MotionBody {
  return {
    path: { start: new Vector3(lane, 0, from), end: new Vector3(lane, 0, to), travelLimit },
    bounds: box(lane, from, 2, 4), progress: t => t, cues: [],
  };
}

test('dois carros em sentidos opostos param ao contato; faixas paralelas ficam livres', () => {
  const a = driver(-10, 10), b = driver(10, -10), c = driver(-10, 10, 3);
  stopAtContacts([a, b, c]);
  assert.ok(Math.abs(a.path.travelLimit - 0.4) < 1e-8);
  assert.equal(a.path.travelLimit, b.path.travelLimit);
  assert.equal(c.path.travelLimit, 1);
});

test('fila para em sequência atrás do primeiro veículo já limitado por uma fachada', () => {
  const first = driver(0, 10, 0, 0.2), second = driver(-6, 4), third = driver(-12, -2);
  stopAtContacts([third, first, second]);
  assert.ok(Math.abs(second.path.travelLimit - 0.4) < 1e-8);
  assert.ok(Math.abs(third.path.travelLimit - 0.6) < 1e-8);
});

test('considera a pausa do pedestre antes da deixa de andar', () => {
  const car = driver(-8, 8);
  const person = driver(0, 10);
  person.cues = [0.5];
  person.progress = t => Math.max(0, (t - 0.5) * 2);
  stopAtContacts([person, car]);
  assert.equal(car.path.travelLimit, 0.25);
  assert.equal(person.path.travelLimit, 0);
});
