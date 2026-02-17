---
title: "SQL or NoSQL? Why Not Both? Using Oracle's Converged Database with Quarkus"
date: 2026-02-17T08:00:00-03:00
draft: false
tags: ["Oracle FreeStack Journey", "Quarkus", "Oracle Cloud", "JSON", "Hibernate Panache", "Flyway", "Converged Database"]
author: "Matheus Oliveira"
slug: "quarkus-oracle-converged-database-json"
summary: "Discover the power of Oracle's converged database: how to persist and query native JSON documents using Quarkus and Hibernate Panache without needing a separate NoSQL database."
description: "In this second article of the series, we implement a CRUD of articles with flexible content (JSON). We show Flyway configuration, PanacheEntity usage, and how Oracle supports JSON natively."
cover:
  image: "oracle-convergente-json.png"
  alt: "High-end Seinen manga style illustration of the Oracle Logo, featuring heavy ink brush strokes, intricate deep black cross-hatching, and a glowing golden digital aura."
  caption: "The weight of Oracle's legacy meets the fluidity of modern data: a contemplative, ink-drawn foundation for converged development."
  relative: true
---

*This article is part of the ["Oracle FreeStack Journey"](https://blog.omatheusmesmo.dev/en/tags/oracle-freestack-journey/) series. In the [previous article]({{< ref "posts/2026-02-16-quarkus-connect-oracle-autonomous-db/index.en.md" >}}), we configured our database and the secure Wallet connection. If you don't have a cloud account yet, start with [Phase 0]({{< ref "posts/2026-02-15-oracle-cloud-free-tier-setup/index.en.md" >}}).*

Today, let's talk about one of the biggest myths in modern development: the idea that you need different databases (Polyglot Persistence) for different types of data.

### The Developer's Dilemma
You have structured data (Users, Dates, IDs) and flexible data (Blog content, dynamic metadata). The standard market response?
- "Use PostgreSQL for relational and MongoDB for JSON."

**The Problem:** Now you have two databases to manage, two networks, two security systems, and zero transactional consistency between them.

### The Solution: Converged Database (Oracle 26ai)
With Oracle Autonomous Database 26ai, we treat JSON as a first-class citizen. You get the ACID consistency of SQL with the flexibility of NoSQL. The 26ai engine brings AI vector optimizations that, combined with our JSON documents, allow for powerful semantic searches without leaving the relational base.

This means you can perform a `JOIN` between a complex JSON document and a relational metadata table in a single query, without network latency between different database services.

### 0. Critical Quarkus Configuration

Before coding, we need to add the **Flyway** (for migrations) and **Hibernate Validator** (for data validation) extensions, and tell Quarkus not to try formatting the database JSON fields with REST defaults.

You can add them via CLI:

```bash
quarkus extension add flyway hibernate-validator
```

Or, if you prefer, add them directly to your `pom.xml`:

```xml
<dependency>
    <groupId>io.quarkus</groupId>
    <artifactId>quarkus-flyway</artifactId>
</dependency>
<dependency>
    <groupId>io.quarkus</groupId>
    <artifactId>quarkus-hibernate-validator</artifactId>
</dependency>
```

In the `application.properties` file:

```properties
# Prevents Quarkus from forcing REST formats on Hibernate mapping
quarkus.hibernate-orm.mapping.format.global=ignore

# BONUS TIP: Automatically converts camelCase to snake_case (e.g., createdAt -> created_at)
quarkus.hibernate-orm.physical-naming-strategy=org.hibernate.boot.model.naming.CamelCaseToUnderscoresNamingStrategy
```

## Implementing the Article CRUD

So you can implement this in your project right now, here is the complete anatomy of each layer, from the database to the endpoint.

### 1. DTOs: Input and Output Contracts
Always start with DTOs. They define your API contract and protect your internal entities.

```java
// CreateArticleRequest.java
public record CreateArticleRequest(
    @NotBlank String title,
    @NotBlank String author,
    @NotNull JsonNode content
) {}

// ArticleResponse.java
public record ArticleResponse(
    Long id,
    String title,
    String author,
    JsonNode content,
    Instant createdAt
) {}
```

### 2. The Entity: Converged Persistence
Integration with **Oracle 26ai** is achieved by mapping `JsonNode` to a native `json` column type:

```java
// Article.java
@Entity
public class Article extends PanacheEntity {
    @Column(nullable = false)
    public String title;

    @Column(nullable = false)
    public String author;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(columnDefinition = "json")
    public JsonNode content;

    @Column(nullable = false, updatable = false)
    public Instant createdAt;
}
```

> **Professional Bonus Tip:** Notice we no longer need to define `@Column(name = "created_at")`. Thanks to the `CamelCaseToUnderscoresNamingStrategy` configuration, Hibernate performs this translation for us transparently and standardized. This keeps the code clean and follows market best practices that few developers apply.

Using `PanacheEntity` gives us a solid foundation with an auto-managed `id`, facilitating persistence without the need for complex inheritance or repetitive primary key definitions. In Oracle, this automatically translates into a `SEQUENCE`, ensuring that ID generation doesn't become a performance bottleneck in high-concurrency scenarios.

### 3. Repository: Native SQL/JSON Queries
While HQL is evolving, using **Native SQL** with the `PASSING` clause is the most robust and performant way to inject parameters into SQL/JSON expressions in Oracle, preventing the database from treating the path as a literal string without variables:

```java
// ArticleRepository.java
@ApplicationScoped
public class ArticleRepository implements PanacheRepository<Article> {
    
    public List<Article> findByTag(String tag) {
        return getEntityManager()
                .createNativeQuery("SELECT * FROM Article WHERE json_exists(content, '$.tags?(@ == $t)' PASSING :tag AS "t")", Article.class)
                .setParameter("tag", tag)
                .getResultList();
    }
}
```

### 4. Service: Orchestration and Conversion
The service layer handles business logic and conversions between DTOs and Entities under a single transaction:

```java
// ArticleService.java
@ApplicationScoped
public class ArticleService {
    @Inject ArticleRepository repository;

    @Transactional
    public ArticleResponse createArticle(CreateArticleRequest request) {
        Article article = new Article();
        article.title = request.title();
        article.author = request.author();
        article.content = request.content();
        article.createdAt = Instant.now();

        repository.persist(article);
        return mapToResponse(article);
    }

    public List<ArticleResponse> listAll() {
        return repository.listAll().stream()
                .map(this::mapToResponse)
                .collect(Collectors.toList());
    }

    public ArticleResponse findById(Long id) {
        return repository.findByIdOptional(id)
                .map(this::mapToResponse)
                .orElseThrow(() -> new NotFoundException("Article not found"));
    }

    public List<ArticleResponse> findByTag(String tag) {
        return repository.findByTag(tag).stream()
                .map(this::mapToResponse)
                .collect(Collectors.toList());
    }

    private ArticleResponse mapToResponse(Article article) {
        return new ArticleResponse(
            article.id, article.title, article.author, 
            article.content, article.createdAt);
    }
}
```

### 5. Resource: Reactive REST Endpoints
Finally, we expose our functionality via REST. Notice how the code is extremely succinct:

```java
// ArticleResource.java
@Path("/articles")
@Produces(MediaType.APPLICATION_JSON)
@Consumes(MediaType.APPLICATION_JSON)
public class ArticleResource {
    @Inject ArticleService service;

    @POST
    public Response create(@Valid CreateArticleRequest request) {
        ArticleResponse created = service.createArticle(request);
        return Response.status(Response.Status.CREATED).entity(created).build();
    }

    @GET
    public List<ArticleResponse> list() {
        return service.listAll();
    }

    @GET
    @Path("/{id}")
    public ArticleResponse get(@PathParam("id") Long id) {
        return service.findById(id);
    }

    @GET
    @Path("/search")
    public List<ArticleResponse> search(@QueryParam("tag") String tag) {
        return service.findByTag(tag);
    }
}
```

### 6. Flyway: Database Versioning
Don't let Hibernate do the dirty work in production. Use migrations:

```sql
-- V1.0.1__Create_Article_Table.sql
CREATE TABLE Article (
    id NUMBER(19,0) NOT NULL,
    title VARCHAR2(255 CHAR) NOT NULL,
    author VARCHAR2(255 CHAR) NOT NULL,
    content JSON,
    created_at TIMESTAMP (6) WITH TIME ZONE NOT NULL,
    CONSTRAINT pk_article PRIMARY KEY (id)
);

CREATE SEQUENCE Article_SEQ START WITH 1 INCREMENT BY 50;
```

## Testing the Endpoints

With the environment in development mode (`quarkus:dev`), you can validate the implementation using the commands below:

### 1. Create an Article (POST)
```bash
curl -X POST http://localhost:8080/articles 
  -H "Content-Type: application/json" 
  -d '{
    "title": "My Converged Article",
    "author": "Matheus",
    "content": {
      "body": "Flexible content here...",
      "tags": ["java", "oracle", "cloud"],
      "metadata": { "views": 0 }
    }
  }'
```

### 2. List Articles (GET)
```bash
curl http://localhost:8080/articles
```

### 3. Find by ID (GET)
```bash
# Replace 1 with the ID of the created article
curl http://localhost:8080/articles/1

# TIP: Use -i to see the 404 status for non-existent IDs
curl -i http://localhost:8080/articles/999
```

### 4. Search by Tag in JSON (Search)
```bash
curl "http://localhost:8080/articles/search?tag=oracle"
```

### 5. Integrity Check (Optional)
A utility endpoint to validate the implementation status:
```bash
curl http://localhost:8080/oracle/project/changes
```

## Conclusion

We implemented a clean, resilient, and production-ready persistence layer, leveraging native Oracle Autonomous Database features — JSON storage, SQL/JSON queries, and Flyway-managed migrations. The solution delivers transactional consistency, reduces operational surface (a single database for relational data and documents), and keeps the data model simple to evolve.

AI features were not incorporated in this project; they are outside the current scope. The architecture, however, was designed to allow future integrations (e.g., vector indexing or recommendation engines) without needing to restructure the persistence layer.

## Next Steps: Zero Trust Security

In the next article, we will delve into security with the **Zero Trust Security Phase with Vault**. We will demonstrate how to remove sensitive credentials from the source code and manage secrets directly in Oracle's infrastructure.

---

## Resources

For technical depth on the technologies used, see the references below:

- **Quarkus & Hibernate Panache**: [Simplifying Hibernate ORM with Panache](https://quarkus.io/guides/hibernate-orm-panache)
- **Oracle JSON Search**: [SQL/JSON Path Expressions](https://docs.oracle.com/en/database/oracle/oracle-database/23/adjsn/json-path-expressions.html)
- **Flyway Integration in Quarkus**: [Using Flyway in Quarkus](https://quarkus.io/guides/flyway)
- **Oracle Database 26ai (New Features)**: [Oracle Database AI & Vectorial Features](https://www.oracle.com/database/ai/)
- **Project Repository**: [Quarkus-OCI-FreeStack](https://github.com/omatheusmesmo/Quarkus-OCI-FreeStack)
