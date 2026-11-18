// Clique na versão: abre as novidades (o CHANGELOG.md, embutido no build).

import changelog from '../CHANGELOG.md?raw';
import { parseChangelog, type Release } from './changelog';

/** Texto com **negrito** e `código` vira nós do DOM, sem innerHTML. */
function rich(target: HTMLElement, text: string): void {
  for (const piece of text.split(/(\*\*[^*]+\*\*|`[^`]+`)/)) {
    if (!piece) continue;
    if (piece.startsWith('**')) {
      const strong = document.createElement('strong');
      strong.textContent = piece.slice(2, -2);
      target.append(strong);
    } else if (piece.startsWith('`')) {
      const code = document.createElement('code');
      code.textContent = piece.slice(1, -1);
      target.append(code);
    } else {
      target.append(piece.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1'));
    }
  }
}

const formatDate = (iso: string): string => {
  const [y, m, d] = iso.split('-');
  return y && m && d ? `${d}/${m}/${y}` : iso;
};

function build(releases: Release[]): HTMLDialogElement {
  const dialog = document.createElement('dialog');
  dialog.id = 'whats-new';
  const box = document.createElement('div');
  box.className = 'whats-new';
  const title = document.createElement('h2');
  title.textContent = 'Novidades do Xilo';
  box.append(title);
  releases.forEach((release, index) => {
    const block = document.createElement('section');
    block.className = 'release';
    const head = document.createElement('h3');
    head.textContent = `Versão ${release.version}`;
    if (index === 0) {
      const tag = document.createElement('span');
      tag.className = 'tag tag-admin';
      tag.textContent = 'atual';
      head.append(' ', tag);
    }
    const when = document.createElement('span');
    when.className = 'release-date';
    when.textContent = formatDate(release.date);
    head.append(when);
    block.append(head);
    for (const line of release.intro) {
      const p = document.createElement('p');
      p.className = 'hint';
      rich(p, line);
      block.append(p);
    }
    for (const section of release.sections) {
      const label = document.createElement('h4');
      label.textContent = section.title;
      const list = document.createElement('ul');
      for (const item of section.items) {
        const li = document.createElement('li');
        rich(li, item);
        list.append(li);
      }
      block.append(label, list);
    }
    box.append(block);
  });
  const actions = document.createElement('div');
  actions.className = 'dialog-actions';
  const spacer = document.createElement('span');
  spacer.className = 'spacer';
  const close = document.createElement('button');
  close.className = 'btn btn-primary';
  close.type = 'button';
  close.textContent = 'Fechar';
  close.addEventListener('click', () => dialog.close());
  actions.append(spacer, close);
  box.append(actions);
  dialog.append(box);
  // clique fora da caixa fecha
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) dialog.close();
  });
  document.body.append(dialog);
  return dialog;
}

export function initVersionModal(): void {
  const badge = document.getElementById('app-version');
  if (!badge) return;
  let dialog: HTMLDialogElement | null = null;
  badge.addEventListener('click', () => {
    dialog ??= build(parseChangelog(changelog));
    dialog.showModal();
    dialog.scrollTop = 0;
  });
}
