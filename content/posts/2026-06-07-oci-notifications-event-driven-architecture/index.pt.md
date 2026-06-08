---
title: "Event-Driven no Free Tier: OCI Notifications (ONS) como Barramento de Eventos"
date: 2026-06-07T08:00:00-03:00
draft: false
tags: ["Jornada Oracle FreeStack", "Quarkus", "OCI Notifications", "ONS", "Event-Driven", "Always Free"]
author: "Matheus Oliveira"
slug: "oci-notifications-event-driven-architecture-quarkus-always-free"
summary: "Descubra como implementar Event-Driven Architecture no OCI Always Free usando OCI Notifications (ONS). O ONS entrega 1M de notificacoes HTTPS/mes e 1000 emails/mes de graca."
description: "Guia completo de Event-Driven Architecture com Quarkus e OCI Notifications (ONS) no Always Free. Aprenda como publicar eventos tipados, lidar com o campo DEFAULT da API, e configurar o servico pub/sub nativo da OCI."
cover:
  image: "oci-ons-event-driven.png"
  alt: "OCI Notifications e Event-Driven Architecture"
  caption: "Event-Driven Architecture no Always Free com OCI Notifications"
  relative: true
---

*Este artigo faz parte da serie ["Jornada Oracle FreeStack"](https://blog.omatheusmesmo.dev/tags/jornada-oracle-freestack/). No [artigo anterior]({{< ref "posts/2026-02-22-quarkus-oci-object-storage/index.pt.md" >}}), resolvemos o armazenamento de midia com OCI Object Storage. Hoje, vamos desacoplar nossa aplicacao com eventos usando o OCI Notifications.*

Dando continuidade a nossa **Jornada Oracle FreeStack**, apos garantir a seguranca com o OCI Vault (Phase 3) e o armazenamento de midia com o Object Storage (Phase 4), chegamos a um ponto crucial de qualquer arquitetura moderna: o desacoplamento.

Neste artigo, vamos transformar nosso backend em uma arquitetura orientada a eventos (Event-Driven Architecture - EDA) usando o **OCI Notifications (ONS)** - o servico pub/sub nativo da OCI que e **100% Always Free** (1 milhao de notificacoes HTTPS/mes, 1000 emails/mes).

## O Cenario

Em sistemas de alto desempenho, nao queremos que o usuario espere por tarefas secundarias (como indexacao de busca ou processamento de imagem) durante o processo de criacao de um artigo. O backend deve persistir o dado no **Oracle 26ai**, disparar um evento e responder imediatamente. O processamento pesado acontece de forma assincrona.

## OCI Notifications: O Pub/Sub do Free Tier

O OCI Notifications (ONS) e um servico de mensageria pub/sub totalmente gerenciado. Ele nao exige gerenciamento de clusters ou particoes - usa a mesma autenticacao OCI (API Key ou Instance Principals) que ja configuramos para o Vault.

Para o nosso cenario (notificar sistemas quando um artigo e criado), o ONS e mais do que suficiente - e custa zero.

## Infraestrutura: Provisionando via OCI CLI

Todo o provisionamento foi feito via CLI, sem necessidade de Console.

### 1. Recriar o Autonomous Database (se necessario)

Se o banco anterior foi excluido (como aconteceu conosco), criamos um novo via CLI com um unico comando:

```bash
TENANCY=$(cat ~/.oci/config | grep tenancy | head -1 | cut -d= -f2 | tr -d ' ')

oci db autonomous-database create \
  --compartment-id "$TENANCY" \
  --db-name "FreeStackDB" \
  --display-name "FreeStack-Lab-DB" \
  --admin-password "<SENHA_FORTE_AQUI>" \
  --db-workload OLTP \
  --data-storage-size-in-tbs 1 \
  --is-free-tier true \
  --license-model LICENSE_INCLUDED \
  --db-version "23ai"
```

Aguarde o provisionamento (aproximadamente 2 minutos):

```bash
ATP_ID="ocid1.autonomousdatabase.oc1.sa-saopaulo-1.xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"

oci db autonomous-database get \
  --autonomous-database-id "$ATP_ID" \
  --query 'data."lifecycle-state"'
```

Quando retornar `"AVAILABLE"`, atualize a senha no Vault e baixe o wallet:

```bash
# Atualizar a senha no Vault (cria uma nova versao do segredo)
oci vault secret update-base64 \
  --secret-id "ocid1.vaultsecret.oc1.sa-saopaulo-1.xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" \
  --secret-content-content "$(echo -n '<SENHA_FORTE_AQUI>' | base64)" \
  --secret-content-stage CURRENT \
  --force

# Baixar o wallet mTLS
oci db autonomous-database generate-wallet \
  --autonomous-database-id "$ATP_ID" \
  --password "<WALLET_PASSWORD>" \
  --file /tmp/wallet.zip

# Extrair para o projeto
WALLET_DIR="src/main/resources/wallet"
rm -rf "$WALLET_DIR"/*
unzip -o /tmp/wallet.zip -d "$WALLET_DIR"
```

**Importante:** Apos extrair o wallet, corrija o `sqlnet.ora` com o caminho absoluto do diretorio:

```properties
# Antes (nao funciona):
WALLET_LOCATION = (SOURCE = (METHOD = file) (METHOD_DATA = (DIRECTORY="?/network/admin")))

# Depois (caminho absoluto do seu projeto):
WALLET_LOCATION = (SOURCE = (METHOD = file) (METHOD_DATA = (DIRECTORY="/caminho/absoluto/para/seu/projeto/src/main/resources/wallet")))
```

### 2. Criar o Topic ONS

```bash
oci ons topic create \
  --compartment-id "$TENANCY" \
  --name "articles-events" \
  --description "Article lifecycle events for FreeStack"
```

Resultado:

```text
"topic-id": "ocid1.onstopic.oc1.sa-saopaulo-1.xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
"lifecycle-state": "ACTIVE"
```

### 3. Adicionar Subscriptions (opcional)

Para receber notificacoes por email quando um artigo for criado:

```bash
oci ons subscription create \
  --compartment-id "$TENANCY" \
  --topic-id "ocid1.onstopic.oc1.sa-saopaulo-1.xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" \
  --protocol "EMAIL" \
  --subscription-endpoint "admin@example.com"
```

O ONS suporta protocolos: `EMAIL`, `HTTPS`, `SLACK`, `PAGERDUTY`, e `ORACLE_FUNCTIONS`.

## Implementacao: A Anatomia da Feature

### 1. Dependencia

Adicionamos o SDK nativo do ONS:

```xml
<dependency>
  <groupId>com.oracle.oci.sdk</groupId>
  <artifactId>oci-java-sdk-ons</artifactId>
</dependency>
```

O `oci-java-sdk-ons` ja esta no BOM do OCI SDK (`oci-java-sdk-bom`) que configuramos na Phase 3.

### 2. O Contrato do Evento (Records)

Em vez de usar `Map<String, Object>` sem tipagem, definimos records Java para garantir type safety e autodocumentacao:

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

O payload especifico do dominio tambem e um record:

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

### 3. O Servico de Notificacao

Criamos um servico CDI que encapsula a comunicacao com o OCI Notifications via SDK:

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

Pontos-chave da implementacao:

- **`NotificationDataPlaneClient`**: Cliente sync do OCI SDK para o plano de dados do ONS (publicacao). O plano de controle (`NotificationControlPlaneClient`) seria para criar/topics e subscriptions - nao necessario na aplicacao.
- **`MessageType.Json`**: Indica ao ONS que o body e um JSON estruturado. Isso permite que subscribers recebam o payload parsable.
- **`JavaTimeModule`**: Registra suporte a `java.time.Instant` no `ObjectMapper` standalone. O mapper CDI do Quarkus ja tem isso, mas nosso `ObjectMapper` e criado manualmente para o servico de notificacao.
- **`OnsMessageBody`**: Record que encapsula o campo `DEFAULT` exigido pela API do ONS. Quando usamos `MessageType.Json`, o body **deve** conter um campo chamado `DEFAULT` com o conteudo da mensagem. Este e um requisito da API, nao uma escolha nossa. O nome do campo e literalmente `DEFAULT` em maiusculas.
- **`NotificationPublishException`**: Excecao tipada em vez de `RuntimeException` generica. Permite ao chamador distinguir falhas de publicacao de outras excecoes de infraestrutura.
- **Try-with-resources**: O client e criado e fechado a cada publicacao. Em cenarios de alto volume, seria melhor manter um pool ou singleton - mas para o nosso caso (eventos de criacao de artigo), o custo e insignificante.

### 4. O Service Atualizado

No `ArticleService`, integrando a chamada tipada ao `OciNotificationService`:

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

Note o uso de records tipados: `ArticleEvent` define o contrato do payload, e `NotificationEvent.of()` e uma factory method que encapsula o timestamp. O serializador Jackson converte automaticamente os records em JSON. Nenhum `Map<String, Object>` sem tipagem, nenhum cast inseguro.

### 5. Configuracao (application.properties)

```properties
# OCI Notifications (ONS) Configuration
oci.notification.topic-id=${OCI_NOTIFICATION_TOPIC_ID}
```

E no `.env`:

```bash
OCI_NOTIFICATION_TOPIC_ID=ocid1.onstopic.oc1.sa-saopaulo-1.xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

Sem credenciais, sem auth tokens, sem senhas. O ONS usa a mesma autenticacao OCI que o Vault.

### 6. ConfigSource Convention-Based (BONUS)

Aproveitamos esta phase para refatorar o `OciVaultConfigSource` para ser baseado em convencao. Em vez de mapear propriedades hardcoded, agora **qualquer** propriedade `X` com uma variavel de ambiente `X_SECRET_OCID` e automaticamente resolvida do Vault:

```bash
# Exemplo: resolvendo DB_PASSWORD do Vault
DB_PASSWORD_SECRET_OCID=ocid1.vaultsecret.oc1.xxx...
# Resultado: DB_PASSWORD fica disponivel no MicroProfile Config (ordinal 500)
```

Isso elimina a necessidade de alterar codigo Java cada vez que um novo segredo precisa ser injetado. A convencao e auto-descritiva e segue o principio de convention over configuration.

## O Elo de Ligacao

O diferencial desta implementacao esta na **convergencia de autenticacao**. O ONS compartilha o mesmo provedor de identidade que ja configuramos para o OCI Vault:

- **Dev local**: `~/.oci/config` (API Key)
- **Producao**: Instance Principals (sem credenciais no codigo)

Isso significa que a mesma identidade OCI que recupera segredos do Vault tambem publica eventos no ONS. Zero novas credenciais para gerenciar. Zero novos segredos para armazenar no Vault. E exatamente o principio do Zero Trust aplicado a mensageria.

A classe `OciNotificationService` cria seu proprio `NotificationDataPlaneClient` com o mesmo provedor de autenticacao do `OciVaultService`. Nao ha dependencia CDI entre eles - cada um tem seu ciclo de vida independente, o que e correto para servicos de infraestrutura que devem funcionar mesmo se o container CDI estiver em estado parcial.

## O Campo DEFAULT: Uma Armadilha da API ONS

Durante o E2E test, descobrimos que a API do ONS retorna um erro 400 quando usamos `MessageType.Json`:

```text
Json formatted body must contain a 'DEFAULT' field
```

O body da mensagem com `MessageType.Json` nao e um JSON qualquer: ele precisa seguir o formato de template do ONS, onde cada campo representa um protocolo de entrega. O campo `DEFAULT` e o fallback para todos os protocolos que nao tem um campo especifico.

A solucao foi encapsular o evento dentro de um record com o campo `DEFAULT`:

```java
public record OnsMessageBody(String DEFAULT) {
}
```

Isso garante que o JSON serializado tenha a estrutura esperada pela API: `{"DEFAULT": "<evento_json>"}`. Subscribers que usam protocolo HTTPS recebem o conteudo do campo `DEFAULT`, enquanto subscribers email recebem o `title` como assunto e o `DEFAULT` como corpo.

Esta e uma daquelas peculiaridades de API que so descobrimos na pratica. Documentacao oficial: [PublishMessage API](https://docs.oracle.com/iaas/api/#/en/notification/20181201/NotificationTopic/PublishMessage).

## OCI Notifications: Sem Custo, Sem Complexidade

O OCI Notifications e genuinamente Always Free, com limites generosos (1M notificacoes HTTPS/mes, 1000 emails/mes). Para a maioria das aplicacoes que precisam de pub/sub simples (notificacoes, webhooks, desacoplamento de servicos), o ONS e a escolha arquitetural correta para o Free Tier.

A licao aqui: **antes de implementar uma feature, verifique os service limits do Free Tier**. A arquitetura deve ser moldada pelos recursos disponiveis, nao o contrario.

## Estrutura do Evento Publicado

Quando um artigo e criado, o ONS recebe esta mensagem JSON:

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

Qualquer subscription (email, HTTPS webhook, Oracle Function) recebe o conteudo do campo `DEFAULT` e pode reagir de forma independente.

## Conclusao

Nossa aplicacao agora e verdadeiramente reativa e desacoplada - e 100% no Free Tier. O backend principal faz o que faz de melhor (gerenciar dados no banco convergente) e delega o restante do ecossistema para reagir aos eventos publicados no OCI Notifications. Sem custo, sem credenciais extras.

No proximo artigo, vamos explorar **subscriptions de email** no ONS, completando o ciclo publish-subscribe com entrega real de notificacoes.

---

## Recursos
- [OCI Notifications Documentation](https://docs.oracle.com/en-us/iaas/Content/Notification/Concepts/notificationoverview.htm)
- [OCI PublishMessage API Reference](https://docs.oracle.com/iaas/api/#/en/notification/20181201/NotificationTopic/PublishMessage)
- [OCI Always Free Resources](https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm)
- [OCI Java SDK - ONS Module](https://docs.oracle.com/en-us/iaas/tools/java/latest/com/oracle/bmc/ons/package-summary.html)
- [Quarkus CDI Reference](https://quarkus.io/guides/cdi-reference)
- [Repositorio do Projeto](https://github.com/m4th3u5vps/quarkus-oci-freestack)
