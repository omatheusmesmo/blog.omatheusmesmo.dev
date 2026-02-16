---
title: "Quarkus + Oracle Autonomous DB: Building a Secure mTLS Connection"
date: 2026-02-16T08:00:00-03:00
draft: false
tags: ["Oracle FreeStack Journey", "Quarkus", "Oracle Cloud", "Java 21", "OCI", "Autonomous Database", "Cloud Native", "Free Tier", "mTLS"]
author: "Matheus Oliveira"
slug: "quarkus-connect-oracle-autonomous-db-mtls"
summary: "Learn how to connect Quarkus to Oracle Autonomous Database using mTLS Wallet authentication in OCI's Always Free tier."
description: "Technical guide on building a cloud-native backend with Quarkus and Oracle Cloud. Covers setup, Wallet configuration, Health Checks, and REST endpoints."
cover:
  image: "quarkus-oracle-cloud.png"
  alt: "Ink-wash manga style illustration featuring a stone monolith shaped like a cylindrical database, with a glowing golden digital aura representing mTLS connection."
  caption: "Oracle Database's robustness meets Quarkus's agility: a stone-solid foundation for Cloud-Native Java."
  relative: true
---

*This article is part of the ["Oracle FreeStack Journey"](https://blog.omatheusmesmo.dev/en/tags/oracle-freestack-journey/) series. We started in [Phase 0: Oracle Cloud Free Tier: How to Get 24GB RAM and Database Free Forever]({{< ref "posts/2026-02-15-oracle-cloud-free-tier-setup/index.en.md" >}}) preparing our cloud environment.*

The cloud-native era demands applications that start in milliseconds and consume minimal resources. Quarkus, designed specifically for GraalVM and HotSpot, redefines the efficiency of the Java ecosystem. In this article, we will build the foundation of a high-performance backend that connects to **Oracle Autonomous AI Database (26ai)** using **secure mTLS authentication**, taking advantage of the resources in OCI's **Always Free** tier.

## Getting to Work: Creating the Project

The Oracle Autonomous AI Database is the heart of this journey. More than just a managed database, it is a **converged database** that natively supports SQL, JSON documents, spatial data, and now AI Vector Search in a single instance. Let's start by generating our Quarkus project with the necessary extensions for this integration.

### Using Quarkus CLI:
```bash
quarkus create app com.freestack:oracle-freestack-lab \
    --extension="jdbc-oracle,hibernate-orm-panache,resteasy-reactive-jackson,smallrye-health" \
    --java=21 \
    --maven \
    --no-code
```

### Using Maven:
```bash
mvn io.quarkus.platform:quarkus-maven-plugin:3.31.3:create \
    -DprojectGroupId=com.freestack \
    -DprojectArtifactId=oracle-freestack-lab \
    -Dextensions="jdbc-oracle,hibernate-orm-panache,resteasy-reactive-jackson,smallrye-health" \
    -Djava=21 \
    -DnoCode
```

## Why Oracle Autonomous AI Database?

Unlike traditional approaches where you would use **MongoDB for JSON** + **PostgreSQL for SQL** + **Redis for cache**, Oracle's converged database allows you to:

- Store JSON documents natively with SQL queries
- Execute spatial queries without PostGIS
- Perform graph traversals without Neo4j
- All in a **single managed and auto-scaling database** in the Always Free tier

## Step-by-Step: Provisioning your Database in the Cloud

Before coding, we need our engine. OCI's **Always Free** tier is generous: you are entitled to two Autonomous AI Database instances with 20GB each.

### 1. Creating the Autonomous AI Database Instance (26ai)
Access the [OCI console](https://cloud.oracle.com/), go to **Oracle AI Database > Autonomous AI Database** and click on **Create Autonomous AI Database**.

Configure it as follows to ensure there will be no costs:
*   **Always Free:** Turn this switch on! (Make sure the "Always Free" badge appears)
*   **Workload Type:** Transaction Processing (ATP).
*   **Version:** 26ai (take advantage of the new AI vector features).
*   **Credentials:** Keep the `ADMIN` user password safe.
*   **Access:** Select "Secure access from everywhere".

### 2. Downloading and Configuring the Wallet
Oracle DB uses mTLS (Mutual TLS) for security. This requires a **Wallet** file:
1. In your database dashboard, click on **Database Connection**.
2. Click on **Download Wallet**, set a password, and save the `.zip` file.
3. Extract the contents into the `src/main/resources/wallet` folder of your project.

You will see files like `tnsnames.ora` and `cwallet.sso`. They are the security bridge between your Quarkus app and OCI.


## Secure Configuration with Environment Variables

Quarkus adopts a **build-time configuration optimization** approach, which ensures an extremely fast startup. Let's configure our credentials securely using environment variables.

First, create a `.env.example` file as a template:

```bash
# Oracle Autonomous Database Configuration
DB_USERNAME=ADMIN
DB_PASSWORD=your_admin_password_here
DB_SERVICE_NAME=freestackdb_high
# IMPORTANT: Use the absolute path to your extracted wallet
DB_WALLET_PATH=/full/path/to/your/wallet
```

Then, **copy this file to `.env`** and fill it with your real values. Quarkus will automatically read the `.env` file (thanks to dev services and dotenv support) and inject these variables.

Now, configure `application.properties` to read from these environment variables:

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

**Pro Tip:** Using the `${VAR:default}` syntax allows Quarkus to fallback to default values during development while reading from environment variables in production — without needing multiple properties files!


## The Secret to the Connection: The 3 Pillars of Success

Many developers get stuck on the **`ORA-17957: Unable to initialize the key store`** error. This happens because Java, by default, doesn't know how to read Oracle's proprietary `cwallet.sso` format.

To solve this and ensure a robust connection, we apply a solution based on **3 Pillars**:

### 1. Security Injection (Dependencies)

The Java engine (JVM) needs \"extensions\" to understand Oracle's encryption. The JDBC driver alone is not enough for Wallet connections.

**The Solution:** We add the `oraclepki`, `osdt_cert`, and `osdt_core` libraries to `pom.xml`.
**The Trick:** We use specific versions (`23.26.1.0.0` and `21.20.0.0`) available on Maven Central, allowing Java to \"read\" the certificate in the Wallet.

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

### 2. Secret Externalization (.env)

To make the project **production-ready**, we remove passwords and local paths from the code. Quarkus reads the `.env` file at runtime, allowing the same code to run on your PC or in the Cloud without changes.

### 3. The Smart Connection String

We configure the JDBC URL to use `TNS_ADMIN`:
`jdbc:oracle:thin:@${DB_SERVICE_NAME}?TNS_ADMIN=${DB_WALLET_PATH}`

By passing `TNS_ADMIN`, the driver automatically reads the `sqlnet.ora` from your folder, which contains the exact instructions on how to use the Wallet.

## Anatomy of a Secure Connection


Oracle Autonomous AI Database doesn't use simple username/password authentication over the network. Instead, it requires **mutual TLS (mTLS)** using a **Wallet** that contains:

| Component                    | Function in Your Project                                                  |
| ---------------------------- | ------------------------------------------------------------------------- |
| **`cwallet.sso`**            | Contains security credentials and SSL keys.                               |
| **`oraclepki.jar`**          | The \"translator\" that allows Java to open the proprietary `.sso` format. |
| **`tnsnames.ora`**           | The address \"catalog\" that tells the driver where the DB is in the cloud. |
| **`sqlnet.ora`**             | Network instructions that tell the driver to use the Wallet.              |
| **`application.properties`** | The \"maestro\" that links `.env` variables to the JDBC driver.           |

This Wallet approach provides enterprise-level security out of the box, eliminating the need for VPNs or IP whitelisting for development.

## Implementing a Production-Ready Health Check

Observability is native in Quarkus through the SmallRye Health extension. Let's create a **Readiness Check** that automatically validates our database connection:

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

**Why `@Readiness` instead of `@Liveness`?**

In Kubernetes:
- **Liveness probes** determine if the pod should be restarted.
- **Readiness probes** determine if the pod should receive traffic.

Since database connection issues are usually temporary, we use `@Readiness` to allow Kubernetes to stop sending traffic while the issue resolves, without killing the pod.

## Building REST Endpoints for Database Info

Let's create endpoints that demonstrate our Oracle connection. Note that we are using **RESTEasy Reactive** for truly reactive capabilities:

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

## Testing the Application

Start Quarkus in development mode:

```bash
./mvnw quarkus:dev
```

Quarkus will:
- Start in less than 1 second.
- Enable hot reload (change the code and see results instantly).
- Open the Dev UI at `http://localhost:8080/q/dev`.

Test your endpoints:

```bash
# Check database version
curl http://localhost:8080/oracle/version

# Expected response:
{
  "status": "connected",
  "version": "Oracle Database 26ai Enterprise Edition...",
  "message": "Successfully connected to Oracle Autonomous AI Database!"
}

# Check health status
curl http://localhost:8080/q/health/ready

# Expected response:
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

## Conclusion

Adopting Quarkus with Oracle Cloud is a paradigm shift toward true cloud-native architecture. By leveraging:

- **ArC CDI** for build-time dependency injection.
- **Oracle Autonomous AI Database** for converged data management.
- **mTLS Wallet Authentication** for enterprise security.
- **SmallRye Health** for Kubernetes-ready probes.

We've built an application that starts instantly and consumes minimal resources while connecting to a production-grade database.

In this article, we covered project setup, secure configuration, Wallet integration, health checks, and REST endpoints. You now have a solid foundation for building efficient cloud services.

## Next Steps

In the **next phase**, we will explore the true power of Oracle's **Converged Database**:
- Creating hybrid entities (SQL columns + JSON fields).
- Using Hibernate ORM Panache for zero-boilerplate persistence.
- Querying JSON documents with native SQL.
- Implementing full CRUD operations.

If this guide helped you, **share it with your team** to accelerate your cloud-native journey!

---

## Quick Reference

### Key Files Created
- `OracleDatabaseHealthCheck.java` - Readiness probe.
- `OracleInfoResource.java` - REST endpoints.
- `.env.example` - Configuration template.
- `application.properties` - Quarkus configuration.

### Resources
- [Quarkus Guides](https://quarkus.io/guides/)
- [Oracle Autonomous AI Database Docs](https://docs.oracle.com/en/cloud/paas/autonomous-database/)
- [OCI Always Free](https://www.oracle.com/cloud/free/)
- [Project Repository](https://github.com/omatheusmesmo/Quarkus-OCI-FreeStack)
