import './auth.css';

import { currentUser, logout } from './api';

/** Mostra quem está logado, o link do painel (admins) e o botão de sair. */
export async function initSession(): Promise<void> {
  const box = document.getElementById('session');
  if (!box) return;
  try {
    const { user } = await currentUser();
    if (!user) {
      // Sessão expirou com a página aberta.
      location.replace('/login');
      return;
    }
    document.getElementById('session-name')!.textContent = user.name;
    document.getElementById('open-admin')!.hidden = !user.admin;
    document.getElementById('logout')!.addEventListener('click', () => void logout());
    box.hidden = false;
  } catch {
    // Sem servidor de contas (ex.: `vite` sozinho): o app continua funcionando.
  }
}
