---
title: "Integração com Kafka no Quarkus: Reactive Messaging, @Incoming e @Outgoing"
date: 2026-08-01T10:00:00-03:00
draft: false
tags: ["Quarkus", "Spring", "Java", "Kafka", "Reactive Messaging", "SmallRye", "Dev Services", "Messaging", "Virtual Threads", "Quarkus for Spring Developers"]
author: "Matheus Oliveira"
slug: "quarkus-kafka-reactive-messaging"
summary: "Leve a mensageria para fora da aplicação com SmallRye Reactive Messaging. Channels vs Topics, @Incoming, @Outgoing, Emitter, serialização JSON automática e Dev Services subindo o broker sem você instalar nada."
description: "Guia completo de integração com Apache Kafka no Quarkus usando SmallRye Reactive Messaging. Compare com Spring Cloud Stream e @KafkaListener, entenda o mapeamento de canais para tópicos, configure serialização JSON automática, escreva testes com o conector in-memory e use Dev Services para rodar sem instalar Kafka."
cover:
  image: "quarkus-kafka-cover.png"
  alt: "Pixel art SNES 16-bit de um shoot-em-up horizontal onde uma nave dispara cápsulas de dados que fluem por três faixas de neon numeradas como partições, com três naves-satélite em formação consumindo cada faixa, letreiro KAFKA no HUD"
  caption: "O produtor dispara, o log corre, e cada consumidor lê a própria partição"
  relative: true
---

*Este artigo faz parte da série ["Quarkus for Spring Developers"](https://blog.omatheusmesmo.dev/tags/quarkus-for-spring-developers/).*

Nos dois artigos anteriores, sobre o [Event Bus do Vert.x]({{< ref "posts/2026-06-20-quarkus-event-bus-consumeevent/index.pt.md" >}}) e o [Quarkus Signals]({{< ref "posts/2026-06-27-quarkus-signals-messaging/index.pt.md" >}}), desacoplamos componentes **dentro** da mesma aplicação. Nenhuma infraestrutura externa, nenhum broker, nenhuma configuração. E ficou uma dívida no fim do último texto: em algum momento a mensagem precisa atravessar a fronteira do processo.

É esse momento. Quando o pedido é aprovado e o **serviço de estoque** (outro deploy, outro time, talvez outra linguagem) precisa reagir, o Event Bus não serve. Ele vive na memória de uma única instância. Se o pod cair, a mensagem morre com ele.

Aqui entra o **Apache Kafka**, e a forma como o Quarkus fala com ele: o **SmallRye Reactive Messaging**, implementação da especificação MicroProfile Reactive Messaging. Neste artigo você vai entender a abstração de conectores e canais, produzir e consumir mensagens com `@Outgoing` e `@Incoming`, resolver serialização JSON sem escrever uma linha de serde (a contração de *serializer* + *deserializer*, o par de classes que converte objeto em bytes e bytes em objeto), e rodar tudo isso sem instalar Kafka na sua máquina.

---

## Antes de Começar: Atualizações em Relação ao Livro

O *Quarkus for Spring Developers* cobre Reactive Messaging no Capítulo 5, sobre o Quarkus 2.1.4. Essa é, de longe, a seção do livro que mais envelheceu: o exemplo pede um `docker-compose.yml` com **Zookeeper**, imagens `strimzi/kafka:0.20.1`, e um script `create-topic.sh` chamando `kafka-topics` na mão. Nada disso é necessário hoje. A tabela resume o que muda na versão atual (3.38.0):

| No Livro | No Quarkus Atual | O que mudou |
| :--- | :--- | :--- |
| `smallrye-reactive-messaging-kafka` | `quarkus-messaging-kafka` | A extensão foi renomeada. O artefato antigo ainda resolve em projetos legados, mas o nome canônico hoje é `io.quarkus:quarkus-messaging-kafka`. |
| Docker Compose com Zookeeper | **Dev Services para Kafka** | O Quarkus sobe um broker em container automaticamente em dev e em teste. O Kafka moderno roda em modo KRaft: o Zookeeper foi removido do Kafka a partir do 4.0. |
| `create-topic.sh` com `kafka-topics` | `quarkus.kafka.devservices.topic-partitions.<topico>=N` | Criação de tópicos declarativa, no `application.properties`. |
| `javax.enterprise.*`, `javax.ws.rs.*` | `jakarta.enterprise.*`, `jakarta.ws.rs.*` | Migração para Jakarta EE 9+. |
| Serde JSON escrito à mão | Auto-detecção e **auto-geração** de serdes | O Quarkus detecta o serializer pelo tipo e, quando não encontra, gera um baseado em Jackson em tempo de build. |
| `Emitter` (só `CompletionStage`) | `Emitter` e `MutinyEmitter` | O `MutinyEmitter` devolve `Uni<Void>`, encaixando no modelo reativo do resto do Quarkus. |
| `@Blocking` como única saída para código bloqueante | `@Blocking` ou `@RunOnVirtualThread` | Virtual threads não existiam em 2021. Hoje são uma alternativa de primeira classe, e veremos as duas. |
| `Publisher<Double>` da spec Reactive Streams | `Multi<Double>` do Mutiny | O livro usa `Publisher` no `@Channel`. `Multi` continua sendo um `Publisher`, então os dois funcionam, mas o idiomático hoje é `Multi`. |
| Kafka 2.6 | `kafka-clients` 4.1.1 | A extensão é compatível com brokers 2.x em diante. |

> **Sobre o provider do Dev Services:** a maior parte do material que você encontra na internet, inclusive artigos recentes, afirma que o Dev Services usa **Redpanda** por padrão. Isso mudou. O padrão atual de `quarkus.kafka.devservices.provider` é **`upstream-kafka-native`**, a imagem oficial do Apache Kafka compilada com GraalVM, que sobe rápido justamente por ser nativa. Redpanda continua disponível como opção.

---

## 1. O Problema: A Mensageria Precisa Sair da Aplicação

Retomando o sistema de pedidos que construímos nos artigos anteriores. Hoje, ao salvar um pedido, disparamos um evento in-process e três handlers reagem: notificação, estoque e dashboard. Tudo dentro do mesmo processo.

O requisito novo é outro: **o serviço de estoque virou um microsserviço separado**. Ele tem o próprio deploy, o próprio banco, e não pode ser acoplado ao nosso. Precisamos de:

1. **Entrega durável.** Se o consumidor estiver fora do ar, a mensagem espera.
2. **Replay.** Se o consumidor processar errado, ele reprocessa a partir de um offset.
3. **Múltiplos consumidores independentes.** Estoque, faturamento e BI leem o mesmo fluxo, cada um no seu ritmo.
4. **Backpressure real.** O produtor não pode afogar o consumidor.

O Event Bus não entrega nenhum desses quatro. O Kafka entrega os quatro.

No Spring, o caminho usual é o **Spring Cloud Stream** com o binder de Kafka, ou o `@KafkaListener` do Spring for Apache Kafka. No Quarkus, é o **SmallRye Reactive Messaging**.

---

## 2. Conectores e Canais: A Abstração do SmallRye

Esse é o conceito central do capítulo, e o que mais confunde quem vem do `@KafkaListener`. No Spring for Apache Kafka, você anota um método com o **nome do tópico**:

```java
// SPRING
@KafkaListener(topics = "orders-dispatch", groupId = "inventory")
public void listen(String message) { ... }
```

O código conhece o broker. Se amanhã a mensagem vier de RabbitMQ, o método muda.

No SmallRye, o código conhece apenas um **channel**, um nome lógico interno à aplicação. Quem decide o que existe do outro lado é a configuração.

```java
// QUARKUS
@Incoming("orders-in")
public void listen(String message) { ... }
```

`orders-in` não é um tópico. É um canal. O vínculo entre o canal e o Kafka mora no `application.properties`:

```properties
mp.messaging.incoming.orders-in.connector=smallrye-kafka
mp.messaging.incoming.orders-in.topic=orders-dispatch
```

O vocabulário da especificação é deliberadamente genérico, porque o SmallRye também fala AMQP, MQTT, JMS e Camel:

| Conceito | O que é | Onde vive |
| :--- | :--- | :--- |
| **Message** | Envelope com payload e metadata. No conector Kafka, corresponde a um *record*. | Código Java |
| **Channel** | Nome lógico por onde as mensagens trafegam | `@Incoming`, `@Outgoing`, `@Channel` |
| **Connector** | Implementação do transporte (`smallrye-kafka`, `smallrye-amqp`, in-memory) | `application.properties` |
| **Topic** | O destino real no broker | `application.properties` |

A separação tem três consequências práticas:

1. **Troca de transporte sem tocar no código.** Mudar `connector` de `smallrye-kafka` para `smallrye-amqp` reaponta o mesmo método.
2. **Canais internos de graça.** Um channel sem conector configurado vira um canal **in-memory** entre dois métodos da mesma aplicação. Você encadeia `@Incoming` e `@Outgoing` sem broker nenhum. O livro chama atenção para isso e o comentário continua válido: o Spring não tem esse conceito, e o exemplo do Capítulo 5 precisa de uma classe `InMemoryChannel` construída à mão em cima de `Sinks.Many` do Reactor.
3. **Testes triviais.** É por isso que dá para substituir o Kafka por um conector in-memory nos testes, como veremos na seção 9.

Dois atalhos que a documentação oficial permite e que enxugam a configuração:

- **Se o nome do canal for igual ao nome do tópico**, você pode omitir `.topic`.
- **Se o conector Kafka for o único no classpath**, você pode omitir `.connector`. O Quarkus assume que todo canal não resolvido é Kafka.

Ou seja, nos casos simples a configuração pode ser literalmente vazia. Ainda assim, prefiro declarar as duas linhas: quando os nomes divergem, e uma hora divergem, o arquivo já está no formato certo.

---

## 3. Instalação e Dev Services

Uma dependência:

```xml
<dependency>
    <groupId>io.quarkus</groupId>
    <artifactId>quarkus-messaging-kafka</artifactId>
</dependency>
```

Ou pela CLI:

```bash
quarkus extension add messaging-kafka
```

E agora a parte que apaga metade do Capítulo 5 do livro: **você não precisa instalar, subir ou configurar um Kafka.** Em dev mode e durante os testes, os **Dev Services** detectam que existe um conector Kafka configurado e sobem um broker em container automaticamente.

```bash
./mvnw quarkus:dev
```

```
[io.qua.kaf.cli.dep.DevServicesKafkaProcessor] Dev Services for Kafka started. Kafka broker is available at localhost:36429
```

Note a porta aleatória. O Quarkus injeta `kafka.bootstrap.servers` apontando para ela. Em produção, você define o endereço real com o profile `%prod`:

```properties
%prod.kafka.bootstrap.servers=kafka.mycompany.svc:9092
```

O Dev Services se desativa sozinho quando `kafka.bootstrap.servers` está configurado. Ou seja, a linha acima já garante que nada suba em container no ambiente real.

Configurações úteis:

```properties
# Cria tópicos com N partições ao subir o broker
quarkus.kafka.devservices.topic-partitions.orders-dispatch=3

# Porta fixa, se você quiser plugar um kcat externo
quarkus.kafka.devservices.port=9092

# Trocar o broker de desenvolvimento
quarkus.kafka.devservices.provider=redpanda

# Desligar
quarkus.kafka.devservices.enabled=false
```

Os providers aceitos são `upstream-kafka-native` (padrão), `upstream-kafka`, `redpanda`, `strimzi` e `kafka-native`.

Duas notas que economizam tempo:

- **`quarkus.kafka.devservices.shared`** vale `true` em dev mode e `false` em teste. Várias aplicações Quarkus rodando em dev na sua máquina **compartilham o mesmo broker**, identificado pelo label `quarkus.kafka.devservices.service-name` (padrão `kafka`). Isso é ótimo para simular dois microsserviços conversando. Nos testes, cada execução ganha um broker isolado.
- **Criação automática de tópicos.** O broker de dev aceita produzir num tópico inexistente e o cria com 1 partição. Isso mascara bugs de particionamento que só aparecem em produção, e é por isso que vale declarar `topic-partitions` explicitamente.

---

## 4. Produzindo Mensagens com @Outgoing

### O modelo declarativo

A forma mais idiomática é um método `@Outgoing` que devolve um stream. Ele é assinado no boot e roda sozinho. É o `PriceGenerator` do livro, atualizado:

```java
@ApplicationScoped
public class PriceGenerator {

    @Outgoing("prices-out")
    public Multi<Double> generate() {
        return Multi.createFrom().ticks().every(Duration.ofSeconds(1))
            .onOverflow().drop()
            .map(tick -> ThreadLocalRandom.current().nextDouble(100));
    }
}
```

Isso cobre fontes contínuas: sensores, geradores, polling. Mas o nosso caso é outro. Queremos publicar **quando um pedido é criado**, a partir de um endpoint REST. Isso é imperativo, não é um stream infinito.

### O modelo imperativo: Emitter

Para isso existe o `Emitter`, injetado com `@Channel`:

```java
@Inject
@Channel("orders-dispatch")
Emitter<OrderDispatched> emitter;

public void dispatch(OrderDispatched payload) {
    CompletionStage<Void> ack = emitter.send(payload);
}
```

E a variante reativa, que devolve `Uni<Void>` e encaixa melhor no resto do Quarkus:

```java
@Inject
@Channel("orders-dispatch")
MutinyEmitter<OrderDispatched> emitter;
```

| API | Retorno de `send()` | Quando usar |
| :--- | :--- | :--- |
| `Emitter<T>` | `CompletionStage<Void>` | Código imperativo, integração com APIs Java padrão |
| `MutinyEmitter<T>` | `Uni<Void>` | Pipelines reativos, endpoints que já retornam `Uni`, Hibernate Reactive |
| `@Outgoing` | Nenhum | Streams contínuos, gerados pela própria aplicação |

> **O `send()` é assíncrono.** O `CompletionStage` ou `Uni` só completa quando o broker confirma o recebimento. Se você ignorar o retorno, ignora junto a falha de escrita. Voltaremos a isso na seção 10.

### Comparação com o Spring

```java
// SPRING CLOUD STREAM
@Bean
public Supplier<Flux<Double>> generateprice() {
    return () -> Flux.interval(Duration.ofSeconds(1))
        .map(t -> random.nextDouble());
}
```

```properties
spring.cloud.function.definition=generateprice
spring.cloud.stream.bindings.generateprice-out-0.destination=prices
```

> **Atenção se você seguir o livro aqui:** a propriedade do Capítulo 5 é `spring.cloud.stream.function.definition`, que hoje está deprecada. A atual é `spring.cloud.function.definition`, nativa do Spring Cloud Function. E ela é **opcional** quando existe um único bean `Supplier`, `Function` ou `Consumer` no contexto: nesse caso o bean é auto-descoberto, embora a documentação recomende declarar mesmo assim para evitar ambiguidade. Para desligar a auto-descoberta, `spring.cloud.stream.function.autodetect=false`.

A diferença que continua valendo não é o registro em si, e sim de onde vem o nome do destino. No Spring Cloud Stream o binding é **derivado do nome do bean** (`generateprice` vira `generateprice-out-0`), então renomear o método renomeia o binding e quebra a configuração. No Quarkus, o nome do canal é uma string escolhida por você na anotação, independente do nome do método.

---

## 5. Consumindo Mensagens com @Incoming

O consumidor mais simples recebe o payload já desserializado:

```java
@ApplicationScoped
public class DispatchConsumer {

    @Incoming("orders-in")
    public void consume(OrderDispatched order) {
        LOG.infof("Reserving stock for order %s", order.orderId());
    }
}
```

Precisando dos metadados do registro (chave, partição, offset, headers), você recebe o `Message<T>` ou o `ConsumerRecord` cru:

```java
@Incoming("orders-in")
public CompletionStage<Void> consume(Message<OrderDispatched> msg) {
    var metadata = msg.getMetadata(IncomingKafkaRecordMetadata.class).orElseThrow();
    LOG.infof("partition=%d offset=%d", metadata.getPartition(), metadata.getOffset());
    return msg.ack();
}
```

```java
@Incoming("orders-in")
public void consume(ConsumerRecord<String, OrderDispatched> record) {
    LOG.infof("key=%s value=%s", record.key(), record.value());
}
```

### Processamento: @Incoming e @Outgoing no mesmo método

Um método pode consumir de um canal e produzir em outro. É o `PriceConverter` do livro:

```java
@ApplicationScoped
public class PriceConverter {

    static final double CONVERSION_RATE = 0.88;

    @Incoming("prices")
    @Outgoing("my-data-stream")
    @Broadcast
    public double process(int priceInUsd) {
        return priceInUsd * CONVERSION_RATE;
    }
}
```

`prices` vem do Kafka. `my-data-stream` não tem conector configurado, então é um canal **in-memory**. O `@Broadcast` entrega o item a todos os assinantes, em vez de um só. E aí o canal in-memory pode ser exposto como Server-Sent Events:

```java
@Path("/prices")
public class PriceResource {

    @Channel("my-data-stream")
    Multi<Double> prices;

    @GET
    @Path("/stream")
    @Produces(MediaType.SERVER_SENT_EVENTS)
    public Multi<Double> stream() {
        return prices;
    }
}
```

Três anotações e o tópico Kafka vira um stream HTTP no navegador. No Spring, como o livro observa, é preciso construir a ponte in-memory à mão.

### O detalhe que derruba aplicação: a thread do consumidor

Este é o erro mais comum de quem chega no Reactive Messaging vindo do `@KafkaListener`. **O método `@Incoming` roda numa thread de I/O, a event loop do Vert.x.** Se você fizer uma chamada bloqueante ali (persistir no banco, chamar uma API HTTP síncrona) você trava a event loop e derruba a vazão da aplicação inteira.

```java
// ERRADO: bloqueia a event loop
@Incoming("orders-in")
public void consume(OrderDispatched order) {
    Stock.persist(new Stock(order));  // JDBC é bloqueante
}
```

Existem duas saídas.

**Saída 1: `@Blocking`.** Move a execução para uma worker thread. É a resposta clássica, e a única que o livro conhece.

```java
import io.smallrye.reactive.messaging.annotations.Blocking;

@Incoming("orders-in")
@Blocking
@Transactional
public void consume(OrderDispatched order) {
    Stock.persist(new Stock(order));
}
```

> **Atalho útil:** se o método já tem `@Transactional`, o Quarkus o considera bloqueante automaticamente e o `@Blocking` vira redundante. Mantenho os dois por clareza, mas só `@Transactional` funciona.

Por padrão, `@Blocking` processa os registros **em ordem**, um por vez. Para paralelizar abrindo mão da ordem global:

```java
@Incoming("orders-in")
@Blocking(ordered = false)
public void consume(OrderDispatched order) { ... }
```

```properties
# ou preservando a ordem por partição, ou por chave
mp.messaging.incoming.orders-in.ordered=partition
```

Também dá para direcionar o método a um pool nomeado com `@Blocking("my-worker-pool")`.

**Saída 2: `@RunOnVirtualThread`.** Cada mensagem roda numa virtual thread nova. Você escreve código bloqueante, direto, sem consumir uma worker thread da plataforma:

```java
import io.smallrye.common.annotation.RunOnVirtualThread;

@ApplicationScoped
public class PriceConsumer {

    @RestClient
    PriceAlertService alertService;

    @Incoming("prices")
    @RunOnVirtualThread
    public void consume(double price) {
        if (price > 90.0) {
            alertService.alert(price);
        }
    }
}
```

A anotação vale no método ou na classe inteira. Aplicada na classe, os métodos anotados com `@Blocking` passam a rodar em virtual threads, exceto os que apontarem para um pool nomeado. Requer Java 21 ou superior, e só funciona em assinaturas elegíveis a `@Blocking`:

```java
@Incoming("in") void consume(I in)
@Incoming("in") Uni<Void> consume(I in)
@Incoming("in") CompletionStage<Void> consume(Message<I> msg)
@Incoming("in") @Outgoing("out") O process(I in)
@Outgoing("out") O generator()
```

Para consumidor que faz I/O bloqueante (banco, HTTP), `@RunOnVirtualThread` costuma escalar melhor que `@Blocking`, porque não fica limitado ao tamanho do worker pool. A ressalva é a de sempre com virtual threads: cuidado com *pinning* em blocos `synchronized` e em bibliotecas nativas.

### Consumer groups

Por padrão, o `group.id` é o `quarkus.application.name`. Ele determina o comportamento de escala: **instâncias no mesmo grupo dividem as partições**, e grupos diferentes recebem cada um uma cópia completa do fluxo.

```properties
mp.messaging.incoming.orders-in.group.id=inventory-service
mp.messaging.incoming.orders-in.auto.offset.reset=earliest
```

Precisando que **toda** instância receba **todas** as mensagens, o caso de um cache local replicado, dê a cada uma um grupo único:

```properties
mp.messaging.incoming.orders-in.group.id=${quarkus.uuid}
```

Para aumentar o paralelismo dentro de uma única instância:

```properties
mp.messaging.incoming.orders-in.concurrency=3
```

> **Qualquer propriedade do cliente Kafka funciona.** O prefixo do canal é um pass-through: `mp.messaging.incoming.orders-in.max.poll.records=1000` ou `mp.messaging.outgoing.orders-dispatch.max.block.ms=10000` chegam direto no consumer e no producer do Kafka. Não é preciso procurar um equivalente "do Quarkus" para cada tuning.

---

## 6. Serialização JSON Automática

O livro dedica páginas a configurar `IntegerSerializer` e `IntegerDeserializer` na mão. Para tipos primitivos isso nem é mais necessário: o Quarkus **auto-detecta** serde para `short`, `int`, `long`, `float`, `double`, `byte[]`, `String`, `UUID`, `ByteBuffer`, `Bytes`, `Buffer`, `JsonObject` e `JsonArray`.

Vale saber também que, se você não disser nada, `key.serializer` e `key.deserializer` assumem `StringSerializer` e `StringDeserializer`. A chave é String por padrão.

O caso interessante é o objeto de domínio. Existem três níveis, e a maior parte dos tutoriais só mostra o primeiro.

**Nível 1, serde explícito, que é o que o livro faz.** Você escreve uma classe:

```java
public class OrderDispatchedDeserializer extends ObjectMapperDeserializer<OrderDispatched> {
    public OrderDispatchedDeserializer() {
        super(OrderDispatched.class);
    }
}
```

```properties
mp.messaging.incoming.orders-in.value.deserializer=org.acme.OrderDispatchedDeserializer
mp.messaging.outgoing.orders-dispatch.value.serializer=io.quarkus.kafka.client.serialization.ObjectMapperSerializer
```

O serializer não precisa de subclasse, porque `ObjectMapperSerializer` serializa qualquer objeto. O deserializer precisa, porque o tipo alvo se perde por *erasure*.

**Nível 2, auto-detecção.** Se você declarar a classe acima e não configurar nada, o Quarkus a encontra e conecta sozinho.

**Nível 3, auto-geração.** Se você não configurar serde **e** a auto-detecção não achar nada, o Quarkus **gera** o serializer e o deserializer em tempo de build, baseados em Jackson, a partir do tipo declarado no método. Na prática, para um `record` de domínio, isto basta:

```properties
mp.messaging.outgoing.orders-dispatch.connector=smallrye-kafka
mp.messaging.outgoing.orders-dispatch.topic=orders-dispatch
mp.messaging.incoming.orders-in.connector=smallrye-kafka
mp.messaging.incoming.orders-in.topic=orders-dispatch
```

Nenhuma linha de serde. É o que vamos usar no projeto.

Para desligar a auto-detecção:

```properties
quarkus.messaging.kafka.serializer-autodetection.enabled=false
```

> **Cuidado com a auto-geração em contratos entre times.** Ela é excelente para prototipar e para tópicos internos. Quando o tópico é contrato público entre microsserviços, um schema explícito, Avro ou JSON Schema com Schema Registry, evita que um rename de campo quebre o consumidor silenciosamente.

---

## 7. Projeto Prático: Despachando Pedidos para o Estoque

Vamos ao exemplo completo. Ao aprovar um pedido, publicamos em `orders-dispatch`. Um consumidor, simulando o serviço de estoque, lê e reserva o inventário.

> **Dev Services em dobro:** o projeto usa `quarkus-rest-jackson`, `quarkus-hibernate-orm-panache`, `quarkus-jdbc-postgresql` e `quarkus-messaging-kafka`. Sem nenhuma configuração, os Dev Services sobem **um PostgreSQL e um Kafka** em containers, em dev e em teste.

### Estrutura do Projeto

```
kafka-demo/
  src/main/java/org/acme/
    Order.java
    OrderDTO.java
    OrderDispatched.java
    OrderService.java
    InventoryConsumer.java
    OrderResource.java
  src/main/resources/
    application.properties
  src/test/java/org/acme/
    OrderResourceTest.java
    OrderDispatchInMemoryTest.java
```

### Order.java

```java
@Entity
@Table(name = "orders")
public class Order extends PanacheEntity {

    @Column(name = "customer_name", nullable = false)
    public String customerName;

    @Column(name = "total_amount", nullable = false)
    public double totalAmount;

    @Column(nullable = false)
    public String status;

    @Column(nullable = false, updatable = false)
    public LocalDateTime createdAt;

    @PrePersist
    void onCreate() {
        createdAt = LocalDateTime.now();
        if (status == null) {
            status = "APPROVED";
        }
    }
}
```

### OrderDispatched.java

O payload que trafega no tópico. Um `record`, imutável e serializado automaticamente:

```java
public record OrderDispatched(
    String orderId,
    String customerName,
    double totalAmount,
    LocalDateTime dispatchedAt
) {}
```

### OrderService.java

```java
@ApplicationScoped
public class OrderService {

    private static final Logger LOG = Logger.getLogger(OrderService.class);

    final MutinyEmitter<OrderDispatched> emitter;

    OrderService(@Channel("orders-dispatch") MutinyEmitter<OrderDispatched> emitter) {
        this.emitter = emitter;
    }

    @Transactional
    public Order create(OrderDTO dto) {
        Order order = new Order();
        order.customerName = dto.customerName;
        order.totalAmount = dto.totalAmount;
        order.persist();
        LOG.infof("Order %d persisted for customer: %s", order.id, order.customerName);
        return order;
    }

    public Uni<Void> dispatch(Order order) {
        OrderDispatched payload = new OrderDispatched(
            String.valueOf(order.id),
            order.customerName,
            order.totalAmount,
            LocalDateTime.now());

        return emitter.send(payload)
            .invoke(() -> LOG.infof("Order %s dispatched to Kafka", payload.orderId()))
            .onFailure().invoke(t ->
                LOG.errorf(t, "Failed to dispatch order %s", payload.orderId()));
    }
}
```

Repare que **`create()` e `dispatch()` estão separados**, e que o `send()` está fora do `@Transactional`. Isso é deliberado, e vale um aviso.

> **O problema da escrita dupla (dual write).** É tentador chamar `emitter.send()` dentro do método `@Transactional`, logo após o `persist()`. O risco: o `send()` é assíncrono e não participa da transação JTA. A mensagem pode chegar ao Kafka **antes** do commit, e se a transação der rollback você publicou um pedido que não existe no banco. O inverso também ocorre: commit bem-sucedido e publicação falha, e o estoque nunca é avisado.
>
> Para tópicos internos e tolerantes, separar as chamadas e logar a falha é aceitável. Quando a consistência importa de verdade, o padrão é o **Outbox**: grave o evento numa tabela na mesma transação e deixe um processo separado publicá-lo. O Quarkus também oferece `KafkaTransactions` para escrita exatamente-uma-vez entre tópicos, e permite encadear uma transação Kafka com uma transação do Hibernate Reactive, mas nenhum dos dois é um substituto trivial do Outbox no caso do banco relacional bloqueante.

### InventoryConsumer.java

```java
@ApplicationScoped
public class InventoryConsumer {

    private static final Logger LOG = Logger.getLogger(InventoryConsumer.class);

    @Incoming("orders-in")
    @Blocking
    @Transactional
    public void reserveStock(OrderDispatched order) {
        LOG.infof("Reserving stock for order %s (customer: %s, total: $%.2f)",
            order.orderId(), order.customerName(), order.totalAmount());
    }
}
```

Num sistema real este consumidor estaria em **outro projeto**. Deixá-lo aqui permite ver os dois lados no mesmo `quarkus:dev`. E, graças ao `shared=true` do Dev Services, você pode subir um segundo projeto Quarkus na sua máquina e ele vai se conectar ao mesmo broker.

### OrderResource.java

```java
@Path("/orders")
public class OrderResource {

    private static final Logger LOG = Logger.getLogger(OrderResource.class);

    final OrderService service;

    OrderResource(OrderService service) {
        this.service = service;
    }

    @POST
    public Uni<Response> create(@Valid OrderDTO dto) {
        LOG.info("Creating new order");
        Order created = service.create(dto);
        return service.dispatch(created)
            .replaceWith(() -> Response.status(Response.Status.CREATED)
                .entity(created).build());
    }
}
```

### application.properties

```properties
# ---- Kafka: produtor ----
mp.messaging.outgoing.orders-dispatch.connector=smallrye-kafka
mp.messaging.outgoing.orders-dispatch.topic=orders-dispatch

# ---- Kafka: consumidor ----
mp.messaging.incoming.orders-in.connector=smallrye-kafka
mp.messaging.incoming.orders-in.topic=orders-dispatch
mp.messaging.incoming.orders-in.group.id=inventory-service
mp.messaging.incoming.orders-in.auto.offset.reset=earliest

# ---- Dev Services ----
quarkus.kafka.devservices.topic-partitions.orders-dispatch=3

# ---- Produção ----
%prod.kafka.bootstrap.servers=kafka.mycompany.svc:9092
```

Sem serializer, sem deserializer, sem `docker-compose.yml`. Um `POST /orders` produz:

```
Order 1 persisted for customer: Matheus
Order 1 dispatched to Kafka
Reserving stock for order 1 (customer: Matheus, total: $299.90)
```

> **Dev UI:** em `http://localhost:8080/q/dev-ui` a extensão de Kafka expõe um painel onde você navega pelos tópicos, inspeciona registros e publica mensagens de teste na mão. É o substituto do `kafka-console-consumer` durante o desenvolvimento.

---

## 8. Testes

### Com o broker real (Dev Services)

O caminho mais fiel: `@QuarkusTest` sobe o Kafka de teste e o fluxo roda de ponta a ponta. Como o consumo é assíncrono, o teste precisa **aguardar**. Vale o mesmo alerta do artigo de Event Bus: não teste consumidor assíncrono com asserção imediata.

```java
@QuarkusTest
class OrderResourceTest {

    @InjectSpy
    InventoryConsumer consumer;

    @Test
    void shouldDispatchOrderToKafka() {
        given()
            .contentType(ContentType.JSON)
            .body("""
                {"customerName": "Matheus", "totalAmount": 299.90}
                """)
        .when()
            .post("/orders")
        .then()
            .statusCode(201);

        await().atMost(10, TimeUnit.SECONDS).untilAsserted(() ->
            verify(consumer, times(1)).reserveStock(any(OrderDispatched.class)));
    }
}
```

O `await()` vem do Awaitility (`org.awaitility:awaitility`, escopo de teste).

### Sem broker: o conector in-memory

Testar contra um broker real é lento e traz *flakiness*. Como o código só conhece **canais**, dá para trocar o conector Kafka por um in-memory e testar a lógica isoladamente:

```xml
<dependency>
    <groupId>io.smallrye.reactive</groupId>
    <artifactId>smallrye-reactive-messaging-in-memory</artifactId>
    <scope>test</scope>
</dependency>
```

```java
@QuarkusTest
class OrderDispatchInMemoryTest {

    @BeforeAll
    static void switchChannels() {
        InMemoryConnector.switchOutgoingChannelsToInMemory("orders-dispatch");
        InMemoryConnector.switchIncomingChannelsToInMemory("orders-in");
    }

    @AfterAll
    static void revertChannels() {
        InMemoryConnector.clear();
    }

    @Inject
    @Any
    InMemoryConnector connector;

    @Test
    void shouldPublishToOutgoingChannel() {
        InMemorySink<OrderDispatched> sink = connector.sink("orders-dispatch");

        given()
            .contentType(ContentType.JSON)
            .body("""
                {"customerName": "Matheus", "totalAmount": 299.90}
                """)
        .when()
            .post("/orders")
        .then()
            .statusCode(201);

        assertEquals(1, sink.received().size());
        assertEquals("Matheus", sink.received().get(0).getPayload().customerName());
    }

    @Test
    void shouldConsumeFromIncomingChannel() {
        InMemorySource<OrderDispatched> source = connector.source("orders-in");

        source.send(new OrderDispatched("42", "Ana", 99.0, LocalDateTime.now()));
        // asserções sobre o efeito do consumidor
    }
}
```

A classe é `io.smallrye.reactive.messaging.memory.InMemoryConnector`. O `switch...ToInMemory` substitui o conector antes do contexto CDI subir e o `clear()` reverte. Nenhum container envolvido, teste em milissegundos.

> **O trade-off:** o conector in-memory **não invoca o conector Kafka**. Serialização, particionamento, offsets e metadados específicos do Kafka não são exercitados. Use o in-memory para lógica de negócio e o Dev Services para o caminho de integração. Os dois testes acima se complementam, não competem.

Para cenários mais avançados, como simular falha de rede, inspecionar offsets ou escrever direto no tópico, existe o **Kafka Companion** (`io.quarkus:quarkus-test-kafka-companion`), que conecta a um broker real e oferece asserções de alto nível sobre produção e consumo.

---

## 9. Confiabilidade: Acknowledgment, Commit e DLQ

Um consumidor que lança exceção **para o canal** por padrão. Vale conhecer os três eixos de configuração.

**Acknowledgment**, quando a mensagem é confirmada:

| Estratégia | Comportamento |
| :--- | :--- |
| `POST_PROCESSING` (padrão) | Confirma após o método retornar sem erro |
| `PRE_PROCESSING` | Confirma antes de processar (at-most-once) |
| `MANUAL` | Você chama `msg.ack()`, automático ao receber `Message<T>` |

```java
@Incoming("orders-in")
@Acknowledgment(Acknowledgment.Strategy.PRE_PROCESSING)
public void consume(OrderDispatched order) { ... }
```

**Commit strategy**, quando o offset vai para o broker:

```properties
mp.messaging.incoming.orders-in.commit-strategy=throttled
```

`throttled` é o padrão e comita periodicamente o offset da última mensagem confirmada em sequência. As alternativas são `latest` (comita a cada ack, mais seguro e mais lento), `checkpoint` (offsets num state store, para processamento com estado) e `ignore` (delega ao auto-commit do cliente Kafka).

**Failure strategy**, o que fazer quando estoura:

```properties
mp.messaging.incoming.orders-in.failure-strategy=dead-letter-queue
mp.messaging.incoming.orders-in.dead-letter-queue.topic=orders-dispatch-dlq
```

As opções são `fail` (padrão, para o canal), `ignore` (loga e segue), `dead-letter-queue` e `delayed-retry-topic`. Para retry no próprio consumidor, o SmallRye Fault Tolerance funciona normalmente:

```java
@Incoming("orders-in")
@Blocking
@Retry(delay = 500, maxRetries = 3)
public void consume(OrderDispatched order) { ... }
```

**Health checks.** Cada canal configurado, de entrada ou de saída, registra automaticamente três probes: *startup* (verifica que a comunicação com o cluster foi estabelecida), *liveness* (captura falhas irrecuperáveis) e *readiness* (verifica que o conector está pronto para consumir ou produzir). Isso é exatamente o que o Kubernetes vai consumir, e é o assunto do último artigo da série.

```properties
# desliga liveness e readiness do canal
mp.messaging.incoming.orders-in.health-enabled=false

# desliga só o readiness
mp.messaging.incoming.orders-in.health-readiness-enabled=false
```

Vale desativar o readiness de um canal quando o pod não deve ficar fora de serviço só porque um tópico secundário está indisponível.

---

## 10. Comparação Final: Spring vs Quarkus

A coluna do Spring reflete o Spring Boot 4.1, que traz o Spring for Apache Kafka 4.1, e o Spring Cloud Stream atual. Vale conferir, porque vários nomes dessa coluna mudaram depois que o livro foi escrito.

| Aspecto | Spring (Cloud Stream / Kafka) | Quarkus (SmallRye Reactive Messaging) |
| :--- | :--- | :--- |
| Extensão | `spring-cloud-starter-stream-kafka` | `quarkus-messaging-kafka` |
| Consumo | `@KafkaListener(topics=...)` ou bean `Consumer<T>` | `@Incoming("channel")` |
| Produção | `KafkaTemplate` ou bean `Supplier<T>` | `@Outgoing`, `Emitter`, `MutinyEmitter` |
| Abstração | Binding derivado do nome da função | Channel nomeado explicitamente |
| Registro de funções | `spring.cloud.function.definition`, opcional com um único bean | Não existe |
| Canal in-memory | Implementação manual sobre `Sinks.Many` | Nativo, basta não configurar conector |
| Broker em dev | Docker Compose ou Testcontainers manual | **Dev Services** automático |
| Criação de tópicos | Script ou bean `NewTopic` | `quarkus.kafka.devservices.topic-partitions.*` |
| Serde JSON | `JacksonJsonSerializer` e `JacksonJsonDeserializer` configurados | Auto-detecção e auto-geração |
| Thread do consumidor | Thread do container (bloqueante) | Event loop, exige `@Blocking` ou `@RunOnVirtualThread` |
| Teste sem broker | `@EmbeddedKafka`, só KRaft desde o Spring Kafka 4 | Conector in-memory |
| Modelo reativo | Reactor (`Flux`) | Mutiny (`Multi`, `Uni`) |

A diferença de fundo: no Spring, o código referencia o **tópico**. No Quarkus, referencia um **canal**, e o tópico é detalhe de configuração. Isso custa um conceito a mais para aprender, e devolve testabilidade e portabilidade de transporte.

---

## Conclusão

O Reactive Messaging fecha o arco de mensageria da série. O **Event Bus** desacopla componentes dentro do processo. O **Signals** faz o mesmo com type-safety. O **Kafka**, via SmallRye, leva a mensagem para fora, com durabilidade, replay e consumidores independentes.

O que mais mudou desde o livro não foi a API. `@Incoming` e `@Outgoing` continuam iguais. Mudou tudo em volta: o Capítulo 5 pede Docker Compose, Zookeeper e scripts de criação de tópico, e hoje isso é uma dependência e zero configuração. Some a auto-geração de serdes e o resultado é um exemplo funcional em menos de 100 linhas de Java.

Guarde os dois pontos que mais causam incidente: **consumidor bloqueante sem `@Blocking` ou `@RunOnVirtualThread`**, e a **escrita dupla** entre a transação e o `emitter.send()`. Os dois passam nos testes e aparecem em produção.

No próximo artigo, mudamos de assunto: **compilação nativa com GraalVM e dockerização**. Vamos transformar essa aplicação num binário nativo, entender por que o build demora tanto, como o Quarkus resolve reflection sem configuração manual, e medir quanta memória o nativo economiza em relação ao JAR.

---

## Recursos

* [Guia Oficial: Apache Kafka Reference Guide](https://quarkus.io/guides/kafka)
* [Guia Oficial: Getting Started with Quarkus Messaging and Apache Kafka](https://quarkus.io/guides/kafka-getting-started)
* [Guia Oficial: Dev Services for Kafka](https://quarkus.io/guides/kafka-dev-services)
* [Guia Oficial: Virtual Thread support with Reactive Messaging](https://quarkus.io/guides/messaging-virtual-threads)
* [SmallRye Reactive Messaging: Testing](https://smallrye.io/smallrye-reactive-messaging/latest/concepts/testing/)
* [SmallRye Reactive Messaging: Test Companion for Kafka](https://smallrye.io/smallrye-reactive-messaging/4.2.0/kafka/test-companion/)
* [Especificação MicroProfile Reactive Messaging](https://github.com/eclipse/microprofile-reactive-messaging)
* [Spring Cloud Stream: Producing and Consuming Messages](https://docs.spring.io/spring-cloud-stream/reference/spring-cloud-stream/producing-and-consuming-messages.html)
* [Spring Boot: Apache Kafka Support](https://docs.spring.io/spring-boot/reference/messaging/kafka.html)
* [Spring for Apache Kafka: Serialization e Deserialization](https://docs.spring.io/spring-kafka/reference/kafka/serdes.html)
* [Repositório de Exemplos do Livro](https://github.com/quarkus-for-spring-developers/examples)
