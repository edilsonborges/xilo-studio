# Operação

Como o Xilo roda em produção, em https://xilo.edilson.dev, e como mantê-lo.

## Onde roda

- Container Docker `xilo-studio` (serviço `web` do `docker-compose.yml`), que
  escuta só em `127.0.0.1:47653`.
- O túnel do Cloudflare leva `xilo.edilson.dev` até `http://127.0.0.1:47653`.
- Os dados ficam no volume Docker `xilo-studio_xilo_data` (SQLite em
  `/app/data/xilo.sqlite`): usuários, hashes de senha, sessões e atividade.
  Não apague esse volume.

## Configuração (`.env`, fora do Git)

| Variável | Para quê |
|---|---|
| `ADMIN_EMAILS` | e-mails dos administradores, separados por vírgula. Obrigatória em produção |
| `RESEND_API_KEY` | envio de convites e links de senha. Sem ela o login funciona, mas nenhum e-mail sai |
| `RESEND_FROM` | remetente; o domínio precisa estar verificado no Resend |
| `GATEWAY_API_KEY` | chave de consumidor do opencode-gateway. Sem ela a IA do Xilo fica desligada |
| `GATEWAY_URL`, `GATEWAY_TEXT_MODEL`, `GATEWAY_IMAGE_MODEL` | opcionais; o compose já aponta para `http://host.docker.internal:4097` |

O `docker-compose.yml` define `APP_ORIGIN`, `PORT`, `DATABASE_PATH` e
`TRUST_CLOUDFLARE_IP`. Mantenha o `.env` com permissão 600.

Não rode `docker compose config` para conferir o compose: ele imprime o `.env`
expandido, com as chaves.

## Publicar uma versão

O fluxo de cada entrega é: issue → branch → testes → PR com CI verde → merge →
tag → release → deploy.

```bash
./scripts/check-version.sh                 # VERSION, package.json e CHANGELOG iguais
git tag -a v0.7.0 -m "Xilo Studio v0.7.0"  # depois do merge na main
git push origin v0.7.0                     # o GitHub Actions publica a release
./scripts/update.sh                        # deploy da main nesta máquina
```

- A versão fica em `VERSION`, `package.json` e `package-lock.json`.
- As notas da release saem da entrada da versão no `CHANGELOG.md`. O mesmo
  arquivo alimenta o modal de novidades do app.
- O `update.sh` recusa rodar com alterações locais em arquivos versionados,
  reconstrói o container e espera o `/healthz`.

## Voltar atrás

- `./scripts/update.sh <commit>` publica um commit anterior.
- O banco está na versão 2 desde a v0.5.0. Versões anteriores a ela se recusam a
  abrir esse banco, então não dá para voltar para a v0.4.0 ou antes sem tratar
  o banco primeiro.
- Antes de cada deploy manual feito nesta implantação, a imagem anterior foi
  guardada com uma tag (`xilo-studio-web:antes-do-login`, `antes-da-narracao`,
  `antes-da-ia`, `antes-do-og`). Elas podem ser apagadas quando não fizerem falta.

## Contas

- Não há cadastro aberto. Um administrador convida pelo painel `/admin`; a
  pessoa recebe um link para criar a senha, válido por 7 dias.
- "Esqueci minha senha / primeiro acesso" envia um link válido por 1 hora. Para
  um e-mail sem conta, a tela responde igual e nada é enviado.
- Administradores são os e-mails de `ADMIN_EMAILS`. No primeiro acesso eles
  criam a senha pelo "esqueci minha senha".
- Remover alguém no painel encerra as sessões dessa pessoa na hora.

## Painel de administração

Além das contas, o painel mostra:

- **Resultado por pessoa:** vídeos gerados, exportados, narrações, imagens,
  falhas e última atividade.
- **Atividade:** o que cada pessoa fez nos últimos 180 dias, com filtro por
  pessoa e por tipo. Inclui o roteiro usado em cada geração. Senhas e links de
  acesso nunca são gravados.

## Túnel do Cloudflare nesta máquina

- O túnel `plantix` é gerenciado por arquivo, em `~/.cloudflared/config.yml`, e
  roda pelo LaunchAgent `dev.edilson.cloudflared-tunnel`.
- A regra do Xilo usa `127.0.0.1`, não `localhost`: o cloudflared tenta IPv6
  primeiro e o container só escuta em IPv4.
- Recarregar o túnel derruba todos os sites por alguns segundos:
  `launchctl kickstart -k gui/$(id -u)/dev.edilson.cloudflared-tunnel`.
- Cópia do config anterior à entrada do Xilo:
  `~/.cloudflared/config.yml.before-xilo-20261117145948`.
- Dois serviços antigos do cloudflared, que falhavam em loop desde janeiro,
  foram desligados. Os `.plist` estão em `~/.cloudflared/desativados/` e os logs
  zipados em `~/Library/Logs/cloudflared/antigos/`.
- O log do túnel é dividido por dia e zipado pelo LaunchAgent
  `dev.edilson.cloudflared-logs` (script `~/.cloudflared/rotacionar-logs.sh`,
  todo dia às 03:30, 90 dias de retenção).

## Prévia de link

A página de login traz as tags Open Graph, e `public/og.jpg` (1200x630) é
servida sem login. O WhatsApp guarda a prévia em cache; para forçar a nova,
compartilhe o link com um parâmetro, como `?v=2`.

## Diagnóstico

| Sintoma | Onde olhar |
|---|---|
| Site fora do ar | `docker compose logs --tail=200` e `curl http://127.0.0.1:47653/healthz` |
| Container reiniciando | `.env` sem `ADMIN_EMAILS`, ou banco de versão mais nova que o código |
| E-mail não chega | painel de atividade (o convite foi feito?) e a lista de envios do Resend |
| "A IA não respondeu" | o opencode-gateway: `curl http://127.0.0.1:4097/healthz` |
| Vídeo exportado travado | visuais com efeito dependem da GPU do navegador; teste a "Xilogravura clássica" |
