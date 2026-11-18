# Arquitetura

O Xilo transforma um roteiro em um vídeo vertical 9:16 (1080x1920) com narração,
cenas e legenda sincronizada. O vídeo é montado e exportado no navegador. O
servidor cuida de login, narração e das chamadas à IA.

## Visão geral

```
navegador (Vite + TypeScript, sem framework)
  roteiro → narração → tempos das palavras → cenas → preview → exportação
        │           │                          │
        ▼           ▼                          ▼
servidor Node (Express + SQLite), porta 47653
  /api/auth, /api/admin   contas, sessões, convites (Resend), registro de atividade
  /api/narration          voz pelo Edge TTS, com o tempo de cada palavra
  /api/ai                 texto e imagens pelo opencode-gateway
  páginas e /assets       só para quem tem sessão (menos a tela de login)
```

## Fluxo de uma geração

1. **Roteiro** (`src/writer.ts`): texto do usuário, um exemplo escrito pela IA ou
   uma versão melhorada. O slider de duração orienta o tamanho do texto.
2. **Narração** (`src/audio/edge.ts` → `server/narration.ts`): o Edge TTS devolve
   o `.mp3` e o instante de cada palavra. Também dá para enviar um áudio próprio.
3. **Tempos** (`src/audio/`): com a voz gerada, valem os tempos do Edge TTS. Com
   áudio enviado, o alinhador local estima os tempos, ou o Whisper os mede se a
   pessoa tiver chave da OpenAI.
4. **Fatias de cena** (`src/director/splitter.ts`): corta a narração em cenas de
   4 a 8 s, de preferência em fim de frase. Cada fatia leva as suas palavras com
   tempo.
5. **Direção**, conforme o estilo escolhido:
   - **3D** (`src/director/`): a IA do Xilo ou o gerador por regras monta um
     `SceneGraphJSON`. Veja [IA.md](IA.md) e [MOTOR-3D.md](MOTOR-3D.md).
   - **Ilustrado por IA** (`src/illustrated/`): a IA descreve uma imagem por
     cena e o `gpt-image-2` desenha cada uma.
6. **Preview e exportação** (`src/compositor/`, `src/export/`): o compositor
   desenha o quadro do motor, o título de lugar e a legenda num canvas 2D. A
   exportação grava esse canvas em tempo real com o `MediaRecorder`.

Todo quadro é função pura do tempo do áudio: o mesmo instante gera a mesma
imagem no preview e na exportação.

## Pastas

| Caminho | Papel |
|---|---|
| `index.html`, `login.html`, `admin.html` | as três páginas (app, login, painel) |
| `src/main.ts` | liga a interface do app: roteiro, narração, estilo, geração, exportação |
| `src/writer.ts` | exemplos de roteiro, "melhorar texto", conta de duração |
| `src/stylepicker.ts`, `src/assets/styles/` | seletor de estilo com miniaturas |
| `src/audio/` | narração, alinhador local, Whisper, montagem da linha do tempo |
| `src/director/` | divisão em cenas, IA, regras, validador, exemplos, variações |
| `src/scenarios.ts` | catálogo dos 25 cenários 3D |
| `src/engine/` | motor Three.js: cenário, personagens, objetos, veículos, câmera, visuais |
| `src/illustrated/` | modo ilustrado: descrições, imagens e movimento de câmera |
| `src/compositor/`, `src/export/` | quadro final, legenda e gravação |
| `src/ai/client.ts` | cliente da IA do servidor (espera respostas pendentes) |
| `src/auth/`, `src/login.ts`, `src/admin.ts` | sessão, login e painel de administração |
| `src/changelog.ts`, `src/version.ts` | modal de novidades, lido do `CHANGELOG.md` |
| `server/` | Express: contas, narração, IA, registro de atividade, arquivos protegidos |
| `scripts/` | `update.sh` (deploy), `check-version.sh`, `narrar.mjs` |
| `docs/` | esta documentação e as folhas de contato |

## Servidor

- `server/app.ts`: rotas e proteção dos arquivos. Sem sessão, só a tela de login
  e os arquivos que ela usa são entregues; o resto responde 302 ou 401. A lista
  dos arquivos públicos vem do manifesto do Vite.
- `server/store.ts`: SQLite (`better-sqlite3`). Tabelas `users`, `sessions`,
  `password_tokens`, `rate_limits` e `events`. Versão do banco: 2.
- `server/password.ts`: scrypt. `server/mailer.ts`: Resend.
- `server/narration.ts`: Edge TTS (`msedge-tts`), com o tempo de cada palavra.
- `server/ai.ts`: cliente do opencode-gateway, sempre assíncrono.
- Toda rota que altera algo exige o cabeçalho `Origin` igual a `APP_ORIGIN` e
  corpo JSON. A Content-Security-Policy só libera o próprio site e as APIs da
  OpenAI, do Gemini e da Anthropic.

### Rotas

| Rota | Quem usa |
|---|---|
| `GET /healthz` | Docker e `update.sh` |
| `/api/auth/me`, `login`, `logout`, `password/forgot`, `password/check`, `password/set` | tela de login |
| `GET /api/narration/voices`, `POST /api/narration` | quem está logado |
| `GET /api/ai/status`, `POST /api/ai/text`, `POST /api/ai/image`, `GET /api/ai/jobs/:id` | quem está logado |
| `POST /api/events` | o app registra vídeo gerado, exportado, exemplo e texto melhorado |
| `GET/POST /api/admin/users`, `POST /api/admin/users/:id/link`, `DELETE /api/admin/users/:id`, `GET /api/admin/events` | só administradores |

### Limites por pessoa (a cada 15 minutos)

| O quê | Limite |
|---|---|
| Tentativas de login por e-mail | 10 |
| Pedidos de link de senha por e-mail | 3 |
| Narrações | 20 (até 6.000 caracteres cada) |
| Pedidos de texto à IA | 40 |
| Pedidos de imagem à IA | 60 |

## Testes

`npm test` roda os testes do servidor (`server/app.test.ts`, com gateway, Resend
e Edge TTS falsos) e os de `src/` (regras, validador, visuais, ações, roteiro,
changelog). `npm run check` roda os testes e o build. O CI repete isso e
constrói a imagem Docker.

A conferência visual é feita à parte: folhas de contato renderizadas pelo motor
(as imagens em `docs/`) e testes no navegador contra um container de teste.
