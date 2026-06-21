---
title: "Mensageria Interna no Quarkus: Event Bus, ConsumeEvent e o Padrão Publisher-Subscriber"
date: 2026-06-20T10:00:00-03:00
draft: false
tags: ["Quarkus", "Spring", "Java", "Event Bus", "Messaging", "Vert.x", "CDI Events", "Quarkus for Spring Developers"]
author: "Matheus Oliveira"
slug: "quarkus-event-bus-consumeevent"
summary: "Desacople componentes com o Event Bus do Vert.x. Pub/Sub vs Ponto-a-Ponto, consumidores assíncronos com @ConsumeEvent e por que o Spring não tem nada nativo equivalente."
description: "Guia completo de mensageria interna no Quarkus com Event Bus do Vert.x. Compare CDI Events e ApplicationEvent do Spring, implemente Pub/Sub e Request-Reply, e descubra como disparar eventos assíncronos sem afetar a transação principal."
cover:
  image: "quarkus-event-bus-cover.png"
  alt: "Pixel art SNES 16-bit de uma central de despacho retrô com um operador robô roteando pacotes de mensagem brilhantes por trilhos de neon até três nós receptores distintos, placa neon EVENT BUS ao alto"
  caption: "A central que roteia eventos para consumidores desacoplados"
  relative: true
---

*Este artigo faz parte da série ["Quarkus for Spring Developers"](https://blog.omatheusmesmo.dev/tags/quarkus-for-spring-developers/).*

No [artigo anterior]({{< ref "posts/2026-05-24-panache-active-record-hibernate-reactive/index.pt.md" >}}), montamos o padrão Active Record com `PanacheEntity` e demos os primeiros passos com Hibernate Reactive. Antes dele, no [artigo sobre Panache Repository]({{< ref "posts/2026-05-10-persistencia-panache-repository-quarkus/index.pt.md" >}}), vimos o Quarkus subir um PostgreSQL sozinho via Dev Services. Nosso sistema de pedidos já persiste dados de verdade.

Mas e quando salvar um pedido precisa disparar uma cadeia de reações? Enviar um e-mail, dar baixa no estoque, avisar o financeiro. Nada disso deveria segurar a resposta do cliente que acabou de comprar, e nenhum desses componentes deveria conhecer os outros. Esse é o problema do **desacoplamento em tempo de execução**, e o Quarkus resolve com uma ferramenta que vem de fábrica: o **Vert.x Event Bus**.

Neste artigo, vamos comparar o Event Bus com o `ApplicationEvent` do Spring, entender por que `@ConsumeEvent` roda fora da transação do publisher, e construir um sistema de pedidos que dispara eventos assíncronos sem bloquear ninguém.

---

## Antes de Começar: Atualizações em Relação ao Livro

O *Quarkus for Spring Developers* cobre Event-Driven Services no Capítulo 5, incluindo Event Bus, Reactive Messaging com Kafka e Knative Events. O livro foi escrito sobre o Quarkus 2.1.4, e desde então alguns nomes de pacotes e APIs mudaram. Os conceitos continuam valendo, mas copiar o código literalmente gera erros de compilação. A tabela resume o que muda na versão atual (3.36.3):

| No Livro | No Quarkus Atual | O que mudou |
| :--- | :--- | :--- |
| `io.vertx.core.eventbus.EventBus` | `io.vertx.mutiny.core.eventbus.EventBus` | O Quarkus injeta a variante Mutiny (reativa) do EventBus. É ela que chega no seu construtor, com métodos que retornam `Uni`. |
| `javax.enterprise.context.ApplicationScoped` | `jakarta.enterprise.context.ApplicationScoped` | Migração para Jakarta EE 9+. O namespace `javax` foi aposentado. |
| `javax.transaction.Transactional` | `jakarta.transaction.Transactional` | Mesma migração para Jakarta EE 9+. |
| `javax.ws.rs.*` (Path, NotFoundException, etc.) | `jakarta.ws.rs.*` | Jakarta RESTful Web Services 3.0+. |
| Extensão `io.quarkus:quarkus-vertx` declarada à mão | Vem transitivamente com `quarkus-rest` | `@ConsumeEvent` e `EventBus` continuam vindo da extensão `quarkus-vertx`. Raramente é preciso declará-la: qualquer app com `quarkus-rest` já a traz no classpath. |
| `@ConsumeEvent` retornando valor | `@ConsumeEvent` retornando valor, `Uni<T>` ou `CompletionStage<T>` | Para respostas assíncronas (request-reply), o consumidor pode devolver um `Uni<T>` e manter o pipeline reativo de ponta a ponta. |
| `smallrye-reactive-messaging-kafka` | `quarkus-messaging-kafka` | A extensão de Kafka foi renomeada e ganhou Dev Services, que sobem um broker automaticamente em dev e teste. (Assunto de um próximo artigo da série.) |
| Mock com `@InjectMock` no teste | `@InjectMock` (inalterado) | O mecanismo continua o mesmo. O que muda, e veremos isso na prática, é como verificar um consumidor *fire-and-forget*. |

Ao longo do artigo, uso as versões atualizadas. Se algo do livro não compilar, quase sempre é uma dessas linhas.

> **Olhando para o futuro:** o projeto Quarkus vem desenvolvendo o **Quarkus Signals**, que contribuidores do core indicam como o futuro da mensageria in-process e que deve substituir o Event Bus com o tempo. É novo demais para entrar no escopo do livro, então construímos aqui sobre o Event Bus, a base consolidada hoje. Mas o tema é importante o bastante para um artigo dedicado: vamos falar de Signals no próximo texto da série, antes de partir para o Kafka.

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

## 2. Quarkus Event Bus: A Solução Nativa

O Quarkus é construído sobre o **Eclipse Vert.x**, e com ele vem o **Event Bus** de graça. É um barramento de mensagens **in-process**: vive dentro da sua aplicação, não é um broker externo como o Kafka. Pense nele como um canal interno por onde beans CDI conversam através de endereços de texto, sem conhecer uns aos outros.

O livro descreve os três mecanismos de entrega na Tabela 5.1, e eles continuam idênticos:

| Mecanismo | Descrição | Quando usar |
| :--- | :--- | :--- |
| **Point-to-point** | A mensagem vai para um único consumidor. Havendo vários no mesmo endereço, o Vert.x escolhe um por round-robin. | Processamento exclusivo, sem resposta |
| **Publish-subscribe** | A mensagem é publicada num endereço e **todos** os consumidores que escutam ali recebem. | Notificações em broadcast |
| **Request-reply** | Um único consumidor recebe e **responde** de forma assíncrona. | Consultas e validações |

> **O Event Bus não substitui o Kafka.** O Event Bus do Vert.x *pode* ser distribuído entre nós com um cluster manager, e o livro menciona isso. Mas, numa aplicação Quarkus comum, ele roda **in-process**, dentro de uma única instância. Não o trate como canal automático entre microsserviços: para isso existe o SmallRye Reactive Messaging, tema de um próximo artigo da série. O ponto forte aqui é desacoplar componentes **dentro** da mesma aplicação, sem nenhuma dependência de infraestrutura externa.

---

## 3. Consumindo Eventos: @ConsumeEvent

A anotação `@ConsumeEvent` é o equivalente do Quarkus ao `@EventListener`, com uma diferença que muda o jogo: o consumidor roda na thread de event loop do Vert.x, **não na thread de quem publicou**.

### Spring: @EventListener

```java
// SPRING
@Component
public class OrderEventHandler {

    @EventListener
    public void onOrderCreated(OrderCreatedEvent event) {
        // Mesma thread e mesma transação do publisher.
        // Se lançar exceção, a transação é afetada.
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
        // Roda na event loop do Vert.x, fora da transação do publisher.
        LOG.infof("Sending email for order %d to %s", order.id, order.customerName);
    }
}
```

Repare que o método retorna `void`. Esse é o contrato de *fire-and-forget*: o consumidor processa e ninguém espera resposta. Se você retornar um valor (ou um `Uni<T>`), ele vira a resposta de um request-reply, como veremos adiante.

### Cuidado com a event loop: @Blocking

Aqui mora a armadilha mais comum do Quarkus. Como o `@ConsumeEvent` roda na event loop, **você não pode bloquear ali dentro**. Logar é barato e tudo bem. Mas mandar um e-mail de verdade, abrir uma conexão JDBC ou chamar uma API externa são operações *bloqueantes*, e bloquear a event loop trava o reactor inteiro.

A solução é explícita, e o próprio livro a usa na Listing 5.2: mova o consumidor para uma worker thread com `blocking = true` ou `@Blocking`.

```java
@ConsumeEvent(value = "order-created", blocking = true)
public void onOrderCreated(Order order) {
    emailService.send(order); // operação bloqueante, agora numa worker thread
}
```

> **A regra de ouro:** no projeto de exemplo deste artigo o handler apenas registra logs, então ele roda com segurança na event loop e dispensa o `@Blocking`. Mas guarde isto: trabalho bloqueante de verdade precisa de `@Blocking`.

### Comparativo Direto

| Aspecto | Spring `@EventListener` | Quarkus `@ConsumeEvent` |
| :--- | :--- | :--- |
| Thread padrão | Mesma do publisher | Event loop do Vert.x |
| Transação do publisher | Compartilhada (pode ser afetada) | Isolada |
| Para tornar async | `@Async` + executor | Já é assíncrono por padrão |
| Trabalho bloqueante | Sem ressalva | Exige `@Blocking` ou `blocking = true` |
| Request-reply | Não nativo | Retornar valor ou `Uni<T>` |
| Fire-and-forget | `void` | `void` |

---

## 4. Publicando Eventos: EventBus

Para publicar, injete o `EventBus` no construtor do seu bean. A variante Mutiny oferece quatro formas de enviar, e vale conhecer todas, porque os nomes mudaram em relação ao que muita gente espera:

```java
// 1. Point-to-point, sem resposta (um consumidor)
eventBus.requestAndForget("order-created", order);

// 2. Publish-subscribe (todos os consumidores)
eventBus.publish("order-created", order);

// 3. Request-reply assíncrono (Uni)
Uni<Order> reply = eventBus.<Order>request("validate-order", order)
        .map(Message::body);

// 4. Request-reply bloqueante (espera a resposta)
Order reply = eventBus.<Order>requestAndAwait("validate-order", order).body();
```

No nosso sistema de pedidos, queremos que **vários** componentes reajam ao mesmo evento (e-mail, estoque, dashboard) e não esperamos resposta de nenhum. O método certo é `publish()`:

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

A persistência acontece dentro da transação JTA, na worker thread que atende a requisição. O `publish()` é instantâneo: ele apenas enfileira a mensagem e devolve o controle. O `NotificationHandler` será chamado depois, na event loop, sem segurar a resposta HTTP.

### Request-Reply: quando você precisa da resposta

Se em vez de avisar você precisa **perguntar** (validar uma regra antes de prosseguir, por exemplo), use `request()` e trate a resposta como um pipeline reativo:

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

Do outro lado, o consumidor que **retorna um valor** fecha o ciclo:

```java
@ConsumeEvent("validate-order")
public ValidationResult validate(Order order) {
    return order.totalAmount > 0
            ? ValidationResult.ok()
            : ValidationResult.invalid("Total deve ser positivo");
}
```

---

## 5. Isolamento: o que acontece quando o consumidor falha?

Essa é uma das perguntas mais importantes do tema, e a resposta depende do padrão usado.

Num `publish()` *fire-and-forget* (sem reply handler), se o consumidor lançar uma exceção ela **não volta** para quem publicou. A documentação oficial é clara: sem reply handler, a exceção é relançada e entregue ao exception handler padrão do Vert.x. Na prática, a transação do publisher já foi commitada e segue intacta, mas o evento se perde se você não tratar a falha. Já num request-reply, a falha *é* propagada de volta ao remetente como uma `io.vertx.core.eventbus.ReplyException`.

Como o evento de notificação não pode simplesmente sumir, vale combinar o consumidor com **MicroProfile Fault Tolerance**:

```java
@ApplicationScoped
public class NotificationHandler {

    private static final Logger LOG = Logger.getLogger(NotificationHandler.class);

    @ConsumeEvent(value = "order-created", blocking = true)
    @Retry(maxRetries = 3, delay = 1000)
    @Fallback(fallbackMethod = "fallbackNotification")
    public void onOrderCreated(Order order) {
        emailService.send(order); // pode falhar
    }

    public void fallbackNotification(Order order) {
        LOG.warnf("Failed to send email for order %d, queuing for retry", order.id);
        retryQueue.add(order);
    }
}
```

> **Por que o `blocking = true` aqui?** `@Retry` com `delay` e um envio de e-mail real são operações bloqueantes, então o consumidor precisa estar numa worker thread, não na event loop.

---

## 6. Projeto Prático: Sistema de Pedidos com Notificação

Vamos ao exemplo completo e funcional. Ao salvar um pedido, disparamos um evento para um `NotificationHandler`, que loga o "envio" do e-mail.

> **Dev Services em ação:** o projeto usa `quarkus-rest-jackson`, `quarkus-hibernate-orm-panache` e `quarkus-jdbc-postgresql`. Sem nenhuma configuração de datasource, os Dev Services sobem um PostgreSQL em container automaticamente em dev e teste.

### Estrutura do Projeto

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

`findByIdOptional` é o método do Panache que devolve `Optional<Order>` em vez de lançar exceção, ideal para mapear num `orElseThrow` no resource.

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

Aqui o handler só loga, operação não bloqueante, então ele vive na event loop sem `@Blocking`. Se um dia esse método chamar um SMTP de verdade, lembre da Seção 3: adicione `@Blocking`.

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

### Testes: o detalhe que o livro não conta

O livro testa o Event Bus com `@InjectMock` e `Mockito.verify`. Funciona muito bem **no exemplo dele**, porque lá o endpoint usa request-reply: o REST aguarda o `Uni` da resposta antes de devolver o HTTP, e quando o `verify` roda o consumidor já foi chamado.

No nosso caso é diferente. Usamos `publish()`, *fire-and-forget*. A resposta HTTP volta **antes** de o `NotificationHandler` rodar na event loop. Se você fizer um `Mockito.verify(handler)` logo depois do POST, está apostando numa corrida: na maioria das vezes o consumidor ainda nem foi invocado, e o teste fica intermitente. Por isso os testes do projeto verificam o comportamento observável da API, e a entrega do evento aparece nos logs:

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

E se você **quiser mesmo** afirmar que o consumidor *fire-and-forget* rodou? Não use `verify` direto: espere pela condição com **Awaitility**, que faz polling até o evento ser processado (ou estourar o timeout):

```java
await().atMost(5, SECONDS).untilAsserted(() ->
    Mockito.verify(notificationHandler).onOrderCreated(any()));
```

Rodando `./mvnw test`, os quatro testes passam e o log mostra a separação de threads que é o coração de tudo isso:

```
INFO  [org.acme.OrderService]        (executor-thread-1)        Order 1 persisted for customer: Matheus
INFO  [org.acme.OrderService]        (executor-thread-1)        Event 'order-created' dispatched asynchronously
INFO  [org.acme.NotificationHandler] (vert.x-eventloop-thread-0) === NOTIFICATION SERVICE ===
INFO  [org.acme.NotificationHandler] (vert.x-eventloop-thread-0) Sending confirmation email to: Matheus
```

O `OrderService` na `executor-thread`, o `NotificationHandler` na `vert.x-eventloop-thread`. Desacoplamento de verdade, em threads diferentes.

---

## 7. Pub/Sub vs Request-Reply: quando usar cada um

A escolha do método não é estética, ela define a semântica.

**`publish()` (publish-subscribe):** todos os consumidores do endereço recebem a mensagem, e você não espera resposta. Use quando vários componentes têm responsabilidades distintas sobre o mesmo fato e o produtor não precisa saber o que aconteceu depois.

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

Os três escutam `order-created`. Um único `publish()` aciona os três.

**`request()` (request-reply):** um consumidor recebe e responde. Use quando o resultado importa para continuar, como uma validação de regra de negócio.

```java
Uni<ValidationResult> result = eventBus.<ValidationResult>request("validate-order", order)
        .map(Message::body);
```

A regra prática: fato consumado que outros precisam saber, use `publish()`. Pergunta cuja resposta você precisa, use `request()`.

---

## 8. Objetos no barramento: codecs

Você deve ter notado que estamos publicando uma instância de `Order` direto no barramento. Como isso funciona? Para entrega **local** (in-process), o Quarkus registra automaticamente um codec genérico, então passar POJOs entre consumidores da mesma aplicação simplesmente funciona, sem configuração nenhuma. Foi o que aconteceu no exemplo: nunca registramos nada.

Não existe uma flag mágica de "habilitar serialização" para esse caso. O que existe é o cenário **distribuído**: se um dia você ativar um Event Bus em cluster, as mensagens cruzam a rede e precisam virar bytes. Aí você registra um `io.vertx.core.eventbus.MessageCodec` explícito para o seu tipo. Para o uso in-process deste artigo, nada disso é necessário.

---

## 9. Comparação Final: Spring vs Quarkus

| Funcionalidade | Spring | Quarkus |
| :--- | :--- | :--- |
| Mecanismo | `ApplicationEventPublisher` | `EventBus` (Vert.x) |
| Thread do listener | Mesma do publisher | Event loop (ou worker, com `@Blocking`) |
| Async por padrão | Não (precisa de `@Async`) | Sim |
| Anotação do consumidor | `@EventListener` | `@ConsumeEvent` |
| Fire-and-forget | `void` | `void` |
| Request-reply | Não nativo | `request()` / retornar valor |
| Broadcast | Spring Integration | `publish()` |
| Falha afeta o publisher | Sim, se síncrono | Não, em fire-and-forget |
| Dependência externa | Nenhuma | Nenhuma |

> **Uma palavra sobre *backpressure*:** o termo aparece muito perto de "reativo", mas o Event Bus em si **não** aplica backpressure ao produtor. Quem oferece isso é o `Multi`, do Mutiny, e o SmallRye Reactive Messaging, que implementam Reactive Streams. Não conte com controle de fluxo automático só por estar usando o barramento.

---

## Conclusão

O Event Bus do Quarkus resolve, sem nenhuma infraestrutura externa, um problema que no Spring costuma exigir `@Async` ou Spring Integration: desacoplar componentes dentro da mesma aplicação. Com `@ConsumeEvent` você ganha processamento fora da transação do publisher e em outra thread, de graça. Em troca, assume duas responsabilidades: usar `@Blocking` quando o trabalho for bloqueante, e tratar a perda de eventos *fire-and-forget*, com Fault Tolerance, por exemplo.

No próximo artigo, damos um passo adiante e exploramos o **Quarkus Signals**, a evolução da mensageria in-process que deve suceder o Event Bus. Depois dele, levamos a mensageria para fora da aplicação com **SmallRye Reactive Messaging e Apache Kafka**, conectando microsserviços de forma distribuída e, aí sim, com backpressure de verdade.

---

## Recursos
* [Guia Oficial: Reactive Event Bus](https://quarkus.io/guides/reactive-event-bus)
* [Vert.x Event Bus](https://vertx.io/docs/vertx-core/java/#event_bus)
* [MicroProfile Reactive Messaging](https://quarkus.io/guides/reactive-messaging)
* [SmallRye Mutiny](https://smallrye.io/smallrye-mutiny)
* [Repositório de Exemplos do Livro](https://github.com/quarkus-for-spring-developers/examples)
