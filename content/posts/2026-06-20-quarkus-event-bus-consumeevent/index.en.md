---
title: "Internal Messaging in Quarkus: Event Bus, ConsumeEvent, and the Publisher-Subscriber Pattern"
date: 2026-06-20T10:00:00-03:00
draft: false
tags: ["Quarkus", "Spring", "Java", "Event Bus", "Messaging", "Vert.x", "CDI Events", "Quarkus for Spring Developers"]
author: "Matheus Oliveira"
slug: "quarkus-event-bus-consumeevent"
summary: "Decouple components with the Vert.x Event Bus. Pub/Sub vs Point-to-Point, asynchronous consumers with @ConsumeEvent, and why Spring has no native equivalent."
description: "Complete guide to internal messaging in Quarkus with the Vert.x Event Bus. Compare CDI Events and Spring's ApplicationEvent, implement Pub/Sub and Request-Reply, and learn how to fire asynchronous events without affecting the main transaction."
cover:
  image: "quarkus-event-bus-cover.png"
  alt: "SNES 16-bit pixel art of a retro dispatch center with a robot operator routing glowing message packets down neon rails toward three distinct receiver nodes, neon EVENT BUS sign overhead"
  caption: "The hub that routes events to decoupled consumers"
  relative: true
---

*This article is part of the ["Quarkus for Spring Developers"](https://blog.omatheusmesmo.dev/en/tags/quarkus-for-spring-developers/) series.*

In the [previous article]({{< ref "posts/2026-05-24-panache-active-record-hibernate-reactive/index.en.md" >}}), we built the Active Record pattern with `PanacheEntity` and took our first steps with Hibernate Reactive. Before that, in the [article on Panache Repository]({{< ref "posts/2026-05-10-persistencia-panache-repository-quarkus/index.en.md" >}}), we saw Quarkus spin up a PostgreSQL on its own via Dev Services. Our orders system already persists real data.

But what happens when saving an order needs to trigger a chain of reactions? Send an email, decrement stock, notify finance. None of that should hold up the response to the customer who just bought something, and none of those components should know about the others. That is the problem of **runtime decoupling**, and Quarkus solves it with a tool that ships out of the box: the **Vert.x Event Bus**.

In this article, we will compare the Event Bus with Spring's `ApplicationEvent`, understand why `@ConsumeEvent` runs outside the publisher's transaction, and build an orders system that fires asynchronous events without blocking anyone.

---

## Before We Start: Updates Relative to the Book

*Quarkus for Spring Developers* covers Event-Driven Services in Chapter 5, including the Event Bus, Reactive Messaging with Kafka, and Knative Events. The book was written against Quarkus 2.1.4, and since then some package names and APIs have changed. The concepts still hold, but copying the code literally produces compilation errors. The table summarizes what changes in the current version (3.36.3):

| In the Book | In Current Quarkus | What changed |
| :--- | :--- | :--- |
| `io.vertx.core.eventbus.EventBus` | `io.vertx.mutiny.core.eventbus.EventBus` | Quarkus injects the Mutiny (reactive) variant of the EventBus. That is the one that reaches your constructor, with methods returning `Uni`. |
| `javax.enterprise.context.ApplicationScoped` | `jakarta.enterprise.context.ApplicationScoped` | Migration to Jakarta EE 9+. The `javax` namespace was retired. |
| `javax.transaction.Transactional` | `jakarta.transaction.Transactional` | Same Jakarta EE 9+ migration. |
| `javax.ws.rs.*` (Path, NotFoundException, etc.) | `jakarta.ws.rs.*` | Jakarta RESTful Web Services 3.0+. |
| `io.quarkus:quarkus-vertx` extension declared by hand | Comes transitively with `quarkus-rest` | `@ConsumeEvent` and `EventBus` still come from the `quarkus-vertx` extension. You rarely need to declare it: any app with `quarkus-rest` already brings it onto the classpath. |
| `@ConsumeEvent` returning a value | `@ConsumeEvent` returning a value, `Uni<T>`, or `CompletionStage<T>` | For asynchronous replies (request-reply), the consumer can return a `Uni<T>` and keep the reactive pipeline end to end. |
| `smallrye-reactive-messaging-kafka` | `quarkus-messaging-kafka` | The Kafka extension was renamed and gained Dev Services, which spin up a broker automatically in dev and test. (Subject of an upcoming article in the series.) |
| Mocking with `@InjectMock` in tests | `@InjectMock` (unchanged) | The mechanism is still the same. What changes, and we will see it in practice, is how you verify a *fire-and-forget* consumer. |

Throughout this article, I use the updated versions. If something from the book does not compile, it is almost always one of these lines.

> **Looking ahead:** the Quarkus project has been developing **Quarkus Signals**, which core contributors point to as the future of in-process messaging and which is set to replace the Event Bus over time. It is too new to fall within the book's scope, so here we build on the Event Bus, the established foundation today. But the topic matters enough for a dedicated article: we will cover Signals in the next post of the series, before moving on to Kafka.

---

## 1. The Problem: Runtime Coupling

Imagine that, when saving an order, you need to:

1. Persist the order in the database
2. Send a confirmation email
3. Notify stock
4. Update a dashboard

In Spring, the first tool that comes to hand is `ApplicationEventPublisher`:

```java
// SPRING
@Service
public class OrderService {
    private final ApplicationEventPublisher publisher;

    OrderService(ApplicationEventPublisher publisher) {
        this.publisher = publisher;
    }

    @Transactional
    public Order create(Order order) {
        Order saved = repository.save(order);
        publisher.publishEvent(new OrderCreatedEvent(saved));
        return saved;
    }
}
```

It works, but there is a detail that catches plenty of people off guard: by default `@EventListener` runs **on the same thread and inside the same transaction** as the publisher. If the listener is slow, the customer waits. If it throws an exception, you may end up taking down the transaction that had already saved the order. To make the listener asynchronous you need `@Async` (and an executor configured), and for anything more serious (guaranteed delivery, queuing, broadcast across services) the path becomes Spring Integration, Spring Cloud Stream, or Kafka. That is a lot of infrastructure for a problem that is often local to the application.

---

## 2. Quarkus Event Bus: The Native Solution

Quarkus is built on top of **Eclipse Vert.x**, and the **Event Bus** comes with it for free. It is an **in-process** message bus: it lives inside your application, it is not an external broker like Kafka. Think of it as an internal channel where CDI beans talk through text addresses, without knowing about each other.

The book describes the three delivery mechanisms in Table 5.1, and they are still identical:

| Mechanism | Description | When to use |
| :--- | :--- | :--- |
| **Point-to-point** | The message goes to a single consumer. If several are registered at the same address, Vert.x picks one in round-robin. | Exclusive processing, no reply |
| **Publish-subscribe** | The message is published to an address and **all** consumers listening there receive it. | Broadcast notifications |
| **Request-reply** | A single consumer receives and **replies** asynchronously. | Queries and validations |

> **The Event Bus is not a Kafka replacement.** The Vert.x Event Bus *can* be distributed across nodes with a cluster manager, and the book mentions this. But in a typical Quarkus application it runs **in-process**, within a single instance. Do not treat it as an automatic channel between microservices: that is what SmallRye Reactive Messaging is for, the topic of an upcoming article in the series. The strength here is decoupling components **within** the same application, with no dependency on external infrastructure.

---

## 3. Consuming Events: @ConsumeEvent

The `@ConsumeEvent` annotation is Quarkus's equivalent of `@EventListener`, with one difference that changes the game: the consumer runs on the Vert.x event loop thread, **not on the thread of whoever published**.

### Spring: @EventListener

```java
// SPRING
@Component
public class OrderEventHandler {

    @EventListener
    public void onOrderCreated(OrderCreatedEvent event) {
        // Same thread and same transaction as the publisher.
        // If it throws, the transaction is affected.
        emailService.send(event.getOrder());
    }
}
```

### Quarkus: @ConsumeEvent

```java
// QUARKUS
@ApplicationScoped
public class NotificationHandler {

    private static final Logger LOG = Logger.getLogger(NotificationHandler.class);

    @ConsumeEvent("order-created")
    public void onOrderCreated(Order order) {
        // Runs on the Vert.x event loop, outside the publisher's transaction.
        LOG.infof("Sending email for order %d to %s", order.id, order.customerName);
    }
}
```

Notice the method returns `void`. That is the *fire-and-forget* contract: the consumer processes and no one waits for a reply. If you return a value (or a `Uni<T>`), it becomes the reply of a request-reply, as we will see below.

### Mind the event loop: @Blocking

This is where the most common Quarkus pitfall lives. Because `@ConsumeEvent` runs on the event loop, **you cannot block in there**. Logging is cheap and fine. But sending a real email, opening a JDBC connection, or calling an external API are *blocking* operations, and blocking the event loop stalls the entire reactor.

The fix is explicit, and the book itself uses it in Listing 5.2: move the consumer to a worker thread with `blocking = true` or `@Blocking`.

```java
@ConsumeEvent(value = "order-created", blocking = true)
public void onOrderCreated(Order order) {
    emailService.send(order); // blocking operation, now on a worker thread
}
```

> **The golden rule:** in this article's example project the handler only logs, so it runs safely on the event loop and skips `@Blocking`. But keep this in mind: real blocking work needs `@Blocking`.

### Side by Side

| Aspect | Spring `@EventListener` | Quarkus `@ConsumeEvent` |
| :--- | :--- | :--- |
| Default thread | Same as the publisher | Vert.x event loop |
| Publisher transaction | Shared (can be affected) | Isolated |
| To make it async | `@Async` + executor | Already async by default |
| Blocking work | No caveat | Requires `@Blocking` or `blocking = true` |
| Request-reply | Not native | Return a value or `Uni<T>` |
| Fire-and-forget | `void` | `void` |

---

## 4. Publishing Events: EventBus

To publish, inject the `EventBus` into your bean's constructor. The Mutiny variant offers four ways to send, and it is worth knowing all of them, because the names changed relative to what many people expect:

```java
// 1. Point-to-point, no reply (one consumer)
eventBus.requestAndForget("order-created", order);

// 2. Publish-subscribe (all consumers)
eventBus.publish("order-created", order);

// 3. Asynchronous request-reply (Uni)
Uni<Order> reply = eventBus.<Order>request("validate-order", order)
        .map(Message::body);

// 4. Blocking request-reply (waits for the reply)
Order reply = eventBus.<Order>requestAndAwait("validate-order", order).body();
```

In our orders system, we want **several** components to react to the same event (email, stock, dashboard) and we do not expect a reply from any of them. The right method is `publish()`:

```java
@ApplicationScoped
public class OrderService {

    private static final Logger LOG = Logger.getLogger(OrderService.class);

    final EventBus eventBus;

    OrderService(EventBus eventBus) {
        this.eventBus = eventBus;
    }

    @Transactional
    public Order create(OrderDTO dto) {
        Order order = new Order();
        order.customerName = dto.customerName;
        order.totalAmount = dto.totalAmount;
        order.persist();
        LOG.infof("Order %d persisted for customer: %s", order.id, order.customerName);

        eventBus.publish("order-created", order);
        LOG.info("Event 'order-created' dispatched asynchronously");

        return order;
    }
}
```

Persistence happens inside the JTA transaction, on the worker thread serving the request. The `publish()` is instantaneous: it merely enqueues the message and returns control. The `NotificationHandler` will be called later, on the event loop, without holding up the HTTP response.

### Request-Reply: when you do need the answer

If, instead of notifying, you need to **ask** (validate a rule before proceeding, for example), use `request()` and treat the reply as a reactive pipeline:

```java
public Uni<Order> createWithValidation(Order order) {
    return eventBus.<ValidationResult>request("validate-order", order)
            .onItem().transformToUni(reply -> {
                ValidationResult result = reply.body();
                return result.valid
                        ? Uni.createFrom().item(order)
                        : Uni.createFrom().failure(new ValidationException(result.message));
            });
}
```

On the other side, the consumer that **returns a value** closes the loop:

```java
@ConsumeEvent("validate-order")
public ValidationResult validate(Order order) {
    return order.totalAmount > 0
            ? ValidationResult.ok()
            : ValidationResult.invalid("Total must be positive");
}
```

---

## 5. Isolation: what happens when the consumer fails?

This is one of the most important questions on the topic, and the answer depends on the pattern used.

In a `publish()` *fire-and-forget* (no reply handler), if the consumer throws an exception it does **not** come back to whoever published. The official documentation is clear: with no reply handler, the exception is rethrown and handed to Vert.x's default exception handler. In practice, the publisher's transaction has already been committed and stays intact, but the event is lost if you do not handle the failure. In a request-reply, however, the failure *is* propagated back to the sender as an `io.vertx.core.eventbus.ReplyException`.

Since the notification event cannot simply vanish, it is worth combining the consumer with **MicroProfile Fault Tolerance**:

```java
@ApplicationScoped
public class NotificationHandler {

    private static final Logger LOG = Logger.getLogger(NotificationHandler.class);

    @ConsumeEvent(value = "order-created", blocking = true)
    @Retry(maxRetries = 3, delay = 1000)
    @Fallback(fallbackMethod = "fallbackNotification")
    public void onOrderCreated(Order order) {
        emailService.send(order); // may fail
    }

    public void fallbackNotification(Order order) {
        LOG.warnf("Failed to send email for order %d, queuing for retry", order.id);
        retryQueue.add(order);
    }
}
```

> **Why `blocking = true` here?** `@Retry` with `delay` and a real email send are blocking operations, so the consumer must be on a worker thread, not the event loop.

---

## 6. Hands-On Project: Orders System with Notification

Let us get to the complete, working example. When an order is saved, we fire an event to a `NotificationHandler`, which logs the email "send".

> **Dev Services in action:** the project uses `quarkus-rest-jackson`, `quarkus-hibernate-orm-panache`, and `quarkus-jdbc-postgresql`. With no datasource configuration, Dev Services spins up a PostgreSQL container automatically in dev and test.

### Project Structure

```
event-bus-demo/
  src/main/java/org/acme/
    Order.java
    OrderDTO.java
    OrderService.java
    NotificationHandler.java
    OrderResource.java
  src/main/resources/
    application.properties
  src/test/java/org/acme/
    OrderResourceTest.java
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

    @Column(nullable = false, updatable = false)
    public LocalDateTime createdAt;

    @PrePersist
    void onCreate() {
        createdAt = LocalDateTime.now();
    }
}
```

### OrderDTO.java

```java
public class OrderDTO {

    @NotBlank(message = "Customer name is mandatory")
    public String customerName;

    @Positive(message = "Total amount must be positive")
    public double totalAmount;
}
```

### OrderService.java

```java
@ApplicationScoped
public class OrderService {

    private static final Logger LOG = Logger.getLogger(OrderService.class);

    final EventBus eventBus;

    OrderService(EventBus eventBus) {
        this.eventBus = eventBus;
    }

    @Transactional
    public Order create(OrderDTO dto) {
        Order order = new Order();
        order.customerName = dto.customerName;
        order.totalAmount = dto.totalAmount;
        order.persist();
        LOG.infof("Order %d persisted for customer: %s", order.id, order.customerName);

        eventBus.publish("order-created", order);
        LOG.info("Event 'order-created' dispatched asynchronously");

        return order;
    }

    public List<Order> listAll() {
        return Order.listAll(Sort.by("createdAt").descending());
    }

    public Optional<Order> findById(Long id) {
        return Order.findByIdOptional(id);
    }

    @Transactional
    public boolean delete(Long id) {
        return Order.deleteById(id);
    }
}
```

`findByIdOptional` is the Panache method that returns `Optional<Order>` instead of throwing, ideal for mapping into an `orElseThrow` in the resource.

### NotificationHandler.java

```java
@ApplicationScoped
public class NotificationHandler {

    private static final Logger LOG = Logger.getLogger(NotificationHandler.class);

    @ConsumeEvent("order-created")
    public void onOrderCreated(Order order) {
        LOG.infof("=== NOTIFICATION SERVICE ===");
        LOG.infof("Sending confirmation email to: %s", order.customerName);
        LOG.infof("Order total: $%.2f", order.totalAmount);
        LOG.infof("Email sent successfully for order %d", order.id);
    }
}
```

Here the handler only logs, a non-blocking operation, so it lives on the event loop without `@Blocking`. If one day this method calls a real SMTP server, remember Section 3: add `@Blocking`.

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
    public Response create(@Valid OrderDTO dto) {
        LOG.info("Creating new order");
        Order created = service.create(dto);
        return Response.status(Response.Status.CREATED).entity(created).build();
    }

    @GET
    public List<Order> list() {
        return service.listAll();
    }

    @GET
    @Path("/{id}")
    public Order get(@RestPath Long id) {
        return service.findById(id)
                .orElseThrow(NotFoundException::new);
    }

    @DELETE
    @Path("/{id}")
    public void delete(@RestPath Long id) {
        if (!service.delete(id)) {
            throw new NotFoundException();
        }
    }
}
```

### Tests: the detail the book does not tell you

The book tests the Event Bus with `@InjectMock` and `Mockito.verify`. It works perfectly **in its example**, because there the endpoint uses request-reply: the REST layer awaits the reply `Uni` before returning the HTTP response, and by the time `verify` runs the consumer has already been called.

Our case is different. We use `publish()`, *fire-and-forget*. The HTTP response comes back **before** the `NotificationHandler` runs on the event loop. If you do a `Mockito.verify(handler)` right after the POST, you are betting on a race: most of the time the consumer has not even been invoked yet, and the test becomes flaky. That is why the project's tests verify the observable behavior of the API, while event delivery shows up in the logs:

```java
@QuarkusTest
class OrderResourceTest {

    @Test
    void testCreateOrder() {
        given()
            .contentType(ContentType.JSON)
            .body("{\"customerName\":\"Matheus\",\"totalAmount\":150.0}")
          .when().post("/orders")
          .then()
             .statusCode(201)
             .body("id", notNullValue(),
                   "customerName", is("Matheus"));
    }

    @Test
    void testListOrders() {
        given().when().get("/orders").then().statusCode(200);
    }

    @Test
    void testGetOrderNotFound() {
        given().when().get("/orders/9999").then().statusCode(404);
    }

    @Test
    void testDeleteOrder() {
        String orderId = given()
            .contentType(ContentType.JSON)
            .body("{\"customerName\":\"To Delete\",\"totalAmount\":50.0}")
          .when().post("/orders")
          .then().statusCode(201)
            .extract().path("id").toString();

        given().when().delete("/orders/" + orderId).then().statusCode(204);
    }
}
```

And if you **do** want to assert that the *fire-and-forget* consumer ran? Do not use `verify` directly: wait for the condition with **Awaitility**, which polls until the event is processed (or the timeout fires):

```java
await().atMost(5, SECONDS).untilAsserted(() ->
    Mockito.verify(notificationHandler).onOrderCreated(any()));
```

Running `./mvnw test`, the four tests pass and the log shows the thread separation that is the heart of all this:

```
INFO  [org.acme.OrderService]        (executor-thread-1)        Order 1 persisted for customer: Matheus
INFO  [org.acme.OrderService]        (executor-thread-1)        Event 'order-created' dispatched asynchronously
INFO  [org.acme.NotificationHandler] (vert.x-eventloop-thread-0) === NOTIFICATION SERVICE ===
INFO  [org.acme.NotificationHandler] (vert.x-eventloop-thread-0) Sending confirmation email to: Matheus
```

The `OrderService` on the `executor-thread`, the `NotificationHandler` on the `vert.x-eventloop-thread`. Real decoupling, on different threads.

---

## 7. Pub/Sub vs Request-Reply: when to use each

The choice of method is not cosmetic, it defines the semantics.

**`publish()` (publish-subscribe):** every consumer at the address receives the message, and you do not wait for a reply. Use it when several components have distinct responsibilities over the same fact and the producer does not need to know what happens next.

```java
@ApplicationScoped
public class EmailNotificationHandler {
    @ConsumeEvent("order-created")
    public void sendEmail(Order order) { /* ... */ }
}

@ApplicationScoped
public class StockUpdateHandler {
    @ConsumeEvent("order-created")
    public void updateStock(Order order) { /* ... */ }
}

@ApplicationScoped
public class DashboardHandler {
    @ConsumeEvent("order-created")
    public void updateDashboard(Order order) { /* ... */ }
}
```

All three listen on `order-created`. A single `publish()` triggers the three.

**`request()` (request-reply):** one consumer receives and replies. Use it when the result matters to continue, like a business-rule validation.

```java
Uni<ValidationResult> result = eventBus.<ValidationResult>request("validate-order", order)
        .map(Message::body);
```

The practical rule: a settled fact others need to know about, use `publish()`. A question whose answer you need, use `request()`.

---

## 8. Objects on the bus: codecs

You may have noticed we are publishing an `Order` instance straight onto the bus. How does that work? For **local** (in-process) delivery, Quarkus automatically registers a generic codec, so passing POJOs between consumers in the same application just works, with no configuration at all. That is what happened in the example: we never registered anything.

There is no magic "enable serialization" flag for this case. What does exist is the **distributed** scenario: if one day you enable a clustered Event Bus, messages cross the network and need to become bytes. Then you register an explicit `io.vertx.core.eventbus.MessageCodec` for your type. For this article's in-process usage, none of that is necessary.

---

## 9. Final Comparison: Spring vs Quarkus

| Feature | Spring | Quarkus |
| :--- | :--- | :--- |
| Mechanism | `ApplicationEventPublisher` | `EventBus` (Vert.x) |
| Listener thread | Same as the publisher | Event loop (or worker, with `@Blocking`) |
| Async by default | No (needs `@Async`) | Yes |
| Consumer annotation | `@EventListener` | `@ConsumeEvent` |
| Fire-and-forget | `void` | `void` |
| Request-reply | Not native | `request()` / return a value |
| Broadcast | Spring Integration | `publish()` |
| Failure affects the publisher | Yes, if synchronous | No, in fire-and-forget |
| External dependency | None | None |

> **A word about *backpressure*:** the term shows up a lot near "reactive", but the Event Bus itself does **not** apply backpressure to the producer. What offers that is Mutiny's `Multi` and SmallRye Reactive Messaging, which implement Reactive Streams. Do not count on automatic flow control just because you are using the bus.

---

## Conclusion

The Quarkus Event Bus solves, with no external infrastructure, a problem that in Spring usually requires `@Async` or Spring Integration: decoupling components within the same application. With `@ConsumeEvent` you get processing outside the publisher's transaction and on another thread, for free. In exchange, you take on two responsibilities: use `@Blocking` when the work is blocking, and handle the loss of *fire-and-forget* events, with Fault Tolerance, for example.

In the next article, we take a step further and explore **Quarkus Signals**, the evolution of in-process messaging that is set to succeed the Event Bus. After that, we will take messaging beyond the application with **SmallRye Reactive Messaging and Apache Kafka**, connecting microservices in a distributed way and, this time, with real backpressure.

---

## Resources
* [Official Guide: Reactive Event Bus](https://quarkus.io/guides/reactive-event-bus)
* [Vert.x Event Bus](https://vertx.io/docs/vertx-core/java/#event_bus)
* [MicroProfile Reactive Messaging](https://quarkus.io/guides/reactive-messaging)
* [SmallRye Mutiny](https://smallrye.io/smallrye-mutiny)
* [Book Examples Repository](https://github.com/quarkus-for-spring-developers/examples)
