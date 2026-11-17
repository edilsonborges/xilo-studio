# Changelog

Todas as mudanças relevantes do Xilo Studio ficam registradas aqui. O formato
segue o [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/) e as versões
seguem o [Versionamento Semântico](https://semver.org/lang/pt-BR/).

## [0.2.0] - 2026-11-17

### Adicionado

- 30 visuais para o vídeo 3D, em seis grupos no passo "Estilo do vídeo":
  - **Cordel e gravura:** Xilogravura clássica, Xilogravura P&B, Sépia antiga,
    Linogravura, Carimbo.
  - **Desenho e HQ:** HQ com retícula, Mangá P&B, Cartum, Rascunho a lápis,
    Giz de cera.
  - **Pintura:** Aquarela, Guache pastel, Pop art, Vitral, Óleo impressionista.
  - **Brinquedo e material:** Massinha, Papel recortado, Brinquedo de madeira,
    Feltro, Origami.
  - **Retrô e digital:** Pixel art, Fliperama neon, VHS, Game Boy, Planta baixa.
  - **Cinema e clima:** Noir, Hora dourada, Noite azul, Sonho pastel, Terror.
- Trocar o visual de um vídeo 3D já gerado muda o preview na hora, sem gerar
  de novo. A exportação sai no visual escolhido.
- Cada visual tem uma descrição curta embaixo do seletor.

### Alterado

- O antigo "3D de cordel" agora se chama "Xilogravura clássica" e continua
  com o mesmo visual. Quem tinha essa opção salva passa a ela automaticamente.

## [0.1.0] - 2026-11-17

Primeira versão publicada, em https://xilo.edilson.dev.

### Adicionado

- Roteiro e narração viram um vídeo vertical 9:16 (1080x1920) com legenda que
  destaca a palavra falada, título de lugar e movimento de câmera, exportado
  em MP4 ou WebM.
- Narração gerada no próprio app com as vozes neurais do Edge TTS (Antonio,
  Francisca e Thalita), em cinco velocidades. A legenda usa o tempo exato de
  cada palavra falada, e o `.mp3` pode ser baixado. Enviar um áudio próprio
  continua funcionando.
- Estilos ilustrados por IA: xilogravura de cordel, aquarela, livro infantil e
  cinema realista. A IA descreve uma imagem por cena, mantendo os mesmos
  personagens, desenha cada uma e o vídeo as anima com transição e movimento.
- Estilo 3D de cordel, com cenas montadas por peças 3D e dirigidas pela IA do
  Xilo ou pelo gerador por regras.
- IA do Xilo no servidor, pelo opencode-gateway desta máquina: ninguém precisa
  de chave no navegador. As chaves próprias (OpenAI, Gemini, Anthropic)
  continuam disponíveis em Configurações.
- Acesso só com login. Não há cadastro aberto: administradores convidam pessoas
  pelo painel **Usuários**, e o convite e o "esqueci a senha" chegam por e-mail.
  Remover alguém encerra o acesso na hora.
- Prévia de link com título, descrição e imagem ao compartilhar no WhatsApp e
  em redes sociais.
- Versão do app visível no topo da página e no painel de usuários.

### Corrigido

- A tela de Configurações deixava de abrir depois que a escolha de voz e
  velocidade foi adicionada.
- A imagem Docker deixava de fora o módulo de narração do servidor, o que
  impedia o servidor de iniciar.
