---
title: "Bibliotecas Java para IA Comparadas: LangChain4j, Spring AI e Quarkus LangChain4j"
date: 2026-04-25T12:00:00-03:00
draft: false
tags: ["Java", "AI", "Quarkus", "Spring AI", "LangChain4j", "Open Source"]
author: "Matheus Oliveira"
slug: "bibliotecas-java-para-ia-comparadas"
summary: "Construí o mesmo app de IA com LangChain4j, Spring AI e Quarkus LangChain4j (com e sem EasyRAG). Um deles levou 92 linhas. Os outros levaram 192, 180 e ~117."
description: "Uma comparação prática de quatro projetos Java para IA: mesmas funcionalidades, mesmo modelo, mesmo resultado. A diferença? Quanto código você precisa escrever."
cover:
  image: "java-ai-libraries-compared.png"
  alt: "Comparação de bibliotecas Java para IA"
  caption: "Mesmas funcionalidades de IA, tamanhos de código completamente diferentes"
  relative: true
---

Tenho contribuído com o [Quarkus LangChain4j](https://github.com/quarkiverse/quarkus-langchain4j) há um tempo, você pode ver meus PRs fechados [aqui](https://github.com/quarkiverse/quarkus-langchain4j/pulls?q=is%3Apr+is%3Aclosed+author%3Aomatheusmesmo). Em algum momento, as pessoas começaram a me perguntar: *"Mas como ele se compara ao Spring AI ou ao LangChain4j puro?"*

Boa pergunta. Então construí o mesmo app quatro vezes para descobrir: com LangChain4j Puro, Spring AI, Quarkus LangChain4j com EasyRAG, e Quarkus LangChain4j com um pipeline RAG manual.

## O Que Eu Construí

Mesmas funcionalidades nos quatro projetos:

- **Chat**: converse com um LLM local com memória multi-usuário
- **RAG**: aumente as respostas com seus próprios documentos
- **Tool Calling**: deixe o modelo invocar métodos Java (ex: uma calculadora)

Mesma stack em todos:

- **Java 25** (LTS)
- **Ollama** rodando localmente com **qwen3:1.7b** para chat e **nomic-embed-text** para embeddings
- **Maven** para build

Sem APIs na nuvem, sem chaves de API. Tudo roda na sua máquina.

Cada projeto expõe os mesmos 3 endpoints:

- `/ai/chat`: chat com memória, sem RAG
- `/ai/rag`: chat com RAG + memória
- `/ai/tools`: tool calling com memória, sem RAG

## Os Quatro Candidatos

- **LangChain4j 1.13.1 (Puro)**: A biblioteca standalone. Sem framework, sem mágica. Você conecta tudo manualmente com Javalin como servidor web. Essa é a abordagem idiomática quando você não está usando um framework: `AiServices.builder()` é o padrão oficial para uso standalone.
- **Spring AI 1.1.4**: A integração oficial de IA do Spring. Usa o padrão Advisor, `ChatClient` e auto-configuração do Spring Boot. `RetrievalAugmentationAdvisor` com `ContextualQueryAugmenter` é a melhor prática atual para RAG.
- **Quarkus LangChain4j 1.8.4 com EasyRAG**: A extensão Quarkus LangChain4j (Quarkiverse) traz o LangChain4j para o ecossistema Quarkus. Essa variante usa a extensão EasyRAG para RAG zero-configuração. CDI, serviços de IA declarativos via `@RegisterAiService`, `@ApplicationScoped` com `@MemoryId` é o padrão documentado para chat multi-usuário.
- **Quarkus LangChain4j 1.8.4 sem EasyRAG**: Mesma extensão Quarkus LangChain4j, mas substitui o EasyRAG por um pipeline RAG manual (um bean CDI que produz um `RetrievalAugmentor`). Essa variante usa `TextDocumentParser` em vez do Tika, correspondendo à abordagem de parseamento de documentos do LangChain4j Puro e do Spring AI. Custa ~25 linhas de Java, mas elimina o overhead de startup do Tika.

## O Resultado

| Métrica | LangChain4j Puro | Spring AI | Quarkus LangChain4j + EasyRAG | Quarkus LangChain4j (RAG manual) |
|---|---|---|---|---|
| **Total Java LOC** | 192 | 180 | **92** | ~117 |
| **RAG Java LOC** | ~30 | 50 (RagConfig) | **0** | ~25 (RagConfig) |
| **Wiring manual** | Extensivo | Moderado | **Nenhum** | Moderado |
| **Serviços de IA separados** | 3 interfaces + 3 builders | 3 ChatClients | 2 interfaces (declarativos) | 2 interfaces (declarativos) |

Quarkus LangChain4j com EasyRAG faz o mesmo trabalho com **52% menos código** que o LangChain4j Puro e **49% menos** que o Spring AI. A variante com RAG manual custa ~25 linhas a mais, mas ainda supera ambas as alternativas.

Deixe-me te mostrar o porquê.

## Chat: Onde Tudo Começa

### LangChain4j Puro: Construa Tudo

```java
ChatModel chatModel = OllamaChatModel.builder()
    .baseUrl("http://localhost:11434")
    .modelName("qwen3:1.7b")
    .timeout(Duration.ofMinutes(5))
    .build();

Assistant assistant = AiServices.builder(Assistant.class)
    .chatModel(chatModel)
    .chatMemoryProvider(memoryId ->
        MessageWindowChatMemory.withMaxMessages(20))
    .build();
```

Esse é apenas o wiring de um serviço de IA. Você precisa de três chamadas separadas de `AiServices.builder()` para chat, RAG e tools, mais uma interface separada para cada. Você também precisa iniciar o Javalin manualmente, definir rotas e tratar requisições. O `Application.java` sozinho tem 145 linhas.

### Spring AI: Menos Boilerplate, Ainda Verboso

```java
public AiResource(ChatModel chatModel, VectorStore vectorStore,
        ChatMemory chatMemory, CalculatorTool calculatorTool) {
    MessageChatMemoryAdvisor memoryAdvisor =
        MessageChatMemoryAdvisor.builder(chatMemory).build();

    this.chatClient = ChatClient.builder(chatModel)
        .defaultAdvisors(memoryAdvisor)
        .build();

    this.ragChatClient = ChatClient.builder(chatModel)
        .defaultAdvisors(memoryAdvisor, ragAdvisor)
        .build();

    this.toolsChatClient = ChatClient.builder(chatModel)
        .defaultAdvisors(memoryAdvisor)
        .build();
}
```

O Spring AI 1.1.4 auto-configura o bean de `ChatMemory` (InMemoryChatMemoryRepository + janela de 20 mensagens), legal. Mas você ainda constrói cada `ChatClient` manualmente, conecta os advisors e passa o ID da conversa por requisição. `AiResource.java` tem 91 linhas, e `RagConfig.java` são mais 50.

### Quarkus LangChain4j: Uma Interface e Properties

```java
@RegisterAiService(retrievalAugmentor = RegisterAiService.NoRetrievalAugmentorSupplier.class)
@ApplicationScoped
public interface Assistant {
    String chat(@MemoryId String userId, @UserMessage String message);
    @ToolBox(CalculatorTool.class)
    String chatWithTools(@MemoryId String userId, @UserMessage String message);
}
```

```properties
quarkus.langchain4j.ollama.chat-model.model-id=qwen3:1.7b
quarkus.langchain4j.ollama.timeout=5m
quarkus.langchain4j.chat-memory.type=message-window
quarkus.langchain4j.chat-memory.memory-window.max-messages=20
```

Só isso. O CDI cuida do wiring de modelo, memória e tools. `@ApplicationScoped` mantém o serviço (e sua memória) vivo entre requisições: o [padrão documentado](https://docs.quarkiverse.io/quarkus-langchain4j/dev/messages-and-memory.html) para chat multi-usuário com `@MemoryId`. `AiResource.java` tem 39 linhas.

## RAG: A Maior Diferença

É aqui que o gap realmente aparece.

### LangChain4j Puro: ~30 Linhas de Pipeline

```java
EmbeddingStore<TextSegment> embeddingStore = new InMemoryEmbeddingStore<>();

List<Document> documents = FileSystemDocumentLoader.loadDocuments(
    Path.of("src/main/resources/rag-docs"), new TextDocumentParser());

EmbeddingStoreIngestor ingestor = EmbeddingStoreIngestor.builder()
    .documentSplitter(DocumentSplitters.recursive(200, 30))
    .embeddingModel(embeddingModel)
    .embeddingStore(embeddingStore)
    .build();
ingestor.ingest(documents);

ContentRetriever contentRetriever = EmbeddingStoreContentRetriever.builder()
    .embeddingStore(embeddingStore)
    .embeddingModel(embeddingModel)
    .maxResults(3)
    .minScore(0.5)
    .build();
```

Carregue documentos, divida-os, gere embeddings, armazene-os, construa um retriever. Cada passo é explícito. Requer uma interface `RagAssistant` separada conectada com `.contentRetriever()`.

### Spring AI: RetrievalAugmentationAdvisor + Pipeline ETL de 50 Linhas

O Spring AI 1.1.4 oferece dois RAG advisors: `QuestionAnswerAdvisor` (mais simples) e `RetrievalAugmentationAdvisor` (modular). Usamos o `RetrievalAugmentationAdvisor`: a [melhor prática documentada](https://docs.spring.io/spring-ai/reference/api/retrieval-augmented-generation.html) para este caso de uso. Com `ContextualQueryAugmenter.allowEmptyContext(true)`, queries sem documentos relevantes passam inalteradas em vez de serem rejeitadas. Isso é mais limpo que o `QuestionAnswerAdvisor`, que sempre inclui um template no prompt, mesmo para chat geral, adicionando ruído que prejudica modelos locais pequenos.

```java
RetrievalAugmentationAdvisor ragAdvisor = RetrievalAugmentationAdvisor.builder()
    .documentRetriever(VectorStoreDocumentRetriever.builder()
        .similarityThreshold(0.5)
        .vectorStore(vectorStore)
        .build())
    .queryAugmenter(ContextualQueryAugmenter.builder()
        .allowEmptyContext(true)
        .build())
    .build();

this.ragChatClient = ChatClient.builder(chatModel)
    .defaultAdvisors(memoryAdvisor, ragAdvisor)
    .build();
```

O setup do advisor é limpo. O problema é o `VectorStore`: o Spring AI não auto-configura o `SimpleVectorStore`, então você precisa construir o pipeline ETL manualmente:

```java
@Configuration
public class RagConfig {
    private final EmbeddingModel embeddingModel;

    public RagConfig(EmbeddingModel embeddingModel) {
        this.embeddingModel = embeddingModel;
    }

    @Bean
    public VectorStore vectorStore() throws IOException {
        SimpleVectorStore vectorStore = SimpleVectorStore.builder(embeddingModel).build();
        PathMatchingResourcePatternResolver resolver = new PathMatchingResourcePatternResolver();
        Resource[] resources = resolver.getResources("classpath:rag-docs/*.txt");

        List<Document> allDocuments = new ArrayList<>();
        for (Resource resource : resources) {
            TextReader textReader = new TextReader(resource);
            allDocuments.addAll(textReader.get());
        }

        TokenTextSplitter splitter = TokenTextSplitter.builder()
            .withChunkSize(200).withMinChunkSizeChars(50).build();
        vectorStore.add(splitter.apply(allDocuments));
        return vectorStore;
    }
}
```

### Quarkus LangChain4j: 3 Properties, 0 Linhas de Código Java

```properties
quarkus.langchain4j.easy-rag.path=src/main/resources/rag-docs
quarkus.langchain4j.easy-rag.reuse-embeddings.enabled=true
quarkus.langchain4j.easy-rag.max-segment-size=200
```

Só isso. A extensão `EasyRAG` cuida do carregamento, divisão, embedding, armazenamento e recuperação. Ela auto-cria um bean CDI de `RetrievalAugmentor` que o `@RegisterAiService` utiliza. `NoRetrievalAugmentorSupplier` opta por não usar em serviços sem RAG. Ela até faz cache dos embeddings em disco para que você não reprocesse a cada restart.

Zero código Java para RAG. Não 30 linhas, não 50 linhas. Zero.

### Quarkus LangChain4j Sem EasyRAG: 25 Linhas, Sem Tika

A conveniência zero-configuração do EasyRAG tem um tradeoff: o classpath scanning do Apache Tika adiciona ~5s ao cold start. Se você não precisa de parseamento de múltiplos formatos de documento, pode substituir o EasyRAG por um pipeline RAG manual:

```java
public class RagConfig {
    private volatile RetrievalAugmentor augmentor;

    void onStart(@Observes StartupEvent ev, EmbeddingModel embeddingModel) {
        augmentor = buildRetrievalAugmentor(embeddingModel);
    }

    @Produces @ApplicationScoped
    public RetrievalAugmentor retrievalAugmentor() { return augmentor; }

    private RetrievalAugmentor buildRetrievalAugmentor(EmbeddingModel embeddingModel) {
        EmbeddingStore<TextSegment> embeddingStore = new InMemoryEmbeddingStore<>();
        DocumentParser parser = new TextDocumentParser();
        List<Document> documents = FileSystemDocumentLoader.loadDocuments(
            Path.of("src/main/resources/rag-docs"), parser);
        DocumentSplitter splitter = DocumentSplitters.recursive(200, 30);
        EmbeddingStoreIngestor ingestor = EmbeddingStoreIngestor.builder()
            .documentSplitter(splitter)
            .embeddingModel(embeddingModel)
            .embeddingStore(embeddingStore)
            .build();
        ingestor.ingest(documents);
        ContentRetriever contentRetriever = EmbeddingStoreContentRetriever.builder()
            .embeddingStore(embeddingStore)
            .embeddingModel(embeddingModel)
            .maxResults(3).minScore(0.5).build();
        return DefaultRetrievalAugmentor.builder()
            .contentRetriever(contentRetriever).build();
    }
}
```

Mesma estrutura de pipeline das ~30 linhas do LangChain4j Puro, mas em um bean CDI com `@Observes StartupEvent` para inicialização eager. A interface `RagAssistant` permanece idêntica: o `@RegisterAiService` utiliza automaticamente o `RetrievalAugmentor` produzido pelo CDI. O resultado? Cold start cai de ~7s para ~2.1s, empatando com o LangChain4j Puro. Mesmo framework, mesmo runtime, apenas sem Tika no classpath.

## Tool Calling: Definições Similares, Registro Diferente

As definições de tools são quase idênticas em todos os projetos. A diferença é *como você registra as tools*:

**LangChain4j Puro**: requer uma interface `ToolAssistant` separada + registro no builder:
```java
@Tool("Adds two numbers and returns the result")
public double add(@P("First number") double a, @P("Second number") double b) {
    return a + b;
}

// Interface separada + builder
ToolAssistant toolAssistant = AiServices.builder(ToolAssistant.class)
    .chatModel(chatModel)
    .chatMemoryProvider(memoryId -> MessageWindowChatMemory.withMaxMessages(20))
    .tools(calculatorTool)
    .build();
```

**Spring AI**: registro por requisição em cada prompt do ChatClient:
```java
@Tool(description = "Adds two numbers and returns the result")
public double add(
        @ToolParam(description = "First number") double a,
        @ToolParam(description = "Second number") double b) {
    return a + b;
}

// Por requisição no prompt
toolsChatClient.prompt().user(question).tools(calculatorTool).call();
```

**Quarkus LangChain4j**: declarativo, por método via `@ToolBox`:
```java
@Tool("Adds two numbers and returns the result")
double add(@P("First number") double a, @P("Second number") double b) {
    return a + b;
}

// Declarativo na interface
@ToolBox(CalculatorTool.class)
String chatWithTools(@MemoryId String userId, @UserMessage String message);
```

A tool fica sempre disponível quando aquele método é chamado. Sem wiring por requisição, sem builder separado.

## Memória de Chat: Properties vs. Código

**LangChain4j Puro**: lambda por builder:
```java
.chatMemoryProvider(memoryId ->
    MessageWindowChatMemory.withMaxMessages(20))
```

Precisa passar `@MemoryId` manualmente em cada interface. `chatMemoryProvider` separado para cada chamada de `AiServices.builder()`.

**Spring AI**: bean auto-configurado, mas wiring manual do advisor:
```java
// Bean ChatMemory auto-configurado (InMemoryChatMemoryRepository, janela de 20 mensagens)
MessageChatMemoryAdvisor memoryAdvisor =
    MessageChatMemoryAdvisor.builder(chatMemory).build();

// Por requisição:
.advisors(a -> a.param(ChatMemory.CONVERSATION_ID, userId))
```

O bean é de graça, mas você ainda conecta o advisor e passa o ID da conversa em cada chamada.

**Quarkus LangChain4j**: properties + anotação:
```properties
quarkus.langchain4j.chat-memory.type=message-window
quarkus.langchain4j.chat-memory.memory-window.max-messages=20
```

```java
String chat(@MemoryId String userId, @UserMessage String message);
```

Basta anotar o parâmetro. O CDI cuida do resto.

## O Que o Quarkus Te Dá Além do Tamanho de Código

Menos código é legal, mas tem mais:

| Feature | LangChain4j Puro | Spring AI | Quarkus LangChain4j |
|---|---|---|---|
| Dev Services (auto-start Ollama) | Não | Não | **Sim** |
| Native Image (GraalVM) | Manual | Comunidade | **Out of the box** |
| Live Reload | Não | DevTools | **Dev Mode (instant)** |
| RAG via configuração | Não | Não | **EasyRAG** |
| Serviço de IA zero-config | Não | Não | **@RegisterAiService** |
| Streaming Reativo | Manual | Flux return | **Multi (Mutiny)** |

**Dev Services** merece destaque. Se você não tem o Ollama rodando, o Quarkus inicia um container automaticamente pra você. Sem docker-compose, sem scripts de setup.

## E o Spring Boot Starter do LangChain4j?

O LangChain4j oferece um `langchain4j-spring-boot-starter` com uma anotação declarativa `@AiService`, conceitualmente similar ao `@RegisterAiService` do Quarkus. Porém, na versão LangChain4j 1.13.1, esse starter ainda está em **beta** (`1.13.1-beta23`), não é GA. Para uma comparação de produção, usei a abordagem estável e GA: `AiServices.builder()` com wiring manual.

## Ressalvas

- **Modelos pequenos têm dificuldade com tool calling.** O qwen3:1.7b não invoca tools de forma confiável, frequentemente responde diretamente em vez de usar a tool. Isso afeta todos os projetos igualmente.
- **O `RetrievalAugmentationAdvisor` do Spring AI** com `allowEmptyContext(true)` é a abordagem documentada para RAG que coexiste com chat geral. Mas você ainda precisa do pipeline ETL no `RagConfig.java`: o Spring AI não auto-configura o `SimpleVectorStore`, e não há equivalente à experiência "aponte para um diretório e pronto" do EasyRAG.
- **LangChain4j Puro** é o mais flexível. Se você precisa de controle fino sobre cada componente, ele te dá isso. O tradeoff é a verbosidade, e a necessidade de um framework web separado (Javalin neste caso).
- **Quarkus LangChain4j** prioriza convenção-sobre-configuração, mas não te tranca. Precisa de um `RetrievalAugmentor` customizado? Use `retrievalAugmentor = MeuRetrieverSupplier.class` no `@RegisterAiService`. `ChatMemoryProvider` customizado? `chatMemoryProviderSupplier = CustomMemoryProvider.class`. Múltiplos modelos? `@RegisterAiService(modelName = "m1")` mais properties por nome. Você fica no modelo de programação do Quarkus. Sem precisar baixar para os builders do LangChain4j puro.

## Startup e Memória

Menos código é uma coisa, mas e o runtime? Medi todos os projetos no Java 25 com Ollama rodando localmente (qwen3:1.7b para chat, nomic-embed-text para embeddings). O script de medição é um [arquivo JBang no repositório](https://github.com/omatheusmesmo/java-ai-comparison/blob/main/scripts/Measure.java) para que você possa reproduzir esses números na sua própria máquina. O RSS foi medido após 60s de warmup para a JVM estabilizar (compilação JIT, GC, metaspace).

### Cold start (primeira subida, todos re-embedam documentos)

| Métrica | LangChain4j Puro | Spring AI | Quarkus LangChain4j + EasyRAG | Quarkus LangChain4j (RAG manual) |
|---|---|---|---|---|
| **Startup (wall-clock)** | ~2.0s | ~5.6s | ~7.0s | **~2.1s** |
| **Startup (self-reported)** | 181ms (só Javalin) | 4.9s | 6.8s | **2.0s** |
| **RSS Memória** | ~116MB | ~329MB | ~237MB | **~155MB** |

Wall-clock mede o tempo total de `java -jar` até a porta estar disponível. Self-reported é o que cada framework loga como seu próprio startup: note que os 181ms do LangChain4j Puro contam apenas a inicialização do web server Javalin, não a computação de embeddings que roda antes dele. O Spring AI e o Quarkus incluem sua inicialização completa no tempo self-reported, o que faz os números parecerem mais diferentes do que realmente são.

LangChain4j Puro parece mais leve, mas faz menos: sem container DI, sem annotation processing, sem auto-configuração, e um web server minimalista (Javalin com Jetty embutido). Para igualar as features de produção do Quarkus e do Spring AI, o LangChain4j Puro precisaria de health checks, métricas, OpenAPI, configuração externalizada e Dockerfiles: adições que aumentariam tanto seu footprint quanto sua contagem de código. O RSS baixo reflete um baseline, não uma comparação justa de features.

O cold start mais lento do Quarkus está diretamente ligado ao EasyRAG. A extensão usa **Apache Tika** por padrão para parseamento de documentos, que suporta PDF, DOCX, HTML e imagens com OCR. Nossos demos de LangChain4j Puro e Spring AI usam apenas parsers de texto puro (`TextDocumentParser` e `TextReader`). Ambos oferecem parsers Tika como dependências opcionais (`langchain4j-document-parser-tika` e `spring-ai-tika-document-reader`), e adicionar Tika em qualquer um dos dois exigiria basicamente a mesma mudança de código: trocar a classe do parser. O aumento de LOC é insignificante (~1 linha), mas o overhead de startup seria equivalente ao do Quarkus, já que o custo de classpath scanning e inicialização do Tika é o mesmo independente do framework.

A coluna "Quarkus LangChain4j (RAG manual)" prova isso: ela substitui o EasyRAG por um pipeline RAG manual (um bean CDI produzindo um `RetrievalAugmentor`, similar ao `RagConfig` do Spring AI), custando ~25 linhas de Java e eliminando o overhead de startup do Tika. O resultado é um cold start de 2.1s, quase idêntico aos 2.0s do LangChain4j Puro. Mesmo framework, mesmo runtime Quarkus, apenas sem Tika no classpath.

### Warm start (reinícios subsequentes)

O EasyRAG do Quarkus LangChain4j tem um recurso de `reuse-embeddings` que cacheia os embeddings computados em disco:

| Métrica | LangChain4j Puro | Spring AI | Quarkus LangChain4j + EasyRAG (warm) | Quarkus LangChain4j (RAG manual) |
|---|---|---|---|---|
| **Startup (wall-clock)** | ~2.0s | ~5.6s | **~1.7s** | ~2.1s |
| **Startup (self-reported)** | 181ms (só Javalin) | 4.9s | **1.3s** | 2.0s |
| **RSS Memória** | ~116MB | ~329MB | **~123MB** | ~155MB |

Com embeddings cacheados, o Quarkus LangChain4j com EasyRAG é o mais rápido a subir e tem o menor RSS depois do baseline minimalista do LangChain4j Puro. E ainda fornece CDI, health checks, métricas, OpenAPI e parseamento de documentos com Tika out of the box. O cache de `reuse-embeddings` é uma conveniência de dev mode: um arquivo JSON que evita re-chamar a API de embeddings. Em produção com um embedding store persistente (PgVector, Redis), todos os projetos pulariam o re-embedding no startup.

### O ângulo de produção

Esses são números em modo JVM. O Quarkus pode compilar para **native image GraalVM**, trazendo o startup para milissegundos e o RSS para ~30-50MB. Nem LangChain4j Puro nem Spring AI conseguem igualar isso sem esforço manual significativo.

Há um porém: o EasyRAG não suporta compilação native. Para gerar um native image, você precisa substituir o EasyRAG por um pipeline RAG manual (seu próprio bean CDI de `RetrievalAugmentor` usando um embedding store persistente como PgVector). Esse é o setup realista de produção de qualquer forma: em um deploy real, embeddings são pré-computados e armazenados externamente, então nenhum re-embedding acontece no startup. Com essa arquitetura, o Quarkus inicia em milissegundos no modo native, enquanto Spring AI e LangChain4j Puro ainda pagam o tempo total de boot da JVM. Se performance de cold start e densidade de memória importam para seu deployment (serverless, scale-to-zero, orquestração de containers), a compilação native é a vantagem mais forte do Quarkus.

## Minha Opinião

Se você está construindo apps Java com IA, **Quarkus LangChain4j** é a escolha mais produtiva. Os números falam por si: 92 linhas de Java vs 192 vs 180 para a mesma funcionalidade. O EasyRAG sozinho te economiza 30-50 linhas de código de pipeline. E o `@RegisterAiService` elimina o boilerplate de builder que ambas as alternativas exigem.

Dito isso, LangChain4j Puro é a escolha certa quando você precisa de flexibilidade máxima e não quer um framework. Spring AI é a escolha natural se você já está no ecossistema Spring, especialmente com as melhorias do `RetrievalAugmentationAdvisor` na versão 1.1.4.

Mas se está começando do zero? Eu iria de Quarkus.

## Recursos

- [Código fonte completo de todos os projetos](https://github.com/omatheusmesmo/java-ai-comparison)
- [Quarkus LangChain4j](https://docs.quarkiverse.io/quarkus-langchain4j/dev/)
- [LangChain4j](https://docs.langchain4j.dev/)
- [Spring AI](https://docs.spring.io/spring-ai/reference/)
- [Ollama](https://ollama.com/)
