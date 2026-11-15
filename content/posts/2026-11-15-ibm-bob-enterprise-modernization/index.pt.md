---
title: "IBM Bob e a aposta em modernização repetível"
date: 2026-11-15T10:00:00-03:00
draft: false
tags: ["IBM Bob", "AI", "Agentic Coding", "Modernization", "Java", "Quarkus", "Claude Code", "Codex"]
author: "Matheus Oliveira"
slug: "ibm-bob-agente-de-codigo-modernizacao"
summary: "Peça a um agente de código para migrar um sistema para o Java 21 em dois dias diferentes e ele pode voltar com duas abordagens diferentes. O IBM Bob aposta em workflows para resolver isso. O que ele é, o que os pacotes para Java, IBM i e IBM Z prometem, quanto custa e o que ainda precisa ser conferido."
description: "IBM Bob em 2026: a arquitetura V2, os modos Agent, Plan e Ask, o roteamento entre modelos, os Premium Packages para Java, IBM i e IBM Z, os preços em Bobcoins, a comparação com Claude Code e Codex e como adotar o agente no time com permissões e controle de custo."
cover:
  image: "cover.png"
  alt: "Mascote do IBM Bob, um robô sorridente de capacete azul de obra, ao lado de formas geométricas azuis e roxas, um foguete e linhas de código binário"
  caption: "Imagem: IBM Community, grupo IBM Bob"
  relative: true
---

Imagine duzentos módulos em Java 8 que precisam chegar ao Java 21. Escrever o código de cada migração é a parte fácil. O difícil é descobrir regras de negócio que ninguém documentou, mexer em milhares de arquivos sem mudar o comportamento e fazer o módulo 150 sair igual ao módulo 3. O próprio blog da IBM usa esse exemplo: peça a um agente para "migrar isto para o Java 21" em dois dias diferentes e ele pode voltar com duas abordagens diferentes. Numa tarefa avulsa, tanto faz. Num projeto em fases, é isso que derruba o cronograma.

O IBM Bob foi desenhado em cima desse problema, então fui ler a documentação, os comunicados e o que gente de fora publicou. Não rodei o Bob: cada número aqui vem com quem o afirma.

## O que está no ar hoje

O Bob ficou disponível de forma geral em 28 de abril de 2026, como SaaS e com trial de 30 dias. Existe como extensão de IDE e como Bob Shell, a versão de terminal, que também roda em modo não interativo para ser chamada de scripts.

A V2, de 24 de junho, trocou as bases separadas da IDE e do shell por um único agente e uma única harness. Os cinco modos viraram três (Agent executa, Plan levanta contexto e entrega um plano, Ask só lê), o trabalho exploratório pode ir para subagentes que devolvem só o resumo, e o antigo checkpoint baseado em git virou um rollback por tarefa, por turno ou por chamada de ferramenta. Ela também aproveita regras, comandos e servidores MCP que você já usa em outra ferramenta.

## O workflow é o produto

Nada disso, sozinho, separa o Bob de um Claude Code ou de um Codex. Os workflows separam. A IBM parte da ideia de que nem todo passo de uma modernização deveria passar por um modelo: varrer dependências e rodar testes é automação comum, aprovar a estratégia e revisar o diff cabe a uma pessoa, e a IA fica com as transformações complexas. O workflow define onde cada passo mora, e o motor executa na ordem, guarda o estado e trata os erros.

Sobre esse motor, a IBM vende os Premium Packages. O de Java é o que mais me interessa, porque é o meu terreno. Ele leva aplicações do Java 8 ou 11 para o 17, 21 ou 25 em ciclos de build, teste, diagnóstico e correção, com OpenRewrite nas transformações que precisam ser determinísticas, e cobre também migração para WebSphere Liberty, troca de telas em JSF ou Struts por React, Angular ou Vue, geração de testes com JaCoCo e correção de dependências vulneráveis pela base OSV.

Quem trabalha com Quarkus vai reparar numa linha da documentação desse pacote: entre as skills aparece uma `spring-boot-to-quarkus`, descrita como uma migração modular, guiada por portões, com validação de compilação depois de cada fase. Não sei como ela se sai num projeto Spring de verdade; seria a primeira coisa que eu testaria.

Para IBM Z, o pacote se apoia no Z Understand, uma análise estática que transforma COBOL, PL/I, assembler e JCL num repositório consultável, para que o Bob escreva consultas determinísticas sobre os metadados da aplicação em vez de depender só de geração probabilística. Num sistema com milhares de programas, saber quem chama quem precisa ter resposta exata. O de IBM i lê os membros-fonte direto do QSYS, sem o vai e vem de exportar e importar, converte RPG de formato fixo para free-form e DDS para DDL, e extrai regras de negócio.

## Lado a lado com Claude Code e Codex

Um teste independente publicado em outubro confirmou que o Bob tem o que se espera de um bom agente de código: skills, MCP, AGENTS.md e modo plan. A diferença mais visível está no modelo. Em vez de amarrar tudo a um só, o Bob roteia cada tarefa entre Claude, Mistral, Granite e modelos ajustados para código, segurança e migração de Java, pesando precisão, latência e custo. A ideia, segundo a IBM, é que completar uma linha não precisa do mesmo modelo que planeja uma refatoração, e que ninguém deveria ter de gastar tempo escolhendo.

Nesse teste, o Bob entregou uma loja de café de página única, com filtro, carrinho e confirmação de pedido, em menos de dois minutos e com cerca de 32 mil tokens (0,5 Bobcoin, uns 20 centavos de dólar no plano Pro), contra uns 15 minutos e cerca de 130 mil tokens do Claude Code. A interface do Bob saiu tão utilizável quanto a do concorrente, e até mais funcional segundo o autor. Numa issue do `python-slugify`, os dois corrigiram o bug e passaram nos testes, e o Bob chegou lá com um patch mais curto e com menos da metade dos tokens de saída. Para quem acompanha custo de agente, é um bom sinal de que o roteamento entre modelos faz diferença na conta.

O resto da comparação acontece longe do editor. O plano Enterprise roda self-hosted e até air-gapped, com modelos hospedados pelo cliente, o Bob Shell registra os passos do agente para rastreabilidade, segundo a IBM, e os Bobcoins não têm cota diária nem semanal, o que um departamento de compras orça com mais facilidade. Entre as pessoas ouvidas por uma reportagem, houve quem achasse o modo plan do Bob mais rigoroso e deliberado que o do Claude Code, e quem descreveu a proposta como um fluxo de desenvolvimento completo, e não só mais um copiloto.

## Os números são da IBM

O comunicado de abril diz que mais de 80 mil funcionários da IBM usam o Bob e que os usuários pesquisados relataram, por autodeclaração, 45% de ganho médio de produtividade. Nas tarefas específicas os números foram maiores: a equipe do IBM Instana relatou 70% menos tempo em tarefas selecionadas, cerca de 10 horas por semana, e a do Maximo estimou 69% de economia em geração e refatoração de código.

Entre os clientes, a Blue Pearl usou o Bob em modernização Java e, segundo a IBM, concluiu em cerca de 3 dias um trabalho que levaria mais de 30 dias de desenvolvedor, o que dá algo perto de 90% de ganho de velocidade.

## Quanto custa em Bobcoins

Pela página de preços da IBM, o Pro sai a partir de US$ 20 por instância com 50 Bobcoins, o Pro+ a partir de US$ 60 com 180 e o Ultra a partir de US$ 200 com 1.000; o Enterprise é sob consulta, com limites de Bobcoins por equipe e por usuário. O trial dá 50 Bobcoins por 30 dias, e cada Bobcoin extra custa cerca de US$ 0,50, segundo o teste independente. O pacote de Java começa em US$ 20 e o de IBM i em US$ 40, com primeiro mês grátis para assinantes novos até 31 de dezembro de 2026. Em abril, uma reportagem do lançamento publicou 40 Bobcoins no Pro e 500 no Ultra, então confira a página antes de fazer conta.

## Como levar para o time

Um agente que roda comandos no seu terminal merece o mesmo cuidado de qualquer ferramenta com esse poder, e o Bob traz bastante coisa para isso. Na V2, leituras de arquivo são aprovadas por padrão, mas editar arquivos, executar comandos, chamar ferramentas MCP e invocar skills continuam exigindo aprovação explícita, que dá para apertar ou afrouxar por classe de ferramenta. Ao lado da aprovação ficam o rollback, as regras customizadas e os arquivos de ignore. A documentação da IBM trata o auto-approve de comandos como alto risco e recomenda listas de permissão sem curingas, e esse é o ponto de partida que eu usaria: Ask ou Plan para entender código desconhecido, Agent depois que o plano estiver claro, e permissões estreitas para cada comando liberado.

Para quem lidera um time, o Bobalytics reúne produtividade, qualidade, governança, uso e custo em um só lugar, e o plano Enterprise acrescenta limites de Bobcoins por equipe e por usuário. É o tipo de controle que costuma faltar quando cada pessoa assina uma ferramenta por conta própria.

Minha sugestão é começar fora do trabalho, com um projeto pessoal ou um repositório de código aberto, sem código nem dados da empresa e sem credenciais por perto. Um sistema Java antigo seu, ou um projeto Spring de demonstração, serve bem para usar o mês grátis do pacote e fazer uma pergunta só: rodar o mesmo workflow em dois ou três módulos parecidos e comparar os diffs. Se saírem consistentes, a promessa central do Bob se confirma na prática, e aí vale levar o assunto para o time, com o aval da empresa e dentro da política de uso de IA. Em código novo, o Bob compete com os agentes generalistas, e os argumentos dele ali são o roteamento entre modelos e um custo que dá para prever em Bobcoins.

## Fontes

- [Comunicado de disponibilidade geral do IBM Bob, 28/04/2026](https://www.prnewswire.com/news-releases/introducing-ibm-bob-ai-development-partner-that-takes-enterprises-from-ai-assisted-coding-to-production-ready-software-302755018.html)
- [Comunicado de 09/07/2026: multiagente e workflows de modernização](https://canada.newsroom.ibm.com/2026-07-09-ibm-advances-enterprise-ai-software-development-with-multi-agent-capabilities-and-specialized-modernization-workflows)
- [IBM Bob Premium Packages e nova arquitetura](https://www.ibm.com/new/announcements/ibm-bob-expands-with-premium-packages-new-architecture-and-greater-enterprise-control)
- [Bob V2: Faster, better, smarter](https://bob.ibm.com/blog/bob-v2-release-announcement)
- [Documentação do pacote Java Modernization](https://bob.ibm.com/docs/ide/premium-packages/java-modernization/java-modernization-index) e [página de produto](https://www.ibm.com/products/ai-coding-agent/java-modernization)
- [Documentação do Bob Shell](https://bob.ibm.com/docs/shell) e [preços](https://www.ibm.com/products/ai-coding-agent/pricing)
- [The Register, 28/04/2026](https://www.theregister.com/software/2026/04/28/ibms-ai-coding-partner-bob-hits-general-availability/5226774)
- [Journal du Net, 07/10/2026](https://www.journaldunet.com/intelligence-artificielle/1555847-que-vaut-ibm-bob-l-agent-de-code-qui-veut-rivaliser-avec-claude-code-et-codex/)
- [TechFinitive: what users and experts think](https://www.techfinitive.com/features/ibm-bob-is-out-so-what-do-users-and-experts-think/)
