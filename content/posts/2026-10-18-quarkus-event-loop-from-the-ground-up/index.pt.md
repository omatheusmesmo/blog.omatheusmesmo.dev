---
title: "Por dentro do núcleo reativo do Quarkus, parte 1: o event loop do zero"
date: 2026-10-18T10:00:00-03:00
draft: false
tags: ["Quarkus", "Java", "Vert.x", "Netty", "Event Loop", "Reactive", "Quarkus Internals"]
author: "Matheus Oliveira"
slug: "quarkus-event-loop-do-zero"
summary: "Dei ao Quarkus dois event loops e disparei 24 requisições de uma vez. Todas foram atendidas por uma dessas duas threads. Parte um de uma série sobre como o Quarkus roda o seu código, começando abaixo do Quarkus: Netty, Vert.x e a regra que você não pode quebrar."
description: "Como funciona o event loop por baixo do Quarkus, do Netty ao Vert.x: o padrão reactor, quantos event loops o Quarkus sobe e por quê, a regra de ouro e a sua conta, as redes de proteção que o Quarkus adiciona e por que duas tarefas bloqueantes podem rodar uma depois da outra."
cover:
  image: "cover.png"
  vector: true
  alt: "Ilustração de um anel de threads de event loop, cada uma atendendo várias conexões, com uma thread bloqueada destacada em vermelho"
  caption: "Poucas threads, muitas conexões, uma regra"
  relative: true
---

Configurei o Quarkus com dois event loops e disparei 24 requisições no mesmo instante. Depois perguntei a cada resposta qual thread tinha atendido:

```java
@QuarkusTest
@TestProfile(EventLoopsTest.TwoEventLoops.class)
class EventLoopsTest {

    @Test
    void everyNonBlockingRequestIsServedByOneOfTheConfiguredEventLoops() {
        Set<String> threads = Concurrently.get(24, "/event-loops/current").stream()
                .map(response -> response.jsonPath().getString("thread.name"))
                .collect(Collectors.toSet());

        assertThat(threads, hasSize(lessThanOrEqualTo(2)));
        assertThat(threads, everyItem(startsWith("vert.x-eventloop-thread-")));
    }
}
```

O teste passa. Vinte e quatro requisições em andamento, no máximo dois nomes de thread. Se você vem do Spring MVC ou do Jakarta EE clássico, isso é estranho: você está acostumado com uma thread por requisição, e com um pool de duzentas delas.

Esta é a primeira parte de uma série sobre **quem roda o seu código no Quarkus**. Antes de falar de `@Blocking`, Mutiny ou virtual threads, ela começa abaixo do Quarkus, nas duas camadas em que todo o resto se apoia: Netty e Vert.x. Tudo o que vem depois na série é consequência do que acontece aqui.

## O laboratório

Toda afirmação desta série tem um teste por trás, num demo público: [omatheusmesmo/demos, `quarkus/reactive-core`](https://github.com/omatheusmesmo/demos/tree/main/quarkus/reactive-core). Cada endpoint devolve a thread que o atendeu, e cada teste verifica essa thread, não só o corpo da resposta. Ele roda no Quarkus 3.40.1 com Java 25, e todos os testes deste artigo passam ali. O demo também consegue rodar a suíte inteira de novo contra o Quarkus 4.0.0.Beta1; a seção 8 conta o que aconteceu quando fiz isso.

Com o laboratório de threads rodando, um comando mostra a série inteira em três linhas:

```text
$ make threads MODULE=labs/threading
PATH                     THREAD                               VIRTUAL  EVENTLOOP  DUPLICATED
/dispatch/sync           executor-thread-1                    false    false      true
/dispatch/uni            vert.x-eventloop-thread-3            false    true       true
/dispatch/virtual        quarkus-virtual-thread-0             true     false      true
```

Três endpoints, três tipos de thread. Este artigo é sobre a segunda linha.

## 1. Uma thread, muitas conexões

A ideia é mais antiga que o I/O não bloqueante do Java. Em vez de estacionar uma thread em cada socket enquanto ela espera bytes, você pede ao sistema operacional que avise quais sockets estão prontos (epoll no Linux, kqueue no macOS), e uma única thread percorre essas notificações em loop, executando o código interessado em cada uma. Esse loop é o **event loop**, e o desenho é o **padrão reactor**.

O [Netty](https://netty.io/), a biblioteca de rede por baixo do Vert.x e, portanto, do Quarkus, é construído em torno dele. O Javadoc do seu `EventLoop` tem duas frases, e as duas importam:

> Will handle all the I/O operations for a Channel once registered.
>
> One EventLoop instance will usually handle more than one Channel but this may depend on implementation details and internals.

Um `Channel` é uma conexão. Depois de registrada num event loop, todo o I/O daquela conexão passa por ele, e cada event loop atende várias conexões. O modelo de threads do Netty adiciona a regra que torna isso seguro: todo evento de entrada de um canal é disparado pela thread que faz o I/O daquele canal. O código que reage a uma requisição sempre roda na mesma thread que a leu.

Isso explica o teste do começo. Cada uma das 24 conexões foi registrada em um dos dois event loops, e a partir daí cada byte dela passou por aquele loop.

## 2. Do reactor ao multi-reactor

Um único event loop tem um limite óbvio: uma thread roda em um núcleo. O Node.js tem exatamente esse formato e escala entre núcleos subindo vários processos.

O [Vert.x](https://vertx.io/), o toolkit sobre o qual o Quarkus roda, segue outro caminho. O manual do core chama isso de *Multi-Reactor Pattern*:

> Instead of a single event loop, each Vertx instance maintains *several event loops*.

e acrescenta a garantia que torna o modelo utilizável:

> Even though a Vertx instance maintains multiple event loops, any particular handler will never be executed concurrently, and in most cases (with the exception of worker verticles) will always be called using the *exact same event loop*.

Quando o Quarkus atende uma requisição HTTP, existe um servidor HTTP do Vert.x por baixo, rodando nesses event loops. O mesmo vale para mensageria, gRPC e quase todo tipo de I/O no Quarkus.

## 3. Quantos event loops o Quarkus sobe?

Aqui a documentação discorda de si mesma. O manual do core do Vert.x diz, numa seção, que o número de event loops é escolhido "based on the number of available cores", e, em outra, que uma instância do Vert.x mantém N threads de event loop "where N by default is core*2". As duas frases continuam no manual do Vert.x 5.1.

Para o Quarkus, nenhuma das duas importa, porque o Quarkus não usa o padrão do Vert.x. O guia do Quarkus diz que o tamanho "matches the number of CPUs detected on the system", e o código do `VertxCoreRecorder` (Quarkus 3.40.1) diz um pouco mais:

```java
private static int calculateDefaultIOThreads() {
    //we only allow one event loop per 10mb of ram at the most
    //it's hard to say what this number should be, but it is also obvious
    //that for constrained environments we don't want a lot of event loops
    //lets start with 10mb and adjust as needed
    //We used to recommend a default of twice the number of cores,
    //but more recent developments seem to suggest matching the number of cores 1:1
    //being a more reasonable default. It also saves memory.
    int recommended = ProcessorInfo.availableProcessors();
    long mem = Runtime.getRuntime().maxMemory();
    long memInMb = mem / (1024 * 1024);
    long maxAllowed = memInMb / 10;

    return (int) Math.max(2, Math.min(maxAllowed, recommended));
}
```

Então o padrão é **um event loop por núcleo, nunca mais que um a cada 10 MB de heap, e nunca menos que dois**. Um container que enxerga 32 núcleos mas tem 256 MB de heap sobe 25 event loops, nem 32 nem 64. Dá para sobrescrever com `quarkus.vertx.event-loops-pool-size`, que é o que o teste do começo faz através de um test profile.

Para comparar, o pool de workers que atende código bloqueante tem `max(8 * núcleos, 200)` threads por padrão. Poucos event loops, muitos workers: os dois pools são dimensionados para tipos opostos de trabalho.

## 4. A regra de ouro, e a sua conta

Um punhado de threads atendendo milhares de conexões só funciona com uma condição, que o manual do Vert.x escreve em negrito: **não bloqueie o event loop**. Se um handler bloqueia, aquele event loop não consegue atender nenhuma outra conexão registrada nele até o handler retornar. Bloqueie todos os event loops e a aplicação para.

O manual lista o que conta como bloqueio: `Thread.sleep()`, esperar por um lock ou um monitor (`synchronized`), uma operação longa no banco, um cálculo complexo, um loop girando. E então responde à pergunta que todo mundo faz, "quanto tempo é demais?", com uma conta em vez de um número:

> If you have a single event loop, and you want to handle 10000 http requests per second, then it's clear that each request can't take more than 0.1 ms to process, so you can't block for any more time than that.

A regra não é "nunca faça nada lento". É um orçamento: o tempo que você gasta no event loop é o tempo que todas as outras conexões daquele loop esperam.

Quando você quebra a regra, o Vert.x avisa. Um vigia, o blocked thread checker, registra um aviso com stack trace quando um event loop não retorna a tempo:

```text
Thread vertx-eventloop-thread-3 has been blocked for 20458 ms
```

No Quarkus, o limite é `quarkus.vertx.max-event-loop-execute-time` e o atraso do aviso é `quarkus.vertx.warning-exception-time`. Os dois valem dois segundos por padrão, o que é um detector de desastres, não um orçamento. O seu orçamento de verdade é a conta acima.

## 5. A rede de proteção que o Quarkus adiciona

O Quarkus vai um passo além do aviso: em alguns casos ele se recusa a bloquear. O demo tem um endpoint que espera um `Uni` no event loop:

```java
@GET
@Path("/event-loop")
@NonBlocking
public Observed<String> onEventLoop() {
    return Observed.of(slowResult().await().atMost(TIMEOUT));
}
```

Ele nunca espera. O Mutiny pergunta ao Quarkus se a thread atual pode ser bloqueada, e num event loop a resposta é não, então o `await()` lança na hora:

```java
public static IllegalStateException currentThreadCannotBeBlocked() {
    return new IllegalStateException("The current thread cannot be blocked: " + Thread.currentThread().getName());
}
```

O teste verifica exatamente isso: um `500` cuja mensagem contém "cannot be blocked". O mesmo `await()` num método anotado com `@RunOnVirtualThread` retorna normalmente, o que é assunto da parte 4.

Outras extensões têm as suas próprias redes. O Hibernate ORM, chamado a partir do event loop, falha com "You have attempted to perform a blocking operation on a IO thread". Vale conhecê-las porque transformam um problema silencioso de latência num erro barulhento ainda no desenvolvimento.

## 6. Toda requisição ganha um contexto

Tem mais uma peça do core do Vert.x em que o resto da série se apoia. Toda vez que o Vert.x chama um handler, ele faz isso dentro de um `Context`:

> Usually a context is an *event-loop context* and is tied to a specific event loop thread. So executions for that context always occur on that exact same event loop thread.

O Quarkus refina isso com os **duplicated contexts**: um por unidade de processamento (uma requisição HTTP, uma mensagem do Kafka), ligado a um event loop mas não compartilhado com outras requisições. Todo endpoint do demo reporta `duplicatedContext=true`, inclusive os que rodam em workers e em virtual threads. É ali que o Quarkus guarda o estado de cada requisição, como o request scope do CDI e os dados de tracing, sem `ThreadLocal`. A parte 2 mostra o que isso muda na prática, incluindo um caso em que um `ThreadLocal` parece funcionar, e por quê.

## 7. Saindo do event loop, e a fila que ninguém espera

Aplicações reais têm código bloqueante: JDBC, sistema de arquivos, bibliotecas com API síncrona. O Vert.x não finge o contrário. O manual diz "the real world is not like that. (Have you watched the news lately?)" e oferece o `executeBlocking`, que roda código numa thread worker e devolve o resultado como um future.

Tem um detalhe nessa seção do manual que passa fácil:

> By default, if executeBlocking is called several times from the same context (e.g. the same verticle instance) then the different executeBlocking are executed _serially_ (i.e. one after another).

O demo transforma essa frase num teste. Um endpoint submete duas tarefas bloqueantes de 200 ms a partir do mesmo contexto e informa quantas rodaram ao mesmo tempo:

```java
private Uni<Observed<Integer>> peakOfTwoTasks(boolean ordered) {
    ConcurrencyTracker tracker = new ConcurrencyTracker();
    Context context = vertx.getOrCreateContext();
    return Uni.combine().all()
            .unis(submit(context, tracker, ordered), submit(context, tracker, ordered))
            .with((first, second) -> Observed.of(tracker.peak()));
}

private static Uni<String> submit(Context context, ConcurrencyTracker tracker, boolean ordered) {
    return Uni.createFrom().completionStage(() -> context
            .executeBlocking(() -> tracker.track(ExecuteBlockingResource::blockForAWhile), ordered)
            .toCompletionStage());
}
```

Com `ordered = true`, o padrão, o pico é **1**: a segunda tarefa espera a primeira, mesmo com workers livres. Com `ordered = false`, o pico é **2**. Se você tira trabalho bloqueante de um handler e não entende por que ele não roda em paralelo, essa é a primeira coisa a verificar.

## 8. O que o Quarkus 4 muda aqui

O Quarkus 4.0.0.Beta1 passa para o Vert.x 5.1.8 e o Netty 4.2.18. Comparei o manual do core do Vert.x 4.5 e 5.1 linha por linha: as seções sobre o reactor, a regra de ouro, o contexto e a execução de código bloqueante não mudaram. O que mudou está em volta: verticles agora devolvem futures (`VerticleBase`), o launcher de linha de comando saiu, e timers podem ser usados como futures.

Abaixo do Vert.x, o Netty 4.2 desacopla o event loop do transporte. Em vez de um `NioEventLoopGroup` ou um `EpollEventLoopGroup`, um grupo de event loops agora recebe um handler de I/O (`NioIoHandler`, `EpollIoHandler`, `IoUringIoHandler`), e o io_uring sai da incubadora para virar um transporte suportado. O Netty 4.2 também torna padrão um novo alocador de memória que, segundo o guia de migração, "was also designed from the start to work well with virtual threads". Essa frase vai importar na parte 4.

Depois rodei o demo de novo na 4.0.0.Beta1. Todo módulo que usa o Quarkus do jeito que uma aplicação usa (REST, o REST Client, PostgreSQL, Kafka, Redis, o Scheduler) passou com os mesmos resultados da 3.40.1. O laboratório de threads, onde estão os testes deste artigo, nem compilou:

```text
ContextResource.java:[50,13] no suitable method found for putLocal(java.lang.String,java.lang.String)
```

O Vert.x 5 removeu o `Context.putLocal(Object, Object)`, a forma antiga de guardar dados num contexto, que o laboratório usa para mostrar que o Quarkus recusa locals num root context. Os conceitos deste artigo valem no Quarkus 4; aquele pedaço do laboratório precisa migrar para a API mais nova de context locals antes de os testes rodarem lá. É um bom lembrete do que esta série vive encontrando: um modelo pode sobreviver a um upgrade enquanto uma das suas APIs não sobrevive.

## Conclusão

Por baixo do Quarkus, poucas threads de event loop atendem muitas conexões cada uma. O Netty prende cada conexão a uma delas, o Vert.x roda várias e chama os seus handlers nelas, e o Quarkus as dimensiona em uma por núcleo, limitadas pela memória. O modelo só se sustenta se os handlers retornam rápido: o orçamento é uma conta, não um número fixo, e o Quarkus adiciona redes de proteção que transformam algumas violações em erros.

O que este artigo deixou em aberto é a pergunta no título da série. Se a requisição HTTP sempre chega num event loop, quem decide que um endpoint síncrono roda no `executor-thread-1`? A parte 2 responde, regra por regra, e com uma regra que a documentação do Quarkus ainda descreve mas o código não aplica mais.

## Recursos

- [Demo: `quarkus/reactive-core`](https://github.com/omatheusmesmo/demos/tree/main/quarkus/reactive-core), em especial `labs/threading` (`EventLoopsTest`, `AwaitTest`, `ExecuteBlockingTest`)
- [Vert.x Core Manual](https://vertx.io/docs/vertx-core/java/): Reactor and Multi-Reactor, the Golden Rule, the Context object, Running blocking code
- [Netty user guide for 4.x](https://netty.io/wiki/user-guide-for-4.x.html) e [Netty 4.2 Migration Guide](https://github.com/netty/netty/wiki/Netty-4.2-Migration-Guide)
- [Quarkus reactive architecture](https://quarkus.io/guides/quarkus-reactive-architecture) e [Vert.x reference guide](https://quarkus.io/guides/vertx-reference)
- [Duplicated context, context locals, asynchronous processing and propagation](https://quarkus.io/guides/duplicated-context)
- [Mutiny primer: integration with Quarkus](https://quarkus.io/guides/mutiny-primer)
- Antes aqui no blog: [Mensageria interna no Quarkus com o Event Bus](/posts/quarkus-event-bus-consumeevent/) e [Virtual Threads: Guia de Bolso](/posts/guia-de-bolso-virtual-threads/)
