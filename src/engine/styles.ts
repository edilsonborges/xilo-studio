// Os 30 visuais do vídeo 3D. Cada um combina o material dos objetos (tons de
// sombra e contorno) com um pós-processamento na GPU (post.ts). Tudo aqui é
// dado: acrescentar um visual é acrescentar uma entrada.

export type Shading = 'toon2' | 'toon3' | 'toon5' | 'smooth';

export interface MaterialLook {
  shading: Shading;
  /** multiplica a espessura do contorno; 0 tira o contorno */
  outline: number;
  outlineColor: string;
}

/** Parâmetros do shader de pós-processamento; 0 desliga cada efeito. */
export interface PostLook {
  saturation?: number;
  contrast?: number;
  brightness?: number;
  sepia?: number;
  grayscale?: number;
  /** cor multiplicada sobre a imagem, com a força em tintAmount */
  tint?: string;
  tintAmount?: number;
  /** quantos níveis por canal (0 = sem posterização) */
  posterize?: number;
  /** até 4 cores, do escuro para o claro: a imagem é reduzida a elas pela luminância */
  palette?: string[];
  /** pontilhado ordenado ao reduzir para a paleta */
  dither?: number;
  /** retícula colorida: tamanho da célula em px e força */
  halftone?: number;
  halftoneAmount?: number;
  /** retícula de mangá (só nos meios-tons) */
  screentone?: number;
  /** hachura de lápis/gravura: força e espaçamento em px */
  hatching?: number;
  hatchScale?: number;
  /** tamanho do "pixel" em px */
  pixelate?: number;
  scanlines?: number;
  /** aberração cromática em px */
  chroma?: number;
  /** ondulação horizontal de fita VHS */
  wobble?: number;
  grain?: number;
  /** textura de papel/tela */
  paper?: number;
  /** trama de tecido (feltro, tela de pintura) */
  weave?: number;
  vignette?: number;
  /** brilho nas partes claras */
  glow?: number;
  /** borrão suave (aquarela, sonho) */
  soften?: number;
  /** contornos desenhados pela variação de luz: força, cor e espessura */
  edges?: number;
  edgeColor?: string;
  edgeWidth?: number;
  /** cor de fundo para efeitos de traço (lápis, planta baixa) */
  paperColor?: string;
  /** grade de planta baixa */
  grid?: number;
  /** oscilação de luz (filme antigo, terror) */
  flicker?: number;
}

export interface RenderStyle {
  id: string;
  label: string;
  category: StyleCategory;
  description: string;
  material: MaterialLook;
  post: PostLook;
}

export const STYLE_CATEGORIES = [
  'Cordel e gravura',
  'Desenho e HQ',
  'Pintura',
  'Brinquedo e material',
  'Retrô e digital',
  'Cinema e clima',
] as const;
export type StyleCategory = (typeof STYLE_CATEGORIES)[number];

const INK = '#000000';
const look = (shading: Shading, outline = 1, outlineColor = INK): MaterialLook => ({ shading, outline, outlineColor });

export const RENDER_STYLES: readonly RenderStyle[] = [
  // ---------- Cordel e gravura ----------
  {
    id: 'xilogravura',
    label: 'Xilogravura clássica',
    category: 'Cordel e gravura',
    description: 'O visual original: cel-shading em três tons e contorno preto grosso.',
    material: look('toon3'),
    post: {},
  },
  {
    id: 'xilo-pb',
    label: 'Xilogravura P&B',
    category: 'Cordel e gravura',
    description: 'Preto e branco de capa de cordel, com hachura nos meios-tons.',
    material: look('toon3', 1.3),
    post: { palette: ['#141210', '#efe7d6'], brightness: 0.2, hatching: 0.85, hatchScale: 7, contrast: 1.25, paper: 0.35 },
  },
  {
    id: 'sepia',
    label: 'Sépia antiga',
    category: 'Cordel e gravura',
    description: 'Fotografia envelhecida, com granulação, papel e bordas escuras.',
    material: look('toon3', 0.8),
    post: { sepia: 1, contrast: 1.1, grain: 0.22, paper: 0.35, vignette: 0.6, flicker: 0.08 },
  },
  {
    id: 'linogravura',
    label: 'Linogravura',
    category: 'Cordel e gravura',
    description: 'Duas camadas de tinta chapada, contorno pesado e papel aparente.',
    material: look('toon2', 1.4),
    post: { posterize: 3, saturation: 1.25, paper: 0.45, grain: 0.08 },
  },
  {
    id: 'carimbo',
    label: 'Carimbo',
    category: 'Cordel e gravura',
    description: 'Tinta vermelha e preta, falhada, como carimbo em papel cru.',
    material: look('toon2', 1.2),
    post: { palette: ['#1b1513', '#b8342a', '#efe5d0'], paper: 0.8, grain: 0.18 },
  },

  // ---------- Desenho e HQ ----------
  {
    id: 'hq',
    label: 'HQ com retícula',
    category: 'Desenho e HQ',
    description: 'Gibi colorido, com pontos de retícula nas sombras.',
    material: look('toon3', 1.3),
    post: { saturation: 1.25, halftone: 8, halftoneAmount: 0.6, contrast: 1.05 },
  },
  {
    id: 'manga',
    label: 'Mangá P&B',
    category: 'Desenho e HQ',
    description: 'Preto, branco e retícula de mangá nos meios-tons.',
    material: look('toon3', 1.5),
    post: { grayscale: 1, brightness: 0.18, contrast: 1.3, screentone: 1, edges: 0.5, edgeWidth: 1.2 },
  },
  {
    id: 'cartum',
    label: 'Cartum',
    category: 'Desenho e HQ',
    description: 'Desenho animado: duas cores por objeto, contorno grosso e cores vivas.',
    material: look('toon2', 2.3),
    post: { saturation: 1.55, brightness: 0.07, contrast: 1.1, posterize: 8 },
  },
  {
    id: 'lapis',
    label: 'Rascunho a lápis',
    category: 'Desenho e HQ',
    description: 'Traço de grafite e hachura sobre papel claro.',
    material: look('smooth', 0),
    post: { brightness: 0.22, edges: 1, edgeColor: '#2c2a28', edgeWidth: 1.3, hatching: 0.6, hatchScale: 6, paperColor: '#f4f0e6', paper: 0.4 },
  },
  {
    id: 'giz',
    label: 'Giz de cera',
    category: 'Desenho e HQ',
    description: 'Cores fortes e falhadas, como desenho de criança com giz de cera.',
    material: look('toon3', 0.7, '#3a2a1e'),
    post: { saturation: 1.35, posterize: 6, paper: 0.7, grain: 0.3, weave: 0.35, edges: 0.3, edgeWidth: 1.6 },
  },

  // ---------- Pintura ----------
  {
    id: 'aquarela',
    label: 'Aquarela',
    category: 'Pintura',
    description: 'Manchas suaves que escorrem, bordas de pigmento e papel aparente.',
    material: look('smooth', 0),
    post: { soften: 0.7, paper: 0.55, saturation: 0.85, brightness: 0.08, edges: 0.35, edgeColor: '#5a4a3a', edgeWidth: 1.2 },
  },
  {
    id: 'guache',
    label: 'Guache pastel',
    category: 'Pintura',
    description: 'Tinta opaca em tons pastel, com camadas chapadas.',
    material: look('toon3', 0.45, '#4a3a34'),
    post: { saturation: 0.7, brightness: 0.12, contrast: 0.9, posterize: 7, paper: 0.35 },
  },
  {
    id: 'pop-art',
    label: 'Pop art',
    category: 'Pintura',
    description: 'Cores berrantes, poucas tintas e retícula grande.',
    material: look('toon2', 1.6),
    post: { saturation: 1.9, posterize: 4, halftone: 11, halftoneAmount: 0.55, contrast: 1.15 },
  },
  {
    id: 'vitral',
    label: 'Vitral',
    category: 'Pintura',
    description: 'Vidro colorido e luminoso, separado por chumbo preto.',
    material: look('toon2', 2.2),
    post: { saturation: 1.6, posterize: 4, edges: 1, edgeColor: '#0e0c0a', edgeWidth: 2.2, glow: 0.35 },
  },
  {
    id: 'oleo',
    label: 'Óleo impressionista',
    category: 'Pintura',
    description: 'Pinceladas grossas sobre tela, cores quentes e luz espalhada.',
    material: look('smooth', 0.3, '#3a2a20'),
    post: { soften: 0.55, posterize: 7, weave: 1, saturation: 1.4, glow: 0.3, grain: 0.15, contrast: 1.1 },
  },

  // ---------- Brinquedo e material ----------
  {
    id: 'massinha',
    label: 'Massinha',
    category: 'Brinquedo e material',
    description: 'Bonecos de massa de modelar, com sombra macia e cores vivas.',
    material: look('smooth', 0.35, '#2a1d14'),
    post: { saturation: 1.4, brightness: 0.05, soften: 0.3, grain: 0.05, vignette: 0.4, contrast: 1.12, glow: 0.2 },
  },
  {
    id: 'papel-recortado',
    label: 'Papel recortado',
    category: 'Brinquedo e material',
    description: 'Camadas de cartolina chapada, sem contorno, com textura de papel.',
    material: look('toon2', 0),
    post: { posterize: 5, paper: 0.7, edges: 0.45, edgeColor: '#2a221c', edgeWidth: 1.5, saturation: 1.05 },
  },
  {
    id: 'madeira',
    label: 'Brinquedo de madeira',
    category: 'Brinquedo e material',
    description: 'Peças de madeira pintada, tons quentes e veios aparentes.',
    material: look('toon3', 0.6, '#4a2e18'),
    post: { tint: '#ffcf8a', tintAmount: 0.5, posterize: 6, weave: 0.6, paper: 0.45, saturation: 1.05, vignette: 0.35 },
  },
  {
    id: 'feltro',
    label: 'Feltro',
    category: 'Brinquedo e material',
    description: 'Tecido felpudo, cores macias e textura de trama.',
    material: look('smooth', 0),
    post: { weave: 1.6, grain: 0.4, soften: 0.35, saturation: 0.85, brightness: 0.06, posterize: 8, contrast: 0.92 },
  },
  {
    id: 'origami',
    label: 'Origami',
    category: 'Brinquedo e material',
    description: 'Papel dobrado: muitas faces de luz, vincos claros e cores limpas.',
    material: look('toon5', 0.5, '#ffffff'),
    post: { paper: 0.35, contrast: 1.2, brightness: 0.1, saturation: 0.85, posterize: 9 },
  },

  // ---------- Retrô e digital ----------
  {
    id: 'pixel',
    label: 'Pixel art',
    category: 'Retrô e digital',
    description: 'Videogame de 16 bits: pixels grandes e poucas cores.',
    material: look('toon3', 1),
    post: { pixelate: 9, posterize: 6, saturation: 1.2 },
  },
  {
    id: 'neon',
    label: 'Fliperama neon',
    category: 'Retrô e digital',
    description: 'Fundo escuro, contornos que brilham e linhas de tela.',
    material: look('toon2', 0.6),
    post: { brightness: -0.62, grayscale: 0.35, contrast: 1.25, edges: 1, edgeColor: 'glow', edgeWidth: 1.4, glow: 0.9, scanlines: 0.25 },
  },
  {
    id: 'vhs',
    label: 'VHS',
    category: 'Retrô e digital',
    description: 'Fita de vídeo dos anos 90: cores borradas, chiado e linhas.',
    material: look('toon3', 0.7),
    post: { chroma: 4, scanlines: 0.35, wobble: 1, grain: 0.22, saturation: 1.25, soften: 0.15, vignette: 0.3 },
  },
  {
    id: 'gameboy',
    label: 'Game Boy',
    category: 'Retrô e digital',
    description: 'Quatro tons de verde e pixels pontilhados.',
    material: look('toon3', 1),
    post: { pixelate: 7, palette: ['#0f380f', '#306230', '#8bac0f', '#c4d996'], dither: 1, contrast: 1.15 },
  },
  {
    id: 'blueprint',
    label: 'Planta baixa',
    category: 'Retrô e digital',
    description: 'Desenho técnico: linhas brancas sobre papel azul quadriculado.',
    material: look('smooth', 0),
    post: { edges: 1, edgeColor: '#eaf2ff', edgeWidth: 1.2, paperColor: '#1d4f91', grid: 1 },
  },

  // ---------- Cinema e clima ----------
  {
    id: 'noir',
    label: 'Noir',
    category: 'Cinema e clima',
    description: 'Filme policial em preto e branco, contraste alto e sombras duras.',
    material: look('toon3', 1.1),
    post: { grayscale: 1, contrast: 1.65, grain: 0.18, vignette: 0.75 },
  },
  {
    id: 'hora-dourada',
    label: 'Hora dourada',
    category: 'Cinema e clima',
    description: 'Luz quente de fim de tarde, brilho suave e cores douradas.',
    material: look('toon3', 0.8),
    post: { tint: '#ffb25c', tintAmount: 0.35, saturation: 1.2, glow: 0.45, vignette: 0.45, brightness: 0.03 },
  },
  {
    id: 'noite-azul',
    label: 'Noite azul',
    category: 'Cinema e clima',
    description: 'Cena de noite de cinema, azulada e com brilho nas luzes.',
    material: look('toon3', 0.9),
    post: { grayscale: 0.6, tint: '#6f8cff', tintAmount: 0.7, brightness: -0.12, saturation: 0.9, glow: 0.4, vignette: 0.55 },
  },
  {
    id: 'sonho',
    label: 'Sonho pastel',
    category: 'Cinema e clima',
    description: 'Tons de algodão-doce, luz difusa e contornos que se desfazem.',
    material: look('smooth', 0.2, '#8a6a9a'),
    post: { tint: '#ffc6e8', tintAmount: 0.3, brightness: 0.14, contrast: 0.78, saturation: 0.7, soften: 0.6, glow: 0.55 },
  },
  {
    id: 'terror',
    label: 'Terror',
    category: 'Cinema e clima',
    description: 'Verde doentio, luz que pisca, granulação e sombras pesadas.',
    material: look('toon3', 1.2),
    post: { grayscale: 0.55, tint: '#9fd18a', tintAmount: 0.45, contrast: 1.35, brightness: -0.12, grain: 0.3, vignette: 0.9, flicker: 0.35, chroma: 1.5 },
  },
];

export const DEFAULT_RENDER_STYLE = RENDER_STYLES[0];

export function renderStyle(id: string | undefined): RenderStyle {
  return RENDER_STYLES.find((s) => s.id === id) ?? DEFAULT_RENDER_STYLE;
}
