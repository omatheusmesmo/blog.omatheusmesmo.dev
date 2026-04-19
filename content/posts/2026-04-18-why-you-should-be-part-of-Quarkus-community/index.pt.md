---
title: "Por que você deve ser parte da comunidade Quarkus"
date: 2026-04-18T15:00:00-03:00
draft: false
tags: ["Open Source", "Quarkus", "Carreira", "Comunidade"]
author: "Matheus Oliveira"
slug: "por-que-voce-deve-ser-parte-da-comunidade-quarkus"
summary: "Contribuir com código aberto não precisa ser assustador. Uma história real de como interagir na comunidade Quarkus resultou na minha contribuição para um projeto recém-lançado em menos de 48 horas."
description: "Descubra como os canais da comunidade Quarkus (Zulip, Community Call) podem acelerar suas contribuições open source e impulsionar sua carreira. Case real com o Quarkus Agent MCP."
cover:
  image: "why-you-should-be-part-of-quarkus-community.png"
  alt: "Logo do Quarkus e símbolos de código aberto"
  caption: ""
  relative: true
---

Muitos desenvolvedores olham para grandes projetos Open Source e sentem que não há espaço para eles. Você entra no repositório, vê milhares de issues, discussões complexas e pensa: *"O que eu poderia acrescentar aqui?"*

Hoje, vou te mostrar o oposto. Quero compartilhar a jornada exata de como contribuí para um projeto do ecossistema Quarkus poucas horas após seu lançamento, não por ser um gênio do código, mas por **estar no lugar certo e falar com as pessoas certas**.

A ideia é simples: te convencer a participar ativamente da comunidade Quarkus e mostrar como isso traz um retorno enorme para a sua carreira.

## O Caso: Quarkus Agent MCP

O [Quarkus Agent MCP](https://github.com/quarkusio/quarkus-agent-mcp) é um projeto novíssimo que facilita o desenvolvimento Quarkus integrando IA através do Model Context Protocol (MCP). Fiquei sabendo da sua primeira release em 13/04/2026 e, incrivelmente, **apenas dois dias depois**, já tinha criado uma issue de report e tido meu Pull Request mergeado na branch principal.

Como isso aconteceu tão rápido? A chave não foi apenas ler código, foi *ouvir a comunidade*.

## A Timeline da Contribuição

- **13/04/2026 - A Descoberta:** Fuçando repositórios (um passatempo meu), achei a primeira release do Quarkus Agent MCP. Fui testar. As instruções do README indicavam usar o JBang apontando para o Maven Central, mas o comando falhava. O `uber-jar` não estava lá.
    - Como as ferramentas de IA sugeriam o comando que estava no repositório, abri a [Issue #24](https://github.com/quarkusio/quarkus-agent-mcp/issues/24) detalhando um *workaround* provisório para que outros desenvolvedores pudessem usar build local nas IDEs (VS Code, OpenCode) enquanto a release oficial não saía. Olhando o repositório, vi que o *workflow* de GitHub Actions na última release falhou, o que explicava a ausência do pacote.

- **14/04/2026 - O Contexto (Quarkus Community Call & Zulip):**
    - Estava acompanhando a **Quarkus Community Call** no Google Meet. O time mencionou o projeto MCP e, de forma transparente, comentou que a release automatizada havia falhado (confirmando minha suspeita). Citei no chat da call que o George Gastaldi poderia dar uma luz sobre pipelines falhas.
    - Algumas horas depois, Max Andersen iniciou um tópico no **Quarkus Zulip Chat** chamando apoio para o workflow. Como eu já estava investigando, postei imediatamente o log de erro do *GitHub Actions* na thread.
    - Gastaldi e Smet responderam rápido, indicando que o formato do workflow precisava ser atualizado aos moldes do repositório Quarkus Gizmo.

- **14 a 15/04/2026 - A Execução e o Merge:**
    - Com a direção técnica correta dada pela própria equipe, entendi como resolver. Abri o [PR #32](https://github.com/quarkusio/quarkus-agent-mcp/pull/32) corrigindo o processo de release, adaptado especificamente para gerar o `uber-jar` e atualizar o catálogo do JBang.
    - **15/04/2026:** Phillip Kruger (mantenedor principal do repositório) fez um pequeno ajuste e o PR foi *merged*.

## Comunidades Oficiais do Quarkus

Se você acessar a página [Support When You Need It](https://quarkus.io/support/), verá além do óbvio (StackOverflow e GitHub). Os canais mais ricos são onde a magia real acontece: **Quarkus Community Call, Zulip Chat, Development Mailing List e Quarkus Insights**.

### Quarkus Community Call
Uma reunião periódica por vídeo (no Google Meet) onde o time central apresenta novidades de produtos, discute o roadmap e faz Q&A. Participar é estar na primeira fila do futuro do ecossistema. É uma chance de ouvir as dores atuais (como um *workflow* que quebrou) e fazer perguntas diretamente aos arquitetos.

### Zulip Chat
O Zulip (hospedado no `quarkusio.zulipchat.com`) é o coração pulsante do projeto. Diferente do Slack ou Discord, o Zulip exige que cada mensagem pertença a um *Tópico*. Isso mantém discussões técnicas organizadas como um fórum, e não uma parede contínua de texto. É aqui que você tira dúvidas pesadas, alinha arquitetura antes de codar um Pull Request grande e conversa *peer-to-peer* com os criadores do framework.

### Development Mailing List
O tradicional fórum por e-mail, focado no aspecto mais formal da engenharia. Por lá circulam anúncios de releases críticos, mudanças profundas no *core* do projeto, propostas de design arquitetural e votações importantes. É uma vitrine do nível de tomada de decisão Open Source *Enterprise*.

### Quarkus Insights
Um podcast semanal no YouTube transmitido ao vivo! Uma conversa técnica super descontraída entre desenvolvedores e especialistas da comunidade. A cada episódio, apresentam uma extensão diferente, padrões de projeto ou histórias de sucesso. É um ótimo lugar para observar como a tecnologia se aplica ao mundo real e aprender diretamente com os autores das implementações.

## Benefícios (Reais) de Participar da Comunidade

Minha interação de apenas dois dias gerou valor rápido por um motivo: a comunidade Quarkus é extremamente acessível. Quando você participa ativamente:

1. **Visibilidade Técnica:** Seus Pull Requests viram mais do que código. Você constrói reputação com engenheiros globais de ponta.
2. **Contexto Antes do Código:** Saber **por que** algo está quebrado economiza horas. O Zulip ou as Calls fornecem o *board* de xadrez completo, fazendo suas contribuições serem precisas.
3. **Networking e Mentorias Orgânicas:** Trabalhar em PRs revisados por líderes técnicos que criaram as especificações do Java te transforma em um engenheiro melhor, de graça.
4. **Construção de Portfólio Ativo:** Em entrevistas de emprego, dizer *"sou proficiente em Quarkus e ajudo a manter algumas de suas integrações de infraestrutura AI"* tem um peso muito diferente de apresentar um CRUD estacionado no Github.

## Conclusão

Não tente contribuir para o Open Source codando sozinho no escuro. A barreira de entrada técnica desaba quando você interage com os mantenedores. O projeto Open Source não é só um repositório, é um grupo de pessoas resolvendo problemas juntas.

Entre no Zulip. Participe da próxima Community Call. Ajude a relatar um bug que você enfrentou hoje. O primeiro passo é apenas dar um *"Olá!"* e a sua chance de ter um código em produção mundialmente começa logo ali.

