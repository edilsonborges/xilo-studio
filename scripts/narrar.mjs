#!/usr/bin/env node
// Gera a narração do roteiro com as vozes neurais do Edge TTS (Read Aloud do
// Microsoft Edge). Não precisa de chave. O .mp3 gerado é o que você envia no app.
//
//   npm run narrar -- roteiro.txt
//   npm run narrar -- roteiro.txt --voz pt-BR-FranciscaNeural --saida narracao.mp3
//   npm run narrar -- --vozes

import { createWriteStream } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { pipeline } from 'node:stream/promises';
import { parseArgs } from 'node:util';
import { MsEdgeTTS, OUTPUT_FORMAT } from 'msedge-tts';

const AJUDA = `Uso: npm run narrar -- <roteiro.txt> [opções]

  --voz <nome>         voz neural (padrão: pt-BR-AntonioNeural)
  --saida <arquivo>    arquivo .mp3 de saída (padrão: narracao.mp3)
  --velocidade <n>     1 é o normal; 0.9 mais lento, 1.15 mais rápido
  --tom <valor>        ajuste de tom, por exemplo -10Hz ou +15Hz
  --vozes [idioma]     lista as vozes disponíveis (padrão: pt-BR) e sai
  -h, --help           mostra esta ajuda

Use "-" no lugar do arquivo para ler o roteiro da entrada padrão.`;

const escapeXml = (s) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');

async function lerEntradaPadrao() {
  const partes = [];
  for await (const parte of process.stdin) partes.push(parte);
  return Buffer.concat(partes).toString('utf8');
}

async function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      voz: { type: 'string', default: 'pt-BR-AntonioNeural' },
      saida: { type: 'string', default: 'narracao.mp3' },
      velocidade: { type: 'string', default: '1' },
      tom: { type: 'string' },
      vozes: { type: 'boolean', default: false },
      help: { type: 'boolean', short: 'h', default: false },
    },
  });

  if (values.help) {
    console.log(AJUDA);
    return;
  }

  const tts = new MsEdgeTTS();
  try {
    if (values.vozes) {
      const idioma = (positionals[0] ?? 'pt-BR').toLowerCase();
      const vozes = (await tts.getVoices()).filter((v) => v.Locale.toLowerCase().startsWith(idioma));
      if (vozes.length === 0) throw new Error(`Nenhuma voz encontrada para "${idioma}".`);
      for (const v of vozes) console.log(`${v.ShortName.padEnd(36)} ${v.Gender}`);
      return;
    }

    const origem = positionals[0];
    if (!origem) throw new Error(`Informe o arquivo do roteiro.\n\n${AJUDA}`);
    const roteiro = (origem === '-' ? await lerEntradaPadrao() : await readFile(origem, 'utf8')).trim();
    if (!roteiro) throw new Error('O roteiro está vazio.');

    const velocidade = Number(values.velocidade);
    if (!Number.isFinite(velocidade) || velocidade < 0.5 || velocidade > 2) {
      throw new Error('--velocidade precisa ser um número entre 0.5 e 2.');
    }
    const prosodia = { rate: velocidade };
    if (values.tom) prosodia.pitch = values.tom;

    await tts.setMetadata(values.voz, OUTPUT_FORMAT.AUDIO_24KHZ_96KBITRATE_MONO_MP3);
    // o texto vai dentro de SSML: sem escapar, um "&" ou "<" quebra a síntese
    const { audioStream } = tts.toStream(escapeXml(roteiro), prosodia);
    await pipeline(audioStream, createWriteStream(values.saida));
    console.log(`Narração salva em ${values.saida} (voz ${values.voz}).`);
    console.log('Agora envie esse arquivo no Xilo, junto com o mesmo roteiro.');
  } finally {
    tts.close();
  }
}

main().catch((erro) => {
  console.error(`Erro: ${erro.message}`);
  process.exitCode = 1;
});
