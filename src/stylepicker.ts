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

interface PickerOptions {
  title: string;
  preview?: (option: HTMLOptionElement) => HTMLElement;
}

export function bindPickerDialog(select: HTMLSelectElement, button: HTMLButtonElement, options: PickerOptions): void {
  const preview = options.preview ?? (option => picture(option.value, option.text));
  const dialog = document.createElement('dialog');
  dialog.className = 'style-dialog';
  dialog.id = `${select.id}-dialog`;
  dialog.setAttribute('aria-labelledby', `${dialog.id}-title`);
  button.setAttribute('aria-controls', dialog.id);
  const box = document.createElement('div');
  box.className = 'whats-new';
  const head = document.createElement('div');
  head.className = 'picker-head';
  const title = document.createElement('h2');
  title.id = `${dialog.id}-title`;
  title.textContent = options.title;
  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'btn';
  close.textContent = 'Fechar';
  close.addEventListener('click', () => dialog.close());
  head.append(title, close);
  dialog.append(box);
  document.body.append(dialog);

  button.addEventListener('click', () => {
    box.replaceChildren(head);
    let group: Element | null = null;
    let grid = document.createElement('div');
    let selected: HTMLButtonElement | undefined;
    for (const option of select.options) {
      if (option.parentElement !== group) {
        group = option.parentElement;
        if (group instanceof HTMLOptGroupElement) {
          const heading = document.createElement('h3');
          heading.className = 'style-group';
          heading.textContent = group.label;
          box.append(heading);
        }
        grid = document.createElement('div');
        grid.className = options.preview ? 'style-grid picker-grid-wide' : 'style-grid';
        box.append(grid);
      }
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'style-card';
      card.disabled = option.disabled;
      card.setAttribute('aria-pressed', String(option.selected));
      if (option.selected) {
        selected = card;
        card.classList.add('selected');
      }
      const name = document.createElement('strong');
      name.textContent = option.dataset.title || option.text;
      card.append(preview(option), name);
      if (option.dataset.detail) {
        const detail = document.createElement('small');
        detail.textContent = option.dataset.detail;
        card.append(detail);
      }
      card.addEventListener('click', () => {
        if (!select.disabled) {
          select.value = option.value;
          select.dispatchEvent(new Event('change'));
        }
        dialog.close();
      });
      grid.append(card);
    }
    dialog.showModal();
    selected?.focus({ preventScroll: true });
    selected?.scrollIntoView({ block: 'nearest' });
  });
  dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
}

export function initStylePicker(select: HTMLSelectElement, button: HTMLButtonElement, options: PickerOptions = { title: 'Estilo do vídeo' }): () => void {
  const preview = options.preview ?? (option => picture(option.value, option.text));
  bindPickerDialog(select, button, options);
  const refresh = (): void => {
    const option = select.selectedOptions[0];
    button.disabled = select.disabled || !option;
    if (!option) {
      button.textContent = options.title;
      return;
    }
    const text = document.createElement('span');
    text.className = 'style-current';
    const strong = document.createElement('strong');
    strong.textContent = option.dataset.title || option.text;
    const detail = document.createElement('small');
    detail.textContent = option.dataset.detail || (option.parentElement instanceof HTMLOptGroupElement ? option.parentElement.label : options.title);
    text.append(strong, detail);
    const change = document.createElement('span');
    change.className = 'style-change';
    change.textContent = 'Trocar';
    button.replaceChildren(preview(option), text, change);
    button.setAttribute('aria-label', `${options.title}: ${option.text}. Trocar`);
  };

  select.addEventListener('change', refresh);
  refresh();
  return refresh;
}
