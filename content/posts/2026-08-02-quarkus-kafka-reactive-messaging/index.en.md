---
title: "Kafka Integration in Quarkus: Reactive Messaging, @Incoming and @Outgoing"
date: 2026-08-01T10:00:00-03:00
draft: false
tags: ["Quarkus", "Spring", "Java", "Kafka", "Reactive Messaging", "SmallRye", "Dev Services", "Messaging", "Virtual Threads", "Quarkus for Spring Developers"]
author: "Matheus Oliveira"
slug: "quarkus-kafka-reactive-messaging"
summary: "Take messaging outside the application with SmallRye Reactive Messaging. Channels vs Topics, @Incoming, @Outgoing, Emitter, automatic JSON serialization, and Dev Services starting the broker without you installing anything."
description: "Complete guide to Apache Kafka integration in Quarkus with SmallRye Reactive Messaging. Compare it to Spring Cloud Stream and @KafkaListener, understand how channels map to topics, configure automatic JSON serialization, write tests with the in-memory connector, and use Dev Services to run without installing Kafka."
cover:
  image: "quarkus-kafka-cover.png"
  alt: "16-bit SNES pixel art of a horizontal shoot-em-up where a starfighter launches data capsules flowing along three neon lanes numbered like partitions, with three satellite drones in formation consuming each lane, KAFKA logo on the HUD"
  caption: "The producer fires, the log scrolls, and each consumer reads its own partition"
  relative: true
---

*This article is part of the ["Quarkus for Spring Developers"](https://blog.omatheusmesmo.dev/en/tags/quarkus-for-spring-developers/) series.*

In the two previous articles, on the [Vert.x Event Bus]({{< ref "posts/2026-06-20-quarkus-event-bus-consumeevent/index.en.md" >}}) and [Quarkus Signals]({{< ref "posts/2026-06-27-quarkus-signals-messaging/index.en.md" >}}), we decoupled components **inside** the same application. No external infrastructure, no broker, no configuration. And one debt was left at the end of that last piece: at some point the message has to cross the process boundary.

This is that point. When the order is approved and the **inventory service** (a different deployment, a different team, maybe a different language) needs to react, the Event Bus does not help. It lives in the memory of a single instance. If the pod dies, the message dies with it.

This is where **Apache Kafka** comes in, and the way Quarkus talks to it: **SmallRye Reactive Messaging**, an implementation of the MicroProfile Reactive Messaging specification. In this article you will understand the connector and channel abstraction, produce and consume messages with `@Outgoing` and `@Incoming`, solve JSON serialization without writing a single serde (short for *serializer* + *deserializer*, the pair of classes that turns an object into bytes and bytes back into an object), and run all of it without installing Kafka on your machine.

---

## Before We Start: Updates Relative to the Book

*Quarkus for Spring Developers* covers Reactive Messaging in Chapter 5, on Quarkus 2.1.4. This is by far the section of the book that aged the most: the example asks for a `docker-compose.yml` with **Zookeeper**, `strimzi/kafka:0.20.1` images, and a `create-topic.sh` script calling `kafka-topics` by hand. None of that is necessary today. The table summarizes what changes in the current version (3.38.0):

| In the Book | In Current Quarkus | What Changed |
| :--- | :--- | :--- |
| `smallrye-reactive-messaging-kafka` | `quarkus-messaging-kafka` | The extension was renamed. The old artifact still resolves in legacy projects, but the canonical name today is `io.quarkus:quarkus-messaging-kafka`. |
| Docker Compose with Zookeeper | **Dev Services for Kafka** | Quarkus starts a broker container automatically in dev mode and in tests. Modern Kafka runs in KRaft mode: Zookeeper was removed from Kafka as of 4.0. |
| `create-topic.sh` with `kafka-topics` | `quarkus.kafka.devservices.topic-partitions.<topic>=N` | Declarative topic creation, in `application.properties`. |
| `javax.enterprise.*`, `javax.ws.rs.*` | `jakarta.enterprise.*`, `jakarta.ws.rs.*` | Migration to Jakarta EE 9+. |
| Hand-written JSON serde | Serde auto-detection and **auto-generation** | Quarkus detects the serializer from the type and, when it finds none, generates a Jackson-based one at build time. |
| `Emitter` (only `CompletionStage`) | `Emitter` and `MutinyEmitter` | `MutinyEmitter` returns `Uni<Void>`, fitting the reactive model of the rest of Quarkus. |
| `@Blocking` as the only way out for blocking code | `@Blocking` or `@RunOnVirtualThread` | Virtual threads did not exist in 2021. Today they are a first-class alternative, and we will see both. |
| `Publisher<Double>` from the Reactive Streams spec | `Multi<Double>` from Mutiny | The book uses `Publisher` on `@Channel`. `Multi` is still a `Publisher`, so both work, but the idiomatic choice today is `Multi`. |
| Kafka 2.6 | `kafka-clients` 4.1.1 | The extension is compatible with brokers 2.x and above. |

> **About the Dev Services provider:** most material you will find online, including recent articles, states that Dev Services uses **Redpanda** by default. That changed. The current default for `quarkus.kafka.devservices.provider` is **`upstream-kafka-native`**, the official Apache Kafka image compiled with GraalVM, which starts fast precisely because it is native. Redpanda is still available as an option.

---

## 1. The Problem: Messaging Has to Leave the Application

Picking up the order system we built in the previous articles. Today, when an order is saved, we fire an in-process event and three handlers react: notification, inventory, and dashboard. All inside the same process.

The new requirement is different: **the inventory service became a separate microservice**. It has its own deployment, its own database, and it cannot be coupled to ours. We need:

1. **Durable delivery.** If the consumer is down, the message waits.
2. **Replay.** If the consumer processes it wrong, it reprocesses from an offset.
3. **Multiple independent consumers.** Inventory, billing, and BI read the same stream, each at its own pace.
4. **Real backpressure.** The producer cannot drown the consumer.

The Event Bus delivers none of those four. Kafka delivers all four.

In Spring, the usual path is **Spring Cloud Stream** with the Kafka binder, or `@KafkaListener` from Spring for Apache Kafka. In Quarkus, it is **SmallRye Reactive Messaging**.

---

## 2. Connectors and Channels: The SmallRye Abstraction

This is the central concept of the chapter, and what confuses people coming from `@KafkaListener` the most. In Spring for Apache Kafka, you annotate a method with the **topic name**:

```java
// SPRING
@KafkaListener(topics = "orders-dispatch", groupId = "inventory")
public void listen(String message) { ... }
```

The code knows the broker. If tomorrow the message comes from RabbitMQ, the method changes.

In SmallRye, the code knows only a **channel**, a logical name internal to the application. What sits on the other side is decided by configuration.

```java
// QUARKUS
@Incoming("orders-in")
public void listen(String message) { ... }
```

`orders-in` is not a topic. It is a channel. The binding between channel and Kafka lives in `application.properties`:

```properties
mp.messaging.incoming.orders-in.connector=smallrye-kafka
mp.messaging.incoming.orders-in.topic=orders-dispatch
```

The specification vocabulary is deliberately generic, because SmallRye also speaks AMQP, MQTT, JMS, and Camel:

| Concept | What It Is | Where It Lives |
| :--- | :--- | :--- |
| **Message** | Envelope with payload and metadata. With the Kafka connector, it corresponds to a record. | Java code |
| **Channel** | Logical name messages travel on | `@Incoming`, `@Outgoing`, `@Channel` |
| **Connector** | Transport implementation (`smallrye-kafka`, `smallrye-amqp`, in-memory) | `application.properties` |
| **Topic** | The actual destination on the broker | `application.properties` |

The separation has three practical consequences:

1. **Swapping transports without touching code.** Changing `connector` from `smallrye-kafka` to `smallrye-amqp` repoints the same method.
2. **Free in-memory channels.** A channel with no connector configured becomes an **in-memory** channel between two methods of the same application. You chain `@Incoming` and `@Outgoing` with no broker at all. The book calls attention to this and the remark still holds: Spring has no such concept, and the Chapter 5 example needs a hand-built `InMemoryChannel` class on top of Reactor's `Sinks.Many`.
3. **Trivial tests.** This is why you can replace Kafka with an in-memory connector in tests, as we will see in section 9.

Two shortcuts the official documentation allows, which trim the configuration:

- **If the channel name equals the topic name**, you can omit `.topic`.
- **If the Kafka connector is the only one on the classpath**, you can omit `.connector`. Quarkus assumes every unresolved channel is Kafka.

In simple cases the configuration can be literally empty. Even so, I prefer to declare both lines: when the names diverge, and eventually they do, the file is already in the right shape.

---

## 3. Installation and Dev Services

One dependency:

```xml
<dependency>
    <groupId>io.quarkus</groupId>
    <artifactId>quarkus-messaging-kafka</artifactId>
</dependency>
```

Or via the CLI:

```bash
quarkus extension add messaging-kafka
```

And now the part that erases half of Chapter 5 of the book: **you do not need to install, start, or configure a Kafka.** In dev mode and during tests, **Dev Services** detect that a Kafka connector is configured and start a broker container automatically.

```bash
./mvnw quarkus:dev
```

```
[io.qua.kaf.cli.dep.DevServicesKafkaProcessor] Dev Services for Kafka started. Kafka broker is available at localhost:36429
```

Note the random port. Quarkus injects `kafka.bootstrap.servers` pointing at it. In production, you set the real address with the `%prod` profile:

```properties
%prod.kafka.bootstrap.servers=kafka.mycompany.svc:9092
```

Dev Services disable themselves when `kafka.bootstrap.servers` is configured. That single line already guarantees nothing starts in a container in the real environment.

Useful settings:

```properties
# Creates topics with N partitions when the broker starts
quarkus.kafka.devservices.topic-partitions.orders-dispatch=3

# Fixed port, if you want to attach an external kcat
quarkus.kafka.devservices.port=9092

# Switch the development broker
quarkus.kafka.devservices.provider=redpanda

# Turn it off
quarkus.kafka.devservices.enabled=false
```

The accepted providers are `upstream-kafka-native` (default), `upstream-kafka`, `redpanda`, `strimzi`, and `kafka-native`.

Two notes that save time:

- **`quarkus.kafka.devservices.shared`** is `true` in dev mode and `false` in tests. Several Quarkus applications running in dev on your machine **share the same broker**, identified by the `quarkus.kafka.devservices.service-name` label (default `kafka`). That is great for simulating two microservices talking to each other. In tests, each run gets an isolated broker.
- **Automatic topic creation.** The dev broker accepts producing to a nonexistent topic and creates it with 1 partition. That masks partitioning bugs which only show up in production, which is why declaring `topic-partitions` explicitly is worth it.

---

## 4. Producing Messages with @Outgoing

### The declarative model

The most idiomatic form is an `@Outgoing` method returning a stream. It is subscribed at boot and runs on its own. This is the book's `PriceGenerator`, updated:

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

That covers continuous sources: sensors, generators, polling. But our case is different. We want to publish **when an order is created**, from a REST endpoint. That is imperative, not an infinite stream.

### The imperative model: Emitter

For that there is `Emitter`, injected with `@Channel`:

```java
@Inject
@Channel("orders-dispatch")
Emitter<OrderDispatched> emitter;

public void dispatch(OrderDispatched payload) {
    CompletionStage<Void> ack = emitter.send(payload);
}
```

And the reactive variant, which returns `Uni<Void>` and fits better with the rest of Quarkus:

```java
@Inject
@Channel("orders-dispatch")
MutinyEmitter<OrderDispatched> emitter;
```

| API | `send()` return | When to use |
| :--- | :--- | :--- |
| `Emitter<T>` | `CompletionStage<Void>` | Imperative code, integration with standard Java APIs |
| `MutinyEmitter<T>` | `Uni<Void>` | Reactive pipelines, endpoints already returning `Uni`, Hibernate Reactive |
| `@Outgoing` | None | Continuous streams, generated by the application itself |

> **`send()` is asynchronous.** The `CompletionStage` or `Uni` only completes when the broker acknowledges receipt. If you ignore the return value, you ignore the write failure along with it. We come back to this in section 10.

### Comparison with Spring

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

> **Careful if you follow the book here:** the property in Chapter 5 is `spring.cloud.stream.function.definition`, which is deprecated today. The current one is `spring.cloud.function.definition`, native to Spring Cloud Function. And it is **optional** when there is a single `Supplier`, `Function`, or `Consumer` bean in the context: that bean is auto-discovered, although the documentation recommends declaring it anyway to avoid ambiguity. To turn auto-discovery off, use `spring.cloud.stream.function.autodetect=false`.

The difference that still holds is not the registration itself, it is where the destination name comes from. In Spring Cloud Stream the binding is **derived from the bean name** (`generateprice` becomes `generateprice-out-0`), so renaming the method renames the binding and breaks the configuration. In Quarkus, the channel name is a string you choose in the annotation, independent of the method name.

---

## 5. Consuming Messages with @Incoming

The simplest consumer receives the already-deserialized payload:

```java
@ApplicationScoped
public class DispatchConsumer {

    @Incoming("orders-in")
    public void consume(OrderDispatched order) {
        LOG.infof("Reserving stock for order %s", order.orderId());
    }
}
```

When you need record metadata (key, partition, offset, headers), you receive the `Message<T>` or the raw `ConsumerRecord`:

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

### Processing: @Incoming and @Outgoing on the same method

A method can consume from one channel and produce to another. This is the book's `PriceConverter`:

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

`prices` comes from Kafka. `my-data-stream` has no connector configured, so it is an **in-memory** channel. `@Broadcast` delivers the item to every subscriber instead of just one. And then the in-memory channel can be exposed as Server-Sent Events:

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

Three annotations and the Kafka topic becomes an HTTP stream in the browser. In Spring, as the book notes, you have to build the in-memory bridge by hand.

### The detail that takes applications down: the consumer thread

This is the most common mistake for people arriving at Reactive Messaging from `@KafkaListener`. **The `@Incoming` method runs on an I/O thread, the Vert.x event loop.** If you make a blocking call there (persisting to the database, calling a synchronous HTTP API) you block the event loop and destroy the throughput of the whole application.

```java
// WRONG: blocks the event loop
@Incoming("orders-in")
public void consume(OrderDispatched order) {
    Stock.persist(new Stock(order));  // JDBC is blocking
}
```

There are two ways out.

**Way 1: `@Blocking`.** It moves execution to a worker thread. This is the classic answer, and the only one the book knows about.

```java
import io.smallrye.reactive.messaging.annotations.Blocking;

@Incoming("orders-in")
@Blocking
@Transactional
public void consume(OrderDispatched order) {
    Stock.persist(new Stock(order));
}
```

> **Handy shortcut:** if the method already has `@Transactional`, Quarkus considers it blocking automatically and `@Blocking` becomes redundant. I keep both for clarity, but `@Transactional` alone works.

By default, `@Blocking` processes records **in order**, one at a time. To parallelize by giving up global ordering:

```java
@Incoming("orders-in")
@Blocking(ordered = false)
public void consume(OrderDispatched order) { ... }
```

```properties
# or preserving order per partition, or per key
mp.messaging.incoming.orders-in.ordered=partition
```

You can also route the method to a named pool with `@Blocking("my-worker-pool")`.

**Way 2: `@RunOnVirtualThread`.** Each message runs on a fresh virtual thread. You write blocking, straightforward code without consuming a platform worker thread:

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

The annotation works on the method or on the whole class. Applied to the class, methods annotated with `@Blocking` start running on virtual threads, except those pointing at a named pool. It requires Java 21 or later, and only works on signatures eligible for `@Blocking`:

```java
@Incoming("in") void consume(I in)
@Incoming("in") Uni<Void> consume(I in)
@Incoming("in") CompletionStage<Void> consume(Message<I> msg)
@Incoming("in") @Outgoing("out") O process(I in)
@Outgoing("out") O generator()
```

For a consumer doing blocking I/O (database, HTTP), `@RunOnVirtualThread` usually scales better than `@Blocking`, because it is not bounded by the worker pool size. The usual virtual thread caveat applies: watch out for pinning in `synchronized` blocks and native libraries.

### Consumer groups

By default, `group.id` is `quarkus.application.name`. It determines scaling behavior: **instances in the same group split the partitions**, and different groups each receive a full copy of the stream.

```properties
mp.messaging.incoming.orders-in.group.id=inventory-service
mp.messaging.incoming.orders-in.auto.offset.reset=earliest
```

When you need **every** instance to receive **every** message, the case of a replicated local cache, give each one a unique group:

```properties
mp.messaging.incoming.orders-in.group.id=${quarkus.uuid}
```

To increase parallelism inside a single instance:

```properties
mp.messaging.incoming.orders-in.concurrency=3
```

> **Any Kafka client property works.** The channel prefix is a pass-through: `mp.messaging.incoming.orders-in.max.poll.records=1000` or `mp.messaging.outgoing.orders-dispatch.max.block.ms=10000` land directly on the Kafka consumer and producer. There is no need to hunt for a "Quarkus equivalent" for each tuning knob.

---

## 6. Automatic JSON Serialization

The book spends pages configuring `IntegerSerializer` and `IntegerDeserializer` by hand. For primitive types that is no longer necessary at all: Quarkus **auto-detects** serdes for `short`, `int`, `long`, `float`, `double`, `byte[]`, `String`, `UUID`, `ByteBuffer`, `Bytes`, `Buffer`, `JsonObject`, and `JsonArray`.

It is also worth knowing that, if you say nothing, `key.serializer` and `key.deserializer` default to `StringSerializer` and `StringDeserializer`. The key is a String by default.

The interesting case is the domain object. There are three levels, and most tutorials only show the first.

**Level 1, explicit serde, which is what the book does.** You write a class:

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

The serializer needs no subclass, because `ObjectMapperSerializer` serializes any object. The deserializer does, because the target type is lost to erasure.

**Level 2, auto-detection.** If you declare the class above and configure nothing, Quarkus finds and wires it on its own.

**Level 3, auto-generation.** If you configure no serde **and** auto-detection finds nothing, Quarkus **generates** the serializer and deserializer at build time, Jackson-based, from the type declared on the method. In practice, for a domain `record`, this is enough:

```properties
mp.messaging.outgoing.orders-dispatch.connector=smallrye-kafka
mp.messaging.outgoing.orders-dispatch.topic=orders-dispatch
mp.messaging.incoming.orders-in.connector=smallrye-kafka
mp.messaging.incoming.orders-in.topic=orders-dispatch
```

Not a single serde line. That is what we will use in the project.

To disable auto-detection:

```properties
quarkus.messaging.kafka.serializer-autodetection.enabled=false
```

> **Be careful with auto-generation in cross-team contracts.** It is excellent for prototyping and for internal topics. When the topic is a public contract between microservices, an explicit schema, Avro or JSON Schema with a Schema Registry, prevents a field rename from silently breaking the consumer.

---

## 7. Hands-On Project: Dispatching Orders to Inventory

Let's go to the complete example. When an order is approved, we publish to `orders-dispatch`. A consumer, simulating the inventory service, reads it and reserves stock.

> **Dev Services twice over:** the project uses `quarkus-rest-jackson`, `quarkus-hibernate-orm-panache`, `quarkus-jdbc-postgresql`, and `quarkus-messaging-kafka`. With no configuration at all, Dev Services start **a PostgreSQL and a Kafka** in containers, in dev and in tests.

### Project Structure

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

The payload traveling on the topic. A `record`, immutable and serialized automatically:

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

Note that **`create()` and `dispatch()` are separate**, and that `send()` sits outside `@Transactional`. That is deliberate, and it deserves a warning.

> **The dual write problem.** It is tempting to call `emitter.send()` inside the `@Transactional` method, right after `persist()`. The risk: `send()` is asynchronous and does not participate in the JTA transaction. The message may reach Kafka **before** the commit, and if the transaction rolls back you have published an order that does not exist in the database. The inverse also happens: a successful commit and a failed publish, and inventory is never told.
>
> For internal, tolerant topics, separating the calls and logging the failure is acceptable. When consistency genuinely matters, the pattern is the **Outbox**: write the event to a table in the same transaction and let a separate process publish it. Quarkus also offers `KafkaTransactions` for exactly-once writes across topics, and lets you chain a Kafka transaction with a Hibernate Reactive transaction, but neither is a trivial substitute for the Outbox in the blocking relational database case.

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

In a real system this consumer would live in **another project**. Keeping it here lets you see both sides in a single `quarkus:dev`. And thanks to the Dev Services `shared=true` default, you can start a second Quarkus project on your machine and it will connect to the same broker.

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
# ---- Kafka: producer ----
mp.messaging.outgoing.orders-dispatch.connector=smallrye-kafka
mp.messaging.outgoing.orders-dispatch.topic=orders-dispatch

# ---- Kafka: consumer ----
mp.messaging.incoming.orders-in.connector=smallrye-kafka
mp.messaging.incoming.orders-in.topic=orders-dispatch
mp.messaging.incoming.orders-in.group.id=inventory-service
mp.messaging.incoming.orders-in.auto.offset.reset=earliest

# ---- Dev Services ----
quarkus.kafka.devservices.topic-partitions.orders-dispatch=3

# ---- Production ----
%prod.kafka.bootstrap.servers=kafka.mycompany.svc:9092
```

No serializer, no deserializer, no `docker-compose.yml`. A `POST /orders` produces:

```
Order 1 persisted for customer: Matheus
Order 1 dispatched to Kafka
Reserving stock for order 1 (customer: Matheus, total: $299.90)
```

> **Dev UI:** at `http://localhost:8080/q/dev-ui` the Kafka extension exposes a panel where you browse topics, inspect records, and publish test messages by hand. It is the replacement for `kafka-console-consumer` during development.

---

## 8. Testing

### With the real broker (Dev Services)

The most faithful path: `@QuarkusTest` starts the test Kafka and the flow runs end to end. Since consumption is asynchronous, the test has to **wait**. The same warning from the Event Bus article applies: do not test an asynchronous consumer with an immediate assertion.

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

`await()` comes from Awaitility (`org.awaitility:awaitility`, test scope).

### Without a broker: the in-memory connector

Testing against a real broker is slow and brings flakiness. Since the code only knows **channels**, you can swap the Kafka connector for an in-memory one and test the logic in isolation:

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
        // assertions on the consumer's effect
    }
}
```

The class is `io.smallrye.reactive.messaging.memory.InMemoryConnector`. The `switch...ToInMemory` calls replace the connector before the CDI context starts, and `clear()` reverts. No container involved, tests in milliseconds.

> **The trade-off:** the in-memory connector **does not invoke the Kafka connector at all**. Serialization, partitioning, offsets, and Kafka-specific metadata are not exercised. Use in-memory for business logic and Dev Services for the integration path. The two tests above complement each other, they do not compete.

For more advanced scenarios, such as simulating network failure, inspecting offsets, or writing directly to the topic, there is the **Kafka Companion** (`io.quarkus:quarkus-test-kafka-companion`), which connects to a real broker and offers high-level assertions about production and consumption.

---

## 9. Reliability: Acknowledgment, Commit, and DLQ

A consumer that throws **stops the channel** by default. It is worth knowing the three configuration axes.

**Acknowledgment**, when the message is confirmed:

| Strategy | Behavior |
| :--- | :--- |
| `POST_PROCESSING` (default) | Acks after the method returns without error |
| `PRE_PROCESSING` | Acks before processing (at-most-once) |
| `MANUAL` | You call `msg.ack()`, automatic when receiving `Message<T>` |

```java
@Incoming("orders-in")
@Acknowledgment(Acknowledgment.Strategy.PRE_PROCESSING)
public void consume(OrderDispatched order) { ... }
```

**Commit strategy**, when the offset goes to the broker:

```properties
mp.messaging.incoming.orders-in.commit-strategy=throttled
```

`throttled` is the default and periodically commits the offset of the latest acked message in sequence. The alternatives are `latest` (commits on every ack, safer and slower), `checkpoint` (offsets on a state store, for stateful processing), and `ignore` (delegates to the Kafka client auto-commit).

**Failure strategy**, what to do when it blows up:

```properties
mp.messaging.incoming.orders-in.failure-strategy=dead-letter-queue
mp.messaging.incoming.orders-in.dead-letter-queue.topic=orders-dispatch-dlq
```

The options are `fail` (default, stops the channel), `ignore` (logs and moves on), `dead-letter-queue`, and `delayed-retry-topic`. For retrying in the consumer itself, SmallRye Fault Tolerance works normally:

```java
@Incoming("orders-in")
@Blocking
@Retry(delay = 500, maxRetries = 3)
public void consume(OrderDispatched order) { ... }
```

**Health checks.** Every configured channel, incoming or outgoing, automatically registers three probes: *startup* (verifies communication with the cluster was established), *liveness* (captures unrecoverable failures), and *readiness* (verifies the connector is ready to consume or produce). This is exactly what Kubernetes will consume, and it is the subject of the last article in the series.

```properties
# disables both liveness and readiness for the channel
mp.messaging.incoming.orders-in.health-enabled=false

# disables readiness only
mp.messaging.incoming.orders-in.health-readiness-enabled=false
```

Disabling readiness for a channel is worth it when the pod should not be taken out of service just because a secondary topic is unavailable.

---

## 10. Final Comparison: Spring vs Quarkus

The Spring column reflects Spring Boot 4.1, which ships Spring for Apache Kafka 4.1, and the current Spring Cloud Stream. It is worth checking, because several names in that column changed after the book was written.

| Aspect | Spring (Cloud Stream / Kafka) | Quarkus (SmallRye Reactive Messaging) |
| :--- | :--- | :--- |
| Extension | `spring-cloud-starter-stream-kafka` | `quarkus-messaging-kafka` |
| Consuming | `@KafkaListener(topics=...)` or a `Consumer<T>` bean | `@Incoming("channel")` |
| Producing | `KafkaTemplate` or a `Supplier<T>` bean | `@Outgoing`, `Emitter`, `MutinyEmitter` |
| Abstraction | Binding derived from the function name | Explicitly named channel |
| Function registry | `spring.cloud.function.definition`, optional with a single bean | Does not exist |
| In-memory channel | Manual implementation over `Sinks.Many` | Native, just leave the connector unset |
| Broker in dev | Manual Docker Compose or Testcontainers | Automatic **Dev Services** |
| Topic creation | Script or `NewTopic` bean | `quarkus.kafka.devservices.topic-partitions.*` |
| JSON serde | Configured `JacksonJsonSerializer` and `JacksonJsonDeserializer` | Auto-detection and auto-generation |
| Consumer thread | Container thread (blocking) | Event loop, requires `@Blocking` or `@RunOnVirtualThread` |
| Testing without a broker | `@EmbeddedKafka`, KRaft-only since Spring Kafka 4 | In-memory connector |
| Reactive model | Reactor (`Flux`) | Mutiny (`Multi`, `Uni`) |

The underlying difference: in Spring, the code references the **topic**. In Quarkus, it references a **channel**, and the topic is a configuration detail. That costs one extra concept to learn, and gives back testability and transport portability.

---

## Conclusion

Reactive Messaging closes the messaging arc of the series. The **Event Bus** decouples components inside the process. **Signals** does the same with type safety. **Kafka**, through SmallRye, takes the message outside, with durability, replay, and independent consumers.

What changed most since the book is not the API. `@Incoming` and `@Outgoing` are still the same. What changed is everything around it: Chapter 5 asks for Docker Compose, Zookeeper, and topic creation scripts, and today that is one dependency and zero configuration. Add serde auto-generation and the result is a working example in under 100 lines of Java.

Keep in mind the two things that cause the most incidents: **a blocking consumer without `@Blocking` or `@RunOnVirtualThread`**, and the **dual write** between the transaction and `emitter.send()`. Both pass the tests and show up in production.

In the next article, we change subjects: **native compilation with GraalVM and dockerization**. We will turn this application into a native binary, understand why the build takes so long, how Quarkus solves reflection without manual configuration, and measure how much memory native saves compared to the JAR.

---

## Resources

* [Official Guide: Apache Kafka Reference Guide](https://quarkus.io/guides/kafka)
* [Official Guide: Getting Started with Quarkus Messaging and Apache Kafka](https://quarkus.io/guides/kafka-getting-started)
* [Official Guide: Dev Services for Kafka](https://quarkus.io/guides/kafka-dev-services)
* [Official Guide: Virtual Thread support with Reactive Messaging](https://quarkus.io/guides/messaging-virtual-threads)
* [SmallRye Reactive Messaging: Testing](https://smallrye.io/smallrye-reactive-messaging/latest/concepts/testing/)
* [SmallRye Reactive Messaging: Test Companion for Kafka](https://smallrye.io/smallrye-reactive-messaging/4.2.0/kafka/test-companion/)
* [MicroProfile Reactive Messaging Specification](https://github.com/eclipse/microprofile-reactive-messaging)
* [Spring Cloud Stream: Producing and Consuming Messages](https://docs.spring.io/spring-cloud-stream/reference/spring-cloud-stream/producing-and-consuming-messages.html)
* [Spring Boot: Apache Kafka Support](https://docs.spring.io/spring-boot/reference/messaging/kafka.html)
* [Spring for Apache Kafka: Serialization and Deserialization](https://docs.spring.io/spring-kafka/reference/kafka/serdes.html)
* [Book Examples Repository](https://github.com/quarkus-for-spring-developers/examples)
