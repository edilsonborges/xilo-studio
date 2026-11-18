export const CAPTION_STYLES = [
  { id: 'pill', label: 'Pílula', description: 'Fundo branco e destaque na palavra falada' },
  { id: 'cinema', label: 'Cinema', description: 'Texto branco com contorno sobre a cena' },
  { id: 'headline', label: 'Manchete', description: 'Letras maiúsculas em uma faixa escura' },
  { id: 'cordel', label: 'Cordel', description: 'Papel creme, serifa e sublinhado' },
  { id: 'spotlight', label: 'Palavra em foco', description: 'Uma palavra por vez, em tamanho grande' },
] as const;

export type CaptionStyle = (typeof CAPTION_STYLES)[number]['id'];
export function captionStyle(value: string): CaptionStyle {
  return CAPTION_STYLES.find(style => style.id === value)?.id ?? 'pill';
}

const SANS = "'Helvetica Neue', 'Segoe UI', Arial, sans-serif";
const SERIF = "Georgia, 'Times New Roman', serif";
const fonts: Record<CaptionStyle, string> = {
  pill: `800 62px ${SANS}`,
  cinema: `600 58px ${SANS}`,
  headline: `900 67px ${SANS}`,
  cordel: `italic 700 68px ${SERIF}`,
  spotlight: `900 110px ${SANS}`,
};
const maxWidth = 860;
const lineHeight = 86;

function panel(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, radius: number, color: string) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, radius);
  ctx.fill();
}

// A origem é o centro da legenda, em unidades do vídeo de 1080 px.
// O cartão do seletor usa o mesmo desenho, com outra escala.
export function paintCaption(ctx: CanvasRenderingContext2D, style: CaptionStyle, words: string[], active: number, accent: string): void {
  if (!words.length) return;
  ctx.save();
  ctx.font = fonts[style];
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  if (style === 'spotlight') {
    const word = words[active];
    const width = Math.min(maxWidth, ctx.measureText(word).width);
    ctx.textAlign = 'center';
    ctx.strokeStyle = '#17110d';
    ctx.lineWidth = 14;
    ctx.strokeText(word, 0, 0, maxWidth);
    ctx.fillStyle = '#fffaf0';
    ctx.fillText(word, 0, 0, maxWidth);
    panel(ctx, -width / 2, 62, width, 10, 5, accent);
    ctx.restore();
    return;
  }

  ctx.textAlign = 'left';
  const text = style === 'headline' ? words.map(w => w.toLocaleUpperCase('pt-BR')) : words;
  const widths = text.map(w => Math.min(maxWidth, ctx.measureText(w).width));
  const space = ctx.measureText(' ').width;
  const lines: Array<{ from: number; to: number; width: number }> = [];
  let from = 0;
  let width = 0;
  for (const [i, wordWidth] of widths.entries()) {
    if (i > from && width + space + wordWidth > maxWidth) {
      lines.push({ from, to: i, width });
      from = i;
      width = 0;
    }
    width += (i > from ? space : 0) + wordWidth;
  }
  lines.push({ from, to: text.length, width });
  const w = Math.max(...lines.map(line => line.width)) + 92;
  const h = lines.length * lineHeight + 52;
  const x = -w / 2;
  const y = -h / 2;
  if (style === 'pill') {
    panel(ctx, x + 8, y + 10, w, h, 48, '#140e0a');
    panel(ctx, x, y, w, h, 48, '#ffffff');
    ctx.lineWidth = 6;
    ctx.strokeStyle = '#140e0a';
    ctx.stroke();
  } else if (style === 'headline') {
    panel(ctx, x, y, w, h, 2, '#191717');
    ctx.fillStyle = accent;
    ctx.fillRect(x, y, 14, h);
  } else if (style === 'cordel') {
    panel(ctx, x + 6, y + 8, w, h, 1, '#2b2016');
    panel(ctx, x, y, w, h, 1, '#ffebbb');
    ctx.strokeStyle = '#392319';
    ctx.lineWidth = 3;
    ctx.strokeRect(x + 8, y + 8, w - 16, h - 16);
  }

  for (const [row, line] of lines.entries()) {
    let left = style === 'headline' ? x + 46 : -line.width / 2;
    const baseline = y + 28 + lineHeight * (row + 0.5);
    for (let i = line.from; i < line.to; i++) {
      let ink = '#1b1512';
      if (style === 'pill' && i === active) {
        panel(ctx, left - 12, baseline - 37.2, widths[i] + 24, 74.4, 18, accent);
        ink = '#fff';
      } else if (style === 'cinema') {
        ctx.strokeStyle = '#12100e';
        ctx.lineWidth = 8;
        ctx.strokeText(text[i], left, baseline, maxWidth);
        ink = '#fff';
      } else if (style === 'headline') {
        ink = i === active ? '#ffda62' : '#fff';
      } else if (style === 'cordel' && i === active) {
        ctx.fillStyle = accent;
        ctx.fillRect(left, baseline + 30, widths[i], 6);
      }
      ctx.fillStyle = ink;
      ctx.fillText(text[i], left, baseline, maxWidth);
      left += widths[i] + space;
    }
  }
  ctx.restore();
}
