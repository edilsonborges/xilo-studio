# Changelog

Todas as mudanças relevantes do Xilo Studio ficam registradas aqui. O formato
segue o [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/) e as versões
seguem o [Versionamento Semântico](https://semver.org/lang/pt-BR/).

## [0.8.1] - 2026-11-18

### Corrigido

- Onde o VoiceStudio não está disponível, gerar a narração com a voz inicial
  falhava sempre. Agora o Xilo confere se o VoiceStudio está no ar: se não
  estiver, mostra só as vozes do Edge e usa uma delas como voz inicial.

## [0.8.0] - 2026-11-18

### Adicionado

- VoiceStudio passa a ser a voz inicial, com quatro estilos em português brasileiro. Natural usa Dora, Notícia usa Alex, Conto usa Santa e Documentário combina Dora e Alex. As vozes do Edge continuam disponíveis no seletor.

- A narração ganhou player e histórico das três últimas versões neste navegador. Regenerar seleciona a nova voz. Você pode ouvir e escolher uma versão anterior ou permitir a substituição automática da mais antiga.

- Dê play para ouvir uma amostra da voz antes de gerar o roteiro. Depois de gerar, o player mostra a versão selecionada.
- Compare os estilos Pílula, Cinema, Manchete, Cordel e Palavra em foco nos cartões abaixo de Legendas na prévia. Vozes, velocidades e versões de áudio também ganharam seletores maiores.

### Alterado

- O player da narração ganhou controles no estilo do Xilo. Clique no título do player para trocar a versão usada no vídeo ou na seta de download para baixar a versão selecionada. O seletor de legenda ocupa toda a largura abaixo da caixa Legendas.

### Corrigido

- O botão Melhorar texto permanece ao lado de Usar exemplo. Se a IA estiver indisponível, o motivo aparece junto ao roteiro.

- Veículos em movimento param antes da fachada de prédios. Rodas e passageiros acompanham a parada ao reproduzir, retroceder e exportar.

- Carros e pedestres também param ao se encontrar, inclusive em cruzamentos e filas. A passada acompanha a distância percorrida, e o salto segue um arco de queda.

## [0.7.0] - 2026-11-18

### Adicionado

- O passo "Estilo do vídeo" agora mostra uma imagem de exemplo de cada um dos
  34 estilos. O botão abre uma grade com todos, agrupados, e marca o escolhido.
- "Usar exemplo" escreve uma história nova a cada clique, em temas que se
  revezam: sertão, cidade com chuva, festa junina, pescaria, feira e outros.
- "Melhorar texto": a IA do Xilo reescreve o seu roteiro, mais visual e no
  tamanho certo. A sugestão aparece na própria caixa, abaixo de uma linha
  tracejada, e você escolhe entre Aceitar e Descartar.
- Duração do vídeo: um controle de 5 segundos a 3 minutos, com padrão de 30
  segundos. O exemplo e o texto melhorado saem nesse tamanho, e o app mostra
  quanto tempo de narração o seu texto dá.

## [0.6.0] - 2026-11-17

### Adicionado

- Ações no tempo da narração: no vídeo 3D, cada personagem pode fazer mais de
  uma coisa na mesma cena, na hora em que a palavra é falada. Em "ele chegou à
  vila e contou aos amigos", ele chega andando e só então começa a contar. A
  troca de uma ação para outra é suave, e ele só se desloca enquanto anda.
- Ficha da história: antes de montar as cenas, a IA do Xilo lê o roteiro
  inteiro e fixa época e lugar, tom, elenco e a sequência de lugares, hora e
  clima. As cenas seguem a ficha, e ela aparece na lista de etapas.
- Variações: gerar de novo o mesmo roteiro produz outra versão coerente, com
  outras câmeras, objetos, companhia e ambiente. O lugar e as ações do roteiro
  não mudam.
- A IA do Xilo passou a consultar oito histórias de exemplo (sertão, cidade,
  infância, festa junina, mar, família, fé e humor) e usa as mais próximas do
  roteiro.

### Corrigido

- "Caminhava" era lido como "caminhão" pelo gerador sem IA, e o personagem
  aparecia dirigindo um caminhão.

## [0.5.0] - 2026-11-17

### Adicionado

- A versão ao lado do título agora é clicável e abre as novidades de cada
  versão, no visual do app.

## [0.4.0] - 2026-11-17

### Adicionado

- 12 ações novas para os personagens 3D: escutar, espantar-se, rir, chorar,
  concordar, negar, pensar, carregar, trabalhar (enxada), comer, abraçar e cair.
- Gestos e reações funcionam sentado: dá para aplaudir no banco ou comer à mesa.

### Alterado

- Os personagens acenam muito menos. Acenar, apontar, aplaudir, comemorar,
  espantar-se, rir, concordar, negar e abraçar agora tocam uma vez, por cerca
  de dois a três segundos, e o personagem volta a ficar parado, atento.
- Sem ação no roteiro, o personagem fica parado em vez de acenar, e quem
  acompanha escuta, virado para quem fala, em vez de "falar" o tempo todo.
- Quando alguém faz algo e outros assistem ("os vizinhos não acreditaram"),
  quem assiste reage: espanta-se, ri ou chora.
- Andar ou correr sem destino definido passa a atravessar o quadro, em vez de
  marchar no lugar.

## [0.3.0] - 2026-11-17

### Adicionado

- 25 cenários 3D em seis grupos:
  - **Sertão e campo:** sertão de dia, caatinga na seca, fazenda e roça, vila
    ao entardecer, estrada de terra.
  - **Cidade:** rua da cidade, praça com coreto, feira livre, cidade à noite.
  - **Natureza:** floresta, beira de rio, serra e montanhas, campo florido.
  - **Litoral e água:** praia, porto e cais, alto-mar.
  - **Interiores:** quarto à noite, sala de casa, cozinha, sala de aula, dentro
    da igreja.
  - **Festas e sonho:** festa junina, carnaval, noite estrelada, sonho.
- Personagens de quatro tipos (homem, mulher, criança e idoso), com cabelo,
  roupa e proporções próprias, e novos acessórios: boné, chapéu de couro de
  cangaceiro, lenço e óculos.
- 15 ações: andar, correr, pular, dançar, sentar, conversar, acenar, apontar,
  bater palmas, comemorar, rezar ajoelhado, dormir, dirigir e montar, além de
  ficar parado.
- Veículos que andam durante a cena e levam gente: carro, caminhão, ônibus,
  bicicleta, moto, barco e carroça. Animais: cavalo (dá para montar),
  cachorro, galinha, pássaro, cabra e boi.
- Mais de 40 objetos novos, como prédios, igreja, coreto, barraca de feira,
  poste, banco, coqueiro, ponte, cais, sofá, fogão, lousa, fogueira e
  bandeirinhas.
- Clima: sol, nublado, chuva, tempestade com relâmpago, neblina e vento. Hora
  do dia: dia, entardecer, noite e amanhecer. À noite, janelas, postes e
  fogueiras acendem.
- Câmera: grua subindo, grua descendo e câmera na mão.
- A IA do Xilo e o gerador por regras reconhecem tudo isso no roteiro. Por
  exemplo, "seu Antônio, com oitenta anos, disparou pela praça" vira um idoso
  correndo na praça.

### Alterado

- Vidros dos veículos translúcidos e cabines abertas, para quem dirige aparecer.
- Cenas antigas (JSON da v0.2.0) continuam valendo sem mudança.

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
