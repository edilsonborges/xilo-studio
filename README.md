# Xilo Studio

Roteiro + narração → vídeo vertical 3D low-poly com cel-shading, legendas
karaokê e exportação automática. Three.js + LLM.

O nome vem de **xilogravura**, a arte que ilustra a literatura de cordel:
contornos pretos grossos e cores chapadas. É a estética que o motor produz
(toon shader de 3 tons + contorno por casco invertido).

## O que é

Uma aplicação web que roda 100% no navegador. Você entrega:

1. o texto do roteiro;
2. o áudio da narração (`.mp3` ou `.wav`).

O Xilo devolve um vídeo vertical 9:16 (1080x1920) com cenas 3D montadas só com
primitivas procedurais, câmera animada, título de localização e legenda que
destaca a palavra falada, sincronizado com a narração e pronto para exportar.

**Funciona sem nenhuma chave de API.** Com chaves, fica melhor:

| Etapa | Sem chave | Com chave |
|---|---|---|
| Tempo de cada palavra | Alinhador local | OpenAI Whisper |
| Direção de arte das cenas | Gerador por regras | OpenAI, Gemini ou Claude |

## Instalar e rodar

Requer Node.js 20.19+ (ou 22.12+).

```bash
git clone https://github.com/edilsonborges/xilo-studio.git
cd xilo-studio
npm install
npm run dev
```

Abra o endereço que o Vite mostrar (por padrão `http://localhost:5173`).

Outros comandos:

```bash
npm run build      # checa os tipos e gera o site estático em dist/
npm run preview    # serve o build de produção localmente
npm run typecheck  # só a checagem de tipos
```

## Exemplo de uso

1. Clique em **Usar exemplo** (ou cole o seu roteiro).
2. Envie o áudio com a narração desse texto.
3. Clique em **Gerar vídeo**. O preview 9:16 começa a tocar com a narração.
4. Arraste a linha do tempo à vontade: o mesmo instante mostra sempre o mesmo
   frame.
5. Escolha o formato e clique em **Exportar vídeo**. O arquivo é baixado ao
   final.

Para ajustar as cenas à mão, abra **Cenas (SceneGraphJSON)**, edite o JSON e
clique em **Aplicar JSON**. Valores fora do schema são corrigidos, nunca
quebram a renderização.

Dica: sem Whisper, o alinhador local distribui as palavras do roteiro pela
duração da fala. Ele funciona melhor quando o roteiro é exatamente o texto
narrado e a narração tem ritmo regular.

## Chaves de API

As chaves são digitadas em **Configurações**, dentro do app. Elas ficam apenas
no `localStorage` do seu navegador e são enviadas somente para a API do
provedor escolhido. Nada vai para o repositório nem para servidor do Xilo
(não existe servidor).

| Campo | Para que serve |
|---|---|
| Chave OpenAI | Whisper (timestamps por palavra) e/ou diretor de arte |
| Chave Gemini | Diretor de arte |
| Chave Anthropic | Diretor de arte |

Em Configurações você também escolhe a origem dos timestamps, o provedor do
diretor de arte, os modelos e a cor de destaque da legenda. O botão **Apagar
chaves** limpa os campos.

Observações:

- Chamar essas APIs direto do navegador expõe a chave a quem tiver acesso à
  sua máquina ou ao seu perfil do navegador. Use chaves suas, com limite de
  gasto, e não publique o app com chaves embutidas.
- A API da Anthropic é chamada pelo SDK oficial com
  `dangerouslyAllowBrowser: true`, que envia o header
  `anthropic-dangerous-direct-browser-access: true`.
- Se uma chamada falhar (chave inválida, limite, rede), o Xilo avisa e cai no
  fallback local daquela etapa.
- O `.env.example` não guarda segredos: só permite trocar os modelos padrão
  sugeridos na tela de Configurações.

## Como funciona

```
roteiro + áudio
   │
   ▼
1. Timestamps        src/audio/       Whisper ou alinhador local
   │                                  → palavras e frases com tempo
   ▼
2. Diretor de arte   src/director/    fatia em cenas de 4 a 8 s, pede o
   │                                  SceneGraphJSON ao LLM (ou às regras)
   │                                  e valida contra o schema
   ▼
3. Motor 3D          src/engine/      Three.js: toon de 3 tons, contorno,
   │                                  personagens, ambiente, props
4. Câmera e tempo                     tudo é função de currentTime
   ▼
5. Compositor        src/compositor/  Canvas 2D master: frame 3D + título
   │                                  + legenda karaokê
   ▼
   Exportador        src/export/      MediaRecorder: canvas + áudio original
```

### 1. Áudio e timestamps

- `audio/whisper.ts`: envia o áudio à OpenAI Audio API com timestamps por
  palavra e casa a transcrição com o roteiro (maior subsequência comum), para
  a legenda manter a grafia e a pontuação do roteiro com os tempos reais.
- `audio/aligner.ts`: fallback local. Detecta início e fim da fala pelo
  envelope de energia e distribui o tempo proporcionalmente ao tamanho das
  palavras, com pausas em vírgulas, pontos e quebras de linha.

### 2. Diretor de arte

- `director/splitter.ts`: corta a narração em cenas de 4 a 8 segundos,
  preferindo fim de frase, depois vírgula.
- `director/llm.ts`: prompt e chamadas a OpenAI, Gemini e Claude. Os tempos
  das cenas vêm sempre do áudio, o LLM só decide o conteúdo.
- `director/validate.ts`: normaliza qualquer JSON recebido. Enum fora da lista
  vira o valor válido mais próximo (apelidos, flexões, distância de edição) ou
  o padrão; cores e vetores inválidos caem na paleta do preset; o mesmo `id`
  de personagem mantém cores e acessório em todas as cenas.
- `director/rules.ts`: fallback sem chave. Palavras-chave do roteiro escolhem
  preset, props, animações, companhia em cena, câmera e título.

### 3 e 4. Motor, câmera e determinismo

- `engine/toon.ts`: `MeshToonMaterial` com `DataTexture` de 3 tons e
  `NearestFilter`; contorno por casco invertido (`BackSide`) com espessura
  uniforme.
- `engine/character.ts`: `createCharacter(config)`, humanoide articulado com
  `idle`, `walk`, `talk`, `sleep` e `gesture`.
- `engine/environment.ts`: `createEnvironment(preset, cores)`, com chão, céu
  em gradiente, luz direcional com sombra, luz ambiente, neblina e partículas
  (`dust`, `fireflies`, `leaves`, `rain`).
- `engine/props.ts`: `createProp(type, position, scale, color)` para os dez
  tipos do schema.
- `engine/camera.ts`: `static`, `pan_left`, `pan_right`, `zoom_in`,
  `zoom_out`, `orbit` e `follow_character`, com `easeInOut`.

Nenhuma animação acumula delta de frame. Poses, partículas, deslocamentos e
câmera são recalculados a partir do `currentTime` do áudio a cada desenho, e
tudo que é aleatório usa semente fixa. Por isso avançar ou voltar na timeline
mostra sempre o mesmo frame para o mesmo instante.

### 5. Legendas e exportação

- `compositor/compositor.ts`: desenha o canvas WebGL num canvas 2D e, por
  cima, o `locationTitle` (serifado, com fade) e a pílula branca da legenda
  com a palavra atual destacada. Como tudo está no mesmo canvas, tudo sai na
  gravação.
- `export/exporter.ts`: `MediaRecorder` grava o stream do canvas master junto
  com o áudio original (`AudioContext` + `MediaStreamAudioDestinationNode`).
  O frame desenhado segue o relógio do `AudioContext`, então áudio e vídeo não
  derivam.

## Schema das cenas (SceneGraphJSON)

```json
{
  "scenes": [
    {
      "id": "scene_1",
      "startTime": 0.0,
      "endTime": 5.5,
      "locationTitle": "Bahia, anos 1930",
      "environment": {
        "preset": "sertao_day",
        "skyColor": "#e8c391",
        "groundColor": "#c28d53",
        "fogColor": "#e8c391",
        "particles": "dust"
      },
      "camera": {
        "movement": "zoom_in",
        "startPos": [0, 3, 10],
        "endPos": [0, 2.5, 7],
        "lookAt": [0, 1, 0],
        "target": "protagonist"
      },
      "characters": [
        {
          "id": "protagonist",
          "position": [0, 0, 0],
          "targetPosition": [0, 0, 3],
          "skinColor": "#8d5524",
          "shirtColor": "#f4f1ea",
          "pantsColor": "#3d352e",
          "accessory": "straw_hat",
          "animation": "walk"
        }
      ],
      "props": [
        { "type": "rustic_house", "position": [-4, 0, -3], "rotationY": 0.5, "scale": 1.0, "color": "#d9a066" },
        { "type": "dry_tree", "position": [3, 0, -2], "rotationY": 0, "scale": 1.2 }
      ]
    }
  ]
}
```

| Campo | Valores |
|---|---|
| `environment.preset` | `sertao_day`, `interior_night`, `village_sunset`, `forest` |
| `environment.particles` | `dust`, `fireflies`, `leaves`, `rain`, `none` |
| `camera.movement` | `static`, `pan_left`, `pan_right`, `zoom_in`, `zoom_out`, `orbit`, `follow_character` |
| `characters[].animation` | `idle`, `walk`, `talk`, `sleep`, `gesture` |
| `characters[].accessory` | `straw_hat`, `none` |
| `props[].type` | `rustic_house`, `bed`, `tree`, `dry_tree`, `cactus`, `table`, `lantern`, `road`, `fence`, `animal` |

- `camera.target` só vale com `follow_character` e precisa ser o `id` de um
  personagem da cena.
- `targetPosition` é opcional: com ele, o personagem vai de `position` até
  `targetPosition` ao longo da cena.
- `color` em props é opcional: sem ele, vale a paleta do preset.
- O mesmo `id` de personagem mantém cores e acessório em todas as cenas.

## Limitações conhecidas

- A exportação é em tempo real: um vídeo de 60 s leva 60 s. Mantenha a aba
  visível; se ela for para segundo plano, a gravação pausa e continua quando
  você voltar.
- O formato depende do navegador. Chrome e Edge recentes e o Safari gravam
  MP4 (H.264 + AAC); o Firefox grava WebM. Arquivos WebM do `MediaRecorder`
  podem sair sem duração no cabeçalho, o que atrapalha o avanço em alguns
  players; prefira MP4 quando disponível.
- A API de transcrição da OpenAI aceita arquivos de até 25 MB.
- Recomendado: navegador de desktop com WebGL 2.

## Licença

[MIT](LICENSE)
