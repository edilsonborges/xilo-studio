# IA no Xilo

O Xilo funciona sem IA. Com ela, fica melhor em quatro pontos: direção das cenas
3D, imagens do modo ilustrado, exemplos de roteiro e "melhorar texto".

## De onde vem a IA

| Origem | O que faz | Onde fica a chave |
|---|---|---|
| **IA do Xilo** (padrão) | texto com `gpt-6-luna` e imagens com `gpt-image-2`, pelo opencode-gateway desta máquina | só no `.env` do servidor |
| Chaves próprias (OpenAI, Gemini, Anthropic) | alternativa para a direção 3D e para o Whisper | `localStorage` do navegador de quem as digitou |

O opencode-gateway usa a assinatura do ChatGPT, não a API paga. O nome
`gpt-image-2` é o rótulo do gateway para a ferramenta de imagem do ChatGPT.
Cada chamada consome o limite do plano.

## Como o servidor fala com o gateway (`server/ai.ts`)

- Texto: `POST /v1/chat/completions`, com `reasoning_effort: "low"`,
  `response_format: json_object` e o cabeçalho `X-Executor-Profile: minimal`.
- Imagem: `POST /v1/images/generations` com `model` e `prompt`. Não há parâmetro
  de formato: o prompt pede "Vertical 9:16 portrait".
- Todo pedido leva `Prefer: respond-async, wait=25` e uma `Idempotency-Key`. O
  gateway responde 200 com o resultado ou 202 com uma URL de consulta.
- No 202, o servidor guarda um id próprio e devolve 202 ao navegador, que
  consulta `GET /api/ai/jobs/:id` a cada 5 s, por até 6 minutos. Assim nenhuma
  requisição passa do limite de cerca de 100 s do Cloudflare.
- Só o dono do pedido pode consultá-lo, e a URL de consulta só é seguida se for
  do próprio gateway.
- Falha (502, `failed`) não tem reenvio automático: o app avisa e segue por um
  caminho sem IA.
- O gateway gera uma imagem por vez, em 20 a 45 s cada.

O prompt para integrar outro projeto ao gateway está no artefato
"Integração opencode-api", criado nesta mesma implantação.

## Direção das cenas 3D (`src/director/`)

Duas chamadas de texto por roteiro (mais uma a cada 12 cenas):

1. **Ficha da história** (`STORY_PROMPT` em `llm.ts`): época e lugar, tom,
   elenco (tipo, cores, acessório, jeito) e o arco de lugares, hora e clima.
   `sanitizeStorySheet` normaliza a resposta. Se falhar, as cenas saem sem ficha.
2. **Cenas** (`SYSTEM_PROMPT` + `buildUserPrompt`): o prompt leva o roteiro, as
   fatias de cena, a ficha, o elenco já definido e:
   - **dois exemplos** da biblioteca (`examples.ts`), escolhidos pelos cenários
     previstos para o roteiro;
   - **orientações de variação** (`variants.ts`), só ao gerar de novo o mesmo
     roteiro: situação, ambiente e câmera por cena, escolhidos por um número de
     variação.

A resposta passa pelo validador (`validate.ts`), que conserta o que estiver fora
do esquema: valores desconhecidos viram o mais próximo, com apelidos em inglês e
português. Cena que faltar é preenchida pelo gerador por regras.

### Ações no tempo da narração

Cada personagem tem `animation` (a ação inicial) e, opcionalmente, `actions`:

```json
{ "id": "vaqueiro", "animation": "walk",
  "actions": [{ "at": "contou", "do": "talk" }] }
```

`at` aceita segundos desde o início da cena ou uma palavra da narração daquela
cena. O validador troca a palavra pelo instante em que ela é falada.

### Sem IA: gerador por regras (`rules.ts`)

Lê palavras do roteiro e decide cenário, clima, hora, tipo de personagem, ações,
veículos, animais, objetos e câmera. Também cria as deixas de ação a partir dos
verbos, na ordem em que aparecem, e varia as escolhas livres pelo número de
variação. É determinístico.

Para ensinar uma palavra nova, acrescente o radical (sem acento) na lista certa:
`ACTIONS`, `REACTIONS`, `PROP_WORDS`, `VEHICLE_WORDS`, `ANIMAL_WORDS`,
`WEATHER_WORDS`, `TIME_WORDS` em `rules.ts`, ou `words` do cenário em
`src/scenarios.ts`. Cuidado com radicais curtos: "caminha" já fez "caminhava"
virar caminhão.

## Modo ilustrado (`src/illustrated/`)

1. `storyboard`: uma chamada de texto devolve a descrição fixa dos personagens e
   uma descrição de imagem por cena, com o movimento de câmera.
2. `imagePrompt`: monta o pedido de cada imagem com o estilo (xilogravura,
   aquarela, livro infantil, cinema), os personagens e a cena.
3. As imagens são geradas uma a uma e aparecem no preview conforme chegam.
4. Se a primeira imagem falhar, o Xilo faz o vídeo em 3D e avisa.

## Roteiro (`src/writer.ts`)

- **Usar exemplo:** cada clique pede uma história nova, num tema em rodízio
  entre 12. Sem IA, roda uma lista de roteiros prontos.
- **Melhorar texto:** reescreve o roteiro mantendo a história. A sugestão entra
  na caixa abaixo de uma linha `----------------`, com os botões Aceitar e
  Descartar. Com sugestão pendente, narrar e gerar ficam bloqueados.
- **Duração:** o slider (5 s a 3 min) define o tamanho pedido à IA, a 2,3
  palavras por segundo. O prompt fixa o número de linhas e um teto de palavras;
  se a resposta ainda passar muito, as linhas do meio são cortadas.
