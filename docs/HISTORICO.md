# Histórico da implantação

O que foi feito entre 17 e 18 de novembro de 2026, em ordem, com as decisões e
os problemas encontrados. Para o que mudou em cada versão do ponto de vista de
quem usa, veja o [CHANGELOG](../CHANGELOG.md).

## 1. Publicação

- O site estático subiu em Docker, na porta `127.0.0.1:47653`, e ganhou o
  endereço https://xilo.edilson.dev pelo túnel `plantix` do Cloudflare.
- A regra do túnel aponta para `127.0.0.1`, porque o cloudflared tenta IPv6
  primeiro e o container só escuta em IPv4.
- O `scripts/update.sh` rodou pela primeira vez, sem precisar de correção.
- O endereço entrou no campo Website do repositório no GitHub.

## 2. Limpeza do cloudflared

- Havia dois serviços antigos do cloudflared falhando em loop desde janeiro, com
  cerca de 1,5 GB de log. Foram desligados e os logs, zipados.
- O log do túnel ativo passou a ser dividido por dia e zipado, com 90 dias de
  retenção. Detalhes em [OPERACAO.md](OPERACAO.md).

## 3. Login e usuários

- O nginx deu lugar a um servidor Node (Express + SQLite), no mesmo esquema do
  projeto Play: senha com scrypt, sessão por cookie e e-mails pelo Resend.
- Sem cadastro aberto: só convite do administrador.
- A chave do Resend fica no `.env` da máquina. Secret do GitHub não serviria,
  porque o deploy é feito aqui, não pelo GitHub Actions.

## 4. Narração no app

- O Edge TTS, que só existia como script de terminal, passou a rodar no
  servidor. Ele devolve o tempo exato de cada palavra, que substituiu a
  estimativa do alinhador na legenda.
- Problema encontrado: o Dockerfile listava os arquivos do servidor um a um e
  deixaria o módulo novo de fora. Passou a copiar a pasta inteira.

## 5. IA pelo opencode-gateway

- Motivo: um roteiro como "jaiminho era um menino que gostava de brincar" gerava
  sempre o mesmo sertão com vaqueiro, porque o kit 3D era pequeno e a IA
  dependia de chave própria de cada pessoa.
- A "IA do Xilo" passou a rodar no servidor, pelo gateway desta máquina, sem
  chave no navegador. Entrou o modo ilustrado, com uma imagem por cena.
- A geração de imagens falhava com 502. A causa estava no gateway (o executor
  não conseguia chamar a ferramenta de imagem) e foi corrigida pela sessão
  daquele projeto.
- A chave do Resend apareceu na conversa por causa de um `docker compose config`
  e foi trocada.

## 6. Versões

| Versão | Issue → PR | Entrou |
|---|---|---|
| 0.1.0 | #1 → #2 | versão, changelog, CI, release automática, prévia de link |
| 0.2.0 | #3 → #5 | 30 visuais para o 3D |
| 0.3.0 | #4 → #6 | 25 cenários, tipos de personagem, 15 ações, veículos, animais, clima |
| 0.4.0 | #7 → #8 | gestos de uma vez, 12 reações e ofícios, fim do aceno de enchimento |
| 0.5.0 | #9 → #10 | versão clicável com modal de novidades; registro de atividade no painel |
| 0.6.0 | #11 → #12 | ficha da história, variações, biblioteca de exemplos, ações no tempo da narração |
| 0.7.0 | #13 → #14 | seletor de estilo com imagens, exemplos em rodízio, "melhorar texto", slider de duração e esta documentação |
| 0.8.0 | → #16 | VoiceStudio, player e histórico de narração, estilos de legenda, colisões no 3D (feita por outra sessão) |
| 0.8.1 | #17 → #18 | voz inicial volta a funcionar onde não há VoiceStudio |
| 0.8.2 | #19 → #20 | VoiceStudio em CPU pelo motor OmniVoice: duas qualidades, espera prevista, andamento e cancelamento |

O registro de atividade do painel ficou fora das notas públicas da 0.5.0, a
pedido.

## Pendências e ideias

- Medir a exportação dos visuais com efeito num navegador com GPU.
- Olhar dirigido, expressões no rosto e "jeito" por ação nos personagens.
- Variações no modo ilustrado.
- Em durações longas, os exemplos da IA saem mais curtos que o pedido.
- O repositório é público: o código do registro de atividade fica visível.

## Lições desta implantação

- Compatibilidade se confere na documentação e no próprio programa, não por dedução. O VoiceStudio tem versão para Mac Intel, mas só da interface; o que não roda em Intel é o motor local. A afirmação errada de que "só roda em Apple Silicon" chegou a entrar numa issue antes de ser corrigida.
- Cancelar um pedido não garante que o serviço do outro lado pare. O VoiceStudio continuou gerando por mais de 100 s depois de um pedido abandonado; o teste real mostrou isso, os testes com serviço falso não.

- Radical curto demais no gerador por regras causa leitura errada ("caminha").
  Os testes com roteiros reais pegaram esse caso.
- A geração de imagem pode ficar sem resposta por muito tempo. O app desiste
  depois de 6 minutos; scripts avulsos precisam do próprio prazo.
- O Chrome automatizado desta máquina renderiza por software. Ele serve para
  conferir o visual, mas não o desempenho.
