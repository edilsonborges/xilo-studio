import 'dotenv/config';
import { createApp } from './app.js';
import { loadConfig } from './config.js';

const config = loadConfig();
const app = createApp({ config });
if (!config.resendApiKey) {
  console.warn('RESEND_API_KEY ausente: convites e "esqueci a senha" ficam desativados.');
}
const server = app.listen(config.port, '0.0.0.0', () => {
  console.info(`Xilo Studio na porta ${config.port}.`);
});

function shutdown(): void {
  server.close(() => {
    app.locals.close();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.once('SIGTERM', shutdown);
process.once('SIGINT', shutdown);
