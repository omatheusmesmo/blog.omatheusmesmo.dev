---
title: "Event-Driven on the Free Tier: OCI Notifications (ONS) as an Event Bus"
date: 2026-06-07T08:00:00-03:00
draft: false
tags: ["Oracle FreeStack Journey", "Quarkus", "OCI Notifications", "ONS", "Event-Driven", "Always Free"]
author: "Matheus Oliveira"
slug: "oci-notifications-event-driven-architecture-quarkus-always-free"
summary: "Discover how to implement Event-Driven Architecture on OCI Always Free using OCI Notifications (ONS). ONS delivers 1M HTTPS notifications/month and 1000 emails/month for free."
description: "Complete guide to Event-Driven Architecture with Quarkus and OCI Notifications (ONS) on Always Free. Learn how to publish typed events, handle the DEFAULT field quirk, and configure the native OCI pub/sub service."
cover:
  image: "oci-ons-event-driven.png"
  alt: "OCI Notifications and Event-Driven Architecture"
  caption: "Event-Driven Architecture on Always Free with OCI Notifications"
  relative: true
---

*This article is part of the ["Oracle FreeStack Journey"](https://blog.omatheusmesmo.dev/en/tags/oracle-freestack-journey/) series. In the [previous article]({{< ref "posts/2026-02-22-quarkus-oci-object-storage/index.en.md" >}}), we solved media storage with OCI Object Storage. Today, we will decouple our application with events using OCI Notifications.*

Continuing our **Oracle FreeStack Journey**, after securing our application with OCI Vault (Phase 3) and managing media storage with Object Storage (Phase 4), we reached a critical point in any modern architecture: decoupling.

In this article, we will transform our backend into an Event-Driven Architecture (EDA) using **OCI Notifications (ONS)** - the native OCI pub/sub service that is **100% Always Free** (1 million HTTPS notifications/month, 1000 emails/month).

## The Scenario

In high-performance systems, we do not want the user to wait for secondary tasks (such as search indexing or image processing) during the article creation process. The backend should persist the data in **Oracle 26ai**, fire an event, and respond immediately. Heavy processing happens asynchronously.

## OCI Notifications: The Free Tier Pub/Sub

OCI Notifications (ONS) is a fully managed pub/sub messaging service. It requires no cluster management or partitions - it uses the same OCI authentication (API Key or Instance Principals) we already configured for the Vault.

For our scenario (notifying systems when an article is created), ONS is more than sufficient - and it costs zero.

## Infrastructure: Provisioning via OCI CLI

All provisioning was done via CLI, without needing the Console.

### 1. Recreate the Autonomous Database (if necessary)

If the previous database was deleted (as happened to us), create a new one via CLI with a single command:

```bash
TENANCY=$(cat ~/.oci/config | grep tenancy | head -1 | cut -d= -f2 | tr -d ' ')

oci db autonomous-database create \
  --compartment-id "$TENANCY" \
  --db-name "FreeStackDB" \
  --display-name "FreeStack-Lab-DB" \
  --admin-password "<STRONG_PASSWORD_HERE>" \
  --db-workload OLTP \
  --data-storage-size-in-tbs 1 \
  --is-free-tier true \
  --license-model LICENSE_INCLUDED \
  --db-version "23ai"
```

Wait for provisioning (approximately 2 minutes):

```bash
ATP_ID="ocid1.autonomousdatabase.oc1.sa-saopaulo-1.xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"

oci db autonomous-database get \
  --autonomous-database-id "$ATP_ID" \
  --query 'data."lifecycle-state"'
```

When it returns `"AVAILABLE"`, update the password in Vault and download the wallet:

```bash
# Update the password in Vault (creates a new secret version)
oci vault secret update-base64 \
  --secret-id "ocid1.vaultsecret.oc1.sa-saopaulo-1.xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" \
  --secret-content-content "$(echo -n '<STRONG_PASSWORD_HERE>' | base64)" \
  --secret-content-stage CURRENT \
  --force

# Download the mTLS wallet
oci db autonomous-database generate-wallet \
  --autonomous-database-id "$ATP_ID" \
  --password "<WALLET_PASSWORD>" \
  --file /tmp/wallet.zip

# Extract to the project
WALLET_DIR="src/main/resources/wallet"
rm -rf "$WALLET_DIR"/*
unzip -o /tmp/wallet.zip -d "$WALLET_DIR"
```

**Important:** After extracting the wallet, fix `sqlnet.ora` with the absolute directory path:

```properties
# Before (does not work):
WALLET_LOCATION = (SOURCE = (METHOD = file) (METHOD_DATA = (DIRECTORY="?/network/admin")))

# After (absolute path for your project):
WALLET_LOCATION = (SOURCE = (METHOD = file) (METHOD_DATA = (DIRECTORY="/absolute/path/to/your/project/src/main/resources/wallet")))
```

### 2. Create the ONS Topic

```bash
oci ons topic create \
  --compartment-id "$TENANCY" \
  --name "articles-events" \
  --description "Article lifecycle events for FreeStack"
```

Result:

```text
"topic-id": "ocid1.onstopic.oc1.sa-saopaulo-1.xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
"lifecycle-state": "ACTIVE"
```

### 3. Add Subscriptions (optional)

To receive email notifications when an article is created:

```bash
oci ons subscription create \
  --compartment-id "$TENANCY" \
  --topic-id "ocid1.onstopic.oc1.sa-saopaulo-1.xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" \
  --protocol "EMAIL" \
  --subscription-endpoint "admin@example.com"
```

ONS supports protocols: `EMAIL`, `HTTPS`, `SLACK`, `PAGERDUTY`, and `ORACLE_FUNCTIONS`.

## Implementation: The Anatomy of the Feature

### 1. Dependency

We added the native ONS SDK:

```xml
<dependency>
  <groupId>com.oracle.oci.sdk</groupId>
  <artifactId>oci-java-sdk-ons</artifactId>
</dependency>
```

The `oci-java-sdk-ons` is already in the OCI SDK BOM (`oci-java-sdk-bom`) we configured in Phase 3.

### 2. The Event Contract (Records)

Instead of using untyped `Map<String, Object>`, we defined Java records to ensure type safety and self-documentation:

```java
package com.freestack.infra.notification;

import java.time.Instant;

public record NotificationEvent(
    String eventType,
    Object data,
    Instant timestamp) {

    public static NotificationEvent of(String eventType, Object data) {
        return new NotificationEvent(eventType, data, Instant.now());
    }
}
```

The domain-specific payload is also a record:

```java
package com.freestack.article.dto;

import java.time.Instant;

public record ArticleEvent(
    Long id,
    String title,
    String author,
    Instant createdAt) {
}
```

### 3. The Notification Service

We created a CDI service that encapsulates communication with OCI Notifications via SDK:

```java
package com.freestack.infra.notification;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import com.oracle.bmc.ConfigFileReader;
import com.oracle.bmc.auth.BasicAuthenticationDetailsProvider;
import com.oracle.bmc.auth.ConfigFileAuthenticationDetailsProvider;
import com.oracle.bmc.auth.InstancePrincipalsAuthenticationDetailsProvider;
import com.oracle.bmc.ons.NotificationDataPlaneClient;
import com.oracle.bmc.ons.model.MessageDetails;
import com.oracle.bmc.ons.requests.PublishMessageRequest;
import com.oracle.bmc.ons.requests.PublishMessageRequest.MessageType;
import jakarta.enterprise.context.ApplicationScoped;
import org.eclipse.microprofile.config.inject.ConfigProperty;
import org.jboss.logging.Logger;

import java.time.Instant;

@ApplicationScoped
public class OciNotificationService {

    private static final Logger LOG = Logger.getLogger(OciNotificationService.class);

    @ConfigProperty(name = "oci.notification.topic-id")
    String topicId;

    @ConfigProperty(name = "oci.auth.instance-principal", defaultValue = "false")
    boolean useInstancePrincipal;

    private final ObjectMapper objectMapper = new ObjectMapper()
            .registerModule(new JavaTimeModule());

    public void publishEvent(NotificationEvent event) {
        LOG.infof("Publishing event [%s] to ONS topic: %s",
            event.eventType(), topicId);

        try (NotificationDataPlaneClient client = createClient()) {
            String eventJson = objectMapper.writeValueAsString(event);

            String jsonBody = objectMapper.writeValueAsString(
                new OnsMessageBody(eventJson));

            MessageDetails messageDetails = MessageDetails.builder()
                .title(event.eventType())
                .body(jsonBody)
                .build();

            PublishMessageRequest request = PublishMessageRequest.builder()
                .topicId(topicId)
                .messageDetails(messageDetails)
                .messageType(MessageType.Json)
                .build();

            client.publishMessage(request);
            LOG.infof("Event [%s] published successfully to ONS",
                event.eventType());

        } catch (Exception e) {
            LOG.errorf("Failed to publish event [%s] to ONS: %s",
                event.eventType(), e.getMessage());
            throw new NotificationPublishException(
                event.eventType(), e);
        }
    }

    private NotificationDataPlaneClient createClient()
            throws Exception {
        BasicAuthenticationDetailsProvider provider;

        if (useInstancePrincipal) {
            LOG.info("ONS Authentication: Instance Principal (Production)");
            provider = InstancePrincipalsAuthenticationDetailsProvider
                .builder().build();
        } else {
            LOG.info("ONS Authentication: Local Config File (Development)");
            ConfigFileReader.ConfigFile configFile =
                ConfigFileReader.parseDefault();
            provider = new ConfigFileAuthenticationDetailsProvider(
                configFile);
        }

        return NotificationDataPlaneClient.builder()
            .build(provider);
    }

    public record OnsMessageBody(String DEFAULT) {
    }

    public static class NotificationPublishException
            extends RuntimeException {
        public NotificationPublishException(String eventType,
                Throwable cause) {
            super("Could not publish event [" + eventType
                + "] to OCI Notifications", cause);
        }
    }
}
```

Key implementation points:

- **`NotificationDataPlaneClient`**: The OCI SDK sync client for the ONS data plane (publishing). The control plane (`NotificationControlPlaneClient`) would be for creating topics and subscriptions - not needed in the application.
- **`MessageType.Json`**: Tells ONS that the body is structured JSON. This allows subscribers to receive a parseable payload.
- **`JavaTimeModule`**: Registers `java.time.Instant` support in the standalone `ObjectMapper`. Quarkus' CDI-managed mapper already has this, but our `ObjectMapper` is created manually for the notification service.
- **`OnsMessageBody`**: Record that encapsulates the `DEFAULT` field required by the ONS API. When using `MessageType.Json`, the body **must** contain a field named `DEFAULT` with the message content. This is an API requirement, not our choice. The field name is literally `DEFAULT` in uppercase.
- **`NotificationPublishException`**: Typed exception instead of a generic `RuntimeException`. Allows the caller to distinguish publish failures from other infrastructure exceptions.
- **Try-with-resources**: The client is created and closed on each publish. In high-volume scenarios, it would be better to maintain a pool or singleton - but for our case (article creation events), the cost is negligible.

### 4. The Updated Service

In `ArticleService`, integrating the typed call to `OciNotificationService`:

```java
@Inject
OciNotificationService notificationService;

@Transactional
public ArticleResponse createArticle(CreateArticleRequest request) {
    Article article = new Article();
    article.title = request.title();
    article.author = request.author();
    article.content = request.content();
    article.createdAt = Instant.now();

    repository.persist(article);

    ArticleEvent articleEvent = new ArticleEvent(
        article.id, article.title, article.author, article.createdAt);

    notificationService.publishEvent(
        NotificationEvent.of("article.created", articleEvent));

    return mapToResponse(article);
}
```

Note the use of typed records: `ArticleEvent` defines the payload contract, and `NotificationEvent.of()` is a factory method that encapsulates the timestamp. The Jackson serializer automatically converts records to JSON. No untyped `Map<String, Object>`, no unsafe casts.

### 5. Configuration (application.properties)

```properties
# OCI Notifications (ONS) Configuration
oci.notification.topic-id=${OCI_NOTIFICATION_TOPIC_ID}
```

And in `.env`:

```bash
OCI_NOTIFICATION_TOPIC_ID=ocid1.onstopic.oc1.sa-saopaulo-1.xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

No credentials, no auth tokens, no passwords. ONS uses the same OCI authentication as the Vault.

### 6. Convention-Based ConfigSource (BONUS)

We took the opportunity in this phase to refactor `OciVaultConfigSource` to be convention-based. Instead of mapping hardcoded properties, now **any** property `X` with an `X_SECRET_OCID` environment variable is automatically resolved from Vault:

```bash
# Example: resolving DB_PASSWORD from Vault
DB_PASSWORD_SECRET_OCID=ocid1.vaultsecret.oc1.xxx...
# Result: DB_PASSWORD becomes available in MicroProfile Config (ordinal 500)
```

This eliminates the need to modify Java code every time a new secret needs to be injected. The convention is self-descriptive and follows the principle of convention over configuration.

## The Connecting Link

The key differentiator of this implementation is **authentication convergence**. ONS shares the same identity provider we already configured for OCI Vault:

- **Local dev**: `~/.oci/config` (API Key)
- **Production**: Instance Principals (no credentials in code)

This means the same OCI identity that retrieves secrets from Vault also publishes events to ONS. Zero new credentials to manage. Zero new secrets to store in Vault. It is exactly the Zero Trust principle applied to messaging.

The `OciNotificationService` class creates its own `NotificationDataPlaneClient` with the same authentication provider as `OciVaultService`. There is no CDI dependency between them - each has its own independent lifecycle, which is correct for infrastructure services that must function even if the CDI container is in a partial state.

## The DEFAULT Field: An ONS API Trap

During E2E testing, we discovered that the ONS API returns a 400 error when using `MessageType.Json`:

```text
Json formatted body must contain a 'DEFAULT' field
```

The message body with `MessageType.Json` is not just any JSON: it needs to follow the ONS template format, where each field represents a delivery protocol. The `DEFAULT` field is the fallback for all protocols that do not have a specific field.

The solution was to encapsulate the event within a record with the `DEFAULT` field:

```java
public record OnsMessageBody(String DEFAULT) {
}
```

This ensures the serialized JSON has the structure expected by the API: `{"DEFAULT": "<event_json>"}`. Subscribers using the HTTPS protocol receive the content of the `DEFAULT` field, while email subscribers receive the `title` as the subject and `DEFAULT` as the body.

This is one of those API quirks you only discover in practice. Official documentation: [PublishMessage API](https://docs.oracle.com/iaas/api/#/en/notification/20181201/NotificationTopic/PublishMessage).

## OCI Notifications: No Cost, No Complexity

OCI Notifications is genuinely Always Free, with generous limits (1M HTTPS notifications/month, 1000 emails/month). For most applications that need simple pub/sub (notifications, webhooks, service decoupling), ONS is the correct architectural choice for the Free Tier.

The lesson here: **before implementing a feature, check the Free Tier service limits**. Architecture should be shaped by available resources, not the other way around.

## Published Event Structure

When an article is created, ONS receives this JSON message:

```json
{
  "DEFAULT": {
    "eventType": "article.created",
    "data": {
      "id": 42,
      "title": "Cloud Native Java",
      "author": "Matheus",
      "createdAt": "2026-06-07T17:00:00Z"
    },
    "timestamp": "2026-06-07T17:00:00.123Z"
  }
}
```

Any subscription (email, HTTPS webhook, Oracle Function) receives the content of the `DEFAULT` field and can react independently.

## Conclusion

Our application is now truly reactive and decoupled - and 100% on the Free Tier. The main backend does what it does best (managing data in the converged database) and delegates the rest of the ecosystem to react to events published in OCI Notifications. No cost, no extra credentials.

In the next article, we will explore **email subscriptions** in ONS, completing the publish-subscribe cycle with real notification delivery.

---

## Resources
- [OCI Notifications Documentation](https://docs.oracle.com/en-us/iaas/Content/Notification/Concepts/notificationoverview.htm)
- [OCI PublishMessage API Reference](https://docs.oracle.com/iaas/api/#/en/notification/20181201/NotificationTopic/PublishMessage)
- [OCI Always Free Resources](https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm)
- [OCI Java SDK - ONS Module](https://docs.oracle.com/en-us/iaas/tools/java/latest/com/oracle/bmc/ons/package-summary.html)
- [Quarkus CDI Reference](https://quarkus.io/guides/cdi-reference)
- [Project Repository](https://github.com/m4th3u5vps/quarkus-oci-freestack)
