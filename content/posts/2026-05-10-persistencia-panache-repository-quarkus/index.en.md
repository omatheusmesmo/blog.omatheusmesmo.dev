---
title: "Persistence with Panache: From Spring Data JPA to the Repository Pattern in Quarkus"
date: 2026-05-10T10:00:00-03:00
draft: false
tags: ["Quarkus", "Spring", "Java", "Hibernate", "Panache", "JPA", "PostgreSQL", "Dev Services", "Quarkus for Spring Developers"]
author: "Matheus Oliveira"
slug: "persistence-panache-repository-quarkus"
summary: "No more in-memory lists! Evolve your orders application with real persistence using Hibernate ORM with Panache in the Repository pattern. Dev Services, pagination, HQL queries and the transition from Spring Data JPA."
description: "Complete guide to persistence in Quarkus with Panache Repository Pattern. Compare with Spring Data JPA, configure Dev Services with PostgreSQL via Docker, master the find() method, pagination, sorting and custom HQL queries."
cover:
  image: "panache-repository-cover.png"
  alt: "SNES 16-bit pixel art beat 'em up scene of a street fighter shattering an in-memory list enemy while crystal database tables rise from the ground, neon PANACHE sign in the background"
  caption: "Defeating in-memory storage and summoning real persistence, beat 'em up style"
  relative: true
---

*This article is part of the ["Quarkus for Spring Developers"](https://blog.omatheusmesmo.dev/en/tags/quarkus-for-spring-developers/) series.*

Up until now, our orders system lived in memory. The `OrderService` stored data in an `ArrayList`, which served its purpose for learning dependency injection, REST, and validation. But every real application needs to persist data. It is time to give our project a real database.

In this article, we will migrate from in-memory storage to **Hibernate ORM with Panache** in the Repository pattern, configure **Dev Services** to spin up a PostgreSQL automatically in Dev mode, and master Panache's simplified queries, including pagination and custom HQL.

---

## Before We Start: Updates Relative to the Book

*Quarkus for Spring Developers* is an excellent reference, but Quarkus has evolved since its publication. If you are following the book alongside this series, watch out for these changes:

| In the Book | In Current Quarkus | What changed |
| :--- | :--- | :--- |
| `hibernate-orm.database.generation` | `hibernate-orm.schema-management.strategy` | The schema management property was renamed. |
| `javax.persistence.*` and `javax.transaction.*` | `jakarta.persistence.*` and `jakarta.transaction.*` | Migration to Jakarta EE 9+. The `javax` package is deprecated. |
| `PanacheRepositoryBase<Entity, Long>` as default | `PanacheRepository<Entity>` | `PanacheRepository` already assumes `Long` as the ID type. Use `PanacheRepositoryBase` only for non-Long IDs. |

Throughout this article, we use the updated versions. If you copy code from the book and run into compilation errors, it is likely due to one of these changes.

---

## 1. The Transition: Spring Data JPA to Panache Repository

If you come from Spring, you know `JpaRepository` well: an interface that Spring implements via a runtime proxy. Panache follows the same Repository concept, but with a fundamental difference in mechanics.

| Aspect | Spring Data JPA | Quarkus Panache Repository |
| :--- | :--- | :--- |
| Definition | `interface` | Concrete `class` |
| Implementation | Dynamic proxy at runtime | Bytecode generated at build time |
| Bean annotation | `@Repository` (or none) | `@ApplicationScoped` |
| Base | `JpaRepository<Entity, Id>` | `PanacheRepository<Entity>` |
| Persist | `repository.save(entity)` returns the entity | `repository.persist(entity)` returns `void` |
| Find by ID | `repository.findById(id)` returns `Optional` | `repository.findByIdOptional(id)` returns `Optional` |
| Delete | `repository.deleteById(id)` | `repository.deleteById(id)` |
| Derived queries | Method name defines the query | Explicit method with `find()` |

The fact that Panache uses a **concrete class** instead of an interface is not a step backward. It is an optimization: by eliminating the dynamic proxy, Quarkus performs analysis and bytecode generation at build time, resulting in faster startup and native GraalVM support from day one.

---

## 2. Hands On: Configuring the DataSource and Dev Services

### Adding the Extensions

We need Hibernate ORM with Panache and the PostgreSQL driver:

```bash
quarkus ext add hibernate-orm-panache jdbc-postgresql
```

This adds to your `pom.xml`:
* `io.quarkus:quarkus-hibernate-orm-panache` (Panache + Hibernate ORM)
* `io.quarkus:quarkus-jdbc-postgresql` (PostgreSQL JDBC driver)

### Dev Services: Zero-Configuration Database

Here is one of Quarkus's most powerful features. In Spring Boot, you need to install and configure a database manually for development. In Quarkus, **Dev Services** does it automatically.

When you run `./mvnw quarkus:dev`, Quarkus detects the PostgreSQL driver on the classpath and spins up a Docker container with PostgreSQL, automatically configuring the URL, username, and password. When the application shuts down, the container is removed. Zero configuration required.

To customize the container image (for example, to include a pre-existing schema), add to `application.properties`:

```properties
quarkus.datasource.devservices.image-name=quay.io/edeandrea/postgres-13-fruits:latest
```

If you do not specify an image, Quarkus picks a default one based on the driver on the classpath, and the database starts without a schema. For rapid prototyping, this is sufficient.

### Production Configuration

For production environments, credentials should be injected via environment variables. In `application.properties`:

```properties
quarkus.datasource.username=${DB_USERNAME}
quarkus.datasource.password=${DB_PASSWORD}
quarkus.datasource.jdbc.url=jdbc:postgresql://${DB_HOST:localhost}:${DB_PORT:5432}/${DB_NAME:orders}
quarkus.hibernate-orm.schema-management.strategy=validate
```

The `schema-management.strategy` property instructs Hibernate to verify that entities match the existing schema, without creating or altering tables. This is essential in production, where the schema is managed by tools like Flyway or Liquibase. When Dev Services is active in dev and test modes, Quarkus automatically overrides the default to `drop-and-create`, so no extra configuration is needed.

---

## 3. Mapping the Entities: Order and OrderItem

In previous articles, we used a simple `Order` with public fields. Now, we will turn it into a proper JPA entity, keeping the connection with the DTOs we created in the [Bean Validation article]({{< ref "posts/2026-03-18-quarkus-bean-validation-dto/index.en.md" >}}).

### OrderItem.java

```java
@Entity
@Table(name = "order_items")
public class OrderItem {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    public Long id;

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

### Order.java

```java
@Entity
@Table(name = "orders")
public class Order {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    public Long id;

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
}
```

Note that we use public fields and getters/setters are omitted for now. In the Repository pattern, the entity is a POJO with JPA annotations. Quarkus generates accessors at build time when needed.

> **Crucial difference from Spring:** In Spring, Hibernate scans entities at runtime during startup. In Quarkus, this scan happens at build time. This is one of the reasons for Quarkus's ultra-fast startup.

### Naming Strategy: Automatic camelCase to snake_case

If you paid attention to the entities, Java fields use `camelCase` (`customerName`, `totalAmount`, `createdAt`), but by default Hibernate maps the column name exactly as the field is written. To have Hibernate automatically convert to `snake_case` in the database (`customer_name`, `total_amount`, `created_at`), add:

```properties
quarkus.hibernate-orm.physical-naming-strategy=org.hibernate.boot.model.naming.CamelCaseToUnderscoresNamingStrategy
```

With this configuration, Hibernate automatically converts `camelCase` to `snake_case`. In fields with camelCase, we use `@Column(name = "...")` to be explicit, but with this strategy you can remove them if you prefer to rely on automatic conversion.

---

## 4. PanacheRepository: The Successor to JpaRepository

### Creating the Repository

```java
@ApplicationScoped
public class OrderRepository implements PanacheRepository<Order> {

    public Optional<Order> findByCustomerName(String customerName) {
        return find("customerName", customerName).firstResultOptional();
    }

    public List<Order> findByCustomerNameContaining(String name) {
        return find("customerName like ?1", "%" + name + "%").list();
    }

    public long countByCustomerName(String customerName) {
        return count("customerName", customerName);
    }
}
```

The `@ApplicationScoped` annotation turns the repository into a CDI bean, ready to be injected into any other bean. We use `PanacheRepository<Order>` instead of `PanacheRepositoryBase<Order, Long>` because `PanacheRepository` already assumes `Long` as the ID type. Use `PanacheRepositoryBase` only when the ID is not `Long`.

### The Power of the `find()` Method

The `find()` method is the backbone of Panache. It accepts multiple formats:

| Format | Example | Description |
| :--- | :--- | :--- |
| Simple field | `find("customerName", "Matheus")` | Direct equality search |
| HQL with positional param | `find("customerName like ?1", "%Mat%")` | HQL query with `?1` |
| HQL with named param | `find("customerName = :name", Map.of("name", "Matheus"))` | HQL query with `:name` |
| Sorted | `find("customerName", Sort.by("createdAt").descending(), "Matheus")` | With sorting |
| Multiple fields | `find("customerName = ?1 and totalAmount > ?2", "Matheus", 100.0)` | Condition composition |

`find()` returns a `PanacheQuery<T>`, which offers terminal methods:

* `.list()` - returns `List<T>`
* `.firstResult()` - returns `T` (or `null`)
* `.firstResultOptional()` - returns `Optional<T>`
* `.singleResult()` - returns `T` (throws exception if more than one)
* `.stream()` - returns `Stream<T>`
* `.page(Page.ofSize(10))` - starts pagination

---

## 5. Pagination and Sorting: Simple and Direct

Pagination in Panache uses the `Page` class or the `.page()` and `.range()` methods.

### Basic Pagination

```java
@ApplicationScoped
public class OrderRepository implements PanacheRepository<Order> {

    public List<Order> findPaged(int pageIndex, int pageSize) {
        return findAll()
                .page(Page.of(pageIndex, pageSize))
                .list();
    }
}
```

> **Note:** `Page.ofSize(25)` only sets the page size. `Page.of(index, size)` sets both. Use `Page.ofSize()` when you want to set the size once and navigate with `.nextPage()`.

### Pagination with Sorting

```java
public List<Order> findPagedSorted(int pageIndex, int pageSize) {
    return find("customerName like ?1", Sort.by("totalAmount").descending()
            .and("createdAt").descending(), "%Mat%")
            .page(Page.of(pageIndex, pageSize))
            .list();
}
```

### Pagination in the Resource

```java
@GET
@Path("/paged")
public List<Order> listPaged(@RestQuery int page, @RestQuery int size) {
    return orderRepository.findPaged(page, size);
}
```

### Pagination Metadata

To get the total number of pages and records:

```java
PanacheQuery<Order> query = orderRepository.findAll().page(Page.ofSize(10));
long totalPages = query.pageCount();
long totalRecords = query.count();
List<Order> firstPage = query.list();
List<Order> secondPage = query.nextPage().list();
```

Compared to Spring Data JPA, where pagination requires `PageRequest` and returns a `Page<T>` wrapper, Panache is more direct: you operate on the `PanacheQuery` and extract the data you need.

---

## 6. Custom HQL Queries in the Repository

When the derived queries from `find()` are not enough, we write HQL explicitly.

### Queries with Named Parameters

```java
@ApplicationScoped
public class OrderRepository implements PanacheRepository<Order> {

    public List<Order> findHighValueOrders(String customerName, double minValue) {
        return find("customerName = :name and totalAmount > :minValue",
                Parameters.with("name", customerName)
                        .and("minValue", minValue))
                .list();
    }

    public List<Order> findRecentOrders(int days) {
        return find("createdAt >= :since",
                Parameters.with("since", LocalDateTime.now().minusDays(days)))
                .list();
    }

    public long countOrdersAbove(double minValue) {
        return count("totalAmount > ?1", minValue);
    }

    public int deleteByCustomerName(String customerName) {
        return delete("customerName", customerName);
    }

    public List<Order> findByNameLike(String name, int page, int size) {
        return find("customerName like ?1", Sort.by("createdAt").descending(),
                "%" + name + "%")
                .page(Page.of(page, size))
                .list();
    }
}
```

The `Parameters` class (from `io.quarkus.panache.common`) is the idiomatic way to construct named parameters in Panache, replacing `Map.of()` with something more readable and type-safe.

### Update Queries

```java
public int updateTotalAmount(Long orderId, double newTotal) {
    return update("totalAmount = ?1 where id = ?2", newTotal, orderId);
}
```

---

## 7. Integrating with OrderResource: Real Persistence

Now let's connect everything. The `OrderService` stops being an in-memory list and starts using the database. The `@Transactional` annotation is mandatory on methods that modify database state.

### OrderService.java

```java
@ApplicationScoped
public class OrderService {

    private static final Logger LOG = Logger.getLogger(OrderService.class);

    final OrderRepository orderRepository;

    OrderService(OrderRepository orderRepository) {
        this.orderRepository = orderRepository;
    }

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
            item.order = order;
            order.items.add(item);
        }

        orderRepository.persist(order);
        LOG.infof("Order persisted with ID: %d", order.id);
        return order;
    }

    public List<Order> listAll() {
        return orderRepository.listAll(Sort.by("createdAt").descending());
    }

    public Optional<Order> findById(Long id) {
        return orderRepository.findByIdOptional(id);
    }

    public List<Order> searchByCustomer(String name, int page, int size) {
        return orderRepository.findByNameLike(name, page, size);
    }

    @Transactional
    public boolean delete(Long id) {
        LOG.infof("Deleting order: %d", id);
        return orderRepository.deleteById(id);
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

The `get` and `delete` methods throw `NotFoundException` (from `jakarta.ws.rs`) when the order does not exist. Jakarta REST automatically converts this exception into a 404 response, making the code cleaner than manually building `Response.status(NOT_FOUND)`. The `@Transactional` annotation (from the `jakarta.transaction` package) marks service methods that modify the database. Quarkus REST automatically detects that these endpoints are blocking because of `@Transactional`, so there is no need to add `@Blocking` on the resource.

---

## 8. Testing: Dev Services as an Ally

Quarkus reuses the same Dev Services container during tests. No extra Testcontainers configuration is needed like in Spring.

### Integration Test

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

### Repository Test

```java
@QuarkusTest
@TestTransaction
class OrderRepositoryTest {

    @Inject
    OrderRepository repository;

    @Test
    void findByCustomerName() {
        Order order = new Order();
        order.customerName = "Matheus";
        order.totalAmount = 150.0;
        repository.persist(order);

        Optional<Order> found = repository.findByCustomerName("Matheus");

        assertThat(found).isPresent();
        assertThat(found.get().customerName).isEqualTo("Matheus");
        assertThat(found.get().id).isNotNull();
    }

    @Test
    void countByCustomerName() {
        Order order = new Order();
        order.customerName = "Ana";
        order.totalAmount = 99.0;
        repository.persist(order);

        long count = repository.countByCustomerName("Ana");

        assertThat(count).isGreaterThan(0);
    }
}
```

The `@TestTransaction` annotation ensures each test runs in an isolated transaction with automatic rollback, without polluting the database between tests.

> **Advantage over Spring:** In Spring Boot, each `@SpringBootTest` starts a new Testcontainers container. In Quarkus, the container is started once and reused by all `@QuarkusTest` tests, drastically speeding up the test suite.

---

## Conclusion

Migrating from Spring Data JPA to Panache Repository is a natural transition. The concept is the same: a component that encapsulates persistence operations. The difference lies in the implementation: concrete classes instead of proxied interfaces, build-time scanning instead of runtime, and the `find()` method as a Swiss army knife for simplified queries.

Now our orders system has real persistence. In the next article, we will explore the **Active Record Pattern**, where the entity and its operations live in the same class, and how it compares to the Repository we just implemented.

---

## Resources
* [Official Guide: Hibernate ORM with Panache](https://quarkus.io/guides/hibernate-orm-panache)
* [Official Guide: Dev Services - Configuration-free Databases](https://quarkus.io/guides/datasource#dev-services-configuration-free-databases)
* [Official Guide: Datasource](https://quarkus.io/guides/datasource)
* [Spring Data JPA Reference](https://spring.io/projects/spring-data-jpa)
* [Book Examples Repository](https://github.com/quarkus-for-spring-developers/examples)
