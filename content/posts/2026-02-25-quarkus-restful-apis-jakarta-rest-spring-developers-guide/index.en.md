---
title: "RESTful APIs with Quarkus: Use Jakarta REST and Quarkus REST for Spring Developers"
date: 2026-02-25T07:00:00-03:00
draft: false
tags: ["Quarkus", "Spring", "Java", "REST", "JAX-RS", "Quarkus REST", "RESTEasy", "Cloud Native", "Quarkus for Spring Developers"]
author: "Matheus Oliveira"
slug: "quarkus-restful-apis-jakarta-rest-spring-developers-guide"
summary: "A complete guide for Spring developers on RESTful APIs in Quarkus. Learn about the Jakarta REST specification, the Quarkus REST implementation, and how to build high-performance endpoints."
description: "Compare Spring MVC and WebFlux with Quarkus's Jakarta REST (JAX-RS). Learn how to map URLs, manage HTTP statuses, negotiate content, and implement exception handling in a native and optimized way."
cover:
  image: "restful-apis-jakarta-rest.png"
  alt: "SNES 16-bit pixel art battle screen between a tech-fantasy hero and a 'Legacy Complexity' monster"
  caption: "Mastering the REST arts in a 16-bit tech-fantasy world"
  relative: true
---

*This article is part of the ["Quarkus for Spring Developers"](https://blog.omatheusmesmo.dev/en/tags/quarkus-for-spring-developers/) series.*

In the world of modern applications, communication between systems is predominantly carried out through RESTful APIs. If you come from the Spring universe, you are used to building these endpoints with **Spring MVC** or, more recently, with **Spring WebFlux**. In Quarkus, the path is equally direct, but with nuances and optimizations that make it a powerful choice for the Cloud Native era.

In this article, we will delve into building RESTful APIs with Quarkus, exploring the **Jakarta REST (formerly JAX-RS)** standard and its high-performance implementation, **Quarkus REST** (formerly known as RESTEasy Reactive). We will compare the approaches with Spring, focusing on how to map URLs, negotiate content, manage status codes, and handle exceptions efficiently, in addition to covering the importance of testing.

## Getting Started: Adding JSON Support

If you followed the [previous tutorial]({{< ref "posts/2026-02-14-mastering-dependency-injection-configuration-quarkus/index.en.md" >}}), your project already has the `quarkus-rest` extension (the next-generation reactive engine). Now, to send and receive data in JSON format, we need to add the extension that integrates the REST engine with Jackson.

**Via Quarkus CLI:**
```bash
# Adds JSON support (Jackson) and REST-assured integration for testing
quarkus ext add io.quarkus:quarkus-rest-jackson rest-assured
```

This extension is fundamental: it provides the necessary `MessageBodyReader` and `MessageBodyWriter` so that Quarkus knows how to transform your Java objects (like our `Order` class) into JSON and vice versa automatically.

> **Performance Tip:** For native executables, enable reflection-free serialization optimization in your `application.properties`:
> `quarkus.rest.jackson.optimization.enable-reflection-free-serializers=true`

---

## Spring MVC vs. Jakarta REST (Quarkus REST)

Both frameworks offer robust support for building RESTful applications. Conceptually, the approach is similar: you create classes with methods that represent resources, declaring input and output parameters.

### Jakarta REST (JAX-RS) and Quarkus REST
Quarkus uses **Jakarta REST** to define its endpoints. Unlike traditional JAX-RS running in servlet containers, in Quarkus:
*   **No `Application` Class:** There is no need to define an `Application` class. Quarkus creates it automatically.
*   **CDI by Default:** All resources are treated as CDI beans scoped as `Singleton` by default.

### Underlying Runtime: Vert.x and Reactive Flexibility
A fundamental difference between Quarkus and Spring lies in the choice of the runtime. While Spring MVC has historically relied on the synchronous Servlet Specification, Quarkus uses the **Eclipse Vert.x** reactive event-loop engine as the default.

**Quarkus REST** processes requests directly on the I/O thread for maximum throughput (similar to Spring WebFlux). For methods that perform blocking work, simply use the `@Blocking` annotation. This signals Quarkus to move the execution to a separate worker thread pool, freeing the I/O thread for other requests.

> **Performance Fact:** According to Georgios Andrianakis in ["Massive performance without headaches"](https://quarkus.io/blog/resteasy-reactive-faq/), a `Quarkus REST` endpoint even using `@Blocking` still achieves **50% higher** throughput than the `RESTEasy Classic` model (servlet-based), due to deep integration with Vert.x and build-time optimizations.

### Reactive Libraries: Mutiny vs. Project Reactor
Spring WebFlux developers are familiar with `Mono` and `Flux`. In Quarkus, we use **SmallRye Mutiny**, focused on events:
*   **Uni:** Equivalent to `Mono` (a single asynchronous result or failure).
*   **Multi:** Equivalent to `Flux` (streams of multiple items with backpressure support).

---

## Anatomy of Endpoints: Structure and Parameters

Building endpoints in Quarkus follows the Jakarta REST pattern, clearly separating responsibilities for routing, method, and content.

### How to map URLs and paths?

| Feature | Quarkus (Jakarta REST) | Spring Equivalent | Location | Description |
| :--- | :--- | :--- | :--- | :--- |
| Base Path | `@Path("/orders")` | `@RequestMapping` | Class | Prefix for all paths in the class. |
| Sub-path | `@Path("/{id}")` | Atributo `path` de `@GetMapping` | Method | Specific endpoint path. |
| GET Verb | `@GET` | `@GetMapping` | Method | Maps HTTP GET requests. |
| POST Verb | `@POST` | `@PostMapping` | Method | Maps HTTP POST requests. |
| Produces | `@Produces` | `produces` attribute | Class/Method | Defines output format (Default: JSON). |
| Consumes | `@Consumes` | `consumes` attribute | Class/Method | Defines accepted input format (Default: JSON). |

### Parameter Injection

Quarkus REST introduced concise annotations that make reading easier by inferring the parameter name automatically if it matches the variable name:

| Description | Quarkus (Jakarta REST) | Spring Equivalent |
| :--- | :--- | :--- |
| Path Variable | `@RestPath` | `@PathVariable` |
| Query Parameter | `@RestQuery` | `@RequestParam` |
| Header Value | `@RestHeader` | `@RequestHeader` |
| Cookie Value | `@RestCookie` | `@CookieValue` |
| Request Body | N/A (Direct injection) | `@RequestBody` |

### Common Return Values

| Description | Quarkus (Jakarta REST) | Spring Equivalent |
| :--- | :--- | :--- |
| Full Response | `Response` | `ResponseEntity<>` |
| No Body | `void` | `void` (Returns 204) |
| Reactive Single Value | `Uni<T>` | `Mono<T>` |
| Reactive Stream | `Multi<T>` | `Flux<T>` |
| POJO Object | `T` | `T` (Marshalled to JSON) |

---

## Code Comparison: Spring vs. Quarkus

For those coming from Spring, the best way to understand Quarkus is by seeing the same behaviors implemented in both technologies.

### 1. Resource/Controller Class Structure

```java
// SPRING MVC
@RestController
@RequestMapping("/orders")
public class OrderController { }

// QUARKUS (Jakarta REST)
@Path("/orders")
public class OrderResource { }
```

### 2. Listing Resources

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

### 3. Search by ID with 404 (Not Found) Status

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

### 4. Resource Creation (201 Created)

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

### 6. Exception Handling

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

## Server-Sent Events (SSE)

A common need in modern applications is sending real-time updates from the server to the client (push) without the client having to poll. The W3C standard for this is **Server-Sent Events (SSE)**.

In Quarkus, implementing an SSE endpoint is extremely simple, especially using Mutiny's reactive types:

```java
@GET
@Path("/stream")
@Produces(MediaType.SERVER_SENT_EVENTS) // text/event-stream
public Multi<Order> streamOrders() {
    return service.getOrderStream();
}
```

Unlike Spring MVC, where implementing SSE can be verbose (requiring `SseEmitter` and manual thread management), in Quarkus and Spring WebFlux the approach is declarative. The framework handles keeping the connection open and sending each item from the `Multi` as a formatted event.

---

## Advanced and \"Exclusive\" Features

Beyond the basics, Quarkus offers features that simplify daily life and increase your API's security.

### 1. Cache Control and Field Security
Use `@Cache` to manage the `Cache-Control` header and `@SecureField` in your POJO to omit sensitive fields (like `profitMargin`) based on the logged-in user's roles.

```java
public class Order {
    public Long id;
    public String customerName;
    @SecureField(rolesAllowed = "ADMIN")
    public double profitMargin;
}
```

### 2. Multipart and File Upload
File access is native through the `FileUpload` class and the `@RestForm` annotation.

---

## The Great Synthesis: The Complete Order System

Let's now consolidate everything we've learned into a professional implementation, expanding on what we started in the Dependency Injection post.

### Step 1: OrderService Expansion
We will simulate in-memory persistence with logs and error logic for testing.

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

### Step 2: The Definitive OrderResource
This definitive version uses logs, Exception Mapping, and SSE.

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

## Integration Testing with REST-assured

In Quarkus, we inject the real Service to prepare the system state and validate the complete HTTP flow.

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
        // Ensuring at least one data exists
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

## Conclusion

Building RESTful APIs with Quarkus and Jakarta REST offers an optimized development experience for the Cloud Native era. The unification of synchronous and asynchronous models in a single runtime eliminates barriers and scales your application efficiently without needing to learn drastically different frameworks for reactive cases.

In the next article, we will dive into **Bean Validation and DTOs**, ensuring that our data inputs are robust and well-structured!

---

## Resources
*   [Jakarta RESTful Web Services Specification](https://jakarta.ee/specifications/restful-ws/)
*   [Official Guide: Quarkus REST Reference](https://quarkus.io/guides/rest)
*   [SmallRye Mutiny (Reactivity in Quarkus)](https://smallrye.io/smallrye-mutiny)
