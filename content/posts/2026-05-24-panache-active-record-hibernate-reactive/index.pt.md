---
title: "O Padrão Active Record e Hibernate Reactive: Entidades que se Salvam no Quarkus"
date: 2026-05-24T10:00:00-03:00
draft: false
tags: ["Quarkus", "Spring", "Java", "Hibernate", "Panache", "JPA", "PostgreSQL", "Active Record", "Hibernate Reactive", "Reactive", "Vert.x", "Uni", "Dev Services", "Quarkus for Spring Developers"]
author: "Matheus Oliveira"
slug: "padrao-active-record-hibernate-reactive"
summary: "Entidades que se salvam! Refatore sua aplicação de pedidos para o padrão Active Record com PanacheEntity, descubra quando escolher Repository vs. Active Record, e entre no mundo reativo com Hibernate Reactive e @WithTransaction."
description: "Guia completo do padrão Active Record e Hibernate Reactive no Quarkus. Compare Repository vs. Active Record, refatore entidades para estender PanacheEntity, faça mock com PanacheMock, e construa um Audit Log reativo com Hibernate Reactive, @WithTransaction e Uni."
cover:
 image: "active-record-reactive-cover.png"
 alt: "SNES 16-bit pixel art beat 'em up scene de um guerreiro absorvendo poder de cristal de banco de dados enquanto ondas de energia reativa irradiam para fora, neon ACTIVE RECORD ao fundo"
 caption: "A entidade se torna o lutador: Active Record e energia reativa, no melhor estilo beat 'em up"
 relative: true
---

*Este artigo faz parte da série ["Quarkus for Spring Developers"](https://blog.omatheusmesmo.dev/tags/quarkus-for-spring-developers/).*

No [artigo anterior]({{< ref "posts/2026-05-10-persistencia-panache-repository-quarkus/index.pt.md" >}}), demos ao nosso sistema de pedidos persistência real usando o padrão Repository. A classe `OrderRepository` encapsulou todas as operações de banco, mantendo a entidade como um mero portador de dados. Funciona, e é familiar para quem vem do Spring Data JPA.

Mas e se a entidade pudesse gerenciar sua própria persistência? Sem repository separado, sem classe extra para injetar. Apenas `Order.persist(order)` e pronto. Esse é o **padrão Active Record**, e é a forma padrão como desenvolvedores Quarkus escrevem entidades com Panache.

Neste artigo, vamos refatorar nossa aplicação de pedidos do padrão Repository para o Active Record, comparar as duas abordagens com um guia de decisão claro, e depois ir além: entrar no **Hibernate Reactive**, onde operações de banco retornam `Uni<T>` em vez de bloquear a thread, e uma entidade `AuditLog` registra cada alteração de pedido de forma reativa.

---

## Antes de Começar: Atualizações em Relação ao Livro

O *Quarkus for Spring Developers* cobre tanto o padrão Repository quanto o Active Record no Capítulo 4. Desde sua publicação, várias APIs evoluíram. Se você estiver acompanhando o livro em paralelo, fique atento a estas mudanças:

| No Livro | No Quarkus Atual | O que mudou |
| :--- | :--- | :--- |
| `PanacheEntityBase` com `@Id` customizado | `PanacheEntity` para IDs `Long` auto-gerados | `PanacheEntity` estende `PanacheEntityBase` e fornece o campo `id` automaticamente. Use `PanacheEntityBase` apenas para estratégias de ID customizadas. |
| `javax.persistence.*` | `jakarta.persistence.*` | Migração para Jakarta EE 9+. O pacote `javax` foi descontinuado. |
| `javax.transaction.*` | `jakarta.transaction.*` | Mesma migração para Jakarta EE 9+. |
| Transações reativas: `@ReactiveTransactional` | `@WithTransaction` (ou `@Transactional`) | A anotação `@ReactiveTransactional` foi substituída. O Quarkus atual usa `@WithTransaction` para métodos reativos que retornam `Uni`, ou `@Transactional` para ambos bloqueantes e reativos. Veja a seção Sessões e Transações para detalhes. |
| Testes reativos: classe `TestTransaction` customizada | `TransactionalUniAsserter` + `@RunOnVertxContext` | O Quarkus agora fornece utilitários de teste nativos para rollback de transações reativas, eliminando a necessidade de um `TestTransaction` feito à mão. |
| `findByIdOptional()` no Panache Reativo | Use `findById(id).map(Optional::ofNullable)` | O método `findByIdOptional` não existe no Hibernate Reactive Panache. Mapeie o resultado de `findById` para `Optional` manualmente. |

Ao longo deste artigo, usaremos as versões atualizadas. Se você copiar código do livro e encontrar erros de compilação, provavelmente é por conta de uma dessas mudanças.

---

## 1. Active Record: Entidades que se Salvam

A ideia central do padrão Active Record é simples: **a entidade e suas operações de persistência vivem na mesma classe**. Em vez de injetar um repository para chamar `repository.persist(order)`, você chama `order.persist()` diretamente. Em vez de `repository.findById(id)`, você chama `Order.findById(id)`.

Se você vem do Spring, isso pode parecer estranho. O Spring Data JPA separa rigorosamente a entidade (um POJO com anotações JPA) do repository (uma interface que o Spring faz proxy em runtime). O Active Record do Panache funde ambos numa única classe.

| Aspecto | Spring Data JPA | Quarkus Panache Active Record |
| :--- | :--- | :--- |
| Definição da entidade | POJO com `@Entity`, campos privados, getters/setters | `@Entity` extends `PanacheEntity`, campos públicos |
| Operações de persistência | Em uma interface `JpaRepository` separada | Métodos estáticos na própria entidade |
| Uso | `repository.save(entity)` | `entity.persist()` ou `Entity.persist(entity)` |
| Buscar por ID | `repository.findById(id)` retorna `Optional` | `Entity.findByIdOptional(id)` retorna `Optional` |
| Queries customizadas | Derivadas do nome do método ou `@Query` | Métodos estáticos usando `find()`, `list()`, `count()` |
| Mocking em testes | Mockito na interface do repository | `PanacheMock.mock(Entity.class)` |

Por que o Active Record é tão popular no ecossistema Quarkus? Três razões:

1. **Menos cerimônia.** Uma classe por entidade em vez de duas. Sem interface, sem proxy, sem ponto de injeção.
2. **Descoberta.** Digite `Order.` e sua IDE mostra todas as operações: `findById`, `listAll`, `count`, `delete`, além dos seus métodos customizados. Tudo num lugar só.
3. **Otimização em build time.** Como não há proxy em runtime, o Quarkus realiza enhancement de bytecode em build time, resultando em startup mais rápido e compatibilidade nativa com GraalVM desde o primeiro dia.

---

## 2. Refatorando Order para Active Record

Nossas entidades `Order` e `OrderItem` do [artigo sobre Repository]({{< ref "posts/2026-05-10-persistencia-panache-repository-quarkus/index.pt.md" >}}) já usavam campos públicos. A refatoração para Active Record é direta: estender `PanacheEntity` em vez de declarar `@Id` manualmente, e mover os métodos do repository para a entidade como métodos estáticos.

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

`OrderItem` estende `PanacheEntityBase` em vez de `PanacheEntity` porque declara seu próprio campo `@Id`. Use `PanacheEntityBase` quando precisar de uma estratégia de ID customizada. Use `PanacheEntity` quando um `Long id` auto-gerado for suficiente.

Note o `@JsonIgnore` no campo de back-reference `order`. Sem ele, a serialização Jackson entra num loop infinito: Order serializa seus items, cada item serializa seu order, que serializa seus items de novo. `@JsonIgnore` quebra o ciclo na back-reference, permitindo que o JSON renderize Order com seus items, mas cada item sem o order pai.

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

Repare no que mudou em relação à versão com Repository:

- `Order` agora estende `PanacheEntity`, que fornece o campo `id` automaticamente. Removemos as declarações explícitas de `@Id` e `@GeneratedValue`.
- Todos os métodos que viviam em `OrderRepository` são agora **métodos estáticos** dentro de `Order`. Mesma API `find()`, `list()`, `count()`, mas chamados na classe da entidade.
- As anotações `@Entity` e `@Table` permanecem inalteradas.
- `Parameters` vem de `io.quarkus.panache.common.Parameters`, mesmo de antes.

> **Reescrita de acesso a campos:** Quando você escreve `order.customerName`, o Quarkus reescreve em build time para chamar o getter/setter gerado. Isso significa que você tem encapsulamento adequado em runtime, mesmo que o código leia como acesso direto ao campo. Você ainda pode definir getters/setters customizados quando necessário, e eles serão usados de forma transparente.

---

## 3. Ciclo de Vida da Entidade Sem Repository

No padrão Repository, o ciclo de vida era gerenciado através do repository: `repository.persist(order)`, `repository.deleteById(id)`, `repository.isPersistent(order)`. No Active Record, a entidade gerencia seu próprio ciclo de vida.

### Persistindo

```java
Order order = new Order();
order.customerName = "Matheus";
order.totalAmount = 250.0;
order.persist();
```

Após `persist()`, o campo `order.id` é preenchido pelo banco. Não há retorno (diferente do `repository.save()` do Spring, que retorna a entidade). Você pode usar `persistAndFlush()` se precisar de feedback imediato e quiser capturar `PersistenceException` no ato.

### Verificando o Estado de Persistência

```java
if (order.isPersistent()) {
 order.delete();
}
```

`isPersistent()` retorna `true` se a entidade está gerenciada pelo contexto de persistência atual. Isso é útil para evitar chamar `persist()` numa entidade já gerenciada.

### Deletando

```java
Order.deleteById(1L);
order.delete();
```

Tanto o método de instância (`entity.delete()`) quanto o método estático (`Entity.deleteById(id)`) estão disponíveis. O método de instância só funciona em entidades persistentes.

### Atualizando

```java
Order order = Order.findById(1L);
order.customerName = "Nome Atualizado";
```

Uma vez que a entidade é persistente (gerenciada pelo contexto de persistência), todas as modificações de campos são automaticamente sincronizadas com o banco no commit da transação. Nenhuma chamada explícita a `save()` ou `merge()` é necessária. Esse é um comportamento fundamental do JPA que o Panache preserva.

### Operações em Lote

```java
long deleted = Order.delete("status = ?1", "CANCELLED");
int updated = Order.update("totalAmount = ?1 where id = ?2", 300.0, 1L);
```

Esses métodos estáticos realizam operações em massa diretamente no banco, sem carregar entidades na memória.

---

## 4. Refatorando OrderService: Chega de Injeção de Repository

Com o Active Record, `OrderService` não precisa mais de `OrderRepository`. Todas as operações são chamadas estáticas em `Order`.

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

Compare com a versão com Repository: o campo `orderRepository` e o construtor sumiram. Cada chamada `orderRepository.method()` virou `Order.method()`. A anotação `@Transactional` (de `jakarta.transaction`) permanece nos métodos de escrita.

Note que também adicionamos `item.unitPrice = itemDTO.unitPrice`, que era uma lacuna do artigo anterior: a entidade `OrderItem` tinha um campo `unitPrice`, mas o mapeamento no `OrderItemDTO` estava faltando. Aqui está o DTO atualizado:

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

Com essa adição, o DTO agora mapeia completamente os campos da entidade `OrderItem`.

### OrderResource.java (inalterado)

O resource REST não muda em nada. Ele continua delegando para `OrderService`, que é o limite arquitetural correto:

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

O fato de `OrderResource` permanecer intocado é importante: a refatoração para Active Record é um **detalhe interno de implementação**. O contrato da API REST fica o mesmo.

---

## 5. Testes com PanacheMock

Testar o padrão Active Record exige uma estratégia de mocking diferente. No Repository, usávamos `@InjectMock` na classe do repository (um bean CDI). Com Active Record, não há repository para injetar. Os métodos estáticos da entidade precisam de mock, e o Mockito não consegue fazer mock de métodos estáticos diretamente.

O Quarkus fornece o **PanacheMock** para isso. Adicione a dependência de teste:

```xml
<dependency>
    <groupId>io.quarkus</groupId>
    <artifactId>quarkus-panache-mock</artifactId>
    <scope>test</scope>
</dependency>
```

### Teste de Integração (inalterado)

O teste de integração não muda. Ele ainda usa REST-assured contra a aplicação rodando, e o Dev Services fornece o container PostgreSQL:

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

### Teste de Entidade com @TestTransaction

Para testar métodos customizados da entidade contra o banco real, use `@TestTransaction` (mesmo do padrão Repository):

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

### Teste Unitário com PanacheMock

Quando você precisa testar uma classe que consome métodos estáticos da entidade sem tocar no banco, use `PanacheMock`:

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

> **Mockando parâmetros `Sort`:** Quando o service chama `Order.listAll(Sort.by("createdAt").descending())`, o mock deve usar `any(Sort.class)` em vez de `Sort.by("createdAt").descending()`. O motivo: `Sort.by()` cria uma nova instância de objeto cada vez, então a igualdade exata de objetos nunca funciona. Usar `any(Sort.class)` do Mockito evita essa armadilha.

Diferenças-chave em relação ao mocking no padrão Repository:

| Aspecto | Padrão Repository | Padrão Active Record |
| :--- | :--- | :--- |
| Configuração do mock | `@InjectMock OrderRepository repo` | `PanacheMock.mock(Order.class)` |
| Definir comportamento | `Mockito.when(repo.count()).thenReturn(23L)` | `Mockito.when(Order.count()).thenReturn(23L)` |
| Verificar | `Mockito.verify(repo).count()` | `PanacheMock.verify(Order.class).count()` |
| Reset | Automático (por teste) | `PanacheMock.mock()` no início de cada teste |

> **Importante:** Chame `PanacheMock.mock(Order.class)` no início de cada teste que precise de mocking. Sem isso, os métodos estáticos reais executam contra o banco.

---

## 6. Quando Usar Repository vs. Active Record

Os dois padrões são totalmente suportados no Quarkus Panache. A escolha é arquitetural, não funcional. Aqui está um guia de decisão:

| Critério | Prefira Repository | Prefira Active Record |
| :--- | :--- | :--- |
| **Background do time** | Desenvolvedores Spring acostumados com `JpaRepository` | Times de Ruby on Rails, Django ou nativos de Quarkus |
| **Complexidade do domínio** | Domínios complexos com muitas queries customizadas | CRUD simples com queries customizadas ocasionais |
| **Separação de responsabilidades** | Você quer separação estrita entidade/DAO | Você prefere co-localizar estado e comportamento |
| **Isolamento em testes** | Fácil fazer mock do repository com `@InjectMock` | Requer `PanacheMock` para métodos estáticos |
| **Múltiplas implementações de persistência** | Trocar o repository por outra fonte de dados | A entidade É o acesso a dados (mais difícil de trocar) |
| **Número de classes** | Duas classes por entidade | Uma classe por entidade |
| **Convenção do Quarkus** | Suportado, mas não é o padrão | Padrão na documentação e quickstarts |

**Nossa recomendação:** Se você está migrando do Spring Data JPA e seu time valoriza a separação familiar, comece com o padrão Repository. Se está construindo uma aplicação Quarkus nova e quer menos boilerplate, vá de Active Record. Você sempre pode refatorar depois, como acabamos de demonstrar.

Uma preocupação prática: se sua entidade tem muitas queries customizadas (10+ métodos), a classe pode ficar grande. Nesse caso, o padrão Repository mantém a entidade focada no mapeamento, e o repository cuida da complexidade das queries. Para nossa entidade `Order` com um punhado de métodos, Active Record é um encaixe limpo.

---

## 7. Hibernate Reactive: O Fim do Bloqueio de JDBC

Até aqui, nossa aplicação usa **Hibernate ORM** com drivers JDBC. Cada chamada ao banco bloqueia uma thread: quando `Order.findById(1L)` executa, a thread atual espera a resposta do banco antes de prosseguir. Num container servlet tradicional, isso é esperado. Cada request recebe sua própria thread.

Numa arquitetura reativa, bloqueio é uma armadilha de performance. O Quarkus REST (antigo RESTEasy Reactive) roda no event loop do Vert.x, um pool pequeno de threads (tipicamente uma por núcleo de CPU) que atende todas as requests concorrentemente. Se uma request bloqueia em JDBC, ela segura a thread do event loop, impedindo que outras requests sejam processadas. Sob alta concorrência, isso vira um gargalo.

O **Hibernate Reactive** resolve isso usando clientes de banco não-bloqueantes do Vert.x em vez de JDBC. Operações de banco retornam `Uni<T>`, permitindo que a thread do event loop seja liberada enquanto aguarda a resposta do banco.

> **Hibernate Reactive não é um substituto do Hibernate ORM.** É uma stack diferente para casos de uso reativos onde você precisa de alta concorrência. Se você não precisa de alta concorrência, ou não está acostumado com o paradigma reativo, a documentação oficial do Quarkus recomenda usar Hibernate ORM. Usar Quarkus REST não exige Hibernate Reactive.

### Adicionando as Extensões

Para trocar de Hibernate ORM para Hibernate Reactive, substitua as dependências bloqueantes:

```bash
quarkus ext remove hibernate-orm-panache jdbc-postgresql
quarkus ext add hibernate-reactive-panache reactive-pg-client
```

Isso substitui:
* `io.quarkus:quarkus-hibernate-orm-panache` por `io.quarkus:quarkus-hibernate-reactive-panache`
* `io.quarkus:quarkus-jdbc-postgresql` por `io.quarkus:quarkus-reactive-pg-client`

### Configuração

A configuração do Dev Services é idêntica: o Quarkus detecta o cliente reativo de PostgreSQL no classpath e sobe um container Docker automaticamente. Para produção:

```properties
quarkus.datasource.db-kind=postgresql
quarkus.datasource.username=${DB_USERNAME}
quarkus.datasource.password=${DB_PASSWORD}
quarkus.datasource.reactive.url=postgresql://${DB_HOST:localhost}:${DB_PORT:5432}/${DB_NAME:orders}
```

Note que a URL usa o esquema `postgresql://` para o cliente reativo do Vert.x, e não `jdbc:postgresql://` como no JDBC.

---

## 8. Transações Reativas: @WithTransaction

No mundo ORM bloqueante, `@Transactional` (de `jakarta.transaction`) marca um método como limite de transação. No mundo reativo, o equivalente é `@WithTransaction` (de `io.quarkus.hibernate.reactive.panache.common.WithTransaction`).

Você também pode usar `@Transactional` com Hibernate Reactive. Porém, há uma ressalva importante: **não misture `@Transactional` com `@WithTransaction` ou `@WithSession` na mesma aplicação**. Escolha uma abordagem e use consistentemente. Misturar essas anotações num pipeline reativo resulta em `UnsupportedOperationException`.

Para aplicações reativas, a abordagem recomendada é:

| Anotação | Pacote | Use Quando |
| :--- | :--- | :--- |
| `@WithTransaction` | `io.quarkus.hibernate.reactive.panache.common` | Método retorna `Uni`, pipeline reativo |
| `@WithSession` | `io.quarkus.hibernate.reactive.panache.common` | Método precisa de sessão reativa mas sem transação (somente leitura) |
| `@Transactional` | `jakarta.transaction` | Funciona com ORM e Reactive, mas evite misturar com `@WithTransaction` |

### Order.java Reativa

A classe da entidade troca sua classe base do pacote ORM Panache para o Reactive Panache:

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

A diferença-chave: todo método agora retorna `Uni<T>` em vez de `T` diretamente. `findByNameLike` retorna `Uni<List<Order>>` em vez de `List<Order>`. `countByCustomerName` retorna `Uni<Long>` em vez de `long`.

A associação `@OneToMany` permanece **LAZY** (o padrão). Em vez de mudar para EAGER, usamos queries com **JOIN FETCH** (`listAllWithItems` e `findByIdWithItems`) para carregar os items na mesma ida ao banco. Por que não EAGER? Porque EAGER carrega os items em toda query, mesmo quando você não precisa deles (como em `countByCustomerName`). JOIN FETCH dá controle explícito: carregue items apenas quando o caso de uso exige.

> **A LazyInitializationException no contexto reativo:** Num contexto reativo, o lazy loading fora de uma sessão ativa causa `LazyInitializationException` quando o Jackson serializa a entidade. O event loop do Vert.x já liberou a sessão do banco na hora da serialização. `@WithSession` no método do service mantém a sessão aberta para a query Panache, mas NÃO estende até a serialização do Jackson. JOIN FETCH resolve isso no nível da query: os items são carregados eagerly dentro da mesma query, então nenhum lazy loading ocorre durante a serialização.

### OrderService.java Reativo

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

Repare no encadeamento reativo em `create()`: `order.persist()` retorna `Uni<Void>`, então usamos o cast genérico `order.<Order>persist()` seguido de `.replaceWith(order)` para retornar a entidade persistida. Esse é o equivalente reativo do `persist()` bloqueante seguido de `return order`.

Métodos de leitura (`listAll`, `findById`, `searchByCustomer`) usam `@WithSession` em vez de `@WithTransaction`. Uma sessão é suficiente para operações de somente leitura e evita o overhead de uma transação completa. Os métodos `listAll()` e `findById()` agora chamam `Order.listAllWithItems()` e `Order.findByIdWithItems()` respectivamente, usando as queries com JOIN FETCH para evitar `LazyInitializationException`.

> **`findByIdOptional` não existe no Panache Reativo.** No Panache bloqueante, `findByIdOptional(id)` retorna `Optional<T>`. No Panache Reativo, use `findById(id).map(Optional::ofNullable)` ou uma query customizada como `findByIdWithItems(id).map(order -> Optional.ofNullable(order))`.

### OrderResource.java Reativo

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

Todo endpoint agora retorna `Uni<T>`. O Quarkus REST detecta o tipo de retorno reativo e garante que o método rode no event loop do Vert.x. As anotações `@Transactional` e `@Blocking` não são necessárias aqui: `@WithTransaction` nos métodos do service cuida do limite de transação, e retornar `Uni` sinaliza ao Quarkus REST que este é um endpoint não-bloqueante.

O endpoint `delete` retorna `Uni<Boolean>` (não `Uni<Void>`) porque `service.delete()` retorna `Uni<Boolean>` e `.invoke()` não altera o tipo de retorno. O valor booleano é descartado pela camada HTTP após o efeito colateral do `.invoke()` rodar, então o cliente recebe `204 No Content` em caso de sucesso.

---

## 9. Mão na Massa: Audit Log Reativo

Para colocar o Hibernate Reactive em prática, vamos implementar uma entidade **AuditLog** que registra cada alteração de pedido. Esse é o equivalente reativo de uma trilha de auditoria tradicional, mas sem bloquear nenhuma thread.

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

### Integrando com o OrderService

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

O operador `.call()` encadeia um efeito colateral (persistir o audit log) sem alterar o resultado principal do pipeline. Tanto o pedido quanto o audit log são persistidos na mesma transação, garantindo consistência. Se o audit log falhar, a transação inteira faz rollback, incluindo a criação do pedido.

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

### Testando o Audit Log Reativo

Testes com Panache Reativo exigem `@RunOnVertxContext` e `TransactionalUniAsserter`:

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

`@RunOnVertxContext` garante que o teste rode no event loop do Vert.x. `TransactionalUniAsserter` envolve cada asserção numa transação reativa separada com rollback automático, mantendo o banco limpo entre testes.

> **Importante:** A classe `TransactionalUniAsserter` está no pacote `io.quarkus.test.hibernate.reactive.panache` (não em `io.quarkus.test.vertx` como alguns guias antigos sugerem). `RunOnVertxContext` está em `io.quarkus.test.vertx`.

> **Entradas de AuditLog devem ser criadas manualmente nos testes.** Ao testar `AuditLog` diretamente (não através de `OrderService`), você deve persistir tanto o order quanto o audit log manualmente no bloco `asserter.execute()`. O método `OrderService.create()` encadeia o audit logging via `.call()`, mas esse encadeamento só roda quando você chama o service. Num `AuditLogTest` standalone, você replica o mesmo encadeamento para configurar os dados do teste.

### Testes com PanacheMock Reativo

Para testes unitários da camada de service sem banco de dados, use `PanacheMock` com `UniAsserter`:

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

Note as diferenças em relação ao PanacheMock bloqueante: métodos mockados devem retornar `Uni<...>` (não valores diretos), e o teste usa `UniAsserter` (não `TransactionalUniAsserter`) porque testes de mock não precisam de uma transação real de banco. O mock faz match direto com `Order.listAllWithItems()` (sem `any(Sort.class)`) porque o service chama esse método estático específico.

---

## Conclusão

O padrão Active Record no Quarkus Panache é mais do que uma escolha estilística. Ele reduz boilerplate, centraliza as operações da entidade numa classe só, e se alinha com a filosofia de build time do Quarkus. Para desenvolvedores Spring, ele desafia a separação estrita entidade/repository, mas o trade-off é claro: menos código, uma classe por entidade, e a mesma API `find()` poderosa.

Quando a aplicação exige alta concorrência, o Hibernate Reactive substitui o bloqueio de JDBC por clientes não-bloqueantes do Vert.x, e `@WithTransaction` substitui `@Transactional` para limites de transação reativos. A mesma API Panache funciona nos dois mundos, mas os métodos retornam `Uni<T>` em vez de `T`.

O exemplo do Audit Log demonstra como entidades reativas compõem naturalmente dentro de um pipeline reativo: criação do pedido e registro de auditoria acontecem na mesma transação, sem bloquear nenhuma thread.

No próximo artigo, vamos explorar **mensageria interna com o EventBus do Vert.x**, desacoplando código além da injeção de dependência e disparando eventos como `OrderPaidEvent` sem conhecer quem vai ouvir.

---

## Recursos
* [Guia Oficial: Simplified Hibernate ORM with Panache](https://quarkus.io/guides/hibernate-orm-panache)
* [Guia Oficial: Simplified Hibernate Reactive with Panache](https://quarkus.io/guides/hibernate-reactive-panache)
* [Guia Oficial: Using Hibernate Reactive](https://quarkus.io/guides/hibernate-reactive)
* [Guia Oficial: Datasource - Dev Services](https://quarkus.io/guides/datasource#dev-services-configuration-free-databases)
* [Spring Data JPA Reference](https://spring.io/projects/spring-data-jpa)
* [Spring Data R2DBC Reference](https://spring.io/projects/spring-data-r2dbc)
* [Repositório de Exemplos do Livro](https://github.com/quarkus-for-spring-developers/examples)
