// Seletor de estilo com imagem de exemplo. O <select> original continua sendo a
// fonte da verdade (valor e evento "change"); este módulo só troca a aparência.

const thumbs = import.meta.glob('./assets/styles/*.jpg', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;

/** "xilogravura" → ia-xilogravura.jpg; "3d-noir" → 3d-noir.jpg */
export function thumbFor(value: string): string | undefined {
  const file = value.startsWith('3d-') ? value : `ia-${value}`;
  return thumbs[`./assets/styles/${file}.jpg`];
}

function picture(value: string, label: string): HTMLElement {
  const url = thumbFor(value);
  if (!url) {
    const empty = document.createElement('span');
    empty.className = 'style-thumb style-thumb-empty';
    empty.textContent = label.slice(0, 1);
    return empty;
  }
  const img = document.createElement('img');
  img.className = 'style-thumb';
  img.src = url;
  img.alt = `Exemplo do estilo ${label}`;
  img.loading = 'lazy';
  img.width = 240;
  img.height = 427;
  return img;
}

export function initStylePicker(select: HTMLSelectElement, button: HTMLButtonElement): void {
  const dialog = document.createElement('dialog');
  dialog.className = 'style-dialog';
  const box = document.createElement('div');
  box.className = 'whats-new';
  const title = document.createElement('h2');
  title.textContent = 'Estilo do vídeo';
  box.append(title);
  const cards = new Map<string, HTMLButtonElement>();

  for (const group of select.querySelectorAll('optgroup')) {
    const heading = document.createElement('h3');
    heading.className = 'style-group';
    heading.textContent = group.label;
    const grid = document.createElement('div');
    grid.className = 'style-grid';
    for (const option of group.querySelectorAll('option')) {
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'style-card';
      const name = document.createElement('span');
      name.textContent = option.textContent ?? option.value;
      card.append(picture(option.value, name.textContent), name);
      card.addEventListener('click', () => {
        select.value = option.value;
        select.dispatchEvent(new Event('change'));
        dialog.close();
      });
      cards.set(option.value, card);
      grid.append(card);
    }
    box.append(heading, grid);
  }
  dialog.append(box);
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) dialog.close();
  });
  document.body.append(dialog);

  const refresh = (): void => {
    const option = select.selectedOptions[0];
    if (!option) return;
    const label = option.textContent ?? option.value;
    const text = document.createElement('span');
    text.className = 'style-current';
    const strong = document.createElement('strong');
    strong.textContent = label;
    const group = document.createElement('small');
    group.textContent = (option.parentElement as HTMLOptGroupElement | null)?.label ?? '';
    text.append(strong, group);
    const change = document.createElement('span');
    change.className = 'style-change';
    change.textContent = 'Trocar';
    button.replaceChildren(picture(option.value, label), text, change);
    for (const [value, card] of cards) card.classList.toggle('selected', value === option.value);
  };
  select.addEventListener('change', refresh);
  button.addEventListener('click', () => {
    dialog.showModal();
    cards.get(select.value)?.scrollIntoView({ block: 'center' });
  });
  refresh();
}
