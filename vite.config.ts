import { readFileSync } from 'node:fs';
import { defineConfig, type Plugin } from 'vite';

// A versão do package.json aparece no app (%VITE_APP_VERSION% no HTML).
process.env.VITE_APP_VERSION = JSON.parse(readFileSync('package.json', 'utf8')).version;

// No dev, /login e /admin abrem as páginas como no servidor de produção.
const cleanUrls: Plugin = {
  name: 'xilo-clean-urls',
  configureServer(server) {
    server.middlewares.use((req, _res, next) => {
      const [path, query = ''] = (req.url ?? '').split('?');
      if (path === '/login' || path === '/admin') req.url = `${path}.html${query ? `?${query}` : ''}`;
      next();
    });
  },
};

export default defineConfig({
  plugins: [cleanUrls],
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 900,
    // O servidor lê o manifesto para liberar só os arquivos da tela de login sem sessão.
    manifest: true,
    rollupOptions: {
      input: {
        main: 'index.html',
        login: 'login.html',
        admin: 'admin.html',
      },
    },
  },
  server: {
    proxy: {
      '/api': 'http://127.0.0.1:47654',
      '/healthz': 'http://127.0.0.1:47654',
    },
  },
});
