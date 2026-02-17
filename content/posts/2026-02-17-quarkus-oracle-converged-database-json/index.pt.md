---
title: "SQL ou NoSQL? Por que não ambos? Usando o Banco Convergente da Oracle com Quarkus"
date: 2026-02-17T08:00:00-03:00
draft: false
tags: ["Jornada Oracle FreeStack", "Quarkus", "Oracle Cloud", "JSON", "Hibernate Panache", "Flyway", "Converged Database"]
author: "Matheus Oliveira"
slug: "quarkus-oracle-banco-convergente-json"
summary: "Descubra o poder do banco convergente da Oracle: como persistir e consultar documentos JSON nativos usando Quarkus e Hibernate Panache sem precisar de um banco NoSQL separado."
description: "Neste segundo artigo da série, implementamos um CRUD de artigos com conteúdo flexível (JSON). Mostramos a configuração do Flyway, o uso do PanacheEntity e como o Oracle suporta JSON nativamente."
cover:
  image: "oracle-convergente-json.png"
  alt: "Ilustração no estilo mangá Seinen de alta qualidade do logotipo da Oracle, com pinceladas de tinta carregadas, hachuras pretas profundas e uma aura digital dourada brilhante."
  caption: "O peso do legado Oracle encontra a fluidez dos dados modernos: uma fundação contemplativa desenhada em nanquim para o desenvolvimento convergente."
  relative: true
---

*Este artigo faz parte da série ["Jornada Oracle FreeStack"](https://blog.omatheusmesmo.dev/tags/jornada-oracle-freestack/). No [artigo anterior]({{< ref "posts/2026-02-16-quarkus-connect-oracle-autonomous-db/index.pt.md" >}}), configuramos nossa base e a conexão segura com o Wallet. Se você ainda não tem uma conta na nuvem, comece pela [Etapa 0]({{< ref "posts/2026-02-15-oracle-cloud-free-tier-setup/index.pt.md" >}}).*

Hoje, vamos falar sobre um dos maiores mitos do desenvolvimento moderno: a ideia de que você precisa de bancos de dados diferentes (Polyglot Persistence) para tipos de dados diferentes. 

### O Dilema do Desenvolvedor
Você tem dados estruturados (Usuários, Datas, IDs) e dados flexíveis (Conteúdo de um blog, metadados dinâmicos). A resposta padrão do mercado? 
- "Usa PostgreSQL para o relacional e MongoDB para o JSON."

**Problema:** Agora você tem dois bancos para gerenciar, duas redes, dois sistemas de segurança e zero consistência transacional entre eles.

### A Solução: Banco Convergente (Oracle 26ai)
Com o Oracle Autonomous Database 26ai, tratamos o JSON como um cidadão de primeira classe. Você tem a consistência ACID do SQL com a flexibilidade do NoSQL. O motor 26ai traz otimizações de IA vetorial que, em conjunto com nossos documentos JSON, permitem buscas semânticas poderosas sem sair da base relacional. 

Isso significa que você pode fazer um `JOIN` entre um documento JSON complexo e uma tabela relacional de metadados em uma única query, sem latência de rede entre diferentes serviços de banco de dados.

### 0. Configuração Crítica do Quarkus

Antes de codar, precisamos adicionar as extensões de **Flyway** (para migrações) e **Hibernate Validator** (para validação de dados), além de avisar ao Quarkus para não tentar formatar os campos JSON do banco de dados com os padrões REST.

Você pode adicionar via CLI:

```bash
quarkus extension add flyway hibernate-validator
```

Ou, se preferir, adicione diretamente ao seu `pom.xml`:

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

No arquivo `application.properties`:

```properties
# Impede que o Quarkus force formatos REST no mapeamento do Hibernate
quarkus.hibernate-orm.mapping.format.global=ignore

# DICA BÔNUS: Converte camelCase para snake_case automaticamente (ex: createdAt -> created_at)
quarkus.hibernate-orm.physical-naming-strategy=org.hibernate.boot.model.naming.CamelCaseToUnderscoresNamingStrategy
```

## Implementando o CRUD de Artigos

Para que você possa implementar isso no seu projeto agora mesmo, aqui está a anatomia completa de cada camada, do banco de dados até o endpoint.

### 1. DTOs: Contratos de Entrada e Saída
Sempre comece pelos DTOs. Eles definem o contrato da sua API e protegem suas entidades internas.

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

### 2. A Entidade: Persistência Convergente
A integração com o **Oracle 26ai** é realizada através do mapeamento do `JsonNode` para uma coluna do tipo `json` nativa:

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

> **Dica Bônus Profissional:** Note que não precisamos mais definir `@Column(name = "created_at")`. Graças à configuração do `CamelCaseToUnderscoresNamingStrategy`, o Hibernate faz essa tradução por nós de forma transparente e padronizada. Isso mantém o código limpo e segue as melhores práticas de mercado que poucos desenvolvedores aplicam.

O uso de `PanacheEntity` nos dá uma base sólida com um `id` auto-gerenciado, facilitando a persistência sem necessidade de heranças complexas ou definições repetitivas de chaves primárias. No Oracle, isso se traduz automaticamente em uma `SEQUENCE`, garantindo que a geração de IDs não se torne um gargalo de performance em cenários de alta concorrência.

### 3. Repository: Consultas SQL/JSON Nativas
Embora o HQL esteja evoluindo, o uso de **Native SQL** com a cláusula `PASSING` é a forma mais robusta e performática de injetar parâmetros dentro de expressões SQL/JSON no Oracle, evitando que o banco trate o caminho como uma string literal sem variáveis:

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

### 4. Service: Orquestração e Conversão
A camada de serviço lida com a lógica de negócio e as conversões entre DTOs e Entidades sob uma mesma transação:

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

### 5. Resource: Endpoints REST Reativos
Finalmente, expomos nossa funcionalidade via REST. Note como o código fica extremamente sucinto:

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

### 6. Flyway: Versionamento de Banco de Dados
Não deixe o Hibernate fazer o trabalho sujo em produção. Use migrações:

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

## Testando os Endpoints

Com o ambiente em modo de desenvolvimento (`quarkus:dev`), é possível validar a implementação utilizando os comandos abaixo:

### 1. Criar um Artigo (POST)
```bash
curl -X POST http://localhost:8080/articles 
  -H "Content-Type: application/json" 
  -d '{
    "title": "Meu Artigo Convergente",
    "author": "Matheus",
    "content": {
      "body": "Conteúdo flexível aqui...",
      "tags": ["java", "oracle", "cloud"],
      "metadata": { "views": 0 }
    }
  }'
```

### 2. Listar Artigos (GET)
```bash
curl http://localhost:8080/articles
```

### 3. Buscar por ID (GET)
```bash
# Substitua o 1 pelo ID do artigo criado
curl http://localhost:8080/articles/1

# DICA: Use -i para ver o status 404 em IDs inexistentes
curl -i http://localhost:8080/articles/999
```

### 4. Buscar por Tag no JSON (Search)
```bash
curl "http://localhost:8080/articles/search?tag=oracle"
```

### 5. Verificação de Integridade (Opcional)
Um endpoint utilitário para validar o estado da implementação:
```bash
curl http://localhost:8080/oracle/project/changes
```

## Conclusão

Implementamos uma camada de persistência limpa, resiliente e adequada a produção, aproveitando os recursos nativos do Oracle Autonomous Database — armazenamento JSON, consultas SQL/JSON e migrações gerenciadas por Flyway. A solução entrega consistência transacional, reduz a superfície operacional (um único banco para dados relacionais e documentos) e mantém o modelo de dados simples de evoluir.

Neste projeto não foram incorporadas funcionalidades de IA; isso está fora do escopo atual. A arquitetura, no entanto, foi projetada para permitir integrações futuras (por exemplo, indexação vetorial ou motores de recomendação) sem necessidade de reestruturar a camada de persistência.

## Próximos Passos: Segurança Zero Trust

No próximo artigo, aprofundaremos em segurança com a **Etapa de Segurança Zero Trust com Vault**. Demonstraremos como remover credenciais sensíveis do código-fonte e gerenciar segredos diretamente na infraestrutura da Oracle.

---

## Recursos

Para aprofundamento técnico sobre as tecnologias utilizadas, consulte as referências abaixo:

- **Quarkus & Hibernate Panache**: [Simplifying Hibernate ORM with Panache](https://quarkus.io/guides/hibernate-orm-panache)
- **Oracle JSON Search**: [SQL/JSON Path Expressions](https://docs.oracle.com/en/database/oracle/oracle-database/23/adjsn/json-path-expressions.html)
- **Flyway Integration in Quarkus**: [Using Flyway in Quarkus](https://quarkus.io/guides/flyway)
- **Oracle Database 26ai (New Features)**: [Oracle Database AI & Vectorial Features](https://www.oracle.com/database/ai/)
- **Repositório do Projeto**: [Quarkus-OCI-FreeStack](https://github.com/omatheusmesmo/Quarkus-OCI-FreeStack)
