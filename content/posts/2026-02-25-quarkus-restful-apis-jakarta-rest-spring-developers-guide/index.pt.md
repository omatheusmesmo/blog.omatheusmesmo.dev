---
title: "APIs RESTful com Quarkus: Use Jakarta REST e Quarkus REST para Desenvolvedores Spring"
date: 2026-02-25T07:00:00-03:00
draft: false
tags: ["Quarkus", "Spring", "Java", "REST", "JAX-RS", "Quarkus REST", "RESTEasy", "Cloud Native", "Quarkus for Spring Developers"]
author: "Matheus Oliveira"
slug: "quarkus-apis-restful-jakarta-rest-guia-spring-developers"
summary: "Um guia completo para desenvolvedores Spring sobre APIs RESTful no Quarkus. Conheça a especificação Jakarta REST, a implementação Quarkus REST e como construir endpoints de alta performance."
description: "Compare Spring MVC e WebFlux com o Jakarta REST (JAX-RS) do Quarkus. Aprenda a mapear URLs, gerenciar status HTTP, negociar conteúdo e implementar tratamento de exceções de forma nativa e otimizada."
cover:
  image: "restful-apis-jakarta-rest.png"
  alt: "SNES 16-bit pixel art battle screen between a tech-fantasy hero and a 'Legacy Complexity' monster"
  caption: "Dominando as artes do REST em um mundo tech-fantasy de 16 bits"
  relative: true
---

*Este artigo faz parte da série ["Quarkus for Spring Developers"](https://blog.omatheusmesmo.dev/tags/quarkus-for-spring-developers/).*

No mundo das aplicações modernas, a comunicação entre sistemas é predominantemente realizada através de APIs RESTful. Se você vem do universo Spring, está acostumado a construir esses endpoints com o **Spring MVC** ou, mais recentemente, com o **Spring WebFlux**. No Quarkus, o caminho é igualmente direto, mas com nuances e otimizações que o tornam uma escolha poderosa para a era Cloud Native.

Neste artigo, vamos mergulhar na construção de APIs RESTful com Quarkus, explorando o padrão **Jakarta REST (anteriormente JAX-RS)** e sua implementação de alta performance, o **Quarkus REST** (anteriormente chamado de RESTEasy Reactive). Vamos comparar as abordagens com o Spring, focando em como mapear URLs, negociar conteúdo, gerenciar códigos de status e lidar com exceções de forma eficiente, além de cobrir a importância dos testes.

## Mãos à obra: Adicionando Suporte a JSON

Se você seguiu o [artigo anterior]({{< ref "posts/2026-02-14-mastering-dependency-injection-configuration-quarkus/index.pt.md" >}}), seu projeto já conta com a extensão `quarkus-rest`. Agora, para que possamos enviar e receber dados no formato JSON, precisamos adicionar a extensão que integra o motor REST com o Jackson.

**Via Quarkus CLI:**
```bash
quarkus ext add io.quarkus:quarkus-rest-jackson rest-assured
```

Esta extensão é fundamental: ela fornece os componentes necessários para que o Quarkus saiba como transformar seus objetos Java (como a nossa classe `Order`) em JSON e vice-versa automaticamente.

> **Dica de Performance:** Para executáveis nativos, habilite a otimização de serialização sem reflexão no `application.properties`:
> `quarkus.rest.jackson.optimization.enable-reflection-free-serializers=true`

---

## Spring MVC vs. Jakarta REST (Quarkus REST)

Ambos os frameworks oferecem suporte robusto para construir aplicações RESTful. Conceitualmente, a abordagem é similar: você cria classes com métodos que representam recursos, declarando parâmetros de entrada e saída.

### Jakarta REST (JAX-RS) e Quarkus REST
O Quarkus utiliza o **Jakarta REST** para definir seus endpoints. Diferente do JAX-RS tradicional rodando em containers de servlet, no Quarkus:
*   **Sem Classe `Application`:** Não há necessidade de definir uma classe `Application`. O Quarkus a cria automaticamente.
*   **CDI por Padrão:** Todos os recursos são tratados como beans CDI escopados como `Singleton` por padrão.

### Runtime Subjacente: Vert.x e Flexibilidade Reativa
Uma diferença fundamental reside na escolha do runtime. Enquanto o Spring MVC historicamente se baseou na Especificação Servlet síncrona, o Quarkus utiliza o motor reativo de *event-loop* do **Eclipse Vert.x** como padrão.

O **Quarkus REST** processa requisições diretamente na thread de I/O para throughput máximo (similar ao Spring WebFlux). Para métodos que realizam trabalho bloqueante, basta usar a anotação `@Blocking`. Isso sinaliza ao Quarkus para mover a execução para um pool de threads de *worker*, liberando a thread de I/O para outras requisições.

> **Fato de Performance:** De acordo com Georgios Andrianakis em ["Massive performance without headaches"](https://quarkus.io/blog/resteasy-reactive-faq/), um endpoint `Quarkus REST` usando `@Blocking` ainda atinge um throughput **50% superior** ao modelo `RESTEasy Classic` (baseado em servlets), devido à integração profunda com o Vert.x e otimizações de tempo de build.

### Bibliotecas Reativas: Mutiny vs. Project Reactor
Desenvolvedores Spring WebFlux conhecem o `Mono` e o `Flux`. No Quarkus, usamos o **SmallRye Mutiny**, focado em eventos:
*   **Uni:** Equivale ao `Mono` (um único resultado assíncrono ou falha).
*   **Multi:** Equivale ao `Flux` (fluxo de múltiplos itens com suporte a backpressure).

---

## Anatomia dos Endpoints: Estrutura e Parâmetros

A construção de endpoints no Quarkus segue o padrão Jakarta REST, separando as responsabilidades de roteamento, método e conteúdo.

### Como mapear URLs e caminhos?

| Funcionalidade | Quarkus (Jakarta REST) | Spring Equivalent | Localização | Descrição |
| :--- | :--- | :--- | :--- | :--- |
| Caminho Base | `@Path("/orders")` | `@RequestMapping` | Classe | Prefixo para todos os caminhos da classe. |
| Sub-caminho | `@Path("/{id}")` | Atributo `path` de `@GetMapping` | Método | Caminho específico do endpoint. |
| Verbo GET | `@GET` | `@GetMapping` | Método | Mapeia requisições HTTP GET. |
| Verbo POST | `@POST` | `@PostMapping` | Método | Mapeia requisições HTTP POST. |
| Produz | `@Produces` | Atributo `produces` | Classe/Método | Define o formato de saída (Default: JSON). |
| Consome | `@Consumes` | Atributo `consumes` | Classe/Método | Define o formato de entrada (Default: JSON). |

### Injeção de Parâmetros

O Quarkus REST introduziu anotações concisas que facilitam a leitura:

| Descrição | Quarkus (Jakarta REST) | Spring Equivalent |
| :--- | :--- | :--- |
| Variável no Path | `@RestPath` | `@PathVariable` |
| Parâmetro de Query | `@RestQuery` | `@RequestParam` |
| Valor de Header | `@RestHeader` | `@RequestHeader` |
| Valor de Cookie | `@RestCookie` | `@CookieValue` |
| Corpo da Requisição | N/A (Injeção direta) | `@RequestBody` |

### Valores de Retorno Comuns

| Descrição | Quarkus (Jakarta REST) | Spring Equivalent |
| :--- | :--- | :--- |
| Resposta Completa | `Response` | `ResponseEntity<>` |
| Sem Corpo | `void` | `void` (Retorna 204) |
| Valor Único Reativo | `Uni<T>` | `Mono<T>` |
| Stream Reativo | `Multi<T>` | `Flux<T>` |
| Objeto POJO | `T` | `T` (Marshalled para JSON) |

---

## Comparativo de Código: Spring vs. Quarkus

Para quem vem do Spring, a melhor forma de entender o Quarkus é vendo os mesmos comportamentos implementados em ambas as tecnologias.

### 1. Estrutura da Classe Resource/Controller

```java
// SPRING MVC
@RestController
@RequestMapping("/orders")
public class OrderController { }

// QUARKUS (Jakarta REST)
@Path("/orders")
public class OrderResource { }
```

### 2. Listagem de Recursos

```java
// SPRING MVC
@GetMapping
public List<Order> list() {
    return service.getOrders();
}

// QUARKUS
@GET
public List<Order> list() {
    return service.getOrders();
}
```

### 3. Busca por ID com Status 404 (Not Found)

```java
// SPRING MVC
@GetMapping("/{id}")
public ResponseEntity<Order> get(@PathVariable Long id) {
    return service.findById(id)
            .map(ResponseEntity::ok)
            .orElseGet(() -> ResponseEntity.notFound().build());
}

// QUARKUS
@GET
@Path("/{id}")
public Response get(@RestPath Long id) {
    return service.findById(id)
            .map(order -> Response.ok(order).build())
            .orElseGet(() -> Response.status(Status.NOT_FOUND).build());
}
```

### 4. Criação de Recursos (201 Created)

```java
// SPRING MVC
@PostMapping
public ResponseEntity<Order> create(@Valid @RequestBody Order order) {
    Order saved = service.save(order);
    return ResponseEntity.status(HttpStatus.CREATED).body(saved);
}

// QUARKUS
@POST
public Response create(@Valid Order order) {
    Order saved = service.save(order);
    return Response.status(Response.Status.CREATED).entity(saved).build();
}
```

### 5. Server-Sent Events (SSE)

```java
// SPRING WEBFLUX
@GetMapping(path = "/stream", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
public Flux<Order> stream() {
    return service.getOrderStream();
}

// QUARKUS
@GET
@Path("/stream")
@Produces(MediaType.SERVER_SENT_EVENTS)
public Multi<Order> stream() {
    return service.getOrderStream();
}
```

### 6. Tratamento de Exceções

```java
// SPRING (@RestControllerAdvice)
@ExceptionHandler(RuntimeException.class)
public ResponseEntity<ErrorMessage> handle(RuntimeException ex) {
    return ResponseEntity.status(500).body(new ErrorMessage(ex.getMessage()));
}

// QUARKUS (@ServerExceptionMapper)
@ServerExceptionMapper(RuntimeException.class)
public Response mapException(RuntimeException ex) {
    return Response.serverError()
            .header("X-ERROR-TYPE", "BUSINESS_FAILURE")
            .entity(new ErrorMessage(ex.getMessage(), 500))
            .build();
}
```

---

## Funcionalidades Avançadas e "Exclusivas"

### 1. Controle de Cache e Segurança de Campos
Use `@Cache` para gerenciar o header `Cache-Control` e `@SecureField` no seu POJO para omitir campos sensíveis (como `profitMargin`) baseados nas roles do usuário logado.

```java
public class Order {
    public Long id;
    public String customerName;
    @SecureField(rolesAllowed = "ADMIN")
    public double profitMargin;
}
```

### 2. Multipart e Upload de Arquivos
O acesso a arquivos é nativo através da classe `FileUpload` e da anotação `@RestForm`.

---

## A Grande Síntese: O Sistema de Pedidos Completo

Vamos consolidar tudo em uma implementação profissional, expandindo o que começamos no post de Injeção de Dependência.

### Passo 1: Expansão do OrderService
Simularemos a persistência em memória com logs e lógica de erro.

```java
@ApplicationScoped
public class OrderService {

    private static final Logger LOG = Logger.getLogger(OrderService.class);
    private List<Order> orders = new ArrayList<>();

    public Order save(Order order) {
        order.id = (long) (orders.size() + 1);
        orders.add(order);
        LOG.infof("Order saved with ID: %d", order.id);
        return order;
    }

    public List<Order> getOrders() {
        LOG.info("Fetching all orders from memory");
        return orders;
    }

    public Optional<Order> findById(Long id) {
        LOG.infof("Finding order: %d", id);
        return orders.stream().filter(o -> o.id.equals(id)).findFirst();
    }

    public void delete(Long id) {
        LOG.infof("Removing order: %d", id);
        orders.removeIf(o -> o.id.equals(id));
    }

    public void performWorkGeneratingError() {
        LOG.error("Simulating a business error...");
        throw new RuntimeException("Unexpected order processing failure");
    }

    public Multi<Order> getOrderStream() {
        return Multi.createFrom().ticks().every(Duration.ofSeconds(1))
                .onItem().transform(tick -> orders.isEmpty() ? null : orders.get(tick.intValue() % orders.size()))
                .select().where(Objects::nonNull)
                .select().first(orders.size());
    }
}
```

### Passo 2: O OrderResource Definitivo
Esta versão definitiva utiliza logs, Exception Mapping e SSE.

```java
@Path("/orders")
public class OrderResource {

    private static final Logger LOG = Logger.getLogger(OrderResource.class);

    @Inject
    OrderService service;

    @POST
    public Response create(Order order) {
        LOG.info("Creating new order for customer: " + order.customerName);
        Order created = service.save(order);
        return Response.status(Response.Status.CREATED).entity(created).build();
    }

    @GET
    public List<Order> list() {
        return service.getOrders();
    }

    @GET
    @Path("/{id}")
    public Response get(@RestPath Long id) {
        return service.findById(id)
                .map(p -> Response.ok(p).build())
                .orElseGet(() -> Response.status(Status.NOT_FOUND).build());
    }

    @DELETE
    @Path("/{id}")
    public Response delete(@RestPath Long id) {
        service.delete(id);
        return Response.noContent().build();
    }

    @GET
    @Path("/stream")
    @Produces(MediaType.SERVER_SENT_EVENTS)
    public Multi<Order> streamOrders() {
        return service.getOrderStream();
    }

    @GET
    @Path("/error")
    public void generateError() {
        service.performWorkGeneratingError();
    }

    @ServerExceptionMapper(RuntimeException.class)
    public Response mapException(RuntimeException ex) {
        LOG.error("Mapping exception to user-friendly response");
        return Response.serverError()
                .header("X-ERROR-TYPE", "BUSINESS_FAILURE")
                .entity(new ErrorMessage(ex.getMessage(), 500))
                .build();
    }
}
```

---

## Testes de Integração com REST-assured

No Quarkus, injetamos a Service real para preparar o estado do sistema e validamos o fluxo HTTP completo.

```java
@QuarkusTest
class OrderResourceTest {

    @Inject
    OrderService service;

    @Test
    void testCreateOrder() {
        Order order = new Order(null, "Matheus", 150.0);

        given()
            .contentType(ContentType.JSON)
            .body(order)
          .when().post("/orders")
          .then()
             .statusCode(201)
             .body("id", notNullValue(),
                   "customerName", is("Matheus"),
                   "totalAmount", is(150.0f));
    }

    @Test
    void testListOrders() {
        // Garantindo que existe ao menos um dado
        service.save(new Order(null, "Test User", 100.0));

        given()
          .when().get("/orders")
          .then()
             .statusCode(200)
             .body("$.size()", greaterThan(0));
    }

    @Test
    void testGetOrderById() {
        Order saved = service.save(new Order(null, "Detail Test", 200.0));

        given()
          .when().get("/orders/" + saved.id)
          .then()
             .statusCode(200)
             .body("id", is(saved.id.intValue()))
             .body("customerName", is("Detail Test"));
    }

    @Test
    void testGetOrderNotFound() {
        given()
          .when().get("/orders/999")
          .then()
             .statusCode(404);
    }

    @Test
    void testDeleteOrder() {
        Order saved = service.save(new Order(null, "To Delete", 50.0));

        given()
          .when().delete("/orders/" + saved.id)
          .then()
             .statusCode(204);
    }

    @Test
    void testGenerateError() {
        given()
          .when().get("/orders/error")
          .then()
             .statusCode(500)
             .header("X-ERROR-TYPE", is("BUSINESS_FAILURE"))
             .body("message", is("Unexpected order processing failure"));
    }
}
```

## Conclusão

Construir APIs RESTful com Quarkus e Jakarta REST oferece uma experiência de desenvolvimento otimizada para a era Cloud Native. A unificação dos modelos síncronos e assíncronos em um único runtime elimina barreiras e escala sua aplicação de forma eficiente sem a necessidade de aprender frameworks drasticamente diferentes para casos reativos.

No próximo artigo, mergulharemos no **Bean Validation e DTOs**, garantindo que as nossas entradas de dados sejam robustas e bem estruturadas!

---

## Recursos
*   [Jakarta RESTful Web Services Specification](https://jakarta.ee/specifications/restful-ws/)
*   [Guia Oficial: Quarkus REST Reference](https://quarkus.io/guides/rest)
*   [SmallRye Mutiny (Reatividade no Quarkus)](https://smallrye.io/smallrye-mutiny)
