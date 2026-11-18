import './style.css';
import './auth/auth.css';

import { ApiError, api, currentUser, logout, type User } from './auth/api';
import { initVersionModal } from './version';

interface UserSummary extends User {
  hasPassword: boolean;
  createdAt: number;
  lastLoginAt: number | null;
  pendingLinkExpiresAt: number | null;
}

const form = document.getElementById('invite-form') as HTMLFormElement;
const tbody = document.getElementById('users') as HTMLTableSectionElement;
const mailOff = document.getElementById('mail-off') as HTMLElement;
const formError = form.querySelector<HTMLElement>('.auth-error')!;
const formOk = form.querySelector<HTMLElement>('.auth-ok')!;
let me: User | null = null;

const dateFormat = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
const when = (ms: number | null): string => (ms ? dateFormat.format(ms) : 'Nunca');

function notify(kind: 'error' | 'ok', text: string): void {
  formError.hidden = kind !== 'error';
  formOk.hidden = kind !== 'ok';
  (kind === 'error' ? formError : formOk).textContent = text;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, text = '', className = ''): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (text) node.textContent = text;
  if (className) node.className = className;
  return node;
}

function status(user: UserSummary): HTMLElement {
  const cell = el('td');
  if (user.admin) cell.append(el('span', 'Admin', 'tag tag-admin'), ' ');
  if (user.hasPassword) cell.append(el('span', 'Ativo', 'tag'));
  else if (user.pendingLinkExpiresAt) cell.append(el('span', `Convite até ${when(user.pendingLinkExpiresAt)}`, 'tag tag-wait'));
  else cell.append(el('span', 'Sem senha', 'tag tag-wait'));
  return cell;
}

function actions(user: UserSummary): HTMLElement {
  const cell = el('td', '', 'actions');
  const send = el('button', user.hasPassword ? 'Enviar link de senha' : 'Reenviar convite', 'btn');
  send.type = 'button';
  send.addEventListener('click', async () => {
    send.disabled = true;
    try {
      await api(`/api/admin/users/${user.id}/link`, 'POST');
      notify('ok', `Link enviado para ${user.email}.`);
      await load();
    } catch (error) {
      notify('error', error instanceof ApiError ? error.message : 'Sem conexão com o servidor.');
    } finally {
      send.disabled = false;
    }
  });
  cell.append(send);
  if (!user.admin && user.id !== me?.id) {
    const remove = el('button', 'Remover', 'btn');
    remove.type = 'button';
    remove.addEventListener('click', async () => {
      if (!confirm(`Remover o acesso de ${user.name} (${user.email})? A pessoa sai na hora.`)) return;
      remove.disabled = true;
      try {
        await api(`/api/admin/users/${user.id}`, 'DELETE');
        notify('ok', `${user.email} não tem mais acesso.`);
        await load();
      } catch (error) {
        notify('error', error instanceof ApiError ? error.message : 'Sem conexão com o servidor.');
        remove.disabled = false;
      }
    });
    cell.append(remove);
  }
  return cell;
}

async function load(): Promise<void> {
  const { users, emailEnabled } = await api<{ users: UserSummary[]; emailEnabled: boolean }>('/api/admin/users');
  mailOff.hidden = emailEnabled;
  tbody.replaceChildren(...users.map((user) => {
    const row = el('tr');
    row.append(el('td', user.name), el('td', user.email), status(user), el('td', when(user.lastLoginAt)), actions(user));
    return row;
  }));
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const button = form.querySelector<HTMLButtonElement>('button[type=submit]')!;
  const name = (form.elements.namedItem('name') as HTMLInputElement).value;
  const email = (form.elements.namedItem('email') as HTMLInputElement).value;
  button.disabled = true;
  try {
    const result = await api<{ user: User; emailSent: boolean }>('/api/admin/users', 'POST', { name, email });
    form.reset();
    if (result.emailSent) notify('ok', `Convite enviado para ${result.user.email}.`);
    else notify('error', `${result.user.email} foi cadastrado, mas o e-mail não saiu. Use "Reenviar convite".`);
    await load();
  } catch (error) {
    notify('error', error instanceof ApiError ? error.message : 'Sem conexão com o servidor.');
  } finally {
    button.disabled = false;
  }
});

document.getElementById('logout')!.addEventListener('click', () => void logout());
initVersionModal();

// ---------- atividade ----------

interface ActivityEvent {
  id: number;
  at: number;
  email: string;
  name: string;
  kind: string;
  status: 'ok' | 'fail' | 'info';
  detail: Record<string, string | number | boolean | null>;
}

interface Summary {
  email: string;
  name: string;
  videos: number;
  exports: number;
  narrations: number;
  images: number;
  failures: number;
  lastAt: number;
}

const KINDS: Record<string, string> = {
  login: 'Entrou',
  logout: 'Saiu',
  password_link: 'Pediu link de senha',
  password_set: 'Definiu a senha',
  narration: 'Gerou narração',
  ai_text: 'IA: direção das cenas',
  ai_image: 'IA: imagem',
  video_generated: 'Gerou vídeo',
  video_exported: 'Exportou vídeo',
  generation_failed: 'Falha ao gerar',
  export_failed: 'Falha ao exportar',
  sample_story: 'Pediu exemplo de roteiro',
  script_improved: 'Melhorou o texto',
  user_invited: 'Convidou pessoa',
  user_removed: 'Removeu pessoa',
};

const eventsBody = document.getElementById('events') as HTMLTableSectionElement;
const summaryBody = document.getElementById('summary') as HTMLTableSectionElement;
const filterEmail = document.getElementById('filter-email') as HTMLSelectElement;
const filterKind = document.getElementById('filter-kind') as HTMLSelectElement;
const moreButton = document.getElementById('more-events') as HTMLButtonElement;
const PAGE = 100;
let oldest = 0;

for (const [kind, label] of Object.entries(KINDS)) filterKind.append(new Option(label, kind));

function detailCell(detail: ActivityEvent['detail']): HTMLElement {
  const cell = el('td', '', 'detail');
  const entries = Object.entries(detail).filter(([, value]) => value !== null && value !== '');
  entries.filter(([key]) => key !== 'roteiro').forEach(([key, value], i) => {
    if (i) cell.append(' · ');
    cell.append(el('b', `${key}: `), String(value));
  });
  const script = detail.roteiro;
  if (typeof script === 'string' && script) {
    const box = el('span', script, 'script');
    box.title = 'Clique para ver o roteiro inteiro';
    box.addEventListener('click', () => box.classList.toggle('open'));
    cell.append(box);
  }
  return cell;
}

function eventRow(event: ActivityEvent): HTMLTableRowElement {
  const row = el('tr');
  const result = el('td');
  result.append(el('span', event.status === 'ok' ? 'Deu certo' : event.status === 'fail' ? 'Falhou' : 'Registro', `tag ${event.status === 'ok' ? 'tag-ok' : event.status === 'fail' ? 'tag-fail' : ''}`));
  const who = el('td', event.name || event.email || '—');
  if (event.name && event.email) who.title = event.email;
  row.append(el('td', when(event.at), 'when'), who, el('td', KINDS[event.kind] ?? event.kind), result, detailCell(event.detail));
  return row;
}

async function loadEvents(reset: boolean): Promise<void> {
  const params = new URLSearchParams({ limit: String(PAGE) });
  if (!reset && oldest) params.set('before', String(oldest));
  if (filterEmail.value) params.set('email', filterEmail.value);
  if (filterKind.value) params.set('kind', filterKind.value);
  const data = await api<{ events: ActivityEvent[]; summary?: Summary[] }>(`/api/admin/events?${params}`);
  if (reset) eventsBody.replaceChildren();
  eventsBody.append(...data.events.map(eventRow));
  if (reset && data.events.length === 0) {
    const empty = el('tr');
    const cell = el('td', 'Nenhuma atividade registrada com esse filtro.');
    cell.colSpan = 5;
    empty.append(cell);
    eventsBody.append(empty);
  }
  oldest = data.events.at(-1)?.id ?? oldest;
  moreButton.hidden = data.events.length < PAGE;
  if (data.summary) {
    summaryBody.replaceChildren(...data.summary.map((s) => {
      const row = el('tr');
      const person = el('td', s.name || s.email);
      person.title = s.email;
      row.append(person, ...[s.videos, s.exports, s.narrations, s.images, s.failures].map((n) => el('td', String(n), 'num')), el('td', when(s.lastAt), 'when'));
      return row;
    }));
    const chosen = filterEmail.value;
    filterEmail.replaceChildren(new Option('Todas as pessoas', ''), ...data.summary.map((s) => new Option(s.name ? `${s.name} (${s.email})` : s.email, s.email)));
    filterEmail.value = chosen;
  }
}

for (const select of [filterEmail, filterKind]) {
  select.addEventListener('change', () => void loadEvents(true).catch(() => notify('error', 'Não foi possível carregar a atividade.')));
}
moreButton.addEventListener('click', () => void loadEvents(false));

async function start(): Promise<void> {
  me = (await currentUser()).user;
  if (!me) {
    location.replace('/login');
    return;
  }
  if (!me.admin) {
    location.replace('/');
    return;
  }
  await load();
  await loadEvents(true);
}

start().catch(() => notify('error', 'Não foi possível carregar os usuários.'));
