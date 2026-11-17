import './style.css';
import './auth/auth.css';

import { ApiError, api, currentUser, logout, type User } from './auth/api';

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
}

start().catch(() => notify('error', 'Não foi possível carregar os usuários.'));
