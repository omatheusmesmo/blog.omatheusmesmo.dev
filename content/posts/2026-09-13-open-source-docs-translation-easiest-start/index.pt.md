---
title: "Documentação e Tradução: o Jeito Mais Fácil de Começar no Open-Source"
date: 2026-09-13T09:00:00-03:00
draft: false
tags: ["Open Source", "Documentação", "Tradução", "Iniciantes", "Comunidade"]
author: "Matheus Oliveira"
slug: "documentacao-e-traducao-o-jeito-mais-facil-de-comecar-no-open-source"
summary: "Quer contribuir pra Open-Source mas trava antes de abrir o editor? Documentação e tradução são a porta de entrada mais fácil que existe, e você pode mandar seu primeiro PR ainda hoje."
description: "Sem saber por onde começar no Open-Source? Descubra por que corrigir e traduzir documentação é o caminho mais fácil, rápido e subestimado pra fazer sua primeira contribuição real."
cover:
  image: "cover.png"
  alt: "Ilustração pixel art estilo SNES de um personagem atravessando um portão de madeira aberto, passando por uma mesa de escriba com um pergaminho sendo traduzido, em direção a uma vila iluminada com fonte, castelo e ponte ao fundo"
  caption: "A porta de entrada que quase ninguém usa"
  relative: true
---

Quantas vezes você já pensou "quero contribuir pra Open-Source" e travou na primeira issue que abriu? Código C++ de 2009, arquitetura que ninguém explica, um `CONTRIBUTING.md` que parece escrito pra quem já é maintainer há cinco anos.

Aí você fecha a aba e volta pro trabalho. De novo.

Existe um caminho mais curto, e ele não está escondido: está na pasta `docs/` do projeto que você já usa todo dia.

## O motivo pelo qual ninguém mexe na documentação

Todo projeto Open-Source tem o mesmo problema: documentação envelhece mais rápido que código. Um exemplo que não roda mais na versão atual, um comando que mudou, uma seção inteira em inglês num projeto com milhares de usuários que não leem inglês fluentemente. Os mantenedores sabem disso. Eles só não têm tempo, porque estão ocupados revisando PR de feature.

É aqui que você entra. Não com um PR de 800 linhas mudando a arquitetura de cache. Com uma correção de três linhas que deixa a vida de outra pessoa mais fácil.

## Por que documentação e tradução, especificamente

Três motivos, sem enrolação:

**Barreira técnica quase zero.** Você não precisa entender o build system, não precisa rodar testes de integração, não precisa saber a diferença entre as duas classes com nome parecido. Precisa ler com atenção e escrever com clareza.

**Review rápido e feedback imediato.** Um maintainer aprova uma correção de typo ou um parágrafo traduzido em minutos. Compare isso com o PR de feature que fica dois meses esperando review porque ninguém tem tempo de validar a lógica.

**Impacto que você sente na pele.** Se você já teve que ler documentação traduzida de forma capenga, ou pior, sem tradução nenhuma, sabe o tanto que isso afasta gente boa de um projeto. Toda vez que você melhora uma doc, tira essa barreira do caminho de alguém que ainda nem chegou.

E sim, isso conta como contribuição de verdade: aparece no seu perfil do GitHub, entra no seu histórico de commits, e é exatamente esse tipo de contribuição consistente que constrói reputação dentro de uma comunidade.

## Como fazer isso ainda hoje

Três passos, sem complicação:

1. **Escolha um projeto que você já usa.** Não precisa ser o mais famoso do GitHub. Pode ser aquela lib que você importa todo santo dia no trabalho.
2. **Procure a label certa.** A maioria dos projetos grandes tem `documentation`, `good first issue` ou `help wanted`. Se não tiver nenhuma issue aberta, abra você mesmo apontando o que está desatualizado, incompleto ou mal traduzido.
3. **Mande o PR pequeno.** Corrija um exemplo quebrado, atualize um comando, traduza uma página ou até um parágrafo. Ninguém pede perfeição no primeiro PR. Pedem clareza.

Repita isso algumas vezes e você vai perceber algo curioso: pra corrigir a documentação direito, você acaba lendo o código por trás dela. Sem perceber, você já está entendendo a arquitetura do projeto, o que deixa o caminho aberto pra, quando quiser, dar o passo seguinte e mexer em código de verdade.

## Um exemplo real: as localizações do site do Quarkus

Se você usa Quarkus (ou quer usar), tem um exemplo perfeito debaixo do seu nariz: o [pt.quarkus.io](https://github.com/quarkusio/pt.quarkus.io), o projeto de localização em português brasileiro do site oficial.

O fluxo é simples: o texto do site vem de arquivos `.adoc`, é extraído automaticamente pra arquivos `.po` (o formato padrão de localização), passa por uma pré-tradução via IA e chega até você marcado como "fuzzy", ou seja, ainda não revisado por gente. Seu trabalho é abrir esse arquivo, revisar a tradução, tirar a marcação de fuzzy e mandar o PR. Sem tocar em uma linha de Java, sem entender o motor da extensão, sem precisar saber o que é um `@ApplicationScoped`.

O mesmo padrão se repete pro [japonês](https://github.com/quarkusio/ja.quarkus.io), pro [chinês](https://github.com/quarkusio/cn.quarkus.io) e pro [espanhol](https://github.com/quarkusio/es.quarkus.io). Se o projeto que você usa tem comunidade grande o suficiente, procure algo parecido antes de assumir que não existe.

Falo com propriedade porque hoje sou mantenedor do `pt.quarkus.io`. Mas há dois anos eu não era mantenedor de nada: estava só limpando arquivo `.po` marcado como fuzzy, dando meus primeiros passos no ecossistema Quarkus através desse mesmo repositório. Foi a porta de entrada, não o destino final.

## "Mas meu inglês não é tão bom" / "eu mal conheço o projeto"

Ninguém pede fluência de tradutor profissional. Pede alguém que entende o conteúdo original e escreve de forma clara no idioma de chegada. Se você fala português e inglês o suficiente pra ler a doc, você já tem o que precisa.

E sobre conhecer o projeto: você não precisa conhecer profundamente pra apontar que um trecho está confuso. Muitas vezes, quem está mais perto de identificar o problema é justamente quem ainda está aprendendo, porque quem escreveu aquela doc já esqueceu como é ser novato ali.

## A porta de entrada é a documentação

Pensa assim: a documentação é a porta de entrada de qualquer projeto. É a primeira coisa que alguém lê antes de decidir se vale a pena instalar aquela lib ou desistir e procurar outra. Uma porta de entrada confusa afasta gente boa antes mesmo dela conhecer o resto da casa.

Se você já leu o [guia definitivo pra começar a contribuir]({{< ref "posts/2026-02-07-open-source-the-definitive-guide-to-start-contributing/index.pt.md" >}}) ou o artigo sobre [como contribuir sem enviar código]({{< ref "posts/2026-07-05-how-to-contribute-to-open-source-without-code/index.pt.md" >}}), você já sabe que existem várias portas de entrada. Documentação e tradução são, na minha experiência mentorando gente que quer começar, as mais rápidas de atravessar.

## Comece hoje

Escolhe um projeto agora. Abre a pasta `docs/`. Acha uma frase confusa, um exemplo quebrado ou uma página sem tradução. Corrige. Manda o PR.

Não precisa ser perfeito. Precisa existir.

Se quiser um passo a passo mais completo pra sair do zero até o primeiro PR, com tudo que aprendi mentorando quem está começando, escrevi o [Guia Prático de Open Source](https://news.omatheusmesmo.dev/ebook/), um e-book curto pra você sair do lugar ainda essa semana.
