---
title: "Persistência com Panache: Do Spring Data JPA ao Repository Pattern no Quarkus"
date: 2026-05-10T10:00:00-03:00
draft: false
tags: ["Quarkus", "Spring", "Java", "Hibernate", "Panache", "JPA", "PostgreSQL", "Dev Services", "Quarkus for Spring Developers"]
author: "Matheus Oliveira"
slug: "persistencia-panache-repository-quarkus"
summary: "Chega de lista em memória! Evolua sua aplicação de pedidos com persistência real usando Hibernate ORM com Panache no padrão Repository. Dev Services, paginação, queries HQL e a transição do Spring Data JPA."
description: "Guia completo de persistência no Quarkus com Panache Repository Pattern. Compare com Spring Data JPA, configure Dev Services com PostgreSQL via Docker, domine o método find(), paginação, ordenação e consultas HQL personalizadas."
cover:
  image: "panache-repository-cover.png"
  alt: "SNES 16-bit pixel art beat 'em up scene of a street fighter shattering an in-memory list enemy while crystal database tables rise from the ground, neon PANACHE sign in the background"
  caption: "Derrotando o armazenamento em memória e invocando persistência real, no melhor estilo beat 'em up"
  relative: true
---

*Este artigo faz parte da série ["Quarkus for Spring Developers"](https://blog.omatheusmesmo.dev/tags/quarkus-for-spring-developers/).*

Até agora, nosso sistema de pedidos vivia em memória. A `OrderService` guardava os dados numa `ArrayList`, o que serviu para aprender injeção de dependência, REST e validação. Mas toda aplicação real precisa persistir dados. É hora de dar ao nosso projeto um banco de dados de verdade.

Neste artigo, vamos migrar do armazenamento em memória para o **Hibernate ORM com Panache** no padrão Repository, configurar o **Dev Services** para subir um PostgreSQL automaticamente no modo Dev, e dominar as queries simplificadas do Panache, incluindo paginação e HQL customizado.

---

## Antes de Começar: Atualizações em Relação ao Livro

O *Quarkus for Spring Developers* é uma referência excelente, mas o Quarkus evoluiu desde sua publicação. Se você estiver acompanhando o livro em paralelo, fique atento a estas mudanças:

| No Livro | No Quarkus Atual | O que mudou |
| :--- | :--- | :--- |
| `hibernate-orm.database.generation` | `hibernate-orm.schema-management.strategy` | A propriedade de gerenciamento de schema foi renomeada. |
| `javax.persistence.*` e `javax.transaction.*` | `jakarta.persistence.*` e `jakarta.transaction.*` | Migração para Jakarta EE 9+. O pacote `javax` foi descontinuado. |
| `PanacheRepositoryBase<Entity, Long>` como padrão | `PanacheRepository<Entity>` | O `PanacheRepository` já assume `Long` como tipo do ID. Use `PanacheRepositoryBase` apenas para IDs de outros tipos. |

Ao longo do artigo, usaremos as versões atualizadas. Se você copiar código do livro e encontrar erros de compilação, provavelmente é por conta de uma dessas mudanças.

---

## 1. A Transição: Spring Data JPA para Panache Repository

Se você vem do Spring, conhece bem o `JpaRepository`: uma interface que o Spring implementa via proxy em runtime. O Panache segue o mesmo conceito de Repository, mas com uma diferença fundamental na mecânica.

| Aspecto | Spring Data JPA | Quarkus Panache Repository |
| :--- | :--- | :--- |
| Definição | `interface` | `class` concreta |
| Implementação | Proxy dinâmico em runtime | Bytecode gerado em build time |
| Anotação de bean | `@Repository` (ou nenhuma) | `@ApplicationScoped` |
| Base | `JpaRepository<Entity, Id>` | `PanacheRepository<Entity>` |
| Persistir | `repository.save(entity)` retorna a entity | `repository.persist(entity)` retorna `void` |
| Buscar por ID | `repository.findById(id)` retorna `Optional` | `repository.findByIdOptional(id)` retorna `Optional` |
| Deletar | `repository.deleteById(id)` | `repository.deleteById(id)` |
| Queries derivadas | Nome do método define a query | Método explícito com `find()` |

O fato de o Panache usar uma **classe concreta** em vez de uma interface não é um retrocesso. É uma otimização: ao eliminar o proxy dinâmico, o Quarkus realiza análise e geração de bytecode em build time, resultando em startup mais rápido e suporte nativo ao GraalVM desde o primeiro dia.

---

## 2. Mãos à Obra: Configurando o DataSource e Dev Services

### Adicionando as Extensões

Precisamos do Hibernate ORM com Panache e do driver PostgreSQL:

```bash
quarkus ext add hibernate-orm-panache jdbc-postgresql
```

Isso adiciona ao seu `pom.xml`:
* `io.quarkus:quarkus-hibernate-orm-panache` (Panache + Hibernate ORM)
* `io.quarkus:quarkus-jdbc-postgresql` (Driver JDBC do PostgreSQL)

### Dev Services: Banco de Dados sem Configuração

Aqui está uma das funcionalidades mais poderosas do Quarkus. No Spring Boot, você precisa instalar e configurar um banco de dados manualmente para desenvolvimento. No Quarkus, o **Dev Services** faz isso automaticamente.

Ao rodar `./mvnw quarkus:dev`, o Quarkus detecta o driver PostgreSQL no classpath e sobe um container Docker com PostgreSQL, configurando a URL, usuário e senha automaticamente. Ao encerrar a aplicação, o container é removido. Zero configuração necessária.

Para customizar a imagem do container (por exemplo, para incluir um schema pré-existente), adicione no `application.properties`:

```properties
quarkus.datasource.devservices.image-name=quay.io/edeandrea/postgres-13-fruits:latest
```

Se você não especificar uma imagem, o Quarkus escolhe uma padrão baseada no driver do classpath, e o banco sobe sem schema. Para prototipagem rápida, isso é suficiente.

### Configuração de Produção

Para ambientes de produção, as credenciais devem ser injetadas via variáveis de ambiente. No `application.properties`:

```properties
quarkus.datasource.username=${DB_USERNAME}
quarkus.datasource.password=${DB_PASSWORD}
quarkus.datasource.jdbc.url=jdbc:postgresql://${DB_HOST:localhost}:${DB_PORT:5432}/${DB_NAME:orders}
quarkus.hibernate-orm.schema-management.strategy=validate
```

A propriedade `schema-management.strategy` instrui o Hibernate a verificar que as entidades correspondem ao schema existente, sem criar ou alterar tabelas. Isso é essencial em produção, onde o schema é gerenciado por ferramentas como Flyway ou Liquibase. Quando Dev Services está ativo em dev e test, o Quarkus sobrescreve automaticamente o default para `drop-and-create`, então não precisa configurar nada.

---

## 3. Mapeando as Entidades: Order e OrderItem

Nos artigos anteriores, usamos um `Order` simples com campos públicos. Agora, vamos transformá-lo numa entidade JPA de verdade, mantendo a conexão com os DTOs que criamos no [artigo sobre Bean Validation]({{< ref "posts/2026-03-18-quarkus-bean-validation-dto/index.pt.md" >}}).

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

Repare que usamos campos públicos e getters/setters são omitidos por enquanto. No padrão Repository, a entidade é um POJO com anotações JPA. O Quarkus gera os accessors em build time quando necessário.

> **Diferença crucial com o Spring:** No Spring, o Hibernate escaneia as entidades em runtime durante o startup. No Quarkus, esse scan acontece em build time. Isso é uma das razões do startup ultrarrápido do Quarkus.

### Naming Strategy: camelCase para snake_case Automaticamente

Se você prestou atenção nas entidades, os campos Java usam `camelCase` (`customerName`, `totalAmount`, `createdAt`), mas por padrão o Hibernate mapeia o nome da coluna exatamente como o campo está escrito. Para que o Hibernate converta automaticamente para `snake_case` no banco (`customer_name`, `total_amount`, `created_at`), adicione:

```properties
quarkus.hibernate-orm.physical-naming-strategy=org.hibernate.boot.model.naming.CamelCaseToUnderscoresNamingStrategy
```

Com essa configuração, o Hibernate converte automaticamente `camelCase` para `snake_case`. Nos campos com camelCase, usamos `@Column(name = "...")` para ser explícito, mas com essa strategy você pode removê-los se preferir depender da conversão automática.

---

## 4. PanacheRepository: O Sucessor do JpaRepository

### Criando o Repository

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

A anotação `@ApplicationScoped` transforma o repository num bean CDI, pronto para ser injetado em qualquer outro bean. Usamos `PanacheRepository<Order>` em vez de `PanacheRepository` porque o `PanacheRepository` já assume `Long` como tipo do ID. Use `PanacheRepositoryBase` apenas quando o ID não for `Long`.

### O Poder do Método `find()`

O método `find()` é a espinha dorsal do Panache. Ele aceita múltiplos formatos:

| Formato | Exemplo | Descrição |
| :--- | :--- | :--- |
| Campo simples | `find("customerName", "Matheus")` | Busca por igualdade direta |
| HQL com parâmetro posicional | `find("customerName like ?1", "%Mat%")` | Query HQL com `?1` |
| HQL com parâmetro nomeado | `find("customerName = :name", Map.of("name", "Matheus"))` | Query HQL com `:name` |
| Sorteado | `find("customerName", Sort.by("createdAt").descending(), "Matheus")` | Com ordenação |
| Múltiplos campos | `find("customerName = ?1 and totalAmount > ?2", "Matheus", 100.0)` | Composição de condições |

O `find()` retorna um `PanacheQuery<T>`, que oferece métodos terminais:

* `.list()` - retorna `List<T>`
* `.firstResult()` - retorna `T` (ou `null`)
* `.firstResultOptional()` - retorna `Optional<T>`
* `.singleResult()` - retorna `T` (lança exceção se houver mais de um)
* `.stream()` - retorna `Stream<T>`
* `.page(Page.of(0, 10))` - inicia paginação

---

## 5. Paginação e Ordenação: Simples e Direta

A paginação no Panache usa a classe `Page` ou os métodos `.page()` e `.range()`.

### Paginação Básica

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

> **Nota:** `Page.ofSize(25)` define apenas o tamanho da página. `Page.of(index, size)` define ambos. Use `Page.ofSize()` quando quiser definir o tamanho uma vez e navegar com `.nextPage()`.

### Paginação com Ordenação

```java
public List<Order> findPagedSorted(int pageIndex, int pageSize) {
    return find("customerName like ?1", Sort.by("totalAmount").descending()
            .and("createdAt").descending(), "%Mat%")
            .page(Page.of(pageIndex, pageSize))
            .list();
}
```

### Paginação no Resource

```java
@GET
@Path("/paged")
public List<Order> listPaged(@RestQuery int page, @RestQuery int size) {
    return service.listPaged(page, size);
}
```

### Metadados de Paginação

Para saber o total de páginas e registros:

```java
PanacheQuery<Order> query = orderRepository.findAll().page(Page.ofSize(10));
long totalPages = query.pageCount();
long totalRecords = query.count();
List<Order> firstPage = query.list();
List<Order> secondPage = query.nextPage().list();
```

Esse exemplo mostra como extrair metadados do `PanacheQuery` diretamente na repository. Para expor isso via API, crie um método no service que encapsule a chamada à repository.

Comparando com Spring Data JPA, onde a paginação exige `PageRequest` e retorna um `Page<T>` wrapper, o Panache é mais direto: você opera no `PanacheQuery` e extrai os dados que precisa.

---

## 6. Queries HQL Personalizadas no Repository

Quando as queries derivadas do `find()` não bastam, escrevemos HQL explicitamente.

### Queries com Parâmetros Nomeados

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

A classe `Parameters` (do `io.quarkus.panache.common`) é a forma idiomática de construir parâmetros nomeados no Panache, substituindo o `Map.of()` por algo mais legível e type-safe.

### Queries de Atualização

```java
public int updateTotalAmount(Long orderId, double newTotal) {
    return update("totalAmount = ?1 where id = ?2", newTotal, orderId);
}
```

---

## 7. Integrando com o OrderResource: Persistência Real

Agora vamos conectar tudo. O `OrderService` deixa de ser uma lista em memória e passa a usar o banco de dados. A anotação `@Transactional` é obrigatória em métodos que modificam o estado do banco.

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

Os métodos `get` e `delete` lançam `NotFoundException` (do `jakarta.ws.rs`) quando o pedido não existe. O Jakarta REST converte essa exceção automaticamente em resposta 404, tornando o código mais limpo do que construir `Response.status(NOT_FOUND)` manualmente. A anotação `@Transactional` (do pacote `jakarta.transaction`) marca os métodos do service que modificam o banco. O Quarkus REST detecta automaticamente que esses endpoints são bloqueantes por causa do `@Transactional`, então não é necessário adicionar `@Blocking` na resource.

---

## 8. Testes: Dev Services como Aliado

O Quarkus reutiliza o mesmo container do Dev Services durante os testes. Não precisa de configuração extra de Testcontainers como no Spring.

### Teste de Integração

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

### Teste do Repository

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

A anotação `@TestTransaction` garante que cada teste execute numa transação isolada com rollback automático, sem poluir o banco entre testes.

> **Vantagem sobre o Spring:** No Spring Boot, cada `@SpringBootTest` inicia um novo container Testcontainers. No Quarkus, o container é iniciado uma única vez e reutilizado por todos os `@QuarkusTest`, acelerando drasticamente a suite de testes.

---

## Conclusão

Migrar do Spring Data JPA para o Panache Repository é uma transição natural. O conceito é o mesmo: um componente que encapsula as operações de persistência. A diferença está na implementação: classes concretas em vez de interfaces com proxy, build-time scanning em vez de runtime, e o método `find()` como canivete suíço para queries simplificadas.

Agora nosso sistema de pedidos tem persistência real. No próximo artigo, vamos explorar o **Padrão Active Record**, onde a entidade e suas operações vivem na mesma classe, e como isso se compara ao Repository que acabamos de implementar.

---

## Recursos
* [Guia Oficial: Hibernate ORM com Panache](https://quarkus.io/guides/hibernate-orm-panache)
* [Guia Oficial: Dev Services - Configuration-free Databases](https://quarkus.io/guides/datasource#dev-services-configuration-free-databases)
* [Guia Oficial: Datasource](https://quarkus.io/guides/datasource)
* [Spring Data JPA Reference](https://spring.io/projects/spring-data-jpa)
* [Repositório de Exemplos do Livro](https://github.com/quarkus-for-spring-developers/examples)
