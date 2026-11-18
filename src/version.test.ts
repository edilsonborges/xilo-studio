import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import { parseChangelog } from './changelog.js';

test('modal de novidades: lê o CHANGELOG real, com a versão atual no topo', () => {
  const releases = parseChangelog(readFileSync(new URL('../CHANGELOG.md', import.meta.url), 'utf8'));
  const version = readFileSync(new URL('../VERSION', import.meta.url), 'utf8').trim();
  assert.equal(releases[0].version, version);
  assert.ok(releases.length >= 4);
  for (const release of releases) {
    assert.match(release.date, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(release.sections.length > 0, release.version);
    for (const section of release.sections) assert.ok(section.items.length > 0, `${release.version} ${section.title}`);
  }
});

test('modal de novidades: junta linhas quebradas e sub-itens no item certo', () => {
  const [release] = parseChangelog('## [1.2.3] - 2026-01-02\n\nIntro.\n\n### Adicionado\n\n- Primeiro item\n  continua aqui.\n  - **Sub:** detalhe.\n- Segundo.\n');
  assert.deepEqual(release.intro, ['Intro.']);
  assert.deepEqual(release.sections[0].items, ['Primeiro item continua aqui. **Sub:** detalhe.', 'Segundo.']);
});
