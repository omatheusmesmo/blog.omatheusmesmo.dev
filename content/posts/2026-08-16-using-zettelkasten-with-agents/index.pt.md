---
title: "Usando Zettelkasten com agentes"
date: 2026-08-16T12:00:00-03:00
draft: false
tags: ["Zettelkasten", "Obsidian", "Produtividade", "IA", "Agentes de IA", "Context Engineering", "Knowledge Base", "Open Source"]
author: "Matheus Oliveira"
slug: "usando-zettelkasten-com-agentes"
summary: "Como tomar notas estruturadas com Zettelkasten virou a base de memória dos meus agentes de IA, e como isso economiza tokens, tempo e dinheiro."
description: "A história de como adotei o método Zettelkasten no Obsidian e acabei transformando meu segundo cérebro em uma base de conhecimento compartilhada com agentes de IA."
cover:
  image: "cover.png"
  alt: "Fichário de notas conectado a um agente de IA"
  caption: "Zettelkasten e agentes: um segundo cérebro compartilhado"
  relative: true
---

_Não, não estou criando uma nova regra sobre como você deve usar AI, apenas quero contar a história de como eu comecei a tomar notas com mais qualidade, como isso me ajudou a trabalhar de forma mais efetiva com agentes e o quanto isso mexeu no meu próprio desenvolvimento pessoal e profissional._

## Como tudo começou

Há quase um ano e meio, eu estava dando meus primeiros grandes passos com Open Source, um projeto em que eu era maintainer, o BuildCLI, estava deslanchando e eu precisava fazer entregas e code reviews na mesma velocidade em que a codebase crescia, e ela crescia rápido. Documentação quase não havia, a pouca que existia estava atrasada e era difícil convencer os contribuidores a atualizarem. Estamos falando do início de 2025, desenvolvimento assistido por AI ainda não era tão popular e os modelos não eram tão capazes, então não era só delegar para um agente como alguém sugeriria em 2026.

Certo dia zapeando pela internet, ou melhor dizendo, pelo YouTube, eu encontrei um vídeo do Professor Rodrigo Leão baseado no livro "How to Take Smart Notes", de Sönke Ahrens, e ele falava sobre o método Zettelkasten, criado pelo sociólogo alemão Niklas Luhmann. Luhmann acumulou mais de 90.000 fichas ao longo da vida e publicou cerca de 70 livros e mais de 400 artigos, creditando boa parte dessa produtividade ao sistema. Ele acreditava que escrever era uma forma de pensar: ao escrever, organizava melhor as ideias e criava novas conexões entre elas. Com o tempo, um fichário desses acaba virando um "segundo cérebro".

Vídeo abaixo:

{{< youtube lBFiqLEIPDY >}}

## O que é Zettelkasten

Zettelkasten é um método de organização de notas e ideias que ajuda a criar conexões entre elas e a gerar insights. O nome vem do alemão "Zettel" (ficha, papel avulso) e "Kasten" (caixa), uma referência direta ao fichário que o Luhmann mantinha.

Vale um aviso: o Ahrens descreve três tipos de notas no livro (fugazes, de literatura e permanentes). O quarto tipo, as notas de índice, vem dos hubs do próprio Luhmann e ficou popular no Obsidian como MOC (Map of Content). Eu uso os quatro, e é assim que separo:

- **Notas de referência**: o que você tirou de uma fonte externa, escrito com as suas palavras. O Ahrens insiste nesse ponto e eu demorei a entender: não é para colecionar citação. Trecho copiado costuma esconder falta de entendimento, reformular obriga você a entender de verdade.
- **Notas permanentes**: suas próprias ideias sobre um assunto, uma ideia por nota, escritas de um jeito que se expliquem sozinhas daqui a um ano, sem depender do contexto em que nasceram.
- **Notas de índice**: links para outras notas, organizados de forma hierárquica ou temática. Funcionam como o mapa que você usa para navegar por todo o resto.
- **Notas fugazes**: ideias que aparecem de forma espontânea, muitas vezes durante uma leitura ou conversa. Elas são descartáveis por natureza: a regra é processar e virar referência ou permanente em poucos dias, senão o Inbox acumula lixo.

Cada nota recebe um identificador único e pode ser ligada às outras por links, e é daí que nasce a rede: um conhecimento puxa o outro, e o conjunto vai sendo explorado e expandido ao longo do tempo. O objetivo não é armazenar, é ter um sistema que sirva ao seu próprio pensamento e permita desenvolver ideias de forma mais profunda e criativa.

## Obsidian

Originalmente o Zettelkasten era feito com fichas de papel, mas hoje existem ferramentas digitais que facilitam muito a criação e a organização das notas, e a que eu uso é o Obsidian. Ele guarda tudo em markdown, conecta as notas por links e ainda traz recursos como grafo de conhecimento, plugins e temas, o que o torna uma ferramenta e tanto para quem quer aplicar o método.

Eu descobri o app em um segundo vídeo do Professor Rodrigo Leão, porque até então eu vivia no tempo das cavernas, usando bloco de notas e arquivos em plain text. Eu sabia do Notion, mas não me apetecia muito, não gostava da ideia de ter que abrir um navegador e deixar meus dados nas mãos de terceiros. O Obsidian resolvia justamente isso: gratuito, 100% offline, com um sistema de plugins fantástico que permite adicionar um sem-número de funcionalidades, e sem nenhum tipo de vendor lock-in, porque no fim são só arquivos markdown na minha máquina.

Era só isso que faltava, eu tinha meu sistema Zettelkasten pronto e podia começar a tomar minhas notas, eu só gastei alguns dias achando as melhores combinações de templates e plugins para turbinar meu obsidian... (risos), cuidado com esse buraco de coelho, não gaste mais tempo configurando do que usando.

O segundo vídeo do Professor Rodrigo Leão:

{{< youtube Q7LuaSyJM7o >}}

## Second Brain dividido com um... Agente?

O ano é ~~2077 e os agentes escravizaram a humanidade~~ 2026, as pessoas estão usando cada vez mais AI e especialmente fluxos agênticos, e principalmente usando markdown para quase tudo, `AGENTS.md`, `CLAUDE.md`, `ARCHITECTURE.md`. E como se não fosse o bastante, um novo padrão começa a se formar, o SDD, Spec Driven Development. Eu sei que algumas dessas coisas já existiam em 2025, mas acredito que foi em 2026 que elas realmente ganharam força e começaram a se popularizar. E eu estava no meio disso tudo, contribuindo para o Open Source, usando AI e agentes, escrevendo especificações em markdown e tomando notas com Zettelkasten.

Conforme eu aumentava o uso de AI, notei que estava criando e mantendo vários arquivos markdown que nem sempre eu versionava no repositório, o que levava a commits acidentais e perda de especificações. Daí veio a ideia óbvia: consolidar tudo em um único lugar, o meu Zettelkasten. Meu segundo cérebro poderia servir de consulta não somente para mim, mas também para o meu agente, assim como ele também poderia construir parte desse conhecimento.

Isso torna tudo muito interessante, pois eu passei a exercitar a chamada engenharia de contexto sem saber. O termo pegou tração em meados de 2025, quando Tobi Lütke e Andrej Karpathy usaram publicamente, e a Anthropic acabou formalizando a prática em um artigo de engenharia, definindo como "o conjunto de estratégias para curar e manter o conjunto ideal de tokens durante a inferência". Eu estava fazendo exatamente isso: tomando notas estruturadas como parte do meu workflow, compartilhando essas notas com o agente, gerenciando a janela de contexto de forma efetiva e mantendo um histórico de conhecimento que pode ser consultado a qualquer momento, mesmo que o agente seja reiniciado ou atualizado.

Todas as especificações e decisões estratégicas que eu tomei, especialmente aquelas que custaram muitos tokens, agora estão a salvo no meu vault do Obsidian, que eu sincronizo com pelo menos 4 dispositivos diferentes usando Syncthing. Isso me deu um super poder: meus agentes têm um sistema de memória primitivo, mas agnóstico a qualquer provedor, e que eu aproveito junto com eles. Se o agente gastou, digamos, 20k tokens para descobrir que uma combinação de comandos resolve um determinado problema, eu registro isso e consulto quando passar pelo mesmo problema de novo, sem ter que queimar os mesmos 20k tokens outra vez. Economiza dinheiro, tempo e energia.

## Rodando em Produção

Pode parecer somente mais um setup pessoal de tech bro, mas eu construí muita coisa no Open Source neste ano usando esse sistema, e levei a mesma prática para o trabalho. Estou na BMW Techworks Brasil há 8 meses, e a combinação de agentes com Zettelkasten tem sido fundamental para a minha produtividade e o meu aprendizado. Mostrei para o meu colega Kayan de Souza e ele rapidamente começou a usar também. Ele já trabalhava com SDD e arquivos markdown para documentar e orientar o workflow dele, mas migrou para o Obsidian (que é uma facilidade para humanos, poderia muito bem ser uma pasta ou um repositório git) e criou a própria versão de "Knowledge Base", com muito sucesso.

E nós fomos além: fizemos uma apresentação para toda a empresa, inclusive para pessoas de fora do Hub brasileiro, mostrando como usar agentes com Knowledge Bases de forma geral, e não somente com Zettelkasten. A apresentação foi um sucesso e muita gente saiu de lá interessada em adotar a abordagem.

Aqui preciso frisar o mérito do Kayan, que em vez de continuar discutindo comigo foi medir. A gente discordava: eu defendia o Zettelkasten, porque é um método que funciona para humanos há décadas e o agente que se adapte, e ele defendia organização por tópicos com uma página indexadora. Ele montou um benchmark com 859 execuções de tarefa e dois modelos, e o Zettelkasten ganhou o placar em base grande. Custando quase o dobro de tokens, é verdade, e por isso a recomendação final dele é o meio-termo, pastas com notas atômicas. Vale muito a leitura, está nos recursos no final.

Mas o número que ficou comigo não tem nada a ver com a nossa briga: ter uma base de conhecimento, qualquer uma das duas, rendeu cerca de **3x** o resultado de não ter nenhuma, em todas as fases do experimento. A escolha do formato é detalhe perto disso.

## Comece hoje mesmo

Não precisa de nada sofisticado para começar. Um diretório com arquivos markdown já resolve, e o Obsidian entra só como conforto na hora de navegar. O que importa mesmo é a convenção ser estável o bastante para o agente conseguir se virar sozinho.

### Estrutura básica

A minha é essa, e os prefixos numéricos existem justamente para ordenar as pastas e dar um identificador curto para cada tema:

```text
00 Inbox/        # notas fugazes, captura rápida
01 MOCs/         # índices por tema (Map of Content)
02 Referencias/  # notas de literatura, fontes externas
03 Zettelkasten/ # notas permanentes, conhecimento original
80 Templates/    # automação
90 Anexos/       # imagens e arquivos
```

Toda nota processada carrega quatro propriedades no frontmatter:

```yaml
---
id: 01-202602121500
data: 2026-02-12
tags:
  - tipo/permanente
  - status/semente
conexao: "[[01 - Java]]"
---
```

O `id` é o prefixo do MOC mais um timestamp, o que garante unicidade sem eu ter que pensar. O `conexao` é o que impede nota órfã: se ela não aponta para um MOC, não aparece em lugar nenhum e some. E o `status` (`semente`, `brotando`, `perene`) marca maturidade, porque nota nova não tem o mesmo peso de uma que já sobreviveu a algumas revisões.

Essa parte do YAML não é firula: é ela que permite o agente filtrar por tipo, por tema e por maturidade sem precisar ler o vault inteiro.

### Uma skill para o agente

Aqui está o pulo do gato: o agente não precisa adivinhar onde salvar nada. Eu tenho uma skill que ensina o fluxo, e ela dispara quando eu falo "cria uma nota sobre isso" ou "anota no obsidian".

```markdown
---
name: obsidian-notes
description: "Create and manage notes in the Obsidian Zettelkasten vault. Use when
  the user wants to capture knowledge, create a note about something learned,
  document insights, or organize information in Obsidian. Triggers include requests
  like 'create a note', 'add to obsidian', 'anota isso no obsidian',
  'vamos criar uma nota sobre isso'."
---
```

Repare que os gatilhos estão em português e em inglês. É pelo `description` que o agente decide carregar a skill ou não, e como eu falo com ele em português na maior parte do tempo, gatilho só em inglês significa skill que nunca dispara.

Mas a decisão de design que mais importa nessa skill é outra, e eu levei um tempo para chegar nela. A skill **não** contém os templates nem a lista de MOCs. Ela contém uma instrução para ir ler:

> Não faça hardcode do conteúdo dos templates nem da lista de MOCs nesta skill. Os arquivos do vault são a fonte da verdade, leia dinamicamente a cada vez para ficar em sincronia com qualquer mudança que o usuário fizer.

A primeira versão tinha o template copiado dentro dela. Funcionou por umas duas semanas, até eu mudar o template no vault e o agente continuar gerando notas no formato antigo, porque para ele a verdade estava na skill. Hoje ela é basicamente uma lista de "leia estes arquivos primeiro" mais a árvore de decisão que os arquivos não cobrem: se o conteúdo é insight original vira permanente, se é resumo de fonte externa vira referência, se é captura rápida vira fugaz.

Duas fontes da verdade são exatamente uma a mais do que dá para manter sincronizada.

### Um AGENTS.md para o vault

O `AGENTS.md` do vault serve para uma coisa só: registrar o que o agente erra.

Eu comecei escrevendo um manual bonito e completo, e foi desperdício, porque metade daquilo o modelo já sabia. Hoje o arquivo começa assim, apontando para o manual de verdade e cobrindo só o resto:

> Manual completo: `Como Usar Meu Zettelkasten.md`. Este arquivo cobre apenas o que um agente provavelmente vai errar.

O que entrou lá, depois de o agente errar cada um pelo menos uma vez:

- **Convenção de nome**: `{prefixo}-{timestamp} - {título}.md`, sem exceção
- **A diferença de YAML**: notas do Inbox usam propriedades simples (`ID:`, `Data:`), notas processadas usam frontmatter com `---` e chaves minúsculas. O agente misturava os dois
- **Nunca deixar nota órfã**: sem `conexao`, a nota não aparece em nenhum MOC
- **Idioma**: conteúdo em português, termos técnicos em inglês
- **Numeração de MOC**: listar a pasta `01 MOCs/` para achar o próximo número livre, nunca inferir por buracos na sequência, porque alguns números são pulados de propósito e outros são reusados

Esse último item é um bom exemplo do princípio: eu só descobri que precisava dele porque o agente criou um MOC com número duplicado. Cada linha desse arquivo custou um erro.

### Plugins recomendados

Os que eu realmente uso:

- **Templater**: gera o `id`, escolhe o MOC e move o arquivo para a pasta certa já na criação. É o que torna a convenção automática em vez de disciplina
- **Dataview**: monta os índices dos MOCs por query, em vez de eu manter lista na mão
- **Dataview Serializer**: o mais importante para esse workflow, explico abaixo
- **Omnisearch**: busca full-text decente no vault inteiro
- **Kanban**: acompanho minhas issues e PRs de Open Source
- **Periodic Notes**, **Auto Link Title**, **Paste Image Rename**: conveniência do dia a dia

O Dataview Serializer merece parágrafo próprio. Query de Dataview normal é renderizada só dentro do Obsidian, então o arquivo em disco contém a query, e não o resultado. Para mim isso é indiferente, para o agente é fatal: ele lê o arquivo, encontra um bloco de query e nenhum conteúdo. O Serializer escreve o resultado como markdown de verdade dentro do arquivo:

```markdown
<!-- QueryToSerialize: LIST FROM "02 Referencias/01 - Java" -->
<!-- SerializedQuery: LIST FROM "02 Referencias/01 - Java" -->
- [[01-202602091530 - Título da primeira nota]]
- [[01-202602091700 - Título da segunda nota]]
<!-- SerializedQuery END -->
```

Agora o MOC é legível por qualquer coisa que saiba ler texto, e o agente consegue navegar o vault pelos índices em vez de varrer todos os diretórios. Isso é recuperação sob demanda na prática: ele lê um MOC pequeno e busca só a nota que interessa, em vez de carregar o vault inteiro na janela de contexto.

## Conclusão

Se eu puder resumir tudo em uma frase: pare de jogar contexto fora. A ferramenta e o formato importam bem menos do que ter alguma coisa escrita em algum lugar.

Todo dia a gente resolve problemas que custaram tempo, tokens e paciência, e depois fecha o terminal e perde tudo. O agente esquece na próxima sessão, e eu esqueço daqui a seis meses. Escrever isso em algum lugar estruturado resolve os dois problemas de uma vez, e essa é a parte que me surpreendeu: eu montei o sistema para mim e ganhei memória para os agentes de brinde, agnóstica de provedor e versionada por mim.
n~a
Se você já toma notas, você está a um `AGENTS.md` de distância de compartilhar isso com o seu agente. Se você não toma, comece pela nota fugaz, que é a de menor atrito, e deixe o resto crescer.

E cuidado com o buraco de coelho da configuração. Sério.

---

## Recursos

- [How to Take Smart Notes, Sönke Ahrens](https://www.goodreads.com/book/show/34507927-how-to-take-smart-notes)
- [Zettelkasten.de: Introduction to the Zettelkasten Method](https://zettelkasten.de/introduction/)
- [Niklas Luhmann (Wikipedia)](https://en.wikipedia.org/wiki/Niklas_Luhmann)
- [Zettelkasten na prática, Prof. Rodrigo Leão](https://www.youtube.com/watch?v=lBFiqLEIPDY)
- [Obsidian, Prof. Rodrigo Leão](https://www.youtube.com/watch?v=Q7LuaSyJM7o)
- [Obsidian](https://obsidian.md/)
- [Effective context engineering for AI agents, Anthropic](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents)
- [Knowledge bases para agentes: o que eu medi em 859 execuções, e o que joguei fora, Kayan de Souza Pereira](https://medium.com/@kayandesouzapereira/knowledge-bases-para-agentes-o-que-eu-medi-em-859-execu%C3%A7%C3%B5es-e-o-que-joguei-fora-973e3499488e)
- [Open Knowledge Format (OKF), Google Cloud](https://github.com/GoogleCloudPlatform/knowledge-catalog/tree/main/okf)
- [GitHub Spec Kit](https://github.com/github/spec-kit)
- [Syncthing](https://syncthing.net/)
