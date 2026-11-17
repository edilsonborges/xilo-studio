import './style.css';
import './auth/auth.css';

import { ApiError, api, currentUser } from './auth/api';

type View = 'login' | 'forgot' | 'set';

const forms: Record<View, HTMLFormElement> = {
  login: document.getElementById('login-form') as HTMLFormElement,
  forgot: document.getElementById('forgot-form') as HTMLFormElement,
  set: document.getElementById('set-form') as HTMLFormElement,
};

let linkToken = '';

function show(view: View): void {
  for (const [name, form] of Object.entries(forms)) form.hidden = name !== view;
  forms[view].querySelector<HTMLInputElement>('input:not([hidden])')?.focus();
}

function message(form: HTMLFormElement, kind: 'error' | 'ok', text: string): void {
  const error = form.querySelector<HTMLElement>('.auth-error');
  const ok = form.querySelector<HTMLElement>('.auth-ok');
  if (error) { error.hidden = kind !== 'error' || !text; error.textContent = kind === 'error' ? text : ''; }
  if (ok) { ok.hidden = kind !== 'ok' || !text; ok.textContent = kind === 'ok' ? text : ''; }
}

const field = (form: HTMLFormElement, name: string): string =>
  (form.elements.namedItem(name) as HTMLInputElement).value;

async function submit(form: HTMLFormElement, work: () => Promise<void>): Promise<void> {
  const button = form.querySelector<HTMLButtonElement>('button[type=submit]')!;
  button.disabled = true;
  message(form, 'error', '');
  try {
    await work();
  } catch (error) {
    message(form, 'error', error instanceof ApiError ? error.message : 'Sem conexão com o servidor.');
  } finally {
    button.disabled = false;
  }
}

const enter = (): void => location.replace('/');

forms.login.addEventListener('submit', (event) => {
  event.preventDefault();
  void submit(forms.login, async () => {
    await api('/api/auth/login', 'POST', { email: field(forms.login, 'email'), password: field(forms.login, 'password') });
    enter();
  });
});

forms.forgot.addEventListener('submit', (event) => {
  event.preventDefault();
  void submit(forms.forgot, async () => {
    await api('/api/auth/password/forgot', 'POST', { email: field(forms.forgot, 'email') });
    message(forms.forgot, 'ok', 'Pronto. Se esse e-mail tiver acesso, o link chega em instantes. Veja também o spam.');
  });
});

forms.set.addEventListener('submit', (event) => {
  event.preventDefault();
  if (field(forms.set, 'password') !== field(forms.set, 'confirm')) {
    message(forms.set, 'error', 'As duas senhas não são iguais.');
    return;
  }
  void submit(forms.set, async () => {
    await api('/api/auth/password/set', 'POST', { token: linkToken, password: field(forms.set, 'password') });
    enter();
  });
});

for (const button of document.querySelectorAll<HTMLButtonElement>('[data-go]')) {
  button.addEventListener('click', () => {
    const target = button.dataset.go as View;
    const email = field(forms.login, 'email') || field(forms.forgot, 'email');
    (forms.forgot.elements.namedItem('email') as HTMLInputElement).value = email;
    (forms.login.elements.namedItem('email') as HTMLInputElement).value = email;
    message(forms[target], 'error', '');
    show(target);
  });
}

async function start(): Promise<void> {
  const token = new URLSearchParams(location.hash.slice(1)).get('token');
  if (token) {
    // Tira o token da barra de endereço e do histórico.
    history.replaceState(null, '', location.pathname);
    linkToken = token;
    show('set');
    try {
      const info = await api<{ email: string; name: string; purpose: 'invite' | 'reset' }>(
        '/api/auth/password/check', 'POST', { token },
      );
      document.getElementById('set-title')!.textContent = info.purpose === 'invite' ? `Bem-vindo, ${info.name}!` : 'Trocar senha';
      document.getElementById('set-hint')!.textContent = `Crie a senha para ${info.email}.`;
      (forms.set.elements.namedItem('username') as HTMLInputElement).value = info.email;
    } catch (error) {
      message(forms.set, 'error', error instanceof ApiError ? error.message : 'Sem conexão com o servidor.');
      forms.set.querySelector<HTMLButtonElement>('button[type=submit]')!.disabled = true;
    }
    return;
  }
  show('login');
  try {
    if ((await currentUser()).user) enter();
  } catch {
    // Sem servidor: o formulário mostra o erro quando a pessoa tentar entrar.
  }
}

void start();
