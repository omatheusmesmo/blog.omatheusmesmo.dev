---
title: "Virtual Threads: Guia de Bolso"
date: 2026-08-23T12:00:00-03:00
tags: ["Java", "Virtual Threads", "Loom", "Quarkus", "Performance", "Concorrência", "JVM", "Java 25"]
author: "Matheus Oliveira"
slug: "guia-de-bolso-virtual-threads"
summary: "O que virtual threads resolvem, o que elas quebram, o que muda quando o banco fica lento, e por que o Java 25 tornou tudo isso muito mais simples do que era em 2023."
description: "Guia prático de virtual threads em Java: pinning e como detectá-lo, o que acontece com chamadas bloqueantes contra recursos degradados, o padrão semáforo, a linha do tempo do Java 21 ao 25, e os conselhos de 2023 que já morreram."
cover:
  image: "cover.png"
  alt: "Tela de status em pixel art estilo SNES com oito carriers empilhados: sete correndo em azul e um em vermelho, travado por um cadeado, com as threads enfileiradas atrás dele"
  caption: "Um milhão de threads. Oito carriers. Um lock."
  relative: true
---

> Guia de bolso, não tutorial. O objetivo é que você consiga decidir **quando usar**,
> **o que vai quebrar** e **o que medir**, sem precisar ler os oito artigos que estão
> nas referências. Se você quer o passo a passo de código, o
> [guia oficial do Quarkus](https://quarkus.io/guides/virtual-threads) faz isso melhor.
>
> Tudo aqui assume **Java 25**. Onde o comportamento mudou desde o Java 21, eu digo
> explicitamente.
>
> Todo código deste post foi compilado e executado em **Java 25.0.2** e **Quarkus
> 3.38.3**. Os números de memória e de `ThreadLocal` são medições minhas, não citações.
> Onde eu não medi, eu digo.

## O dia em que o banco ficou lento

Você ligou virtual threads. O throughput subiu, a latência caiu, o time comemorou.

Três semanas depois, numa terça-feira, uma query sem índice entra em produção e o banco
começa a responder em 30 segundos em vez de 50 milissegundos. O pod morre com
`OutOfMemoryError`.

Antes das virtual threads, esse mesmo incidente teria dado timeout nos clientes e
enchido o dashboard de erro 503. Feio, mas o processo continuaria de pé.

As duas coisas são a mesma coisa, e entender por que é o assunto principal deste post.

---

## O modelo em noventa segundos

Uma **platform thread** é um invólucro fino em volta de uma thread do sistema
operacional. Custa cerca de 1 MB de pilha em memória nativa. Você consegue ter alguns
milhares antes do sistema reclamar.

Uma **virtual thread** é gerenciada pela JVM, não pelo SO. Para executar, ela é
**montada** (mounted) sobre uma platform thread, que nesse papel se chama **carrier**.
Quando a virtual thread bloqueia em I/O, ela é **desmontada**: o estado dela é copiado
para o heap e o carrier fica livre para rodar outra virtual thread.

Por padrão, o número de carriers é igual ao número de processadores disponíveis.
Quatro vCPUs significam quatro carriers. Guarde esse número, ele volta a aparecer.

A frase mais importante da [JEP 444](https://openjdk.org/jeps/444), e a que corta a
maior parte do hype:

> Virtual threads are not faster threads: they do not run code any faster than platform
> threads. They exist to provide **scale** (higher throughput), not **speed** (lower
> latency).

O raciocínio é a **Lei de Little**: concorrência = throughput x latência. Se a sua
latência média é 50ms e você quer 2.000 req/s, precisa de 100 requisições em voo ao
mesmo tempo. No modelo uma-thread-por-requisição, isso são 100 threads. Escale para
20.000 req/s e são 1.000 threads, a 1 MB cada.

O gargalo nunca foi CPU nem rede. Era **o número de threads do SO**, que acabava muito
antes de qualquer outro recurso. Virtual thread não acelera nada, ela remove esse teto
específico.

### Quando ajuda, segundo a especificação

A JEP 444 é precisa sobre a condição:

> Virtual threads can significantly improve application throughput when: the number of
> concurrent tasks is **high (more than a few thousand)**, and the workload is **not
> CPU-bound**.

Abaixo de alguns milhares de tarefas concorrentes, não espere ganho de throughput. Isso
não quer dizer que não vale a pena: em muitos casos o ganho real é **ergonômico**, você
escreve código imperativo com um custo de escalonamento parecido com o do modelo
reativo. Mas seja honesto sobre o que você está comprando.

---

## A linha do tempo, Java 21 a 25

Boa parte do que se escreveu sobre virtual threads é de 2023 e **envelheceu mal**. Esta
tabela é o resumo do que mudou.

| Versão | O que chegou | O que isso significou na prática |
|---|---|---|
| **21** (LTS, set/2023) | [JEP 444](https://openjdk.org/jeps/444): virtual threads final | Bloquear em `synchronized` **pina** o carrier. Metade do ecossistema Java usava `synchronized`. Adoção era um campo minado. |
| **24** (mar/2025) | [JEP 491](https://openjdk.org/jeps/491): sincronizar sem pinning | O motivo número um de falha morreu. `synchronized` deixou de pinar. `-Djdk.tracePinnedThreads` foi **removido**. |
| **25** (LTS, set/2025) | [JEP 506](https://openjdk.org/jeps/506): Scoped Values final | Substituto oficial do `ThreadLocal`, que é a segunda armadilha mais comum. Structured Concurrency segue em preview. |

O Java 25 é o primeiro LTS que reúne as duas correções. Se você está em Java 21 e adiou
virtual threads porque "dava problema", o problema específico que você adiou provavelmente
não existe mais.

### Conselhos de 2023 que você ainda vai encontrar e deve ignorar

- **"Use `-Djdk.tracePinnedThreads` para achar pinning."** A propriedade foi removida no
  Java 24. Setar na linha de comando não faz nada.
- **"Troque todo `synchronized` por `ReentrantLock`."** Desnecessário. A JEP 491 é
  explícita: você não precisa reverter o que já migrou, e para código novo *"use
  `synchronized` where practical, since it is more convenient and less error prone"*.
- **"Cuidado com pinning no driver JDBC."** Era o problema dominante em 2023. Hoje é
  quase irrelevante.

---

## Pinning: o que é, o que sobrou, como achar

**Pinning** é quando a virtual thread **não consegue** desmontar do carrier. O carrier
fica bloqueado junto, exatamente como se você estivesse usando platform threads. Você
pagou o custo da abstração e não levou o benefício.

### O que ainda pina no Java 25

| Situação | Java 21 | Java 25 |
|---|---|---|
| I/O bloqueante dentro de `synchronized` | pina | **resolvido** |
| `Object.wait()` dentro de `synchronized` | pina | **resolvido** |
| Código nativo (JNI ou Foreign Function & Memory) que chama de volta para Java e bloqueia | pina | **ainda pina** |
| Carregamento de classe cujo inicializador bloqueia | pina | **ainda pina** |

O segundo caso é um subconjunto do primeiro: carregamento de classe passa por código
nativo. Ele só te morde se um inicializador estático fizer operação bloqueante, o que é
raro, mas acontece em código com inicialização preguiçosa.

Na prática, no Java 25 sobrou pouca coisa, e ela é bem delimitada.

### I/O de arquivo: não é pinning, e a diferença importa

Aqui vale desfazer uma confusão que circula bastante, inclusive em artigo bom.

I/O de arquivo em disco local **não desmonta** a virtual thread. Isso é verdade, e a
razão de fundo está no
[State of Loom](https://cr.openjdk.org/~rpressler/loom/loom/sol1_part1.html): a JDK usa
I/O bufferizado para arquivos, que **sempre reporta bytes disponíveis** mesmo quando a
leitura vai bloquear. O SO não consegue avisar, então não dá para fazer não bloqueante.
E não existe integração `io_uring` pronta para produção na JDK.

Mas isso **não é pinning**, e a JEP 444 é explícita ao separar as duas categorias:

> some blocking operations in the JDK do not unmount the virtual thread [...] because of
> limitations at either the OS level (e.g., many filesystem operations) or the JDK level
> (e.g., `Object.wait()`). The implementations of these blocking operations **compensate
> for the capture** of the OS thread by temporarily expanding the parallelism of the
> scheduler.

Ou seja: a JVM sabe que essas operações capturam o carrier e **cria carriers extras**
para compensar, via `ForkJoinPool.ManagedBlocker`. O pool cresce além do número de
processadores, e você pode limitar isso com `jdk.virtualThreadScheduler.maxPoolSize`.

Pinning é a categoria em que **não existe resgate**, e são só duas situações, as da
tabela acima.

A diferença prática é enorme e é o assunto do próximo trecho.

### Por que pinning é pior do que captura compensada

A frase que fecha o contraste está algumas linhas depois, na mesma JEP:

> The scheduler does **not** compensate for pinning by expanding its parallelism.

Leia as duas juntas. A JVM tem um mecanismo de resgate para carrier capturado, e ele
**deliberadamente não roda** no caso do pinning. Ler arquivo faz o pool crescer. Pinar
não faz nada: o carrier some do pool e ninguém repõe.

Combine isso com o fato de que o pool de carriers tem o tamanho do número de vCPUs, e
você tem a receita do incidente mais famoso da área.

### O caso Netflix, em um parágrafo

Java 21, Spring Boot 3, Tomcat embarcado, 4 vCPUs, logo 4 carriers. As instâncias
começaram a **parar de responder**, sem erro, sem exceção, sem nada no log. Seis threads
disputavam o mesmo `ReentrantLock` (do Zipkin). Quatro delas eram virtual threads pinadas
por um bloco `synchronized` da biblioteca de tracing. No heap dump, **ninguém segurava o
lock**: a quinta virtual thread já tinha sido sinalizada para pegá-lo, mas não havia
carrier livre para ela sequer acordar.

Deadlock clássico, mas com um lock de um lado e um semáforo de quatro permissões (o
ForkJoinPool) do outro.

Duas lições estruturais que valem mais que o bug em si:

**A falha se manifesta como silêncio, não como lentidão.** Não sobe no dashboard. A JVM
fica viva e muda.

**Bastaram quatro pins simultâneos.** Com um pool de 200 worker threads, esgotar tudo
exigiria muito mais. Virtual threads não inventaram o pinning: elas encolheram o pool
de baixo até ele caber num acidente.

### Como detectar

Em produção, o evento JFR `jdk.VirtualThreadPinned` já vem **ligado por padrão**, com
threshold de 20ms. Colocar um alerta nele é a coisa mais barata que você pode fazer:

```bash
-XX:StartFlightRecording=settings=profile,dumponexit=true
```

Em teste, o Quarkus tem uma extensão JUnit que **falha o teste** se houver pinning. É
ótima para avaliar biblioteca de terceiro antes de decidir entre worker thread e virtual
thread:

```xml
<dependency>
    <groupId>io.quarkus.junit</groupId>
    <artifactId>junit-virtual-threads</artifactId>
    <scope>test</scope>
</dependency>
```

```java
@QuarkusTest
@VirtualThreadUnit
@ShouldNotPin
class RelatorioResourceTest {
    // ...
}
```

### Prova de que o conselho de 2023 morreu

Teste que passa não prova nada se a ferramenta nunca falha. Então inverti: peguei o
exemplo canônico de pinning que aparece em todo tutorial de 2023 e afirmei, via
`@ShouldPin`, que ele **deveria** pinar.

```java
@Path("/pin")
@RunOnVirtualThread
public class PinResource {

    private final Object monitor = new Object();

    @GET
    public String pina() throws Exception {
        synchronized (monitor) {
            Thread.sleep(200);
        }
        return "ok";
    }
}
```

```java
@QuarkusTest
@VirtualThreadUnit
@ShouldPin   // afirma que ISSO pina
class PinTest {
    @Test
    void syncMaisSleepAindaPina() {
        given().when().get("/pin").then().statusCode(200);
    }
}
```

Resultado em Java 25.0.2 e Quarkus 3.38.3:

```
[ERROR] PinTest.syncMaisSleepAindaPina
        The test syncMaisSleepAindaPina() was expected to pin
        the carrier thread, it didn't
```

`synchronized` em volta de uma operação bloqueante, o exemplo que praticamente definiu o
medo de virtual threads por dois anos, **não pina mais**. E o mesmo teste prova que a
extensão não é decorativa: ela mede de verdade, via eventos JFR, e reporta quando a
realidade discorda da sua afirmação.

E vale saber: **`jstack` não mostra virtual threads.** Foi exatamente isso que enganou o
time da Netflix, que via "uma JVM perfeitamente ociosa" enquanto a aplicação estava
travada. Use:

```bash
jcmd <pid> Thread.dump_to_file -format=json /tmp/dump.json
```

Esse dump mostra as virtual threads e **não pausa a aplicação**. Complementando:
`ThreadMXBean.findDeadlockedThreads()` é cego para virtual threads, então seu detector
de deadlock atual não pegaria o caso acima.

---

## O recurso degradado: onde virtual threads realmente mordem

Esta é a seção que eu queria ter lido antes de ligar virtual threads em qualquer lugar.

Volte à Lei de Little e leia ela **ao contrário**. Concorrência = throughput x latência.
A latência não é uma constante sua: ela é decidida pelo recurso do outro lado.

Suponha 2.000 req/s constantes contra um banco:

| | Latência | Concorrência exigida |
|---|---|---|
| Dia normal | 50 ms | 100 requisições em voo |
| Banco degradado | 30 s | **60.000 requisições em voo** |

A taxa de chegada não mudou. O que mudou foi o tempo que cada requisição fica viva. E a
concorrência exigida subiu 600 vezes sozinha.

### O que o pool de threads estava fazendo escondido

Com um pool de 200 platform threads, a concorrência **para em 200**. As outras 59.800
requisições nem entram: elas ficam na fila de accept do kernel, que é barata, ou são
recusadas. Os clientes tomam timeout, o dashboard fica vermelho, e o processo continua
vivo.

O pool de threads era um **bulkhead acidental**. Ele nunca foi só uma otimização de
custo de criação: ele também era o seu limite de carga em voo, e propagava contrapressão
até o TCP.

Com virtual threads, esse teto sumiu. As 60.000 requisições entram, viram 60.000 virtual
threads, e cada uma segura:

- a própria pilha, como objeto no heap
- o objeto de request, o buffer de response, o corpo já parseado
- o socket
- tudo que ela acumulou antes de bloquear

Quanto isso custa? Eu medi, em vez de estimar. O programa de teste cria N virtual threads que
bloqueiam num recurso lento a partir de uma pilha de profundidade configurável, cada uma
segurando um objeto de requisição realista (mapa de headers, cliente, três itens, corpo
JSON de 512 bytes). Depois de forçar GC, ele mede o heap retido por requisição em voo.

Java 25.0.2, ParallelGC, 30 mil requisições paradas:

| Profundidade da pilha | Heap por requisição | 60.000 em voo |
|---|---|---|
| 10 frames | 5,2 KB | 307 MB |
| 30 frames | 6,2 KB | 366 MB |
| 60 frames | 7,3 KB | 429 MB |
| 100 frames | 8,8 KB | 518 MB |

Uma stack de framework real (handler HTTP, filtros, interceptadores CDI, resource,
service, repository, JDBC) fica com facilidade entre 30 e 100 frames. Então o número
honesto é **300 a 520 MB só de requisições esperando**, sem contar cache, sessões e o
resto da aplicação.

Num container com `-Xmx512m`, acabou.

Repare que o custo cresce com a **profundidade da pilha**, não só com o número de
requisições. Cada frame a mais que você empilha antes de bloquear é memória multiplicada
pela sua concorrência.

> **A inversão que importa:** virtual threads convertem um problema de **latência** em um
> problema de **memória**. Antes, o recurso lento te dava erro 503. Agora ele te dá
> `OutOfMemoryError`. O segundo é muito pior, porque mata o processo inteiro em vez de
> recusar uma requisição.

E tem um agravante silencioso: sem limite, você continua aceitando trabalho que o cliente
já desistiu de esperar. O servidor processa 60.000 requisições que ninguém vai mais ler.

### A receita: semáforo, timeout, e falhar rápido

A solução não é minha, é a canônica, e aparece **nas mesmas palavras** em todas as fontes
primárias. Ron Pressler, no State of Loom:

> If we don't pool them, how do we limit concurrent access to some service? [...] use a
> **semaphore** in the service-call code to limit concurrency: **this is how it should be
> done.**

A JEP 444 diz o mesmo:

> do not be tempted to pool virtual threads in order to limit concurrency. Instead use
> constructs specifically designed for that purpose, **such as semaphores**.

A formulação que fecha o raciocínio: o pool de threads sempre fez **duas** coisas ao
mesmo tempo, e ninguém percebia porque era um objeto só.

1. **Isolamento de trabalho:** um trabalhador por tarefa.
2. **Limitação de recurso:** no máximo N tarefas simultâneas.

Virtual threads **desacoplam** as duas. A primeira vira ilimitada. A segunda vira
responsabilidade explícita do seu código, em cada recurso escasso.

```java
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.ws.rs.ServiceUnavailableException;
import java.util.concurrent.Semaphore;
import java.util.concurrent.TimeUnit;

@ApplicationScoped
public class RelatorioService {

    private static final Semaphore PERMISSOES_BANCO = new Semaphore(50);

    private final RelatorioRepository repository;

    public RelatorioService(RelatorioRepository repository) {
        this.repository = repository;
    }

    public Relatorio gerar(String id) throws InterruptedException {
        if (!PERMISSOES_BANCO.tryAcquire(2, TimeUnit.SECONDS)) {
            throw new ServiceUnavailableException("banco saturado");
        }
        try {
            return repository.buscar(id);
        } finally {
            PERMISSOES_BANCO.release();
        }
    }
}
```

`jakarta.ws.rs.ServiceUnavailableException` já mapeia para HTTP 503, que é exatamente a
semântica que você quer: recusar rápido em vez de aceitar e segurar memória.

Repare no `tryAcquire` com timeout em vez de `acquire`. Essa é a diferença entre
**enfileirar para sempre** e **falhar rápido**. Com `acquire()` puro, você recriou o
problema: 60.000 virtual threads esperando educadamente na fila do semáforo, todas vivas
no heap.

O `Semaphore` limita concorrência. Ele **não** é backpressure: ele enfileira ou rejeita,
não faz o produtor desacelerar. Se o seu problema é um stream em que o produtor é mais
rápido que o consumidor, você continua precisando de um modelo reativo.

### O que configurar, concretamente

Se você usa Quarkus, boa parte disso já existe e só precisa ser dimensionada:

```properties
# O pool de conexões JÁ É o seu semáforo do banco. Default: 50.
quarkus.datasource.jdbc.max-size=50

# Já vem com 5S por padrão. Sob recurso degradado, 5s por requisição
# pode ser tempo demais segurando memória. Encurte conscientemente.
quarkus.datasource.jdbc.acquisition-timeout=2S

# Todo cliente HTTP externo precisa dos dois, em milissegundos.
quarkus.rest-client.servico-externo.connect-timeout=2000
quarkus.rest-client.servico-externo.read-timeout=5000
```

Dois detalhes que vale conferir em vez de confiar em artigo, este inclusive.

**O default de `max-size` é 50, não 20.** Muito material (inclusive o excelente post de
2023 do Clement Escoffier) cita 20. A confusão provavelmente vem de que o pool
**reativo** realmente tem default 20: `quarkus.datasource.reactive.max-size` é 20,
enquanto `quarkus.datasource.jdbc.max-size` é 50. São dois pools diferentes com dois
defaults diferentes.

**`acquisition-timeout` não é infinito por padrão.** Ele já vem com **5S**. Isso é bom,
significa que você não tem uma fila literalmente infinita nem se esquecer. Mas 5 segundos
por requisição, com dezenas de milhares delas vivas, ainda é bastante memória parada.
Ajuste com intenção, não deixe no default por acidente.

> Valores verificados na documentação do Quarkus **3.38.x**. Defaults mudam entre
> versões, então confirme na sua.

Para messaging, o Quarkus já aplica o padrão por você: métodos anotados com
`@RunOnVirtualThread` têm concorrência máxima de **1024** por padrão, e o limite vale
separadamente para cada método. Dá para ajustar:

```properties
smallrye.messaging.worker.<virtual-thread>.max-concurrency=256
```

É o padrão semáforo embutido no framework, e existe justamente para a aplicação não
consumir milhões de mensagens de uma vez e estourar a memória.

E se você quiser a versão declarativa em vez do `Semaphore` na mão, o SmallRye Fault
Tolerance oferece `@Bulkhead`, `@Timeout` e `@CircuitBreaker` como anotações.

### Como testar isso antes que aconteça

Uma sugestão que vale mais que qualquer configuração: **injete latência de propósito**.
Coloque um proxy entre a sua aplicação e o banco, adicione 30 segundos de atraso, mande
carga, e olhe o heap. Se o `-Xmx` subir monotonicamente até morrer, você achou o
problema antes que ele te achasse.

---

## As três armadilhas que não dão erro

### 1. ThreadLocal para de ser cache e vira alocador

`ThreadLocal` foi desenhado em 1998 para poucas threads longevas em pool. Bibliotecas
usam esse padrão para fazer pool de objetos caros: `SimpleDateFormat`, `ObjectMapper`,
buffers de byte.

Com virtual threads, cada requisição tem uma thread nova. O "cache" é reconstruído do
zero toda vez. Medi com um `ThreadLocal.withInitial()` instrumentado, mesmo código, mesmas
200 mil tarefas, só trocando o executor:

```
tarefas executadas: 200.000
platform threads (pool de 200):     200 inicializações do ThreadLocal
virtual threads:                200.000 inicializações do ThreadLocal
razão: 1000x
```

E repare que **1000x não é um número mágico**: é exatamente `tarefas ÷ tamanho do pool`.
Com pool de platform threads você inicializa uma vez por thread do pool, para sempre. Com
virtual threads, uma vez por tarefa. A razão vai crescendo conforme seu tráfego cresce,
porque o denominador é fixo e o numerador não.

Nunca lança exceção, nunca loga. O sintoma que chega até você é "pressão de GC
inexplicável depois que ligamos virtual threads", e é fácil concluir errado que virtual
threads têm overhead alto.

Para dar a dimensão do problema: o próprio time do OpenJDK teve que **caçar e remover
usos de `ThreadLocal` do `java.base`** para viabilizar virtual threads.

A solução no Java 25 é `ScopedValue`:

```java
// Antes
private static final InheritableThreadLocal<Contexto> CTX = new InheritableThreadLocal<>();

void tratar(Request req) {
    CTX.set(new Contexto(req.userId(), req.traceId()));
    try { processar(); }
    finally { CTX.remove(); } // fácil de esquecer no caminho de erro
}

// Depois (JEP 506, API final do Java 25)
private static final ScopedValue<Contexto> CTX = ScopedValue.newInstance();

void tratar(Request req) {
    ScopedValue.where(CTX, new Contexto(req.userId(), req.traceId()))
               .run(this::processar);
    // contexto limpo automaticamente na saída do bloco
}
```

> Atenção ao escrever esse trecho a partir de material mais antigo: o método
> `ScopedValue.runWhere(...)` existiu nas versões preview e **não está na API final**. A
> forma correta no Java 25 é `where(...).run(...)`. Outra mudança da finalização:
> `ScopedValue.orElse(null)` deixou de ser permitido.

Subtarefas criadas com `StructuredTaskScope.fork()` **herdam** o `ScopedValue`
automaticamente. Verifiquei rodando: o filho lê o valor do pai sem nenhuma configuração.

> **Um mito que eu mesmo quase publiquei:** circula por aí que com `InheritableThreadLocal`
> os filhos forkados leem `null`. **Não leem.** Testei no Java 25: virtual thread herda
> `InheritableThreadLocal` por padrão, seja via `Thread.ofVirtual()`,
> `newVirtualThreadPerTaskExecutor()` ou `StructuredTaskScope.fork()`. Só fica `null` se
> você desligar de propósito com `.inheritInheritableThreadLocals(false)`.
>
> O problema real do `InheritableThreadLocal` é outro, e é duplo. Primeiro, **custo**: a
> herança é uma cópia feita na criação de cada thread filha, e a JEP 506 chama isso de
> *"expensive inheritance"*. Com um milhão de virtual threads, é um milhão de cópias.
> Segundo, **valor velho**: a cópia acontece no momento em que a thread nasce. Com pool de
> platform threads a thread nasce uma vez só, então ela guarda para sempre o valor que o
> pai tinha naquele instante. Medi isso também: mudei o valor no pai e a thread do pool
> continuou lendo o antigo.

Com `ScopedValue` nenhum dos dois acontece: não há cópia por filho, e a ligação é
estrutural, presa ao bloco.

Quando você **realmente** precisa de reuso por thread, a saída é outra: use um
`ExecutorService` limitado com platform threads para a parte que precisa dos objetos
cacheados, e mantenha virtual threads para a parte de I/O.

Para caçar o problema no seu código: `-Djdk.traceVirtualThreadLocals=true` imprime stack
trace toda vez que uma virtual thread escreve num thread-local.

### 2. Monopolização, ou por que CPU-bound é veneno

O scheduler de virtual threads **não é preemptivo**. Não existe fatia de tempo que force
a troca. A virtual thread solta o carrier quando ela quiser, e computação pura nunca
quer.

Se você rodar um cálculo de 5 segundos numa virtual thread, ela monopoliza aquele
carrier por 5 segundos, e você tem um a menos dos seus quatro.

Para cálculo longo, use um pool dedicado de platform threads. Isso não é regressão, é o
uso certo de cada ferramenta.

**Uma ressalva honesta:** existe um efeito de segunda ordem que complica essa regra. O
compilador C2 roda em threads de background e disputa os mesmos cores que a sua
aplicação. Com 100 conexões, o Tomcat cria ~130 platform threads; com virtual threads,
apenas ~4 carriers ficam on-CPU. Nos
[benchmarks do Francesco Nigro](https://quarkus.io/blog/when-the-jit-cant-keep-up/), num
workload **CPU-bound por design**, virtual threads fizeram o Spring saltar de ~3.300 para
~9.900 req/s e o Quarkus atingir o pico em 15 segundos em vez de 60.

O ganho não é do seu código, é do **JIT**, que finalmente conseguiu CPU para compilar. A
regra continua verdadeira no sentido literal (virtual thread não faz conta mais rápido),
mas menos threads on-CPU podem ajudar um serviço CPU-bound por um caminho indireto.

### 3. A pilha mudou de bolso

Platform thread guarda a pilha em memória **nativa**, fora do heap, limitada por `-Xss`.
O GC não vê.

Virtual thread guarda a pilha **no heap**, como objetos `StackChunk`. Está na JEP 444, é
especificação:

> The stacks of virtual threads are stored in Java's garbage-collected heap as **stack
> chunk objects**.

Consequência direta e frequentemente ignorada: **o `-Xmx` que bastava pode não bastar
mais**. Aquele container com `-Xmx512m` que funcionava perfeitamente com worker threads
pode se comportar de forma estranha depois de você ligar `@RunOnVirtualThread`. Não é
bug, é a pilha que mudou de endereço.

Duas pegadinhas concretas para guardar:

**Não faça pool de virtual thread.** Além de contrariar o design, o
[benchmark do Nigro](https://quarkus.io/blog/to-cache-or-not-to-cache-virtual-threads/)
mostra por quê: com heap de 4 GB, pooling ganhava 13,5%; com 1 GB, perdia 34%, com 461
Full GCs contra 4. O motivo é que virtual thread longeva tem seu `StackChunk` promovido
para o old gen, e a JVM então passa a alocar chunks novos e abandonar os velhos a cada
ciclo. Pooling converte lixo barato do young gen em retenção cara no old gen.

**Cuidado com recursão profunda no G1.** O G1 não suporta `StackChunk` humongous. Se a
pilha de uma virtual thread passar de metade do tamanho da região (que pode ser 512 KB em
heap pequeno), você pode tomar um `StackOverflowError` que não tem nada a ver com o seu
código ter recursão demais.

---

## O guia de bolso de verdade

Se você só for guardar uma parte deste post, guarde esta.

**Use virtual threads quando:**

- milhares de tarefas concorrentes, e
- I/O-bound, e
- os recursos do outro lado são abundantes ou você já colocou semáforo neles

**Não use quando:**

- CPU-bound puro (use pool de platform threads)
- concorrência baixa, algumas centenas de tarefas (não vai fazer diferença)
- você já tem uma stack reativa funcionando bem (não migre por moda)

**Antes de ligar em produção, faça as cinco:**

| # | Ação | Por quê |
|---|---|---|
| 1 | Semáforo ou pool dimensionado em **cada** recurso escasso | senão o recurso degradado vira OOM |
| 2 | Timeout em **toda** chamada bloqueante, e `tryAcquire` com timeout | senão a fila é infinita |
| 3 | Alerta em `jdk.VirtualThreadPinned` no JFR | pinning falha em silêncio |
| 4 | Auditoria de `ThreadLocal` no seu código e nas suas libs | vira alocador sem avisar |
| 5 | Teste de carga **com o recurso degradado de propósito** | é o único jeito de ver o item 1 falhar |

**Comandos que você vai querer ter à mão:**

```bash
# thread dump que enxerga virtual threads, sem pausar a aplicação
jcmd <pid> Thread.dump_to_file -format=json /tmp/dump.json

# JFR com perfil, para pinning e compilação
-XX:StartFlightRecording=settings=profile,dumponexit=true

# caçar ThreadLocal em migração
-Djdk.traceVirtualThreadLocals=true
```

---

## O que fazer com isso

Se você está em Java 21 e desistiu de virtual threads porque "dava problema": vale
revisitar. O problema específico que te fez desistir (pinning por `synchronized`)
provavelmente era esse, e ele acabou no Java 24.

Se você está em Java 25 e ainda não ligou num serviço I/O-bound: comece por um só, o mais
simples, e faça o teste de recurso degradado antes de comemorar. O ganho é real. O modo
de falhar também.

E se você tem que escolher uma única coisa desta lista inteira, escolha o **semáforo**.
Não porque virtual threads são perigosas, mas porque elas são honestas: elas removem um
teto artificial e mostram onde o seu limite realmente sempre esteve. Sua função é decidir
qual é esse limite antes que a produção decida por você.

---

## Referências

Fontes primárias, na ordem em que valem a leitura:

- [JEP 444: Virtual Threads](https://openjdk.org/jeps/444), Ron Pressler e Alan Bateman.
  A especificação. Leia a seção "Do not pool virtual threads" inteira, a parte sobre
  semáforos quase nunca é citada.
- [Java 21 Virtual Threads: Dude, Where's My Lock?](https://netflixtechblog.com/java-21-virtual-threads-dude-wheres-my-lock-3052540e231d),
  Netflix. O melhor relato publicado de como pinning vira deadlock silencioso.
- [JEP 491: Synchronize Virtual Threads without Pinning](https://openjdk.org/jeps/491).
  O que mudou no Java 24 e por quê.
- [JEP 506: Scoped Values](https://openjdk.org/jeps/506). O substituto do `ThreadLocal`.
- [State of Loom](https://cr.openjdk.org/~rpressler/loom/loom/sol1_part1.html),
  Ron Pressler. Denso, mas é a visão de mundo por trás de tudo.

Análise e produção:

- [Virtual Threads after JDK 24: What Changed for Production Java](https://www.infoq.com/articles/virtual-threads-after-jdk24/),
  InfoQ. Benchmark público, com o dado do `ThreadLocal` e do pool de conexões.
- [To Cache or Not to Cache Virtual Threads](https://quarkus.io/blog/to-cache-or-not-to-cache-virtual-threads/),
  Francesco Nigro. Por que não fazer pool, com os internos da JVM.
- [Harder, Better, Faster, Stronger... Earlier!](https://quarkus.io/blog/when-the-jit-cant-keep-up/),
  Francesco Nigro. Starvation do compilador C2 e tempo até o pico.

Quarkus:

- [Virtual Thread support reference](https://quarkus.io/guides/virtual-threads). As
  regras duras e a tabela honesta comparando worker, reativo e virtual thread.
- [When Quarkus meets Virtual Threads](https://quarkus.io/blog/virtual-thread-1/) e
  [Writing CRUD applications using virtual threads](https://quarkus.io/blog/virtual-threads-2/),
  Clement Escoffier. A melhor introdução didática, com a ressalva de que a parte de
  detecção de pinning envelheceu.
