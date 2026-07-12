---
title: "Qlawkus: construa agentes de IA pessoais em Java com Quarkus"
date: 2026-07-12T09:00:00-03:00
draft: false
tags: ["Quarkus", "Java", "IA", "Agentes de IA", "LLM", "Open Source"]
author: "Matheus Oliveira"
slug: "qlawkus-agentes-de-ia-pessoais-com-quarkus"
summary: "Apresento o Qlawkus, um conjunto de extensões Quarkus para construir agentes de IA pessoais em Java: memória injetada automaticamente, skills, mensageria com voz e composição via agent.yml."
description: "Qlawkus é um conjunto de extensões Quarkus para construir agentes de IA pessoais em Java, com memória que é injetada no prompt automaticamente (não depende do modelo decidir buscar), skills procedurais, mensageria no Discord/Telegram com voz e uma pom gerada a partir de um agent.yml. Veja como funciona e como começar."
cover:
  image: "cover.png"
  alt: "Diagrama minimalista mostrando um nó central 'Agent' conectado a quatro módulos: Soul, Memory, Skills e Tools, sobre fundo escuro roxo"
  caption: "Cognição, memória, skills, mensageria e ferramentas - montadas por extensão, uma por uma"
  relative: true
---

Se você programa Java há algum tempo, provavelmente já testou montar um agente de IA pessoal com algum framework Python, ou colou tudo num script solto. Funciona por uma semana, até o contexto ficar grande demais e o "agente" esquecer quem você é. Escrevi o [Qlawkus](https://qlawkus.omatheusmesmo.dev) para resolver exatamente esse problema, e para fazer isso do jeito que a gente já confia para construir backend: Quarkus, extensões, e nada de mágica escondida.

---

## TL;DR

> Qlawkus é um conjunto de extensões Quarkus (padrão `deployment` + `runtime`), construído sobre o quarkus-langchain4j, para montar um agente de IA **pessoal e 100% autônomo**. A diferença central: memória relevante é **injetada automaticamente no prompt antes de cada resposta** via RAG, em vez de depender do modelo decidir chamar uma tool de busca. Você compõe o agente escolhendo só as capacidades que quer - memória em Postgres/pgvector ou só markdown, Discord, Telegram com voz, Google Workspace, um console admin - via um `agent.yml` que gera o pom antes do build. É open-source (Apache 2.0), roda com um `docker compose up`, e está em desenvolvimento ativo (`0.8.x`). PRs, issues e estrelas são muito bem-vindas.

---

## Isso não é a única forma de fazer isso

Preciso ser honesto sobre uma coisa antes de continuar: eu contribuo ativamente para o [quarkus-langchain4j](https://docs.quarkiverse.io/quarkus-langchain4j/dev/), e não quero que esse artigo soe como "esquece a extensão, usa o Qlawkus". Não é essa a ideia. O quarkus-langchain4j já te dá tudo que você precisa pra montar um agente do zero - `@RegisterAiService`, RAG, tools, streaming, guardrails, os providers todos. Ele é a fundação. O Qlawkus não compete com ele, é construído em cima dele.

O Qlawkus resolve um problema mais específico: um agente de IA **pessoal, single-user, com o objetivo declarado de ser 100% autônomo** - que aprende sobre você ao longo do tempo, escreve suas próprias skills, evolui sua própria personalidade (`Soul`) e age em seu nome (git, shell, Google Workspace), sem que você precise reconstruir a fundação toda vez. Pra isso, ele é opinativo por escolha: várias decisões que num agente genérico ficam em aberto - como a memória é injetada, como uma skill envelhece, como um canal de mensageria conversa com o outro - aqui já vêm resolvidas de um jeito específico.

Então "por que Qlawkus e não só quarkus-langchain4j puro" é meio que a pergunta errada. A certa é: você quer decidir cada peça do zero, ou quer um agente pessoal autônomo com essas decisões já tomadas? O quarkus-langchain4j serve os dois casos igualmente bem - ele é a base debaixo dos dois.

A inspiração para essa combinação específica (memória tripla, skills, single-user, 100% autônomo) veio de dois projetos fora do ecossistema Java: [OpenClaw](https://github.com/openclaw/openclaw) e o [Hermes Agent](https://github.com/NousResearch/hermes-agent) (da Nous Research). O Qlawkus pega essa filosofia e reconstrói em cima do Quarkus - extensões, injeção de dependência, imagem nativa, tudo que a comunidade Java já confia para produção.

---

## O problema: memória que depende do modelo lembrar de procurar

A maioria dos agentes pessoais de IA por aí resolve memória de duas formas, e ambas têm um problema:

1. **Tool de busca** - o modelo decide, a cada turno, se vale a pena chamar uma função para buscar memória antiga. Na prática, ele só busca quando percebe que precisa - e o problema é justamente que a informação mais importante costuma ser a que o modelo *não sabe* que deveria procurar.
2. **Jogar tudo no prompt** - simples, mas não escala. Quanto mais o agente aprende sobre você, maior o prompt, mais caro e mais lento fica cada turno.

O Qlawkus não escolhe entre os dois: antes de cada resposta, um passo de RAG (`ActiveMemoryAugmentor`) embeda a mensagem do usuário e injeta só os fatos relevantes para aquele turno - nem tudo, nem nada. Isso acontece **sem chamada de tool**, então a lembrança nunca depende do modelo "se lembrar de checar". E se o agente ainda assim precisar cavar mais fundo, ele tem a tool `searchTranscripts` para buscar deliberadamente no histórico completo de conversas.

## O que entra no prompt, todo turno

* **`Soul`** - a identidade, humor e viés de comportamento do próprio agente.
* **`UserProfile`** - um perfil coerente e curado da pessoa que ele atende (mantido por uma tool e refinado toda noite por um job de curadoria).
* **Fatos relevantes** - recuperados via RAG a partir de um fact store com pgvector, cada um marcado com a origem (`remember-tool`, `semantic-extractor`, `episodic-consolidator`, `transcript`).
* **Índice de skills** - nome e descrição de cada procedimento que o agente já aprendeu (o corpo completo só é carregado sob demanda, via `viewSkill`).

Jobs em background mantêm tudo isso limpo sozinho: deduplicação semântica de fatos quase-duplicados, consolidação de journals diários, e curadoria que funde fatos soltos num `UserProfile` coerente. Você não precisa arrumar a casa manualmente.

## Skills: memória procedural que o próprio agente escreve

Além de saber fatos (memória declarativa), o Qlawkus também aprende *como* fazer coisas recorrentes (memória procedural). Cada skill é um `SKILL.md` simples - frontmatter com `name`/`description`, corpo em Markdown - seguindo o [padrão agentskills.io](https://agentskills.io), então é portável para qualquer outro agente que fale o mesmo formato:

```markdown
---
name: open-a-pr
description: Open a GitHub pull request from the current branch with a clean summary
---

# Open a pull request

1. Confirm the branch is pushed: `git status -sb`.
2. Draft a title that reads well in a changelog.
3. Open it: `gh pr create --title "<title>" --body "<summary>"`.
```

O agente cria, usa e cura suas próprias skills sozinho: um observer destila uma skill reutilizável a cada conversa concluída, um job de curadoria remove redundância, e um job de lifecycle envelhece skills não usadas (`ACTIVE -> STALE -> ARCHIVED`) sem nunca apagá-las de vez.

## Não é só um chatbot: um agente pensado para engenharia

O `open-a-pr` acima não é um exemplo hipotético. O Qlawkus nasceu como um "autonomous personal engineering agent", com um shell sandboxado (`qlawkus.shell.*`) confinado à raiz do workspace, denylist de comandos perigosos por padrão (`sudo *`, `rm -rf /*`, `mkfs*`, `dd if=*`, `shutdown`, `reboot`...) e um modo allowlist opcional para travar ainda mais o que ele pode rodar. Junte isso à integração com `git`/`gh cli` e dá para deixar o agente clonar, testar e abrir PR sozinho, quando autorizado.

Tem também um detalhe menor que mostra o espírito do projeto: ao subir, o agente gera um "startup thought" - uma reflexão curta, no tom da própria `Soul`. É código, mas também é personalidade. A `Soul` padrão que vem no repositório (`default-soul.md`) deixa isso bem claro:

> "Do, don't describe. If something needs doing and I have the tools, I do it (...) Be resourceful before asking. Read the file. Check the logs. Search the history. Try the obvious thing. Come back with answers, not questions - unless asking prevents a mistake."

É isso que é injetado no prompt como `Soul` - não é um "you are a helpful assistant" genérico, é um viés de comportamento real que molda como o agente age.

## Monte só o que você precisa

Aqui é onde o lado "extensão Quarkus" realmente compensa. Em vez de um monólito com tudo embutido, cada capacidade - o backend Postgres/pgvector, Discord, Telegram, Google Workspace, um console admin - é uma extensão opcional. Um `agent.yml` decide o que entra:

```yaml
version: 1

build-time:
  default: enabled
  except:
    - brag
    - skill-hub

runtime:
  qlawkus.skill-hub.approval-mode: hitl
```

`mvn qlawkus:generate` lê esse manifesto e reconcilia o `pom.xml` *antes* do build - uma capacidade que você não pediu nunca chega a entrar no classpath. Quer um agente 100% database-free, só com arquivos markdown? Dá para montar. Quer ele rodando com Postgres, Discord e Google Workspace? Também.

## Rodando em 3 comandos

```bash
git clone https://github.com/omatheusmesmo/qlawkus.git
cd qlawkus
mvn install -pl client -am -DskipTests
cd app && mvn quarkus:dev
```

Dev Services sobe Postgres com pgvector e Ollama via Testcontainers automaticamente - sem precisar de `.env`. Em segundos você já pode conversar com o agente:

```bash
curl -X POST http://localhost:8080/api/chat/sync -u qlawkus:qlawkus \
  -H 'Content-Type: application/json' -d '{"message":"Hello, who are you?"}'
```

Para produção (ou um teste mais realista), `./run.sh local` sobe tudo em Docker sem precisar de chave de API nenhuma (Ollama local), e `./run.sh prod` sobe com o provedor de LLM da sua escolha (NVIDIA, OpenAI, DeepSeek, Mistral, Groq, xAI, OpenRouter - qualquer coisa compatível com a API da OpenAI).

## O que vem na caixa

* **Mensageria** - Discord e Telegram com suporte a voz (STT via Whisper, TTS com múltiplos provedores por idioma), contexto compartilhado entre canais.
* **Ferramentas** - Google Workspace inteiro (Gmail, Calendar, Drive, Sheets, Storage), um tool de shell isolado, um gerador de "brag document" para currículo.
* **Resiliência** - LLM primário com fallback automático para Ollama por trás de um circuit breaker.
* **Segredos** - um keystore PKCS12 criptografado numa pasta montada, sem precisar de banco só para guardar API keys.
* **Console admin** - uma UI server-rendered (Qute + HTMX, zero Node.js) para gerenciar memória, skills, configuração e os jobs agendados.

## Por que isso importa para quem já vive no ecossistema Quarkus

Se você já escreve Quarkus no trabalho, o Qlawkus não é "mais uma stack para aprender": é o mesmo modelo de extensão (`deployment` + `runtime`), o mesmo `@ConfigMapping`, o mesmo `quarkus:dev` com live reload, e o mesmo caminho para imagem nativa que você já usa. A diferença é que, em vez de expor endpoints REST para um cliente, você está montando um agente que aprende sobre você e age em seu nome.

## Próximos passos

O roadmap é público, vive no próprio README, e o projeto está longe de terminado:

* **M8 (em andamento)** - a plataforma composable já está no ar: `agent.yml` → pom, secrets sem banco, o loop de build-and-redeploy e o control-plane UI (onboarding, gerenciamento, editor de configuração, agendamento) já estão todos implementados. Falta o polimento final: cards no Dev UI do Quarkus e uma rodada de QA end-to-end.
* **M9 (pendente)** - observabilidade (métricas, tracing) e um build nativo mais maduro.
* **M10 (pendente)** - autonomia mais profunda e orquestração de jobs: o agente decidindo e agendando o próprio trabalho, não só reagindo a mensagens.

## Vem contribuir

O Qlawkus está em `0.8.x`, ativamente em desenvolvimento, licenciado em Apache 2.0. Se você:

* quer um agente pessoal que realmente lembra de você sem virar uma bagunça de prompt gigante;
* curte a ideia de montar exatamente as capacidades que precisa, sem carregar o resto;
* ou só quer dar uma olhada em como um sistema de cognição/memória é construído do zero em Java,

a documentação completa (arquitetura, memória, skills, composição, mensageria, configuração) está no [site oficial](https://qlawkus.omatheusmesmo.dev) - comece pelo [Quick Start](https://qlawkus.omatheusmesmo.dev/quickstart/). O código está no [repositório no GitHub](https://github.com/omatheusmesmo/qlawkus): uma estrela ajuda a dar visibilidade, uma issue reportando um bug ou pedindo uma feature é uma contribuição real, e um PR é sempre bem-vindo.

E você, o que mais falta para você confiar sua memória de longo prazo a um agente de IA? Deixa nos comentários, eu quero muito saber.
