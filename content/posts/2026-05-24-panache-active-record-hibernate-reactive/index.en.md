---
title: "The Active Record Pattern and Hibernate Reactive: Entities That Save Themselves in Quarkus"
date: 2026-05-24T10:00:00-03:00
draft: false
tags: ["Quarkus", "Spring", "Java", "Hibernate", "Panache", "JPA", "PostgreSQL", "Active Record", "Hibernate Reactive", "Reactive", "Vert.x", "Uni", "Dev Services", "Quarkus for Spring Developers"]
author: "Matheus Oliveira"
slug: "panache-active-record-hibernate-reactive"
summary: "Entities that save themselves! Refactor your orders application to the Active Record pattern with PanacheEntity, learn when to choose Repository vs. Active Record, and enter the reactive world with Hibernate Reactive and @WithTransaction."
description: "Complete guide to the Active Record pattern and Hibernate Reactive in Quarkus. Compare Repository vs. Active Record, refactor entities to extend PanacheEntity, mock with PanacheMock, and build a reactive Audit Log with Hibernate Reactive, @WithTransaction, and Uni."
cover:
  image: "active-record-reactive-cover.png"
  alt: "SNES 16-bit pixel art beat 'em up scene of a warrior absorbing database crystal power into their body while reactive energy waves radiate outward, neon ACTIVE RECORD sign in the background"
  caption: "The entity becomes the fighter: Active Record and reactive energy, beat 'em up style"
  relative: true
---

*This article is part of the ["Quarkus for Spring Developers"](https://blog.omatheusmesmo.dev/en/tags/quarkus-for-spring-developers/) series.*

In the [previous article]({{< ref "posts/2026-05-10-persistencia-panache-repository-quarkus/index.en.md" >}}), we gave our orders system real persistence using the Repository pattern. The `OrderRepository` class encapsulated all database operations, keeping the entity as a pure data holder. It works, and it is familiar to anyone coming from Spring Data JPA.

But what if the entity could handle its own persistence? No separate repository, no extra class to inject. Just `Order.persist(order)` and you are done. That is the **Active Record pattern**, and it is the default way Quarkus developers write entities with Panache.

In this article, we will refactor our orders application from the Repository pattern to the Active Record pattern, compare both approaches with a clear decision guide, and then take it further: enter **Hibernate Reactive**, where database operations return `Uni<T>` instead of blocking the thread, and an `AuditLog` entity tracks every order change reactively.

---

## Before We Start: Updates Relative to the Book

*Quarkus for Spring Developers* covers both the Repository and Active Record patterns in Chapter 4. Since its publication, several APIs have evolved. If you are following the book alongside this series, note these changes:

| In the Book | In Current Quarkus | What changed |
| :--- | :--- | :--- |
| `PanacheEntityBase` with custom `@Id` | `PanacheEntity` for auto-generated `Long` IDs | `PanacheEntity` extends `PanacheEntityBase` and provides the `id` field automatically. Use `PanacheEntityBase` only for custom ID strategies. |
| `javax.persistence.*` | `jakarta.persistence.*` | Migration to Jakarta EE 9+. The `javax` package is deprecated. |
| `javax.transaction.*` | `jakarta.transaction.*` | Same Jakarta EE 9+ migration. |
| Reactive transactions: `@ReactiveTransactional` | `@WithTransaction` (or `@Transactional`) | The `@ReactiveTransactional` annotation was replaced. Current Quarkus uses `@WithTransaction` for reactive methods returning `Uni`, or `@Transactional` for both blocking and reactive. See the Sessions and Transactions section for details. |
| Reactive testing: custom `TestTransaction` class | `TransactionalUniAsserter` + `@RunOnVertxContext` | Quarkus now provides built-in test utilities for reactive transaction rollback, eliminating the need for a hand-rolled `TestTransaction`. |
| `findByIdOptional()` in reactive Panache | Use `findById(id).map(Optional::ofNullable)` | The `findByIdOptional` method does not exist in Hibernate Reactive Panache. Map the result of `findById` to `Optional` manually. |

Throughout this article, we use the updated versions. If you copy code from the book and run into compilation errors, it is likely due to one of these changes.

---

## 1. Active Record: Entities That Save Themselves

The core idea behind the Active Record pattern is simple: **the entity and its persistence operations live in the same class**. Instead of injecting a repository to call `repository.persist(order)`, you call `order.persist()` directly. Instead of `repository.findById(id)`, you call `Order.findById(id)`.

If you come from Spring, this might feel unusual. Spring Data JPA strictly separates the entity (a POJO with JPA annotations) from the repository (an interface that Spring proxies at runtime). Panache's Active Record pattern merges both into a single class.

| Aspect | Spring Data JPA | Quarkus Panache Active Record |
| :--- | :--- | :--- |
| Entity definition | POJO with `@Entity`, private fields, getters/setters | `@Entity` extends `PanacheEntity`, public fields |
| Persistence operations | In a separate `JpaRepository` interface | Static methods on the entity itself |
| Usage | `repository.save(entity)` | `entity.persist()` or `Entity.persist(entity)` |
| Find by ID | `repository.findById(id)` returns `Optional` | `Entity.findByIdOptional(id)` returns `Optional` |
| Custom queries | Derived from method names or `@Query` | Static methods using `find()`, `list()`, `count()` |
| Mocking in tests | Mockito on the repository interface | `PanacheMock.mock(Entity.class)` |

Why is Active Record so popular in the Quarkus ecosystem? Three reasons:

1. **Less ceremony.** One class per entity instead of two. No interface, no proxy, no injection point.
2. **Discoverability.** Type `Order.` and your IDE shows all operations: `findById`, `listAll`, `count`, `delete`, plus your custom methods. Everything is in one place.
3. **Build-time optimization.** Since there is no runtime proxy, Quarkus performs bytecode enhancement at build time, resulting in faster startup and native GraalVM compatibility from day one.

---

## 2. Refactoring Order to Active Record

Our `Order` and `OrderItem` entities from the [Repository article]({{< ref "posts/2026-05-10-persistencia-panache-repository-quarkus/index.en.md" >}}) were already using public fields. The refactoring to Active Record is straightforward: extend `PanacheEntity` instead of declaring `@Id` manually, and move the repository methods into the entity as static methods.

### OrderItem.java

```java
@Entity
@Table(name = "order_items")
public class OrderItem extends PanacheEntityBase {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    public Long id;

    @JsonIgnore
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "order_id")
    public Order order;

    @Column(name = "product_code", nullable = false)
    public String productCode;

    @Column(nullable = false)
    public int quantity;

    @Column(name = "unit_price", nullable = false)
    public double unitPrice;
}
```

`OrderItem` extends `PanacheEntityBase` instead of `PanacheEntity` because it declares its own `@Id` field. Use `PanacheEntityBase` when you need a custom ID strategy. Use `PanacheEntity` when you are happy with an auto-generated `Long id`.

Note the `@JsonIgnore` on the `order` back-reference field. Without it, Jackson serialization enters an infinite loop: Order serializes its items, each item serializes its order, which serializes its items again. `@JsonIgnore` breaks the cycle at the back-reference, allowing the JSON to render Order with its items, but each item without the parent order.

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

    @OneToMany(mappedBy = "order", cascade = CascadeType.ALL, orphanRemoval = true)
    public List<OrderItem> items = new ArrayList<>();

    @PrePersist
    void onCreate() {
        createdAt = LocalDateTime.now();
    }

    public static Optional<Order> findByCustomerName(String customerName) {
        return find("customerName", customerName).firstResultOptional();
    }

    public static List<Order> findByCustomerNameContaining(String name) {
        return find("customerName like ?1", "%" + name + "%").list();
    }

    public static long countByCustomerName(String customerName) {
        return count("customerName", customerName);
    }

    public static List<Order> findHighValueOrders(String customerName, double minValue) {
        return find("customerName = :name and totalAmount > :minValue",
                Parameters.with("name", customerName)
                        .and("minValue", minValue))
                .list();
    }

    public static List<Order> findRecentOrders(int days) {
        return find("createdAt >= :since",
                Parameters.with("since", LocalDateTime.now().minusDays(days)))
                .list();
    }

    public static List<Order> findByNameLike(String name, int page, int size) {
        return find("customerName like ?1",
                Sort.by("createdAt").descending(),
                "%" + name + "%")
                .page(Page.of(page, size))
                .list();
    }
}
```

Notice what changed compared to the Repository version:

- `Order` now extends `PanacheEntity`, which provides the `id` field automatically. We removed the explicit `@Id` and `@GeneratedValue` declarations.
- All the methods that lived in `OrderRepository` are now **static methods** inside `Order`. Same `find()`, `list()`, `count()` API, but called on the entity class.
- The `@Entity` and `@Table` annotations remain unchanged.
- `Parameters` comes from `io.quarkus.panache.common.Parameters`, same as before.

> **Field access rewrite:** When you write `order.customerName`, Quarkus rewrites it at build time to call the generated getter/setter. This means you get proper encapsulation at runtime, even though the code reads like direct field access. You can still define custom getters/setters when needed, and they will be used transparently.

---

## 3. Entity Lifecycle Without a Repository

In the Repository pattern, the lifecycle was managed through the repository: `repository.persist(order)`, `repository.deleteById(id)`, `repository.isPersistent(order)`. In the Active Record pattern, the entity manages its own lifecycle.

### Persisting

```java
Order order = new Order();
order.customerName = "Matheus";
order.totalAmount = 250.0;
order.persist();
```

After `persist()`, the `order.id` field is populated by the database. There is no return value (unlike Spring's `repository.save()` which returns the entity). You can use `persistAndFlush()` if you need immediate feedback and want to catch `PersistenceException` right away.

### Checking Persistence State

```java
if (order.isPersistent()) {
    order.delete();
}
```

`isPersistent()` returns `true` if the entity is managed by the current persistence context. This is useful to avoid calling `persist()` on an already-managed entity.

### Deleting

```java
Order.deleteById(1L);
order.delete();
```

Both instance method (`entity.delete()`) and static method (`Entity.deleteById(id)`) are available. The instance method only works on a persistent entity.

### Updating

```java
Order order = Order.findById(1L);
order.customerName = "Updated Name";
```

Once an entity is persistent (managed by the persistence context), all field modifications are automatically flushed to the database at transaction commit. No explicit `save()` or `merge()` call is needed. This is a fundamental JPA behavior that Panache preserves.

### Batch Operations

```java
long deleted = Order.delete("status = ?1", "CANCELLED");
int updated = Order.update("totalAmount = ?1 where id = ?2", 300.0, 1L);
```

These static methods perform bulk operations directly in the database, without loading entities into memory.

---

## 4. Refactoring OrderService: No More Repository Injection

With the Active Record pattern, `OrderService` no longer needs `OrderRepository`. All operations are static calls on `Order`.

### OrderService.java

```java
@ApplicationScoped
public class OrderService {

    private static final Logger LOG = Logger.getLogger(OrderService.class);

    @Transactional
    public Order create(OrderDTO dto) {
        LOG.infof("Creating order for customer: %s", dto.customerName);

        Order order = new Order();
        order.customerName = dto.customerName;
        order.totalAmount = dto.totalAmount;

        for (OrderItemDTO itemDTO : dto.items) {
            OrderItem item = new OrderItem();
            item.productCode = itemDTO.productCode;
            item.quantity = itemDTO.quantity;
            item.unitPrice = itemDTO.unitPrice;
            item.order = order;
            order.items.add(item);
        }

        order.persist();
        LOG.infof("Order persisted with ID: %d", order.id);
        return order;
    }

    public List<Order> listAll() {
        return Order.listAll(Sort.by("createdAt").descending());
    }

    public Optional<Order> findById(Long id) {
        return Order.findByIdOptional(id);
    }

    public List<Order> searchByCustomer(String name, int page, int size) {
        return Order.findByNameLike(name, page, size);
    }

    @Transactional
    public boolean delete(Long id) {
        LOG.infof("Deleting order: %d", id);
        return Order.deleteById(id);
    }
}
```

Compare with the Repository version: the `orderRepository` field and constructor are gone. Every `orderRepository.method()` call became `Order.method()`. The `@Transactional` annotation (from `jakarta.transaction`) remains on write methods.

Note that we also added `item.unitPrice = itemDTO.unitPrice`, which was a gap from the previous article: the `OrderItem` entity had a `unitPrice` field, but the `OrderItemDTO` mapping was missing it. Here is the updated DTO:

```java
public class OrderItemDTO {

    @NotBlank(message = "Product code is mandatory")
    public String productCode;

    @Positive(message = "Quantity must be greater than zero")
    public int quantity;

    @Positive(message = "Unit price must be greater than zero")
    public double unitPrice;
}
```

With this addition, the DTO now fully maps to the `OrderItem` entity fields.

### OrderResource.java (unchanged)

The REST resource does not change at all. It still delegates to `OrderService`, which is the correct architectural boundary:

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

    @GET
    @Path("/search")
    public List<Order> search(
            @RestQuery String customer,
            @RestQuery @DefaultValue("0") int page,
            @RestQuery @DefaultValue("10") int size) {
        return service.searchByCustomer(customer, page, size);
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

The fact that `OrderResource` is untouched is important: the Active Record refactoring is an **internal implementation detail**. The REST API contract stays the same.

---

## 5. Testing with PanacheMock

Testing the Active Record pattern requires a different mocking strategy. In the Repository pattern, we used `@InjectMock` on the repository class (a CDI bean). With Active Record, there is no repository to inject. The entity's static methods need mocking, and Mockito cannot mock static methods directly.

Quarkus provides **PanacheMock** for this purpose. Add the test dependency:

```xml
<dependency>
    <groupId>io.quarkus</groupId>
    <artifactId>quarkus-panache-mock</artifactId>
    <scope>test</scope>
</dependency>
```

### Integration Test (unchanged)

The integration test does not change. It still uses REST-assured against the running application, and Dev Services provides the PostgreSQL container:

```java
@QuarkusTest
class OrderResourceTest {

    @Inject
    OrderService service;

    @Test
    void testCreateOrder() {
        OrderDTO dto = new OrderDTO();
        dto.customerName = "Matheus";
        dto.totalAmount = 250.0;

        OrderItemDTO item = new OrderItemDTO();
        item.productCode = "PROD-001";
        item.quantity = 3;
        item.unitPrice = 83.33;
        dto.items = List.of(item);

        given()
                .contentType(ContentType.JSON)
                .body(dto)
                .when().post("/orders")
                .then()
                .statusCode(201)
                .body("id", notNullValue(),
                        "customerName", is("Matheus"),
                        "totalAmount", is(250.0f));
    }

    @Test
    void testListOrders() {
        given()
                .when().get("/orders")
                .then()
                .statusCode(200)
                .body("$", not(empty()));
    }

    @Test
    void testGetOrderNotFound() {
        given()
                .when().get("/orders/9999")
                .then()
                .statusCode(404);
    }
}
```

### Entity Test with @TestTransaction

For testing custom entity methods against the real database, use `@TestTransaction` (same as the Repository pattern):

```java
@QuarkusTest
@TestTransaction
class OrderEntityTest {

    @Test
    void findByCustomerName() {
        Order order = new Order();
        order.customerName = "Matheus";
        order.totalAmount = 150.0;
        order.persist();

        Optional<Order> found = Order.findByCustomerName("Matheus");

        assertTrue(found.isPresent());
        assertEquals("Matheus", found.get().customerName);
        assertNotNull(found.get().id);
    }

    @Test
    void countByCustomerName() {
        Order order = new Order();
        order.customerName = "Ana";
        order.totalAmount = 99.0;
        order.persist();

        long count = Order.countByCustomerName("Ana");

        assertTrue(count > 0);
    }

    @Test
    void findHighValueOrders() {
        Order order = new Order();
        order.customerName = "Carlos";
        order.totalAmount = 500.0;
        order.persist();

        List<Order> results = Order.findHighValueOrders("Carlos", 400.0);

        assertFalse(results.isEmpty());
        assertEquals("Carlos", results.get(0).customerName);
    }
}
```

### Unit Test with PanacheMock

When you need to test a class that consumes entity static methods without touching the database, use `PanacheMock`:

```java
@QuarkusTest
class OrderServiceMockTest {

    @Inject
    OrderService service;

    @Test
    void testDeleteOrder() {
        PanacheMock.mock(Order.class);
        Mockito.when(Order.deleteById(1L)).thenReturn(true);

        boolean deleted = service.delete(1L);

        assertTrue(deleted);
        PanacheMock.verify(Order.class).deleteById(1L);
        PanacheMock.verifyNoMoreInteractions(Order.class);
    }

    @Test
    void testDeleteOrderNotFound() {
        PanacheMock.mock(Order.class);
        Mockito.when(Order.deleteById(999L)).thenReturn(false);

        boolean deleted = service.delete(999L);

        assertFalse(deleted);
    }

    @Test
    void testListAll() {
        PanacheMock.mock(Order.class);
        Order order = new Order();
        order.customerName = "Test";
        Mockito.when(Order.listAll(any(Sort.class)))
                .thenReturn(List.of(order));

        List<Order> result = service.listAll();

        assertEquals(1, result.size());
        assertEquals("Test", result.get(0).customerName);
    }
}
```

> **Mocking `Sort` parameters:** When the service calls `Order.listAll(Sort.by("createdAt").descending())`, the mock must use `any(Sort.class)` instead of `Sort.by("createdAt").descending()`. The reason: `Sort.by()` creates a new object instance every time, so exact object equality never matches. Using `any(Sort.class)` from Mockito avoids this pitfall.

Key differences from the Repository pattern mocking:

| Aspect | Repository Pattern | Active Record Pattern |
| :--- | :--- | :--- |
| Mock setup | `@InjectMock OrderRepository repo` | `PanacheMock.mock(Order.class)` |
| Define behavior | `Mockito.when(repo.count()).thenReturn(23L)` | `Mockito.when(Order.count()).thenReturn(23L)` |
| Verify | `Mockito.verify(repo).count()` | `PanacheMock.verify(Order.class).count()` |
| Reset | Automatic (per test) | `PanacheMock.mock()` at start of each test |

> **Important:** Call `PanacheMock.mock(Order.class)` at the beginning of each test that needs mocking. Without it, the real static methods execute against the database.

---

## 6. When to Use Repository vs. Active Record

Both patterns are fully supported in Quarkus Panache. The choice is architectural, not functional. Here is a decision guide:

| Criterion | Prefer Repository | Prefer Active Record |
| :--- | :--- | :--- |
| **Team background** | Spring developers used to `JpaRepository` | Ruby on Rails, Django, or Quarkus-native teams |
| **Domain complexity** | Complex domains with many custom queries | Simple CRUD with occasional custom queries |
| **Separation of concerns** | You want strict entity/DAO separation | You prefer co-locating state and behavior |
| **Test isolation** | Easy to mock the repository with `@InjectMock` | Requires `PanacheMock` for static methods |
| **Multiple persistence implementations** | Swap repository for a different data source | Entity IS the data access (harder to swap) |
| **Number of classes** | Two classes per entity | One class per entity |
| **Quarkus convention** | Supported, but not the default | Default in documentation and quickstarts |

**Our recommendation:** If you are migrating from Spring Data JPA and your team values the familiar separation, start with the Repository pattern. If you are building a new Quarkus application and want less boilerplate, go with Active Record. You can always refactor later, as we just demonstrated.

One practical concern: if your entity has many custom queries (10+ methods), the class can grow large. In that case, the Repository pattern keeps the entity focused on mapping, and the repository handles the query complexity. For our `Order` entity with a handful of methods, Active Record is a clean fit.

---

## 7. Hibernate Reactive: The End of JDBC Blocking

So far, our application uses **Hibernate ORM** with JDBC drivers. Every database call blocks a thread: when `Order.findById(1L)` executes, the current thread waits for the database to respond before proceeding. In a traditional servlet container, this is expected. Each request gets its own thread.

In a reactive architecture, blocking is a performance pitfall. Quarkus REST (formerly RESTEasy Reactive) runs on the Vert.x event loop, a small pool of threads (typically one per CPU core) that handles all requests concurrently. If a request blocks on JDBC, it holds the event loop thread, preventing other requests from being processed. Under high concurrency, this becomes a bottleneck.

**Hibernate Reactive** solves this by using non-blocking Vert.x database clients instead of JDBC. Database operations return `Uni<T>`, allowing the event loop thread to be released while waiting for the database response.

> **Hibernate Reactive is not a replacement for Hibernate ORM.** It is a different stack for reactive use cases where you need high concurrency. If you do not need high concurrency, or are not accustomed to the reactive paradigm, the official Quarkus documentation recommends using Hibernate ORM. Using Quarkus REST does not require Hibernate Reactive.

### Adding the Extensions

To switch from Hibernate ORM to Hibernate Reactive, replace the blocking dependencies:

```bash
quarkus ext remove hibernate-orm-panache jdbc-postgresql
quarkus ext add hibernate-reactive-panache reactive-pg-client
```

This replaces:
* `io.quarkus:quarkus-hibernate-orm-panache` with `io.quarkus:quarkus-hibernate-reactive-panache`
* `io.quarkus:quarkus-jdbc-postgresql` with `io.quarkus:quarkus-reactive-pg-client`

### Configuration

The Dev Services configuration is identical: Quarkus detects the reactive PostgreSQL client on the classpath and spins up a Docker container automatically. For production:

```properties
quarkus.datasource.db-kind=postgresql
quarkus.datasource.username=${DB_USERNAME}
quarkus.datasource.password=${DB_PASSWORD}
quarkus.datasource.reactive.url=postgresql://${DB_HOST:localhost}:${DB_PORT:5432}/${DB_NAME:orders}
```

Note the URL uses the `postgresql://` scheme for the Vert.x reactive client, not `jdbc:postgresql://` as in JDBC.

---

## 8. Reactive Transactions: @WithTransaction

In the blocking ORM world, `@Transactional` (from `jakarta.transaction`) marks a method as a transaction boundary. In the reactive world, the equivalent is `@WithTransaction` (from `io.quarkus.hibernate.reactive.panache.common.WithTransaction`).

You can also use `@Transactional` with Hibernate Reactive. However, there is an important caveat: **you should not mix `@Transactional` with `@WithTransaction` or `@WithSession` in the same application**. Pick one approach and use it consistently. Mixing these annotations in a single reactive pipeline results in an `UnsupportedOperationException`.

For reactive applications, the recommended approach is:

| Annotation | Package | Use When |
| :--- | :--- | :--- |
| `@WithTransaction` | `io.quarkus.hibernate.reactive.panache.common` | Method returns `Uni`, reactive pipeline |
| `@WithSession` | `io.quarkus.hibernate.reactive.panache.common` | Method needs a reactive session but no transaction (read-only) |
| `@Transactional` | `jakarta.transaction` | Works with both ORM and Reactive, but avoid mixing with `@WithTransaction` |

### Reactive Order.java

The entity class changes its base class from the ORM Panache package to the Reactive Panache package:

```java
import io.quarkus.hibernate.reactive.panache.PanacheEntity;

@Entity
@Table(name = "orders")
public class Order extends PanacheEntity {

    @Column(name = "customer_name", nullable = false)
    public String customerName;

    @Column(name = "total_amount", nullable = false)
    public double totalAmount;

    @Column(nullable = false, updatable = false)
    public LocalDateTime createdAt;

    @OneToMany(mappedBy = "order", cascade = CascadeType.ALL, orphanRemoval = true)
    public List<OrderItem> items = new ArrayList<>();

    @PrePersist
    void onCreate() {
        createdAt = LocalDateTime.now();
    }

    public static Uni<Order> findByCustomerName(String customerName) {
        return find("customerName", customerName).firstResult();
    }

    public static Uni<List<Order>> findByCustomerNameContaining(String name) {
        return list("customerName like ?1", "%" + name + "%");
    }

    public static Uni<Long> countByCustomerName(String customerName) {
        return count("customerName", customerName);
    }

    public static Uni<List<Order>> findByNameLike(String name, int page, int size) {
        return find("customerName like ?1",
                Sort.by("createdAt").descending(),
                "%" + name + "%")
                .page(Page.of(page, size))
                .list();
    }

    public static Uni<List<Order>> listAllWithItems() {
        return find("from Order o left join fetch o.items order by o.createdAt desc").list();
    }

    public static Uni<Order> findByIdWithItems(Long id) {
        return find("from Order o left join fetch o.items where o.id = ?1", id).firstResult();
    }
}
```

The key difference: every method now returns `Uni<T>` instead of `T` directly. `findByNameLike` returns `Uni<List<Order>>` instead of `List<Order>`. `countByCustomerName` returns `Uni<Long>` instead of `long`.

The `@OneToMany` association stays **LAZY** (the default). Instead of changing it to EAGER, we use **JOIN FETCH** queries (`listAllWithItems` and `findByIdWithItems`) to load the items in the same database round trip. Why not EAGER? Because EAGER loading loads items for every query, even when you do not need them (like `countByCustomerName`). JOIN FETCH gives you explicit control: load items only when the use case requires them.

> **The LazyInitializationException in reactive:** In a reactive context, lazy loading outside an active session causes a `LazyInitializationException` when Jackson serializes the entity. The Vert.x event loop has already released the database session by the time serialization happens. `@WithSession` on the service method keeps the session open for the Panache query, but it does NOT extend through Jackson serialization. JOIN FETCH solves this at the query level: items are loaded eagerly within the same query, so no lazy loading occurs during serialization.

### Reactive OrderService.java

```java
@ApplicationScoped
public class OrderService {

    private static final Logger LOG = Logger.getLogger(OrderService.class);

    @WithTransaction
    public Uni<Order> create(OrderDTO dto) {
        LOG.infof("Creating order for customer: %s", dto.customerName);

        Order order = new Order();
        order.customerName = dto.customerName;
        order.totalAmount = dto.totalAmount;

        for (OrderItemDTO itemDTO : dto.items) {
            OrderItem item = new OrderItem();
            item.productCode = itemDTO.productCode;
            item.quantity = itemDTO.quantity;
            item.unitPrice = itemDTO.unitPrice;
            item.order = order;
            order.items.add(item);
        }

        return order.<Order>persist()
                .replaceWith(order);
    }

    @WithSession
    public Uni<List<Order>> listAll() {
        return Order.listAllWithItems();
    }

    @WithSession
    public Uni<Optional<Order>> findById(Long id) {
        return Order.findByIdWithItems(id)
                .map(order -> Optional.ofNullable(order));
    }

    @WithSession
    public Uni<List<Order>> searchByCustomer(String name, int page, int size) {
        return Order.findByNameLike(name, page, size);
    }

    @WithTransaction
    public Uni<Boolean> delete(Long id) {
        LOG.infof("Deleting order: %d", id);
        return Order.deleteById(id);
    }
}
```

Notice the reactive chaining in `create()`: `order.persist()` returns `Uni<Void>`, so we use the generic cast `order.<Order>persist()` followed by `.replaceWith(order)` to return the persisted entity instead. This is the reactive equivalent of the blocking `persist()` followed by `return order`.

Read methods (`listAll`, `findById`, `searchByCustomer`) use `@WithSession` instead of `@WithTransaction`. A session is enough for read-only operations and avoids the overhead of a full transaction. The `listAll()` and `findById()` methods now call `Order.listAllWithItems()` and `Order.findByIdWithItems()` respectively, using the JOIN FETCH queries to avoid `LazyInitializationException`.

> **`findByIdOptional` does not exist in reactive Panache.** In blocking Panache, `findByIdOptional(id)` returns `Optional<T>`. In reactive Panache, use `findById(id).map(Optional::ofNullable)` or a custom query like `findByIdWithItems(id).map(order -> Optional.ofNullable(order))`.

### Reactive OrderResource.java

```java
import org.jboss.resteasy.reactive.RestPath;
import org.jboss.resteasy.reactive.RestQuery;

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
        return service.create(dto)
                .map(created -> Response.status(Response.Status.CREATED)
                        .entity(created).build());
    }

    @GET
    public Uni<List<Order>> list() {
        return service.listAll();
    }

    @GET
    @Path("/{id}")
    public Uni<Order> get(@RestPath Long id) {
        return service.findById(id)
                .map(opt -> opt.orElseThrow(NotFoundException::new));
    }

    @GET
    @Path("/search")
    public Uni<List<Order>> search(
            @RestQuery String customer,
            @RestQuery @DefaultValue("0") int page,
            @RestQuery @DefaultValue("10") int size) {
        return service.searchByCustomer(customer, page, size);
    }

    @DELETE
    @Path("/{id}")
    public Uni<Boolean> delete(@RestPath Long id) {
        return service.delete(id)
                .invoke(deleted -> {
                    if (!deleted) {
                        throw new NotFoundException();
                    }
                });
    }
}
```

Every endpoint now returns `Uni<T>`. Quarkus REST detects the reactive return type and ensures the method runs on the Vert.x event loop. The `@Transactional` and `@Blocking` annotations are not needed here: `@WithTransaction` on the service methods handles the transaction boundary, and returning `Uni` signals to Quarkus REST that this is a non-blocking endpoint.

The `delete` endpoint returns `Uni<Boolean>` (not `Uni<Void>`) because `service.delete()` returns `Uni<Boolean>` and `.invoke()` does not change the return type. The boolean value is discarded by the HTTP layer after the `.invoke()` side effect runs, so the client sees a `204 No Content` on success.

---

## 9. Hands-On: Reactive Audit Log

To put Hibernate Reactive into practice, let's implement an **AuditLog** entity that records every order change. This is the reactive equivalent of a traditional audit trail, but without blocking any threads.

### AuditLog.java

```java
@Entity
@Table(name = "audit_log")
public class AuditLog extends PanacheEntity {

    @Column(name = "entity_type", nullable = false)
    public String entityType;

    @Column(name = "entity_id", nullable = false)
    public Long entityId;

    @Column(name = "action", nullable = false)
    public String action;

    @Column(name = "performed_by", nullable = false)
    public String performedBy;

    @Column(nullable = false, updatable = false)
    public LocalDateTime performedAt;

    @Column(name = "details")
    public String details;

    @PrePersist
    void onPersist() {
        performedAt = LocalDateTime.now();
    }

    public static Uni<List<AuditLog>> findByEntityType(String entityType) {
        return list("entityType", Sort.by("performedAt").descending(), entityType);
    }

    public static Uni<List<AuditLog>> findByEntityId(Long entityId) {
        return list("entityId", Sort.by("performedAt").descending(), entityId);
    }

    public static Uni<Long> countByAction(String action) {
        return count("action", action);
    }
}
```

### Integrating with OrderService

```java
@ApplicationScoped
public class OrderService {

    private static final Logger LOG = Logger.getLogger(OrderService.class);

    @WithTransaction
    public Uni<Order> create(OrderDTO dto) {
        Order order = new Order();
        order.customerName = dto.customerName;
        order.totalAmount = dto.totalAmount;

        for (OrderItemDTO itemDTO : dto.items) {
            OrderItem item = new OrderItem();
            item.productCode = itemDTO.productCode;
            item.quantity = itemDTO.quantity;
            item.unitPrice = itemDTO.unitPrice;
            item.order = order;
            order.items.add(item);
        }

        return order.<Order>persist()
                .call(() -> {
                    AuditLog log = new AuditLog();
                    log.entityType = "Order";
                    log.entityId = order.id;
                    log.action = "CREATE";
                    log.performedBy = "system";
                    log.details = "Customer: " + order.customerName;
                    return log.persist();
                })
                .replaceWith(order);
    }

    @WithTransaction
    public Uni<Boolean> delete(Long id) {
        LOG.infof("Deleting order: %d", id);
        return Order.deleteById(id)
                .call(deleted -> {
                    if (deleted) {
                        AuditLog log = new AuditLog();
                        log.entityType = "Order";
                        log.entityId = id;
                        log.action = "DELETE";
                        log.performedBy = "system";
                        log.details = "Order removed";
                        return log.persist();
                    }
                    return Uni.createFrom().voidItem();
                });
    }

    @WithSession
    public Uni<List<Order>> listAll() {
        return Order.listAllWithItems();
    }

    @WithSession
    public Uni<Optional<Order>> findById(Long id) {
        return Order.findByIdWithItems(id)
                .map(order -> Optional.ofNullable(order));
    }

    @WithSession
    public Uni<List<Order>> searchByCustomer(String name, int page, int size) {
        return Order.findByNameLike(name, page, size);
    }
}
```

The `.call()` operator chains a side effect (persisting the audit log) without altering the main pipeline result. Both the order and the audit log are persisted within the same transaction, ensuring consistency. If the audit log fails, the entire transaction rolls back, including the order creation.

### AuditLogResource.java

```java
@Path("/audit")
public class AuditResource {

    @GET
    @Path("/entity/{type}")
    public Uni<List<AuditLog>> byEntityType(@RestPath String type) {
        return AuditLog.findByEntityType(type);
    }

    @GET
    @Path("/entity-id/{id}")
    public Uni<List<AuditLog>> byEntityId(@RestPath Long id) {
        return AuditLog.findByEntityId(id);
    }

    @GET
    @Path("/count")
    public Uni<Long> countByAction(@RestQuery String action) {
        return AuditLog.countByAction(action);
    }
}
```

### Testing the Reactive Audit Log

Reactive Panache testing requires `@RunOnVertxContext` and `TransactionalUniAsserter`:

```xml
<dependency>
    <groupId>io.quarkus</groupId>
    <artifactId>quarkus-test-hibernate-reactive-panache</artifactId>
    <scope>test</scope>
</dependency>
```

```java
import io.quarkus.test.hibernate.reactive.panache.TransactionalUniAsserter;
import io.quarkus.test.vertx.RunOnVertxContext;

@QuarkusTest
class AuditLogTest {

    @Test
    @RunOnVertxContext
    void testCreateAndAudit(TransactionalUniAsserter asserter) {
        asserter.execute(() -> {
            Order order = new Order();
            order.customerName = "Audit Test";
            order.totalAmount = 100.0;
            return order.<Order>persist()
                    .call(() -> {
                        AuditLog log = new AuditLog();
                        log.entityType = "Order";
                        log.entityId = order.id;
                        log.action = "CREATE";
                        log.performedBy = "system";
                        log.details = "Customer: " + order.customerName;
                        return log.persist();
                    })
                    .replaceWith(order);
        });

        asserter.assertEquals(() -> AuditLog.countByAction("CREATE"), 1L);

        asserter.assertThat(() -> AuditLog.findByEntityType("Order"),
                logs -> assertFalse(logs.isEmpty()));
    }

    @Test
    @RunOnVertxContext
    void testDeleteAndAudit(TransactionalUniAsserter asserter) {
        asserter.execute(() -> {
            Order order = new Order();
            order.customerName = "Delete Test";
            order.totalAmount = 50.0;
            return order.<Order>persist()
                    .call(() -> {
                        AuditLog log = new AuditLog();
                        log.entityType = "Order";
                        log.entityId = order.id;
                        log.action = "DELETE";
                        log.performedBy = "system";
                        log.details = "Order removed";
                        return log.persist();
                    })
                    .call(() -> Order.deleteById(order.id));
        });

        asserter.assertEquals(() -> AuditLog.countByAction("DELETE"), 1L);
    }
}
```

`@RunOnVertxContext` ensures the test runs on the Vert.x event loop. `TransactionalUniAsserter` wraps each assertion in a separate reactive transaction with automatic rollback, keeping the database clean between tests.

> **Important:** The `TransactionalUniAsserter` class is in the `io.quarkus.test.hibernate.reactive.panache` package (not `io.quarkus.test.vertx` as some older guides suggest). `RunOnVertxContext` is in `io.quarkus.test.vertx`.

> **AuditLog entries must be created manually in tests.** When testing `AuditLog` directly (not through `OrderService`), you must persist both the order and the audit log manually in the `asserter.execute()` block. The `OrderService.create()` method chains audit logging via `.call()`, but that chain only runs when you call the service. In a standalone `AuditLogTest`, you replicate the same chain to set up the test data.

### Testing with Reactive PanacheMock

For unit testing the service layer without a database, use `PanacheMock` with `UniAsserter`:

```java
import io.quarkus.panache.mock.PanacheMock;
import io.quarkus.test.vertx.UniAsserter;

@QuarkusTest
class OrderServiceMockTest {

    @Inject
    OrderService service;

    @Test
    @RunOnVertxContext
    void testListAllMock(UniAsserter asserter) {
        PanacheMock.mock(Order.class);
        Order order = new Order();
        order.customerName = "Mock Test";
        Mockito.when(Order.listAllWithItems())
                .thenReturn(Uni.createFrom().item(List.of(order)));

        asserter.assertThat(() -> service.listAll(),
                list -> {
                    assertEquals(1, list.size());
                    assertEquals("Mock Test", list.get(0).customerName);
                });
    }

    @Test
    @RunOnVertxContext
    void testDeleteMock(UniAsserter asserter) {
        PanacheMock.mock(Order.class);
        Mockito.when(Order.deleteById(1L))
                .thenReturn(Uni.createFrom().item(true));

        asserter.assertThat(() -> service.delete(1L),
                deleted -> assertTrue(deleted));
    }
}
```

Note the differences from blocking PanacheMock: mocked methods must return `Uni<...>` (not plain values), and the test uses `UniAsserter` (not `TransactionalUniAsserter`) because mock tests do not need a real database transaction. The mock matches `Order.listAllWithItems()` directly (no `any(Sort.class)` matcher needed) because the service calls this specific static method.

---

## Conclusion

The Active Record pattern in Quarkus Panache is more than a stylistic choice. It reduces boilerplate, centralizes entity operations in one class, and aligns with Quarkus's build-time philosophy. For Spring developers, it challenges the strict entity/repository separation, but the trade-off is clear: less code, one class per entity, and the same powerful `find()` API.

When the application demands high concurrency, Hibernate Reactive replaces JDBC blocking with non-blocking Vert.x clients, and `@WithTransaction` replaces `@Transactional` for reactive transaction boundaries. The same Panache API works in both worlds, but methods return `Uni<T>` instead of `T`.

The Audit Log example demonstrates how reactive entities compose naturally inside a reactive pipeline: order creation and audit logging happen in the same transaction, without blocking any thread.

In the next article, we will explore **internal messaging with the Vert.x Event Bus**, decoupling code beyond dependency injection and firing events like `OrderPaidEvent` without knowing who will listen.

---

## Resources
* [Official Guide: Simplified Hibernate ORM with Panache](https://quarkus.io/guides/hibernate-orm-panache)
* [Official Guide: Simplified Hibernate Reactive with Panache](https://quarkus.io/guides/hibernate-reactive-panache)
* [Official Guide: Using Hibernate Reactive](https://quarkus.io/guides/hibernate-reactive)
* [Official Guide: Datasource - Dev Services](https://quarkus.io/guides/datasource#dev-services-configuration-free-databases)
* [Spring Data JPA Reference](https://spring.io/projects/spring-data-jpa)
* [Spring Data R2DBC Reference](https://spring.io/projects/spring-data-r2dbc)
* [Book Examples Repository](https://github.com/quarkus-for-spring-developers/examples)
