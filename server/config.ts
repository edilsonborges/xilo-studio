import { resolve } from 'node:path';
import { z } from 'zod';

export interface ServerConfig {
  databasePath: string;
  appOrigin: string;
  port: number;
  nodeEnv: 'development' | 'test' | 'production';
  resendApiKey?: string;
  resendFrom: string;
  distPath: string;
  /** Administradores: gerenciam usuários e não podem ser removidos pelo painel. */
  adminEmails: string[];
  /** Confia no cabeçalho CF-Connecting-IP (só quando o tráfego chega pelo túnel). */
  trustCloudflareIp: boolean;
}

const emailList = (value: string | undefined): string[] =>
  [...new Set((value ?? '').split(',').map((email) => email.trim().toLowerCase()).filter(Boolean))];

export function loadConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  const nodeEnv = env.NODE_ENV ?? 'development';
  if (!['development', 'test', 'production'].includes(nodeEnv)) {
    throw new Error('NODE_ENV deve ser development, test ou production.');
  }
  const port = Number(env.PORT ?? 47654);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('PORT deve ser uma porta válida.');
  }
  const config: ServerConfig = {
    databasePath: resolve(env.DATABASE_PATH ?? './data/xilo.sqlite'),
    appOrigin: env.APP_ORIGIN ?? 'http://localhost:5173',
    port,
    nodeEnv: nodeEnv as ServerConfig['nodeEnv'],
    resendApiKey: env.RESEND_API_KEY?.trim() || undefined,
    resendFrom: env.RESEND_FROM?.trim() || 'Xilo Studio <acesso@edilson.dev>',
    distPath: resolve(env.DIST_PATH ?? 'dist'),
    adminEmails: emailList(env.ADMIN_EMAILS),
    trustCloudflareIp: env.TRUST_CLOUDFLARE_IP === 'true',
  };
  validateConfig(config);
  return config;
}

export function validateConfig(config: ServerConfig): void {
  if (config.adminEmails.length > 20
    || config.adminEmails.some((email) => !z.string().email().max(254).safeParse(email).success)) {
    throw new Error('ADMIN_EMAILS deve conter e-mails válidos separados por vírgula.');
  }
  if (config.nodeEnv === 'production' && !config.adminEmails.length) {
    throw new Error('Defina ao menos um e-mail em ADMIN_EMAILS.');
  }
  let origin: URL;
  try {
    origin = new URL(config.appOrigin);
  } catch {
    throw new Error('APP_ORIGIN deve conter a origem completa da aplicação.');
  }
  if (!['http:', 'https:'].includes(origin.protocol)
    || origin.origin !== config.appOrigin
    || origin.username || origin.password) {
    throw new Error('APP_ORIGIN deve conter somente protocolo, host e porta, sem barra final.');
  }
  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(origin.hostname);
  if (config.nodeEnv === 'production' && origin.protocol !== 'https:' && !loopback) {
    throw new Error('APP_ORIGIN deve usar HTTPS em produção.');
  }
}
