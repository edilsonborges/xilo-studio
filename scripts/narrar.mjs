#!/usr/bin/env node
import { createWriteStream } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { pipeline } from 'node:stream/promises';
import 'dotenv/config';
import { STUDIO_STYLES, studioStyle, VOICESTUDIO_ID, createVoiceStudio, voiceStudioConfig } from '../server/voicestudio.ts';
import { parseArgs } from 'node:util';
import { MsEdgeTTS, OUTPUT_FORMAT } from 'msedge-tts';

const AJUDA = `Uso: npm run narrar -- <roteiro.txt> [opções]

  --voz <nome>         voz neural (padrão: voicestudio-pt-br)
  --saida <arquivo>    arquivo de saída (VoiceStudio em WAV, Edge em MP3)
  --velocidade <n>     1 é o normal; 0.9 mais lento, 1.15 mais rápido
  --tom <valor>        ajuste de tom do Edge, por exemplo -10Hz ou +15Hz
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
      voz: { type: 'string', default: VOICESTUDIO_ID },
      saida: { type: 'string' },
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
      if ('pt-br'.startsWith(idioma)) {
        for (const style of STUDIO_STYLES) console.log(style.id.padEnd(36) + style.label);
      }
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
    if (studioStyle(values.voz)) {
      if (values.tom) throw new Error('Para ajustar o tom, escolha uma voz do Edge com --voz.');
      const saida = values.saida || 'narracao.wav';
      if (!saida.toLowerCase().endsWith('.wav')) throw new Error('Escolha um arquivo .wav para a saída do VoiceStudio.');
      const { audio } = await createVoiceStudio(voiceStudioConfig())({
        text: roteiro, voice: values.voz, rate: velocidade,
      });
      await writeFile(saida, audio);
      console.log(`Narração salva em ${saida}.`);
      return;
    }
    const saida = values.saida || 'narracao.mp3';
    const prosodia = { rate: velocidade };
    if (values.tom) prosodia.pitch = values.tom;

    await tts.setMetadata(values.voz, OUTPUT_FORMAT.AUDIO_24KHZ_96KBITRATE_MONO_MP3);
    // o texto vai dentro de SSML: sem escapar, um "&" ou "<" quebra a síntese
    const { audioStream } = tts.toStream(escapeXml(roteiro), prosodia);
    await pipeline(audioStream, createWriteStream(saida));
    console.log(`Narração salva em ${saida} (voz ${values.voz}).`);
    console.log('Agora envie esse arquivo no Xilo, junto com o mesmo roteiro.');
  } finally {
    tts.close();
  }
}

main().catch((erro) => {
  console.error(`Erro: ${erro.message}`);
  process.exitCode = 1;
});
