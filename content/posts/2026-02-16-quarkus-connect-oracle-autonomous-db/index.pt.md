---
title: "Quarkus + Oracle Autonomous DB: Criando uma Conexão mTLS Segura"
date: 2026-02-16T08:00:00-03:00
draft: false
tags: ["Jornada Oracle FreeStack", "Quarkus", "Oracle Cloud", "Java 21", "OCI", "Autonomous Database", "Cloud Native", "Free Tier", "mTLS"]
author: "Matheus Oliveira"
slug: "conectar-quarkus-oracle-autonomous-db-mtls"
summary: "Aprenda como conectar o Quarkus ao Oracle Autonomous Database usando autenticação mTLS Wallet no tier gratuito da OCI."
description: "Guia técnico de como construir um backend cloud-native com Quarkus e Oracle Cloud. Cobre setup, configuração de Wallet, Health Checks e endpoints REST."
cover:
  image: "quarkus-oracle-cloud.png"
  alt: "Ilustração em estilo mangá de nanquim mostrando um monolito de pedra em formato de banco de dados cilíndrico com aura dourada."
  caption: "A robustez do Oracle Database encontra a leveza do Quarkus: uma fundação de pedra para o Java Cloud-Native."
  relative: true
---

*Este artigo faz parte da série ["Jornada Oracle FreeStack"](https://blog.omatheusmesmo.dev/tags/jornada-oracle-freestack/). Começamos na [Etapa 0: Oracle Cloud Free Tier: Como Ter 24GB de RAM e Banco de Dados Grátis para Sempre]({{< ref "posts/2026-02-15-oracle-cloud-free-tier-setup/index.pt.md" >}}) preparando nosso ambiente na nuvem.*

A era cloud-native exige aplicações que iniciam em milissegundos e consomem recursos mínimos. O Quarkus, desenhado especificamente para GraalVM e HotSpot, redefine a eficiência do ecossistema Java. Neste artigo, vamos construir a base de um backend de alta performance que se conecta ao **Oracle Autonomous AI Database (26ai)** usando **autenticação mTLS segura**, aproveitando os recursos do **tier Always Free** da OCI.

## Mãos à Obra: Criando o Projeto

O Oracle Autonomous AI Database é o coração desta jornada. Mais do que um banco gerenciado, ele é um **banco convergente** que suporta nativamente SQL, documentos JSON, dados espaciais e agora busca vetorial para IA (AI Vector Search) em uma única instância. Vamos começar gerando nosso projeto Quarkus com as extensões necessárias para essa integração.

### Usando Quarkus CLI:
```bash
quarkus create app com.freestack:oracle-freestack-lab \
    --extension="jdbc-oracle,hibernate-orm-panache,resteasy-reactive-jackson,smallrye-health" \
    --java=21 \
    --maven \
    --no-code
```

### Usando Maven:
```bash
mvn io.quarkus.platform:quarkus-maven-plugin:3.31.3:create \
    -DprojectGroupId=com.freestack \
    -DprojectArtifactId=oracle-freestack-lab \
    -Dextensions="jdbc-oracle,hibernate-orm-panache,resteasy-reactive-jackson,smallrye-health" \
    -Djava=21 \
    -DnoCode
```

## Por Que Oracle Autonomous AI Database?

Diferente de abordagens tradicionais onde você usaria **MongoDB para JSON** + **PostgreSQL para SQL** + **Redis para cache**, o banco convergente da Oracle permite:

- Armazenar documentos JSON nativamente com queries SQL
- Executar consultas espaciais sem PostGIS
- Realizar traversals de grafos sem Neo4j
- Tudo em um **único banco gerenciado e auto-escalável** no tier Always Free

## Passo a Passo: Provisionando seu Banco na Nuvem

Antes de codar, precisamos do nosso motor. O tier **Always Free** da OCI é generoso: você tem direito a duas instâncias de Autonomous AI Database com 20GB cada.

### 1. Criando a Instância Autonomous AI Database (26ai)
Acesse o [console da OCI](https://cloud.oracle.com/), vá em **Oracle AI Database > Autonomous AI Database** e clique em **Create Autonomous AI Database**.

Configure assim para garantir que não haverá custos:
*   **Always Free:** Ligue esta chave! (Certifique-se de que está selecionado)
*   **Workload Type:** Transaction Processing (ATP).
*   **Versão:** 26ai (aproveite as novas features de IA vetorial).
*   **Credenciais:** Guarde bem a senha do usuário `ADMIN`.
*   **Acesso:** Selecione "Secure access from everywhere".

### 2. Baixando e Configurando o Wallet
O Oracle DB usa mTLS (TLS Mútuo) para segurança. Isso exige um arquivo de **Wallet**:
1. No painel do seu banco, clique em **Database Connection**.
2. Clique em **Download Wallet**, defina uma senha e salve o `.zip`.
3. Descompacte o conteúdo na pasta `src/main/resources/wallet` do seu projeto.

Você verá arquivos como `tnsnames.ora` e `cwallet.sso`. Eles são a ponte de segurança entre o seu Quarkus e a OCI.


## Configuração Segura com Variáveis de Ambiente

O Quarkus adota uma abordagem de **otimização de configuração em build-time**, o que garante um arranque extremamente veloz. Vamos configurar nossas credenciais de forma segura usando variáveis de ambiente.

Primeiro, crie um arquivo `.env.example` como template:

```bash
# Oracle Autonomous Database Configuration
DB_USERNAME=ADMIN
DB_PASSWORD=your_admin_password_here
DB_SERVICE_NAME=freestackdb_high
# IMPORTANTE: Use o caminho absoluto para sua wallet descompactada
DB_WALLET_PATH=/caminho/completo/para/sua/wallet
```

Em seguida, **copie este arquivo para `.env`** e preencha com seus valores reais. O Quarkus lerá automaticamente o arquivo `.env` (graças ao suporte a dev services e dotenv) e injetará essas variáveis.

Agora, configure o `application.properties` para ler dessas variáveis de ambiente:

```properties
# Datasource Configuration for Oracle Autonomous AI Database
quarkus.datasource.db-kind=oracle

# Database credentials (loaded from environment variables)
quarkus.datasource.username=${DB_USERNAME:ADMIN}
quarkus.datasource.password=${DB_PASSWORD}

# Oracle Connection String for ATP with mTLS
quarkus.datasource.jdbc.url=jdbc:oracle:thin:@${DB_SERVICE_NAME:freestackdb_high}?TNS_ADMIN=${DB_WALLET_PATH:src/main/resources/wallet}

# Connection Pool Configuration
quarkus.datasource.jdbc.min-size=2
quarkus.datasource.jdbc.max-size=10

# Hibernate ORM Configuration
# quarkus.hibernate-orm.database.generation=none (Deprecated, using none by default with Flyway)
quarkus.hibernate-orm.log.sql=true

# Health Check UI
quarkus.smallrye-health.ui.always-include=true
```

**Dica Pro:** Usar a sintaxe `${VAR:default}` permite que o Quarkus faça fallback para valores padrão durante desenvolvimento enquanto lê de variáveis de ambiente em produção — sem precisar de múltiplos arquivos de propriedades!


## O Segredo da Conexão: Os 3 Pilares do Sucesso

Muitos desenvolvedores travam no erro **`ORA-17957: Unable to initialize the key store`**. Isso acontece porque o Java, por padrão, não sabe ler o formato proprietário `cwallet.sso` da Oracle.

Para resolver isso e garantir uma conexão robusta, aplicamos uma solução baseada em **3 Pilares**:

### 1. Injeção de Segurança (Dependências)

O motor Java (JVM) precisa de "extensões" para entender a criptografia da Oracle. O driver JDBC sozinho não basta para conexões com Wallet.

**A Solução:** Adicionamos as bibliotecas `oraclepki`, `osdt_cert` e `osdt_core` no `pom.xml`.
**O Truque:** Usamos as versões específicas (`23.26.1.0.0` e `21.20.0.0`) disponíveis no Maven Central, permitindo que o Java "leia" o certificado na Wallet.

```xml
<!-- Oracle Wallet Security Dependencies -->
<dependency>
    <groupId>com.oracle.database.security</groupId>
    <artifactId>oraclepki</artifactId>
    <version>23.26.1.0.0</version>
</dependency>
<dependency>
    <groupId>com.oracle.database.security</groupId>
    <artifactId>osdt_cert</artifactId>
    <version>21.20.0.0</version>
</dependency>
<dependency>
    <groupId>com.oracle.database.security</groupId>
    <artifactId>osdt_core</artifactId>
    <version>21.20.0.0</version>
</dependency>
```

### 2. Externalização de Segredos (.env)

Para tornar o projeto **seguro para produção**, removemos senhas e caminhos locais do código. O Quarkus lê o arquivo `.env` em tempo de execução, permitindo que o mesmo código rode no seu PC ou na Cloud sem alterações.

### 3. A String de Conexão Inteligente

Configuramos a URL JDBC para usar o `TNS_ADMIN`:
`jdbc:oracle:thin:@${DB_SERVICE_NAME}?TNS_ADMIN=${DB_WALLET_PATH}`

Ao passar o `TNS_ADMIN`, o driver lê automaticamente o `sqlnet.ora` da sua pasta, que contém as instruções exatas de como usar a Wallet.

## Anatomia da Conexão Segura


O Oracle Autonomous AI Database não usa autenticação simples de usuário/senha pela rede. Ao invés disso, ele requer **TLS mútuo (mTLS)** usando um **Wallet** que contém:

| Componente                   | Função no Teu Projeto                                                   |
| ---------------------------- | ----------------------------------------------------------------------- |
| **`cwallet.sso`**            | Contém as credenciais de segurança e chaves SSL.                        |
| **`oraclepki.jar`**          | O "tradutor" que permite ao Java abrir o formato proprietário `.sso`.   |
| **`tnsnames.ora`**           | O "catálogo" de endereços que diz ao driver onde o banco está na nuvem. |
| **`sqlnet.ora`**             | Instruções de rede que dizem ao driver para usar o Wallet.              |
| **`application.properties`** | O "maestro" que liga as variáveis do `.env` ao driver JDBC.             |

Essa abordagem de Wallet fornece segurança de nível empresarial out of the box, eliminando a necessidade de VPNs ou whitelisting de IPs para desenvolvimento.

## Implementando um Health Check Pronto para Produção

A observabilidade é nativa no Quarkus através da extensão SmallRye Health. Vamos criar um **Readiness Check** que valida nossa conexão com o banco de dados de forma automática:

```java
// OracleDatabaseHealthCheck.java
@Readiness
@ApplicationScoped
public class OracleDatabaseHealthCheck implements HealthCheck {

    @Inject
    DataSource dataSource;

    @Override
    public HealthCheckResponse call() {
        HealthCheckResponseBuilder responseBuilder = 
            HealthCheckResponse.named("Oracle Database Connection");

        try (Connection connection = dataSource.getConnection();
             PreparedStatement statement = connection.prepareStatement(
                 "SELECT BANNER FROM V$VERSION WHERE ROWNUM = 1");
             ResultSet resultSet = statement.executeQuery()) {

            if (resultSet.next()) {
                String oracleVersion = resultSet.getString(1);
                
                return responseBuilder
                    .up()
                    .withData("version", oracleVersion)
                    .withData("connection", "active")
                    .withData("database", "Oracle Autonomous AI Database")
                    .build();
            }

        } catch (Exception e) {
            return responseBuilder
                .down()
                .withData("error", e.getMessage())
                .build();
        }

        return responseBuilder.down().build();
    }
}
```

**Por que `@Readiness` ao invés de `@Liveness`?**

No Kubernetes:
- **Liveness probes** determinam se o pod deve ser reiniciado
- **Readiness probes** determinam se o pod deve receber tráfego

Como problemas de conexão com banco geralmente são temporários, usamos `@Readiness` para permitir que o Kubernetes pare de enviar tráfego enquanto o problema se resolve, sem matar o pod.

## Construindo Endpoints REST para Informações do Banco

Vamos criar endpoints que demonstrem nossa conexão Oracle. Note que estamos usando **RESTEasy Reactive** para capacidades verdadeiramente reativas:

```java
// OracleInfoResource.java
@Path("/oracle")
public class OracleInfoResource {

    @Inject
    DataSource dataSource;

    @GET
    @Path("/version")
    @Produces(MediaType.APPLICATION_JSON)
    public Map<String, String> getDatabaseVersion() {
        Map<String, String> response = new HashMap<>();
        
        try (Connection connection = dataSource.getConnection();
             PreparedStatement statement = connection.prepareStatement(
                 "SELECT BANNER FROM V$VERSION WHERE ROWNUM = 1");
             ResultSet resultSet = statement.executeQuery()) {

            if (resultSet.next()) {
                response.put("status", "connected");
                response.put("version", resultSet.getString(1));
                response.put("message", "Successfully connected to Oracle Autonomous AI Database!");
            }

        } catch (Exception e) {
            response.put("status", "error");
            response.put("error", e.getMessage());
        }

        return response;
    }

    @GET
    @Path("/info")
    @Produces(MediaType.APPLICATION_JSON)
    public Map<String, Object> getDatabaseInfo() {
        Map<String, Object> response = new HashMap<>();
        
        try (Connection connection = dataSource.getConnection()) {

            // Get database version
            try (PreparedStatement psVersion = connection.prepareStatement(
                    "SELECT BANNER FROM V$VERSION WHERE ROWNUM = 1");
                 ResultSet rsVersion = psVersion.executeQuery()) {
                if (rsVersion.next()) {
                    response.put("version", rsVersion.getString(1));
                }
            }

            // Get instance name
            try (PreparedStatement psInstance = connection.prepareStatement(
                    "SELECT INSTANCE_NAME FROM V$INSTANCE");
                 ResultSet rsInstance = psInstance.executeQuery()) {
                if (rsInstance.next()) {
                    response.put("instanceName", rsInstance.getString(1));
                }
            }

            // Get database name
            try (PreparedStatement psDbName = connection.prepareStatement(
                    "SELECT NAME FROM V$DATABASE");
                 ResultSet rsDbName = psDbName.executeQuery()) {
                if (rsDbName.next()) {
                    response.put("databaseName", rsDbName.getString(1));
                }
            }

            response.put("status", "connected");
            response.put("message", "Oracle Autonomous AI Database - Always Free Tier");

        } catch (Exception e) {
            response.put("status", "error");
            response.put("error", e.getMessage());
        }

        return response;
    }
}
```

## Testando a Aplicação

Inicie o Quarkus em modo de desenvolvimento:

```bash
./mvnw quarkus:dev
```

O Quarkus irá:
- Iniciar em menos de 1 segundo
- Habilitar hot reload (mude o código e veja resultados instantaneamente)
- Abrir a Dev UI em `http://localhost:8080/q/dev`

Teste seus endpoints:

```bash
# Verificar versão do banco
curl http://localhost:8080/oracle/version

# Resposta esperada:
{
  "status": "connected",
  "version": "Oracle Database 26ai Enterprise Edition...",
  "message": "Successfully connected to Oracle Autonomous AI Database!"
}

# Verificar status de saúde
curl http://localhost:8080/q/health/ready

# Resposta esperada:
{
  "status": "UP",
  "checks": [
    {
      "name": "Oracle Database Connection",
      "status": "UP",
      "data": {
        "version": "Oracle Database 26ai...",
        "connection": "active",
        "database": "Oracle Autonomous AI Database"
      }
    }
  ]
}
```
---

## Conclusão

Adotar o Quarkus com o Oracle Cloud é uma mudança de paradigma em direção à verdadeira arquitetura cloud-native. Ao aproveitar:

- **ArC CDI** para injeção de dependência em build-time
- **Oracle Autonomous AI Database** para gestão convergente de dados
- **Autenticação mTLS Wallet** para segurança empresarial
- **SmallRye Health** para probes prontas para Kubernetes

Construímos uma aplicação que inicia instantaneamente e consome recursos mínimos enquanto conecta a um banco de dados de nível produção.

Neste artigo, cobrimos setup do projeto, configuração segura, integração do Wallet, health checks e endpoints REST. Você agora tem uma base sólida para construir serviços cloud eficientes.

## Próximos Passos

Na **próxima fase**, vamos explorar o verdadeiro poder do **Banco Convergente** da Oracle:
- Criar entidades híbridas (colunas SQL + campos JSON)
- Usar Hibernate ORM Panache para persistência zero-boilerplate
- Consultar documentos JSON com SQL nativo
- Implementar operações CRUD completas

Se este guia te ajudou, **compartilhe com seu time** para acelerar sua jornada cloud-native!

---

## Referência Rápida

### Arquivos-Chave Criados
- `OracleDatabaseHealthCheck.java` - Probe de readiness
- `OracleInfoResource.java` - Endpoints REST
- `.env.example` - Template de configuração
- `application.properties` - Configuração Quarkus

### Recursos
- [Quarkus Guides](https://quarkus.io/guides/)
- [Oracle Autonomous AI Database Docs](https://docs.oracle.com/en/cloud/paas/autonomous-database/)
- [OCI Always Free](https://www.oracle.com/cloud/free/)
- [Repositório do Projeto](https://github.com/omatheusmesmo/Quarkus-OCI-FreeStack)
