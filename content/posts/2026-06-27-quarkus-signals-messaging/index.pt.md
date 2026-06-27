---
title: "Mensageria Interna no Quarkus: Signals, @Receives e o Novo Padrão Publisher-Subscriber"
date: 2026-06-27T10:00:00-03:00
draft: false
tags: ["Quarkus", "Spring", "Java", "Signals", "Messaging", "CDI Events", "Quarkus for Spring Developers"]
author: "Matheus Oliveira"
slug: "quarkus-signals-messaging"
summary: "Desacople componentes com o Quarkus Signals. Type-safe resolution, @Receives, pub/sub vs unicast vs request-reply e por que o Spring não tem nada nativo equivalente."
description: "Guia completo de mensageria interna no Quarkus com Signals. Compare CDI Events e ApplicationEvent do Spring, implemente Pub/Sub e Request-Reply com type-safe resolution, e descubra como disparar eventos assíncronos sem afetar a transação principal."
cover:
  image: "quarkus-signals-cover.png"
  alt: "Pixel art SNES 16-bit de uma central de despacho retrô com um operador robô roteando pacotes de mensagem brilhantes por trilhos de neon até três nós receptores distintos, placa neon SIGNALS ao alto"
  caption: "A central que roteia signals para consumidores desacoplados com type-safe resolution"
  relative: true
---

*Este artigo faz parte da série ["Quarkus for Spring Developers"](https://blog.omatheusmesmo.dev/tags/quarkus-for-spring-developers/).*

No [artigo anterior]({{< ref "posts/2026-06-20-quarkus-event-bus-consumeevent/index.pt.md" >}}), exploramos o Event Bus do Vert.x e vimos como `@ConsumeEvent` resolve o desacoplamento em tempo de execução. Mas o Event Bus tem uma limitação: resolution baseada em strings, sem type-safety. O Quarkus 3.36 trouxe uma evolução natural: o **Quarkus Signals**.

Signals é uma extensão experimental que eleva a mensageria in-process para um novo nível: resolution type-safe inspirada em CDI events, qualifiers para filtering, execution model flexível (blocking, non-blocking, virtual threads) e suporte nativo a pub/sub, unicast e request-reply. Tudo sem dependência de infraestrutura externa.

Neste artigo, vamos construir o mesmo sistema de pedidos do artigo anterior, mas agora com Signals. Ao final, você vai entender por que o Signals representa a direção natural da mensageria in-process no Quarkus, e quando ele faz sentido frente ao Event Bus.

---

## 1. O Problema: Acoplamento em Tempo de Execução

Imagine que, ao salvar um pedido, você precisa:

1. Persistir o pedido no banco
2. Enviar um e-mail de confirmação
3. Notificar o estoque
4. Atualizar um dashboard

No Spring, a primeira ferramenta que vem à mão é o `ApplicationEventPublisher`:

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

Funciona, mas tem um detalhe que pega bastante gente: por padrão o `@EventListener` roda **na mesma thread e dentro da mesma transação** do publisher. Se o listener for lento, o cliente espera. Se ele lançar uma exceção, você pode acabar derrubando a transação que já tinha salvado o pedido. Para tornar o listener assíncrono é preciso `@Async` (e configurar um executor), e para qualquer coisa mais séria (entrega garantida, fila, broadcast entre serviços) o caminho vira Spring Integration, Spring Cloud Stream ou Kafka. É muita infraestrutura para um problema que, muitas vezes, é local à aplicação.

---

## 2. Quarkus Signals: A Solução Nativa

O Quarkus 3.36 introduziu o **Signals**, uma extensão experimental que resolve o problema do desacoplamento com uma abordagem **type-safe**. Enquanto o Event Bus usa strings como endereços, Signals usa o tipo do objeto e qualifiers para determinar quem recebe o quê.

### O que são Signals?

Um signal é um objeto Java (preferencialmente imutável) que é emitido por um componente e entregue a um ou mais receivers. A resolution é inspirada em CDI events, mas com suporte nativo a múltiplos padrões de entrega:

| Padrão | Descrição | Quando usar |
| :--- | :--- | :--- |
| **Publish (Multicast)** | O signal é entregue a **todos** os receivers que correspondem ao tipo e qualifiers | Notificações em broadcast |
| **Send (Unicast)** | O signal vai para um **único** receiver, selecionado por round-robin | Processamento exclusivo, sem resposta |
| **Request (Request-Reply)** | Um único receiver recebe e **responde** de forma assíncrona | Consultas e validações |

### Signals vs Event Bus

| Aspecto | Event Bus | Signals |
| :--- | :--- | :--- |
| Resolution | Strings (endereços) | Type-safe (tipo do objeto) |
| Qualifiers | Não suportado | Suportado (`@Default`, `@Any`, custom) |
| Execution model | Event loop (default) | Blocking (default), flexível |
| Request-reply | `Uni<T>` ou `CompletionStage<T>` | Tipo de retorno nativo |
| Status | Consolidado | Experimental (Quarkus 3.36+) |

> **Sobre o status experimental:** O Signals é novo (maio de 2026), mas já funcional e pronto para uso em produção. A API pode sofrer ajustes menores, mas os conceitos fundamentais estão consolidados. O Event Bus continua funcionando e será suportado por tempo indeterminado.

---

## 3. Instalação

Para adicionar o Quarkus Signals ao seu projeto:

CLI:
```bash
quarkus extension add quarkus-signals
```

Maven:
```bash
./mvnw quarkus:add-extension -Dextensions='quarkus-signals'
```

Ou adicione diretamente ao `pom.xml`:

```xml
<dependency>
    <groupId>io.quarkus</groupId>
    <artifactId>quarkus-signals</artifactId>
</dependency>
```

---

## 4. Criando um Signal Object

Um signal é um objeto Java que carrega os dados entre componentes. Deve ser imutável ou thread-safe, pois pode ser acessado de múltiplas threads.

### Usando Records (Recomendado)

```java
public record OrderCreated(String orderId, String customerName, double totalAmount) {}
```

Records são imutáveis por natureza, ideais para signals.

### Com Qualifiers

Para distinguir entre diferentes tipos de signals do mesmo tipo, use qualifiers:

```java
@Qualifier
@Retention(RUNTIME)
@Target({PARAMETER, FIELD})
public @interface Urgent {
    public static final class Literal extends AnnotationLiteral<Urgent> implements Urgent {
        public static final Literal INSTANCE = new Literal();
        private static final long serialVersionUID = 1L;
    }
}
```

---

## 5. Emitindo Signals

O ponto de entrada para emissão é a interface `Signal<T>`, injetada como bean CDI:

```java
@Inject
Signal<OrderCreated> orderCreatedSignal;
```

### Modos de Emissão

#### Publish (Multicast) - Fire-and-forget

```java
orderCreatedSignal.publish(new OrderCreated("123", "Matheus", 150.0));
```

Entrega o signal a **todos** os receivers que correspondem ao tipo.

#### Send (Unicast) - Round-robin

```java
orderCreatedSignal.send(new OrderCreated("123", "Matheus", 150.0));
```

Entrega o signal a um **único** receiver, selecionado por round-robin.

#### Request (Request-Reply) - Com resposta

```java
// Blocking
String confirmation = orderCreatedSignal.request(
    new OrderCreated("123", "Matheus", 150.0), String.class);

// Reactive
Uni<String> confirmation = orderCreatedSignal.reactive().request(
    new OrderCreated("123", "Matheus", 150.0), String.class);
```

Entrega o signal a um único receiver e aguarda a resposta.

### Adicionando Metadata

```java
orderCreatedSignal
    .withMetadata("traceId", "abc-123")
    .withMetadata("source", "web")
    .publish(new OrderCreated("123", "Matheus", 150.0));
```

### Quando não há Receiver

Se nenhum receiver corresponder ao signal emitido:

- `publish()` e `send()` executam silenciosamente - nenhuma exceção é lançada
- `request()` retorna `null`
- `reactive().publish()`, `reactive().send()` e `reactive().request()` completam com item `null`

Isso é diferente do Event Bus, onde `request()` lançaria uma `ReplyException`.

### Lazy Uni Semantics

O `Uni` retornado por `reactive().publish()`, `reactive().send()` e `reactive().request()` é **lazy**: nenhum signal é emitido até que o `Uni` seja subscrito. Cada subscription triggera uma nova emissão independente:

```java
Uni<Void> uni = orderCreatedSignal.reactive().publish(new OrderCreated("123", "Matheus", 150.0));
// Nenhum signal foi emitido ainda

// Primeira subscription - emite o signal
uni.await().indefinitely();

// Segunda subscription do mesmo Uni - emite o signal novamente
uni.await().indefinitely();
```

### Tratamento de Erros

Para métodos de emissão blocking (`publish()`, `send()` e `request()`):

- Falhas de `publish()` e `send()` são logadas mas **não propagadas** ao chamador
- Para `request()`, a exceção do receiver é lançada diretamente na thread chamadora

Para métodos reativos (`reactive().publish()`, `reactive().send()` e `reactive().request()`):

- A falha é propagada através do `Uni` retornado
- Para `send` e `request` (unicast), a exceção é propagada diretamente
- Para `publish` (multicast), as falhas são envolvidas em `io.smallrye.mutiny.CompositeException`

---

## 6. Recebendo Signals

O anotação `@Receives` marca um método como receiver de signals. É o equivalente ao `@ConsumeEvent` do Event Bus, com uma diferença crucial: **resolution type-safe**.

### Spring: @EventListener

```java
// SPRING
@Component
public class OrderEventHandler {

    @EventListener
    public void onOrderCreated(OrderCreatedEvent event) {
        // Mesma thread e mesma transação do publisher.
        emailService.send(event.getOrder());
    }
}
```

### Quarkus Signals: @Receives

```java
// QUARKUS SIGNALS
@ApplicationScoped
public class NotificationHandler {

    private static final Logger LOG = Logger.getLogger(NotificationHandler.class);

    void onOrderCreated(@Receives OrderCreated order, EmailService emailService) {
        // Roda em thread separada (blocking por default).
        LOG.infof("Sending email for order %s to %s", order.orderId(), order.customerName());
        emailService.send(order);
    }
}
```

Repare nas diferenças:

1. **`@Receives`** em vez de `@ConsumeEvent`
2. **Parâmetros adicionais** são injetados automaticamente (CDI)
3. **Execution model**: blocking por default (diferente do Event Bus que é event loop)
4. **Type-safe**: o tipo do parâmetro determina qual signal receives

### Execution Model

O execution model é determinado pela anotação no método ou classe:

```java
// Blocking (default para void)
void onOrder(@Receives OrderCreated order) { /* worker thread */ }

// Non-blocking
@NonBlocking
void onOrder(@Receives OrderCreated order) { /* event loop */ }

// Virtual Thread
@RunOnVirtualThread
void onOrder(@Receives OrderCreated order) { /* virtual thread */ }
```

> **Regra de ouro:** Se o método retorna `void` ou um tipo não-reactivo, o default é `BLOCKING`. Se retorna `Uni` ou `CompletionStage`, o default é `NON_BLOCKING`.

### Qualifiers

Qualifiers permitem filtering de signals:

```java
// Recebe apenas OrderCreated com @Default qualifier
void onOrder(@Receives OrderCreated order) { /* ... */ }

// Recebe apenas OrderCreated com @Urgent qualifier
void onUrgentOrder(@Receives @Urgent OrderCreated order) { /* ... */ }

// Recebe TODOS os OrderCreated (qualquer qualifier)
void onAnyOrder(@Receives @Any OrderCreated order) { /* ... */ }
```

> **Diferença do CDI:** No CDI, um observer sem qualifier recebe qualquer event do tipo. No Signals, um receiver sem qualifier recebe apenas signals com `@Default`.

### SignalContext

Para acessar metadata, qualifiers e emission type:

```java
void onOrder(@Receives SignalContext<OrderCreated> ctx) {
    OrderCreated order = ctx.signal();
    Map<String, Object> metadata = ctx.metadata();
    Set<Annotation> qualifiers = ctx.qualifiers();
    SignalContext.EmissionType emissionType = ctx.emissionType();
}
```

### Request Context

Cada execução de receiver está associada a um novo CDI request context. Isso significa que beans `@RequestScoped` injetados no receiver method ou usados pelo bean que declara o receiver são únicos para aquela invocação específica:

```java
@ApplicationScoped
public class OrderHandler {

    void onOrder(@Receives OrderCreated order, MyScopedBean bean) {
        // MyScopedBean é @RequestScoped: único para esta invocação
    }
}
```

---

## 7. Comparativo Direto

| Aspecto | Spring `@EventListener` | Quarkus Signals `@Receives` |
| :--- | :--- | :--- |
| Thread padrão | Mesma do publisher | Worker thread (blocking) |
| Transação do publisher | Compartilhada (pode ser afetada) | Isolada |
| Para tornar async | `@Async` + executor | Já é async por padrão |
| Qualifiers | Não | `@Default`, `@Any`, custom |
| Request-reply | Não nativo | Tipo de retorno nativo |
| Fire-and-forget | `void` | `void` |
| Type-safe | Sim | Sim (mais forte que Event Bus) |

---

## 8. Projeto Prático: Sistema de Pedidos com Notificação

Vamos ao exemplo completo e funcional. Ao salvar um pedido, disparamos um signal para múltiplos handlers.

> **Dev Services em ação:** o projeto usa `quarkus-rest-jackson`, `quarkus-hibernate-orm-panache` e `quarkus-jdbc-postgresql`. Sem nenhuma configuração de datasource, os Dev Services sobem um PostgreSQL em container automaticamente em dev e teste.

### Estrutura do Projeto

```
signals-demo/
  src/main/java/org/acme/
    Order.java
    OrderDTO.java
    OrderCreated.java
    OrderService.java
    NotificationHandler.java
    StockHandler.java
    DashboardHandler.java
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

### OrderCreated.java

```java
public record OrderCreated(String orderId, String customerName, double totalAmount) {}
```

### OrderService.java

```java
@ApplicationScoped
public class OrderService {

    private static final Logger LOG = Logger.getLogger(OrderService.class);

    final Signal<OrderCreated> orderCreatedSignal;

    OrderService(Signal<OrderCreated> orderCreatedSignal) {
        this.orderCreatedSignal = orderCreatedSignal;
    }

    @Transactional
    public Order create(OrderDTO dto) {
        Order order = new Order();
        order.customerName = dto.customerName;
        order.totalAmount = dto.totalAmount;
        order.persist();
        LOG.infof("Order %d persisted for customer: %s", order.id, order.customerName);

        orderCreatedSignal.publish(new OrderCreated(
            String.valueOf(order.id), order.customerName, order.totalAmount));
        LOG.info("Signal 'OrderCreated' dispatched asynchronously");

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

Note que usamos `publish()` (multicast) porque queremos que **vários** handlers recebam o signal.

### NotificationHandler.java

```java
@ApplicationScoped
public class NotificationHandler {

    private static final Logger LOG = Logger.getLogger(NotificationHandler.class);

    void onOrderCreated(@Receives OrderCreated order) {
        LOG.infof("Confirmation email sent to %s for order %s (total: $%.2f)",
            order.customerName(), order.orderId(), order.totalAmount());
    }
}
```

### StockHandler.java

```java
@ApplicationScoped
public class StockHandler {

    private static final Logger LOG = Logger.getLogger(StockHandler.class);

    void onOrderCreated(@Receives OrderCreated order) {
        LOG.infof("Inventory reserved for order %s", order.orderId());
    }
}
```

### DashboardHandler.java

```java
@ApplicationScoped
public class DashboardHandler {

    private static final Logger LOG = Logger.getLogger(DashboardHandler.class);

    void onOrderCreated(@Receives OrderCreated order) {
        LOG.infof("Dashboard metrics refreshed for order %s", order.orderId());
    }
}
```

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

---

## 9. Testes

### Testes de Integração

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

### Verificando Receivers Assíncronos

Como usamos `publish()` (fire-and-forget), a resposta HTTP volta antes dos handlers rodarem. Para verificar que os handlers foram chamados, combine `@InjectSpy` (espiona o bean real, que continua executando) com Awaitility:

```java
@InjectSpy
NotificationHandler notificationHandler;

@Test
void testNotificationHandlerCalled() {
    given()
        .contentType(ContentType.JSON)
        .body("{\"customerName\":\"Matheus\",\"totalAmount\":150.0}")
      .when().post("/orders")
      .then().statusCode(201);

    await().atMost(5, SECONDS).untilAsserted(() ->
        Mockito.verify(notificationHandler).onOrderCreated(any()));
}
```

### Testes Unitários com @InjectMock

```java
@QuarkusTest
class OrderServiceTest {

    @InjectMock
    Signal<OrderCreated> orderCreatedSignal;

    @Inject
    OrderService orderService;

    @Test
    void testCreateOrderPublishesSignal() {
        OrderDTO dto = new OrderDTO();
        dto.customerName = "Matheus";
        dto.totalAmount = 150.0;

        orderService.create(dto);

        Mockito.verify(orderCreatedSignal).publish(any(OrderCreated.class));
    }
}
```

Rodando `./mvnw test`, os testes passam e o log mostra a separação de threads:

```
INFO  [org.acme.OrderService]        (executor-thread-1) Order 1 persisted for customer: Matheus
INFO  [org.acme.OrderService]        (executor-thread-1) Signal 'OrderCreated' dispatched asynchronously
INFO  [org.acme.NotificationHandler] (worker-thread-1)   Confirmation email sent to Matheus for order 1 (total: $150.00)
INFO  [org.acme.StockHandler]        (worker-thread-2)   Inventory reserved for order 1
INFO  [org.acme.DashboardHandler]    (worker-thread-3)   Dashboard metrics refreshed for order 1
```

O `OrderService` na `executor-thread`, os handlers em `worker-threads` diferentes. Desacoplamento de verdade, em threads diferentes.

---

## 10. Pipeline Pattern

Signals suporta pipelines multi-stage, onde cada stage processa o signal e encaminha para o próximo:

```java
@Singleton
public class ValidationStage {

    @Inject
    Signal<ValidatedOrder> validatedOrder;

    OrderConfirmed onPlaceOrder(@Receives PlaceOrder order) {
        return validatedOrder.request(
            new ValidatedOrder(order.orderId(), order.total()),
            OrderConfirmed.class);
    }
}

@Singleton
public class ProcessingStage {

    OrderConfirmed onValidatedOrder(@Receives ValidatedOrder order) {
        return new OrderConfirmed(order.orderId(), "processed");
    }
}
```

O pipeline é iniciado por uma única chamada `request()`, e a resposta final se propaga por todas as stages.

---

## 11. Apêndice: Migrando de Event Bus para Signals

Se você já usa Event Bus no Quarkus, aqui está como migrar para Signals:

### Comparativo de APIs

| Event Bus | Signals |
| :--- | :--- |
| `EventBus` | `Signal<T>` |
| `@ConsumeEvent("address")` | `@Receives OrderCreated` |
| String addresses | Type-safe resolution |
| `eventBus.publish("order-created", order)` | `signal.publish(new OrderCreated(...))` |
| `eventBus.request("validate", order)` | `signal.request(new Order(...), ValidationResult.class)` |
| `blocking = true` | Default é blocking |
| `@Blocking` | `@Blocking` (mesmo) |

### Exemplo: Event Bus

```java
// EMITINDO
@Inject
EventBus eventBus;

eventBus.publish("order-created", order);

// RECEBENDO
@ConsumeEvent(value = "order-created", blocking = true)
public void onOrderCreated(Order order) {
    emailService.send(order);
}
```

### Exemplo: Signals

```java
// EMITINDO
@Inject
Signal<OrderCreated> orderCreatedSignal;

orderCreatedSignal.publish(new OrderCreated(
    String.valueOf(order.id), order.customerName, order.totalAmount));

// RECEBENDO
void onOrderCreated(@Receives OrderCreated order) {
    emailService.send(order);
}
```

### Quando Migrar?

- **Novos projetos**: Use Signals desde o início
- **Projetos existentes com Event Bus**: Não há urgência, mas considere migração para type-safety
- **Projetos que precisam de qualifiers**: Signals é a única opção
- **Projetos em Quarkus < 3.36**: Event Bus continua sendo a opção

> **Dica:** Você pode usar ambos no mesmo projeto. O Event Bus continua funcionando perfeitamente.

---

## 12. Configuração

O Quarkus Signals oferece configurações para controle de concorrência em receivers blocking:

### application.properties

```properties
# Limite máximo de receivers blocking executando concorrentemente
# Se não definido, nenhum limite é aplicado
quarkus.signals.receivers.blocking-concurrency-limit=10

# Limite máximo de receivers com virtual thread executando concorrentemente
# Se não definido, nenhum limite é aplicado
quarkus.signals.receivers.virtual-thread-concurrency-limit=20
```

Quando o limite é atingido, as requisições são enfileiradas e executadas à medida que receivers anteriores completam. Isso é útil para controlar a carga em recursos externos (banco de dados, APIs).

---

## 13. Comparação Final: Spring vs Quarkus Signals

| Funcionalidade | Spring | Quarkus Signals |
| :--- | :--- | :--- |
| Mecanismo | `ApplicationEventPublisher` | `Signal<T>` |
| Thread do listener | Mesma do publisher | Worker thread (blocking) |
| Async por padrão | Não (precisa de `@Async`) | Sim |
| Anotação do consumidor | `@EventListener` | `@Receives` |
| Fire-and-forget | `void` | `void` |
| Request-reply | Não nativo | Tipo de retorno nativo |
| Broadcast | Spring Integration | `publish()` |
| Qualifiers | Não | `@Default`, `@Any`, custom |
| Type-safe | Sim | Sim (mais forte que Event Bus) |
| Falha afeta o publisher | Sim, se síncrono | Não, em fire-and-forget |
| Dependência externa | Nenhuma | Nenhuma |
| Status | Consolidado | Experimental |

---

## Conclusão

O Quarkus Signals é a evolução natural do Event Bus para mensageria in-process. Com type-safe resolution, qualifiers para filtering e execution model flexível, ele resolve o mesmo problema do Event Bus de forma mais elegante e segura.

Para quem vem do Spring, Signals oferece o que o `ApplicationEvent` nunca deu: async por padrão, broadcast nativo e request-reply sem infraestrutura externa. E para quem já usa Event Bus, a migração é simples e opcional.

No próximo artigo, levamos a mensageria para fora da aplicação com **SmallRye Reactive Messaging e Apache Kafka**, conectando microsserviços de forma distribuída e com backpressure de verdade.

---

## Recursos
* [Guia Oficial: Quarkus Signals](https://quarkus.io/guides/signals)
* [Quarkus Signals Extension](https://quarkus.io/extensions/io.quarkus/quarkus-signals/)
* [CDI Events Specification](https://jakarta.ee/specifications/cdi/4.1/jakarta-cdi-spec-4.1#events)
* [SmallRye Mutiny](https://smallrye.io/smallrye-mutiny)
* [Repositório de Exemplos do Livro](https://github.com/quarkus-for-spring-developers/examples)
