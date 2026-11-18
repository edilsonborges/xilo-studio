// Ajuda com o roteiro: exemplos que mudam a cada clique, "melhorar texto" e a
// conta de quanto tempo de narração um texto dá.

import { aiText } from './ai/client';
import { extractJson } from './director/llm';

/** Linha que separa o texto original da sugestão dentro da caixa do roteiro. */
export const SEPARATOR = '----------------';
/** Ritmo médio das vozes do Edge TTS em português, na velocidade normal. */
export const WORDS_PER_SECOND = 2.3;
export const MIN_SECONDS = 5;
export const MAX_SECONDS = 180;
export const DEFAULT_SECONDS = 30;

export const countWords = (text: string): number => text.trim().split(/\s+/).filter(Boolean).length;
export const estimateSeconds = (text: string): number => countWords(text) / WORDS_PER_SECOND;

export function formatDuration(seconds: number): string {
  const s = Math.round(seconds);
  if (s < 60) return `${s} s`;
  const rest = s % 60;
  return rest ? `${Math.floor(s / 60)} min ${rest} s` : `${Math.floor(s / 60)} min`;
}

/** Texto com sugestão pendente: o que está acima e abaixo da linha separadora. */
export function splitSuggestion(text: string): { original: string; suggestion: string } | null {
  const match = /\n\s*-{8,}\s*\n/.exec(text);
  if (!match) return null;
  return { original: text.slice(0, match.index).trim(), suggestion: text.slice(match.index + match[0].length).trim() };
}

export const joinSuggestion = (original: string, suggestion: string): string =>
  `${original.trim()}\n\n${SEPARATOR}\n\n${suggestion.trim()}`;

/** Temas dos exemplos, um por clique, em rodízio. */
export const THEMES = [
  'sertão nordestino e uma longa viagem',
  'cidade grande, trânsito e chuva',
  'infância, brincadeira e um animal de estimação',
  'festa junina com fogueira e forró',
  'pescaria no mar e uma tempestade',
  'família reunida em casa',
  'fé, promessa e gratidão',
  'causo engraçado na feira',
  'fazenda, plantio e colheita',
  'noite estrelada e um sonho',
  'primeiro dia de aula na escola',
  'carnaval de rua',
] as const;

/** Usados quando a IA do Xilo não está disponível. */
export const LOCAL_SAMPLES = [
  `Na Bahia, nos anos 1930, um vaqueiro caminhava pela estrada de terra do sertão.
O sol queimava a caatinga, e o mandacaru era a única sombra no caminho.
Ao entardecer, ele chegou à vila e contou aos amigos sobre a longa viagem.
Naquela noite, deitou na cama e dormiu, sonhando com a chuva que um dia voltaria.`,
  `Chovia forte na cidade quando Dona Lúcia desceu do ônibus.
Ela correu pela calçada, entre os carros parados na avenida.
Na praça, um menino dividiu o guarda-chuva com ela, e os dois riram.
À noite, em casa, ela contou a história para a família na cozinha.`,
  `No sítio, Jaiminho acordou cedo e correu para o campo florido.
O cachorro corria atrás dele enquanto a irmã pedalava a bicicleta.
Os dois pularam de alegria quando o avô chegou de carroça.
Ao entardecer, todos sentaram no banco e comeram bolo de milho.`,
  `Na noite de São João, a vila inteira se reuniu em volta da fogueira.
O casal dançava forró, e o povo batia palmas.
Um menino tropeçou na galinha e caiu, e todo mundo gargalhou.
Quando a lua subiu, a avó rezou e agradeceu pela colheita.`,
  `De madrugada, o pescador saiu do cais e navegou o barco para alto-mar.
O céu escureceu, e a tempestade chegou com trovões.
Ele se assustou, rezou e remou com força de volta ao porto.
Ao amanhecer, a mulher o abraçou na praia, chorando de alívio.`,
  `Maria trabalhava na roça de milho desde cedo, debaixo do sol forte.
Ao meio-dia, sentou na sombra da árvore e comeu com os filhos.
À tarde, caminhou até a igreja da vila e rezou pela chuva.
Naquela noite, a chuva chegou, e a família comemorou na cozinha.`,
] as const;

const lines = (seconds: number): number => Math.min(30, Math.max(1, Math.round(seconds / 6)));
const words = (seconds: number): number => Math.max(8, Math.round(seconds * WORDS_PER_SECOND));

const STRUCTURE = `Structure of a good script for Xilo (it becomes a narrated video, one scene every 4 to 8 seconds):
- One sentence per line.
- First line: where and when, and who is doing something visible.
- Middle lines: each one shows a visible action, and the story changes place, time of day or weather at least once when there is room.
- Last line: an ending with a clear image.
- Be concrete: actions (walk, run, dance, sit, cry, laugh, work, ride, drive), places, time of day, weather, people (man, woman, child, elderly), animals and vehicles.
- Plain narration in Brazilian Portuguese. No dialogue in quotes, no title, no emojis, no scene numbers.`;

const lengthRule = (seconds: number): string => {
  const total = words(seconds);
  const count = lines(seconds);
  return `Length: exactly ${count} line(s). Hard limit of ${total} words in total, so at most ${Math.ceil(total / count)} words per line. Count the words before answering; shorter is better than longer (the narration must last about ${Math.round(seconds)} seconds).`;
};

/** Se o texto passar muito do tamanho, tira linhas do meio (a abertura e o final ficam). */
export function fitToDuration(script: string, seconds: number): string {
  const list = script.split('\n').map((line) => line.trim()).filter(Boolean);
  const limit = words(seconds) * 1.25;
  while (list.length > 2 && countWords(list.join(' ')) > limit) list.splice(list.length - 2, 1);
  return list.join('\n');
}

function readScript(reply: string): string {
  const parsed = extractJson(reply) as { script?: unknown };
  const script = typeof parsed.script === 'string' ? parsed.script.replace(/\r/g, '').replace(/\n{2,}/g, '\n').trim() : '';
  if (countWords(script) < 3 || splitSuggestion(script)) throw new Error('A IA não devolveu um roteiro.');
  return script;
}

export interface Sample {
  script: string;
  theme: string;
  source: 'ai' | 'local';
}

/** Um exemplo novo a cada chamada: o tema roda e o texto é escrito na hora. */
export async function sampleStory(turn: number, seconds: number, useAi: boolean): Promise<Sample> {
  const theme = THEMES[turn % THEMES.length];
  const local = (): Sample => ({ script: LOCAL_SAMPLES[turn % LOCAL_SAMPLES.length], theme: 'exemplo pronto', source: 'local' });
  if (!useAi) return local();
  try {
    const reply = await aiText(
      `You write short narration scripts in Brazilian Portuguese for Xilo, an app that turns a narrated script into a video.\n\n${STRUCTURE}\n\nReply with a single JSON object: {"script": "<the lines separated by \\n>"}.`,
      `Write a new, original story.\nTheme: ${theme}.\n${lengthRule(seconds)}\nTake number ${turn + 1}: invent different characters, names and events from a typical story on this theme.`,
    );
    return { script: fitToDuration(readScript(reply), seconds), theme, source: 'ai' };
  } catch {
    return local();
  }
}

/** Reescreve o roteiro: mesma história, mais visual e no tamanho da duração escolhida. */
export async function improveScript(script: string, seconds: number): Promise<string> {
  const reply = await aiText(
    `You improve narration scripts for Xilo, an app that turns a narrated script into a video. Rewrite the user's script: keep the same story, characters, facts and language, but make it more visual and better paced.\n\n${STRUCTURE}\n\nReply with a single JSON object: {"script": "<the lines separated by \\n>"}.`,
    `${lengthRule(seconds)} Shorten or expand the story to fit.\n\nScript to improve:\n"""\n${script.trim()}\n"""`,
  );
  const improved = readScript(reply);
  if (improved === script.trim()) throw new Error('A IA devolveu o mesmo texto. Tente de novo.');
  return improved;
}
