import assert from 'node:assert/strict';
import { test } from 'node:test';
import { RENDER_STYLES, STYLE_CATEGORIES, renderStyle } from './styles.js';

const HEX = /^#[0-9a-f]{6}$/i;

test('30 visuais 3D, 5 em cada uma das 6 categorias, com ids únicos', () => {
  assert.equal(RENDER_STYLES.length, 30);
  assert.equal(STYLE_CATEGORIES.length, 6);
  for (const category of STYLE_CATEGORIES) {
    assert.equal(RENDER_STYLES.filter((s) => s.category === category).length, 5, category);
  }
  assert.equal(new Set(RENDER_STYLES.map((s) => s.id)).size, 30);
  assert.equal(new Set(RENDER_STYLES.map((s) => s.label)).size, 30);
});

test('cores e parâmetros dos visuais são válidos', () => {
  for (const style of RENDER_STYLES) {
    assert.match(style.material.outlineColor, HEX, style.id);
    assert.ok(style.material.outline >= 0, style.id);
    assert.ok(style.description.length > 20, style.id);
    const { palette = [], tint, edgeColor, paperColor } = style.post;
    assert.ok(palette.length <= 4, style.id);
    for (const hex of palette) assert.match(hex, HEX, style.id);
    if (tint) assert.match(tint, HEX, style.id);
    if (paperColor) assert.match(paperColor, HEX, style.id);
    if (edgeColor && edgeColor !== 'glow') assert.match(edgeColor, HEX, style.id);
  }
});

test('o primeiro visual é o original, sem pós-processamento, e é o padrão', () => {
  assert.equal(RENDER_STYLES[0].id, 'xilogravura');
  assert.deepEqual(RENDER_STYLES[0].post, {});
  assert.equal(renderStyle('nao-existe').id, 'xilogravura');
  assert.equal(renderStyle('noir').label, 'Noir');
});
