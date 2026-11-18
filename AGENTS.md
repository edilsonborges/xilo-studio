# Guia do Xilo Studio

Para quem for trabalhar neste repositório. Leia também `docs/README.md`.

## O projeto

Roteiro e narração viram um vídeo vertical 9:16 com cenas e legenda. O vídeo é
montado no navegador (TypeScript, Vite, Three.js, sem framework). Um servidor
Node (Express, SQLite) cuida de login, narração (Edge TTS) e IA
(opencode-gateway). Em produção: https://xilo.edilson.dev, container
`xilo-studio`, porta `127.0.0.1:47653`.

## Como trabalhar

- Converse e documente em português brasileiro. Textos da interface também.
- Cada entrega segue: issue → branch → testes → PR com CI verde → merge → tag →
  release → deploy com `./scripts/update.sh`. Não faça commit, push nem deploy
  sem pedido.
- Entrega com funcionalidade nova sobe o número do meio e zera o último (de
  `0.8.0` para `0.9.0`). Entrega só de correção sobe o último (de `0.8.0` para
  `0.8.1`).
- Toda versão sobe `VERSION`, `package.json`, `package-lock.json` e ganha uma
  entrada no `CHANGELOG.md`, escrita para quem usa o app. O changelog aparece no
  modal de novidades e na release pública.
- O repositório é público. Nada de segredos, e-mails de pessoas ou dados de uso
  em código, commits, issues ou PRs.

## Verificação

- `npm run check`: testes (servidor e `src/`) e build. Rode antes de todo PR.
- `./scripts/check-version.sh`: versões e changelog coerentes.
- Mudança visual pede conferência visual: renderize o motor numa folha de
  contato ou teste no navegador contra um container de teste em outra porta.
  Nunca teste no container `xilo-studio`.
- Os testes usam gateway, Resend e Edge TTS falsos. Chamadas reais ao gateway
  gastam o plano do ChatGPT: faça poucas e nunca em loop.

## Cuidados

- Não imprima o `.env`. `docker compose config` imprime; não use.
- Não apague o volume `xilo-studio_xilo_data`.
- Não pare nem reconstrua outros containers desta máquina. O túnel do Cloudflare
  atende vários sites: recarregá-lo exige aviso e autorização.
- O Dockerfile copia a pasta `server/` inteira e o `CHANGELOG.md`. Arquivo novo
  fora de `src/`, `server/` e `public/` precisa entrar no Dockerfile e no
  `.dockerignore`.
- O banco tem versão (`user_version`). Mudança de esquema sobe a versão e impede
  voltar a imagens antigas: avise antes.

## Regras do código

- Todo quadro é função pura do tempo do áudio. Nada de estado acumulado entre
  quadros, nem `Math.random()` no motor: use `makeRng` com semente.
- Tudo que vem da IA ou de JSON editado à mão passa por `director/validate.ts`,
  que conserta em vez de recusar. Campos novos são opcionais, para o JSON das
  versões anteriores continuar válido.
- A chave do gateway e a do Resend ficam só no servidor. O navegador fala com
  `/api/ai` e `/api/narration`.
- Chamadas à IA são assíncronas (202 e consulta), por causa do limite de tempo
  do Cloudflare.
- Texto vindo de fora entra no DOM por `textContent`, nunca por `innerHTML`.
- No gerador por regras, radicais vão sem acento e não podem ser curtos demais.
  Acrescente um teste com um roteiro real para cada palavra nova.
