# Motor 3D

O vídeo 3D é montado com Three.js, só com formas básicas feitas em código. Não
há modelos baixados nem imagens geradas. O que entra no motor é um
`SceneGraphJSON`; o que sai é um quadro por instante do áudio.

## O contrato: `SceneGraphJSON` (`src/types.ts`)

```json
{ "scenes": [{
  "id": "scene_3", "startTime": 11.5, "endTime": 16.6,
  "locationTitle": "Vila, ao entardecer",
  "environment": { "preset": "village_sunset", "particles": "fireflies",
                   "weather": "clear", "timeOfDay": "sunset" },
  "camera": { "movement": "pan_left", "startPos": [1.4, 2.6, 9.5],
              "endPos": [-1.4, 2.6, 9.5], "lookAt": [0, 1.2, 0] },
  "characters": [{
    "id": "vaqueiro", "kind": "man", "accessory": "leather_hat",
    "position": [-1.9, 0, -1], "targetPosition": [-0.5, 0, 0.6],
    "animation": "walk", "actions": [{ "at": 2.63, "do": "talk" }]
  }],
  "props": [
    { "type": "rustic_house", "position": [-3, 0, -5], "rotationY": 0.4, "scale": 1.1 },
    { "id": "carro_1", "type": "car", "position": [3, 0, -6], "targetPosition": [3, 0, 4] }
  ]
}] }
```

O painel "Cenas (SceneGraphJSON)" do app mostra esse JSON e aceita edição à mão.
O validador corrige o que estiver fora do esquema.

Unidades em metros, Y para cima, chão em y = 0. O quadro é alto e estreito: no
centro cabem uns 5 metros de largura. Personagens ficam entre x = -2 e 2.

## O que existe no kit

| Item | Quantidade | Onde |
|---|---|---|
| Cenários, em 6 grupos | 25 | `src/scenarios.ts` (catálogo) e `engine/environment.ts` (fundo) |
| Tipos de personagem | 4: homem, mulher, criança, idoso | `engine/character.ts` |
| Acessórios | 5: chapéu de palha, boné, chapéu de couro, lenço, óculos | `engine/character.ts` |
| Ações | 27 | `engine/character.ts` |
| Objetos de cenário | mais de 40 | `engine/props.ts`, `engine/scenery.ts` |
| Veículos e animais | 7 e 6 | `engine/vehicles.ts` |
| Clima e hora do dia | 6 e 4 | `engine/environment.ts` |
| Movimentos de câmera | 10 | `engine/camera.ts` |
| Visuais | 30, em 6 grupos | `engine/styles.ts`, `engine/post.ts` |

As folhas de contato desta pasta mostram tudo isso renderizado:
`visuais-3d.jpg`, `cenarios-3d.jpg`, `acoes-3d.jpg`, `reacoes-3d.jpg`,
`veiculos-3d.jpg`, `clima-3d.jpg` e `gesto-uma-vez.jpg`.

## Personagens e ações

- A pose é calculada do zero a cada quadro, só a partir do tempo
  (`poseCharacter`).
- **Ações contínuas** valem enquanto estiverem em curso: parado, escutar, andar,
  correr, pular, dançar, sentar, conversar, pensar, chorar, carregar, trabalhar,
  comer, rezar, dormir, dirigir, montar, cair.
- **Gestos de uma vez** (`ONE_SHOT`) tocam por 2 a 3 segundos e o personagem
  volta a escutar: acenar, apontar, aplaudir, comemorar, espantar-se, rir,
  concordar, negar, abraçar.
- **Deixas** (`actions`): trocam a ação num instante da cena. A transição
  mistura as duas poses por 0,32 s (`animateCharacter`).
- **Deslocamento:** quem tem `targetPosition` vai até lá em velocidade
  constante, mas só enquanto a ação em curso é andar, correr ou carregar
  (`travelProgress`).
- **Assentos:** um personagem com `mount` igual ao `id` de um objeto vai nele.
  Carro, caminhão e ônibus pedem "dirigir"; bicicleta, moto e cavalo, "montar";
  barco, carroça, cadeira, banco, sofá, banco de igreja e carteira, "sentar".
  As ações de tronco e braços (`UPPER_BODY`) continuam valendo sentado.

## Veículos, animais e objetos

- Todo objeto nasce de uma função `(grupo, contexto) => resultado` registrada em
  `BUILDERS` (`engine/props.ts`). O resultado pode trazer `update` (animação),
  `seat` (assento) e `usedLight` (acendeu uma luz).
- Quem tem `targetPosition` anda até lá e olha para onde vai. Rodas e patas se
  mexem pela distância percorrida.
- À noite, janelas, postes e fogueiras acendem. O limite é de 4 luzes pontuais
  por cena.

## Clima e hora

- Cada cenário tem clima e hora padrão. `weather` e `timeOfDay` na cena trocam a
  luz, o céu, a neblina e as partículas.
- Chuva e tempestade substituem as partículas do cenário; a tempestade tem
  relâmpagos em instantes fixos. Dentro de casa não chove.

## Visuais (`engine/styles.ts`, `engine/post.ts`)

Cada visual combina:

- **material:** sombreamento em 2, 3 ou 5 tons, ou liso; espessura e cor do
  contorno (`engine/toon.ts`);
- **pós-processamento:** um shader único, numa passada, com cada efeito ligado
  por um parâmetro: cor, posterização, paleta, retícula, hachura, pixelização,
  scanlines, aberração cromática, granulação, papel, trama, vinheta, brilho,
  borrão, contornos e grade.

A "Xilogravura clássica" não tem pós-processamento. Trocar de visual num vídeo já
gerado remonta a cena e aplica na hora.

## Como acrescentar coisas

| Para acrescentar | Faça |
|---|---|
| Um visual | uma entrada em `RENDER_STYLES` e a miniatura `src/assets/styles/3d-<id>.jpg` |
| Um cenário | uma entrada em `SCENARIOS` e o fundo em `backdrop()` de `environment.ts` |
| Um objeto | o tipo em `PROP_TYPES`, a função em `scenery.ts` e o registro em `BUILDERS` |
| Uma ação | o nome em `ANIMATIONS` e o `case` em `poseCharacter`; se for gesto, em `ONE_SHOT` |
| Apelidos para a IA | as tabelas `*_ALIASES` em `director/validate.ts` |
| Palavras do roteiro | as listas de `director/rules.ts` |

Os testes de `src/director/rules.test.ts` e `src/engine/*.test.ts` conferem as
contagens e a coerência entre essas listas.

## Limite conhecido

A exportação grava em tempo real. Os visuais com pós-processamento dependem da
GPU do navegador. Num Chrome com renderização por software, o vídeo exportado
perde quadros. Isso ainda não foi medido num navegador com GPU.
