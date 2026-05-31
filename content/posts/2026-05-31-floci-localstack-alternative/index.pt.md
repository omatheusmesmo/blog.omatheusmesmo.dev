---
title: "Floci: a alternativa gratuita e drop-in ao LocalStack, feita com Quarkus"
date: 2026-05-31T10:00:00-03:00
draft: false
tags: ["Floci", "LocalStack", "AWS", "Quarkus", "Java", "Dev Services", "Testcontainers", "DynamoDB", "S3", "SQS", "Lambda", "Docker", "Native Image", "Desenvolvimento Local", "CI", "Cloud"]
author: "Matheus Oliveira"
slug: "floci-alternativa-localstack"
summary: "A edição Community do LocalStack congelou em março de 2026 e agora pede auth token. O Floci é a alternativa sem amarras: um emulador AWS local, gratuito, MIT e nativo em Quarkus. Testei de verdade: AWS CLI, uma Lambda real, duas formas de conectar um app Quarkus (Dev Services e Testcontainers) e a migração do LocalStack."
description: "Guia prático do Floci, a alternativa gratuita e open source ao LocalStack, feita com Quarkus. Rode AWS localmente com docker compose, use S3, DynamoDB, SQS e Lambda pela CLI, conecte um app Quarkus de duas formas (o provider floci dos Dev Services do amazon-services e o módulo Testcontainers do Floci) e migre do LocalStack no nível de imagem e de Dev Services."
cover:
  image: "floci-localstack-cover.png"
  alt: "Pixel art SNES 16-bit de um céu com uma nuvem de pipoca (floccus) chovendo ícones de serviços AWS (S3, DynamoDB, Lambda) sobre um notebook pixelado, neon FLOCI no alto"
  caption: "Floccus, a nuvem de pipoca: o Floci chovendo AWS local na sua máquina"
  relative: true
---

Por anos, rodar AWS no seu notebook significava uma ferramenta só: o LocalStack. Então, em [março de 2026, a edição Community do LocalStack foi efetivamente descontinuada](https://blog.localstack.cloud/the-road-ahead-for-localstack/). Agora ela exige um auth token para rodar, e as atualizações de segurança estão congeladas. Para uma ferramenta que vive no seu `docker-compose.yml` e no seu pipeline de CI, "faça login para continuar usando o tier gratuito" é difícil de engolir.

É essa lacuna que o [Floci](https://floci.io/) quer preencher. Ele é um emulador AWS local, gratuito, open source e licenciado sob MIT. Sem conta, sem auth token, sem feature gates. Apenas `docker compose up`. E tem um detalhe que o torna especialmente interessante para quem lê este blog: o Floci é feito com **Quarkus**, e é exatamente por isso que ele sobe em milissegundos e fica ocioso consumindo poucos megabytes de RAM. Em uma das minhas execuções o binário nativo registrou `started in 0.033s`.

Neste artigo eu não vou só ler o marketing. Vou rodar o Floci de verdade: usar S3, DynamoDB, SQS e uma Lambda real pela AWS CLI, depois conectar uma aplicação Quarkus a ele de **duas formas** (o provider Floci dos Dev Services do `quarkus-amazon-services` e o módulo Testcontainers do Floci) e, por fim, migrar uma configuração de LocalStack nos níveis de imagem e de Dev Services. Cada comando, config e saída abaixo foi executado no ambiente do box.

> **Testado em**
> Java 25 (OpenJDK 25.0.2) · Maven 3.9.14 · Quarkus 3.36.0 (quarkus-amazon-services 3.19.0) · Testcontainers 2.0.5 · Docker 29.4.1 · Floci 1.5.20 (community)

---

## 1. O que é o Floci?

O Floci entrega serviços com a "cara" da AWS na sua máquina, sem conta na nuvem. Você aponta seu AWS SDK, CLI, Terraform, CDK ou suíte de testes para `http://localhost:4566` e mantém seu fluxo de trabalho. Qualquer região funciona, e as credenciais podem ser quaisquer valores não vazios.

O nome vem de [floccus](https://en.wikipedia.org/wiki/Cirrocumulus_floccus), uma nuvem que se forma em pequenos tufos fofos (literalmente "um tufo de lã"), que o próprio projeto Floci compara a pipoca. Leve, fofa e gratuita.

Veja como ele se compara ao LocalStack Community, usando os números publicados pelo projeto Floci:

| Capacidade | Floci | LocalStack Community |
| :--- | :---: | :---: |
| Exige auth token | Não | Sim |
| Atualizações de segurança | Sim | Congeladas |
| Tempo de startup | ~24 ms | ~3,3 s |
| Memória ociosa | ~13 MiB | ~143 MiB |
| Tamanho da imagem Docker | ~90 MB | ~1,0 GB |
| Licença | MIT | Restrita |
| API Gateway v2 / HTTP API | Sim | Não |
| Cognito | Sim | Não |
| RDS, ElastiCache, MSK | Docker real | Não |

Esse tempo de startup e essa pegada de memória ociosa não são acidente. São o que você obtém quando o próprio emulador é uma aplicação Quarkus compilada para imagem nativa. As mesmas propriedades que fazem do Quarkus um ótimo encaixe para serverless tornam o Floci prático de subir e derrubar a cada execução de CI.

O Floci cobre cerca de 52 serviços AWS. Os serviços onde a fidelidade realmente importa (Lambda, RDS, ElastiCache, MSK, ECS, EC2, EKS, OpenSearch) rodam em **containers Docker reais**, em vez de mocks rasos. O resto roda in-process.

---

## 2. Subindo em 30 segundos

A forma mais simples de rodar o Floci é com Docker Compose. Crie um `compose.yaml`:

```yaml
services:
  floci:
    image: floci/floci:latest
    ports:
      - "4566:4566"
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
```

```bash
docker compose up
```

O mount do socket do Docker só é necessário para os serviços baseados em Docker (Lambda, RDS e cia.). Se você só precisa de S3, DynamoDB ou SQS, pode removê-lo.

Agora aponte seu ambiente AWS para o endpoint local. As credenciais não são validadas, então qualquer valor não vazio funciona:

```bash
export AWS_ENDPOINT_URL=http://localhost:4566
export AWS_DEFAULT_REGION=us-east-1
export AWS_ACCESS_KEY_ID=test
export AWS_SECRET_ACCESS_KEY=test
```

Pronto. O Floci já está respondendo chamadas da API da AWS na porta `4566`.

Se você preferir não escrever um arquivo compose, a [Floci CLI](https://github.com/floci-io/floci-cli) do projeto faz os mesmos dois passos: `floci start` para subir o emulador e `eval $(floci env)` para exportar essas variáveis pra você.

Nada disso é específico de Java. É só o padrão de endpoint + credenciais da AWS, então o mesmo setup serve para qualquer SDK ou ferramenta: boto3, os SDKs de JavaScript e Go, a AWS CLI, Terraform, OpenTofu, CDK. O projeto sustenta essa abrangência com cerca de 1.968 testes de compatibilidade automatizados nos seus SDKs e integrações de IaC (Java, Node, Python, Go, Rust, a AWS CLI, Terraform, OpenTofu e CDK). As seções de Quarkus abaixo são o aprofundamento simplesmente porque é o foco deste blog.

---

## 3. Usando a AWS pela CLI

Vou exercitar os três serviços que quase todo projeto encosta: S3, DynamoDB e SQS. Eles rodam in-process, então nenhum container extra é baixado.

### S3

```bash
aws s3 mb s3://my-bucket
echo "hello from floci" > demo.txt
aws s3 cp demo.txt s3://my-bucket/demo.txt
aws s3 ls s3://my-bucket
```

```text
make_bucket: my-bucket
upload: ./demo.txt to s3://my-bucket/demo.txt
2026-05-31 02:42:29         17 demo.txt
```

### DynamoDB

```bash
aws dynamodb create-table \
  --table-name orders \
  --attribute-definitions AttributeName=pk,AttributeType=S \
  --key-schema AttributeName=pk,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST

aws dynamodb put-item --table-name orders \
  --item '{"pk":{"S":"order-1"},"total":{"N":"42"},"customer":{"S":"matheus"}}'

aws dynamodb get-item --table-name orders --key '{"pk":{"S":"order-1"}}'
```

```json
{
    "Item": {
        "pk": { "S": "order-1" },
        "total": { "N": "42" },
        "customer": { "S": "matheus" }
    }
}
```

### SQS

```bash
QURL=$(aws sqs create-queue --queue-name demo-queue --query QueueUrl --output text)
aws sqs send-message --queue-url "$QURL" --message-body 'hello from floci'
aws sqs receive-message --queue-url "$QURL" --query 'Messages[0].Body'
```

```text
http://localhost:4566/000000000000/demo-queue
"hello from floci"
```

Os mesmos comandos que você já roda contra a AWS, com as mesmas estruturas nas respostas. Nada no seu ferramental muda.

---

## 4. Uma Lambda real, num container real

Os exemplos de CLI até aqui batem em serviços in-process. A Lambda é diferente: o Floci roda sua função num **container Docker real** baseado na imagem oficial de runtime da AWS, então o modelo de execução bate com produção. Como o artigo inteiro é sobre uma ferramenta Quarkus nativa, vou fazer deploy de uma função Quarkus nativa nele. Você poderia usar qualquer runtime suportado (Python, Node, Go); uso Quarkus porque é o tema deste blog.

Faça o scaffold de uma Lambda com a CLI do Quarkus:

```bash
quarkus create app dev.omatheusmesmo:hello-floci-lambda \
  --extension=io.quarkus:quarkus-amazon-lambda
```

O handler é um bean que implementa `RequestHandler`:

```java
public class GreetingLambda implements RequestHandler<Map<String, String>, Map<String, String>> {

    @Override
    public Map<String, String> handleRequest(Map<String, String> event, Context context) {
        String name = event.getOrDefault("name", "world");
        return Map.of("message", "hello " + name + " from floci lambda");
    }
}
```

Compile um executável nativo. No Quarkus 3.36 a imagem builder Mandrel padrão é JDK 25, então é um build nativo Java 25 sem precisar instalar GraalVM:

```bash
mvn package -Dnative -Dquarkus.native.container-build=true
```

Isso produz `target/function.zip`, que contém um único binário nativo `bootstrap`. Faça o deploy no runtime customizado `provided.al2023`:

```bash
aws lambda create-function \
  --function-name hello-floci \
  --runtime provided.al2023 \
  --handler bootstrap \
  --role arn:aws:iam::000000000000:role/lambda-role \
  --zip-file fileb://target/function.zip \
  --timeout 30
# { "FunctionName": "hello-floci", "State": "Active", "Runtime": "provided.al2023" }
```

Dois pontos. O ARN do role IAM pode ser qualquer coisa; o Floci não o valida. E o handler é `bootstrap`: na AWS real o handler é ignorado para runtimes `provided`, mas o Floci o valida contra um arquivo do zip, e o zip contém exatamente um arquivo chamado `bootstrap`.

Invoque (o AWS CLI v2 quer `--cli-binary-format raw-in-base64-out` para um payload inline):

```bash
aws lambda invoke --function-name hello-floci \
  --cli-binary-format raw-in-base64-out \
  --payload '{"name":"matheus"}' out.json

cat out.json
# {"message":"hello matheus from floci lambda"}
```

A primeira invocação baixa a imagem de runtime, então é mais lenta; chamadas seguintes reaproveitam um pool de containers quentes. Ir pro nativo também é o que permite rodar **Java 25** na Lambda: o runtime Java gerenciado vai só até `java21`, então um binário nativo no `provided.al2023` é a forma idiomática de entregar a versão mais nova da linguagem, com cold start baixo de brinde. Esse é o tipo de fidelidade que mocks rasos não oferecem, e é por isso que o Floci recorre ao Docker nos serviços que importam.

---

## 5. Conectando uma aplicação Quarkus ao Floci

A CLI é boa para um smoke test, mas o valor real é sua aplicação falando com o Floci durante o desenvolvimento e os testes. Vou construir um pequeno serviço de pedidos: um endpoint REST que grava um pedido no DynamoDB e escreve um recibo no S3.

Faça o scaffold com a CLI do Quarkus:

```bash
quarkus create app dev.omatheusmesmo:floci-quarkus-demo \
  --extension=rest-jackson,amazon-s3,amazon-dynamodb
```

As extensões do AWS SDK v2 precisam de um cliente HTTP síncrono, então adicione o URL connection client ao seu `pom.xml`:

```xml
<dependency>
    <groupId>software.amazon.awssdk</groupId>
    <artifactId>url-connection-client</artifactId>
</dependency>
```

### O código da aplicação

Um pequeno record `Order` e um serviço que grava nos dois stores ao salvar e depois lê de volta do DynamoDB:

```java
public record Order(String id, String customer, double total) {
}
```

```java
@ApplicationScoped
public class OrderService {

    private final DynamoDbClient dynamo;
    private final S3Client s3;
    private final String table;
    private final String bucket;

    public OrderService(DynamoDbClient dynamo, S3Client s3,
                        @ConfigProperty(name = "floci.table") String table,
                        @ConfigProperty(name = "floci.bucket") String bucket) {
        this.dynamo = dynamo;
        this.s3 = s3;
        this.table = table;
        this.bucket = bucket;
    }

    public void save(Order order) {
        dynamo.putItem(b -> b
                .tableName(table)
                .item(Map.of(
                        "pk", AttributeValue.fromS(order.id()),
                        "customer", AttributeValue.fromS(order.customer()),
                        "total", AttributeValue.fromN(Double.toString(order.total())))));

        s3.putObject(
                b -> b.bucket(bucket).key(order.id() + ".txt"),
                RequestBody.fromString("Receipt for order " + order.id()
                        + " - customer " + order.customer()
                        + " - total " + order.total()));
    }

    public Order find(String id) {
        Map<String, AttributeValue> item = dynamo.getItem(b -> b
                .tableName(table)
                .key(Map.of("pk", AttributeValue.fromS(id)))).item();

        if (item == null || item.isEmpty()) {
            return null;
        }
        return new Order(
                item.get("pk").s(),
                item.get("customer").s(),
                Double.parseDouble(item.get("total").n()));
    }
}
```

Um bean `Bootstrap` cria a tabela e o bucket no startup, deixando o app autossuficiente:

```java
@ApplicationScoped
public class Bootstrap {

    private final DynamoDbClient dynamo;
    private final S3Client s3;
    private final String table;
    private final String bucket;

    public Bootstrap(DynamoDbClient dynamo, S3Client s3,
                     @ConfigProperty(name = "floci.table") String table,
                     @ConfigProperty(name = "floci.bucket") String bucket) {
        this.dynamo = dynamo;
        this.s3 = s3;
        this.table = table;
        this.bucket = bucket;
    }

    void onStart(@Observes StartupEvent event) {
        try {
            dynamo.createTable(b -> b
                    .tableName(table)
                    .billingMode(BillingMode.PAY_PER_REQUEST)
                    .attributeDefinitions(a -> a.attributeName("pk").attributeType(ScalarAttributeType.S))
                    .keySchema(k -> k.attributeName("pk").keyType(KeyType.HASH)));
        } catch (ResourceInUseException jaExiste) {
        }
        try {
            s3.createBucket(b -> b.bucket(bucket));
        } catch (BucketAlreadyOwnedByYouException jaExiste) {
        }
    }
}
```

E um recurso REST enxuto. O idiomático no Quarkus REST é retornar o payload direto e deixar `@ResponseStatus` e exceções definirem o código de status, em vez de montar objetos `Response` na mão:

```java
@Path("/orders")
public class OrderResource {

    private final OrderService service;

    public OrderResource(OrderService service) {
        this.service = service;
    }

    @POST
    @ResponseStatus(201)
    public Order create(Order order) {
        service.save(order);
        return order;
    }

    @GET
    @Path("/{id}")
    public Order get(@PathParam("id") String id) {
        Order order = service.find(id);
        if (order == null) {
            throw new NotFoundException();
        }
        return order;
    }
}
```

Agora há duas formas de dar a esse app um Floci para conversar. Escolha uma por módulo (rodar as duas ao mesmo tempo sobe dois Floci e o app pode falar com o errado).

### Abordagem A: Dev Services (o jeito de uma linha)

Esse é o caminho mais limpo se você usa as extensões `quarkus-amazon-services`. Desde a versão **3.18.0**, a extensão traz um **provider Floci** nativo para os Dev Services, então você não configura endpoint nenhum: o Quarkus sobe o Floci pra você em dev e test, e conecta os clients nele. A plataforma Quarkus 3.36 empacota o amazon-services 3.19.0, então isso funciona de imediato na 3.36.

O `application.properties` inteiro:

```properties
floci.bucket=order-receipts
floci.table=orders

quarkus.s3.path-style-access=true
quarkus.s3.sync-client.type=url
quarkus.dynamodb.sync-client.type=url

quarkus.aws.devservices.provider=floci
quarkus.aws.devservices.floci.image-name=floci/floci:latest-compat
quarkus.aws.devservices.floci.init-scripts-folder=src/main/resources/floci-init
quarkus.aws.devservices.floci.init-completion-msg=floci-init-complete
```

Sem `endpoint-override`, sem credenciais estáticas, sem profiles. Dois pontos: `quarkus.s3.path-style-access=true` é obrigatório para o S3 contra um endpoint local (o endereçamento de bucket no estilo virtual-host, tipo `my-bucket.localhost`, não resolve), e o sync client `url` é o cliente HTTP leve que adicionei acima.

O `init-scripts-folder` é um hook de seeding no estilo LocalStack. O Floci o monta em `/etc/floci/init/start.d` e roda os scripts depois que o servidor HTTP sobe. A imagem `latest-compat` (não a `latest` pura) é a que traz o AWS CLI, o `awslocal` e o boto3 para os scripts usarem. O `src/main/resources/floci-init/01-init.sh`:

```bash
#!/bin/bash
export AWS_ACCESS_KEY_ID=test
export AWS_SECRET_ACCESS_KEY=test
export AWS_DEFAULT_REGION=us-east-1
aws --endpoint-url http://localhost:4566 s3 mb s3://init-bucket
echo "floci-init-complete"
```

O `init-completion-msg` faz o Floci esperar por essa linha-marcador antes de se reportar pronto, então o provisionamento nunca corre com a sua primeira chamada. É opcional (os hooks de `start.d` terminaram antes da prontidão nas minhas execuções), mas é um seguro barato.

Rode `quarkus dev` e o Floci sobe sozinho:

```text
Dev Services (amazon-floci) for Amazon Services started for services: dynamodb, s3.
floci-quarkus-demo 1.0.0-SNAPSHOT on JVM (powered by Quarkus 3.36.0) started in 12.111s. Listening on: http://localhost:8888
Installed features: [amazon-sdk-dynamodb, amazon-sdk-s3, cdi, compose, rest, rest-jackson, ...]
```

```bash
curl -X POST http://localhost:8888/orders \
  -H 'Content-Type: application/json' \
  -d '{"id":"order-99","customer":"matheus","total":250.0}'
# {"id":"order-99","customer":"matheus","total":250.0}  [HTTP 201]

curl http://localhost:8888/orders/order-99
# {"id":"order-99","customer":"matheus","total":250.0}  [HTTP 200]
```

Os testes não precisam de fiação extra. Um `@QuarkusTest` comum roda contra o Floci provisionado automaticamente, e você pode comprovar que o init script rodou checando o bucket que ele criou:

```java
@QuarkusTest
class DevServicesInitScriptsTest {

    @Inject
    S3Client s3;

    @Test
    void initScriptShouldHaveCreatedBucket() {
        boolean exists = s3.listBuckets().buckets().stream()
                .anyMatch(b -> b.name().equals("init-bucket"));
        assertTrue(exists, "bucket created by the Floci init script should exist");
    }
}
```

```text
Dev Services (amazon-floci) for Amazon Services started for services: dynamodb, s3.
Tests run: 3, Failures: 0, Errors: 0, Skipped: 0
BUILD SUCCESS
```

> **Pegadinha que vale saber.** A ideia óbvia é manter `provider=localstack` (o default) e só apontar `quarkus.aws.devservices.localstack.image-name` para uma imagem do Floci. Não funciona. O Dev Service do LocalStack passa pelo `LocalStackContainer` do Testcontainers, que sobrescreve o entrypoint da imagem com um bootstrap específico do LocalStack. O entrypoint do Floci então roda sem o próprio comando e o container sai na hora, te deixando com um enganoso "Wait strategy failed. Container exited with code 0". Use `provider=floci`, que usa o container e o entrypoint do próprio Floci.

### Abordagem B: apontar para um Floci que você sobe, mais o módulo Testcontainers

Se você não está nas extensões amazon-services, ou quer controle explícito (por exemplo apontando para um Floci de longa duração, ou um iniciado pela CLI), configure o endpoint direto:

```properties
quarkus.s3.endpoint-override=http://localhost:4566
quarkus.s3.aws.region=us-east-1
quarkus.s3.aws.credentials.type=static
quarkus.s3.aws.credentials.static-provider.access-key-id=test
quarkus.s3.aws.credentials.static-provider.secret-access-key=test
quarkus.s3.path-style-access=true
quarkus.s3.sync-client.type=url

quarkus.dynamodb.endpoint-override=http://localhost:4566
quarkus.dynamodb.aws.region=us-east-1
quarkus.dynamodb.aws.credentials.type=static
quarkus.dynamodb.aws.credentials.static-provider.access-key-id=test
quarkus.dynamodb.aws.credentials.static-provider.secret-access-key=test
quarkus.dynamodb.sync-client.type=url
```

Com o Floci no ar na `4566`, o app se comporta exatamente igual, e como o recibo realmente cai no S3 você pode lê-lo de volta com a CLI, provando que o app e a CLI compartilham um único store:

```bash
curl -X POST http://localhost:8080/orders -H 'Content-Type: application/json' \
  -d '{"id":"order-42","customer":"matheus","total":199.9}'
# {"id":"order-42","customer":"matheus","total":199.9}  [HTTP 201]

aws s3 cp s3://order-receipts/order-42.txt -
# Receipt for order order-42 - customer matheus - total 199.9
```

Para testes isolados, o Floci traz um módulo Testcontainers, então cada execução ganha uma instância nova e descartável. Adicione a dependência (use `2.6.0` para Testcontainers 2.x, ou `1.4.0` para Testcontainers 1.x):

```xml
<dependency>
    <groupId>io.floci</groupId>
    <artifactId>testcontainers-floci</artifactId>
    <version>2.6.0</version>
    <scope>test</scope>
</dependency>
```

Um `QuarkusTestResourceLifecycleManager` sobe o container numa porta aleatória e sobrescreve o endpoint antes do app iniciar:

```java
public class FlociTestResource implements QuarkusTestResourceLifecycleManager {

    private FlociContainer floci;

    @Override
    public Map<String, String> start() {
        floci = new FlociContainer();
        floci.start();
        String endpoint = floci.getEndpoint();
        return Map.of(
                "quarkus.s3.endpoint-override", endpoint,
                "quarkus.dynamodb.endpoint-override", endpoint);
    }

    @Override
    public void stop() {
        if (floci != null) {
            floci.stop();
        }
    }
}
```

```java
@QuarkusTest
@QuarkusTestResource(FlociTestResource.class)
class FlociContainerTest {

    @Test
    void shouldCreateAndRetrieveOrder() {
        given()
                .contentType("application/json")
                .body("{\"id\":\"order-tc\",\"customer\":\"matheus\",\"total\":15.0}")
                .when().post("/orders")
                .then().statusCode(201).body("customer", is("matheus"));

        given().when().get("/orders/order-tc")
                .then().statusCode(200).body("customer", is("matheus"));
    }
}
```

Uma ressalva que encontrei testando: não combine isso com o Dev Service da Abordagem A no mesmo módulo. Com os dois no classpath você sobe dois Floci e o app pode falar com o errado. Escolha Dev Services *ou* o módulo Testcontainers por módulo.

---

## 6. Migrando do LocalStack

A migração acontece em dois níveis, dependendo de como você roda o LocalStack hoje.

### Containers e CLI

No nível de imagem a migração é propositalmente sem graça. A porta, as credenciais, a configuração do SDK e o padrão de endpoint da CLI são idênticos. Você troca a imagem:

```yaml
# Antes
image: localstack/localstack

# Depois
image: floci/floci:latest
```

As variáveis de ambiente do LocalStack são traduzidas automaticamente. A tradução é ligada por padrão, e qualquer variável Floci que você definir explicitamente prevalece sobre ela. Algumas das comuns, do [guia oficial de migração](https://floci.io/floci/getting-started/migrate-from-localstack/):

| LocalStack | Equivalente no Floci |
| :--- | :--- |
| `LOCALSTACK_HOST` | `FLOCI_HOSTNAME` |
| `PERSISTENCE=1` | `FLOCI_STORAGE_MODE=persistent` |
| `EDGE_PORT` | `FLOCI_PORT` |
| `LAMBDA_DOCKER_NETWORK` | `FLOCI_SERVICES_LAMBDA_DOCKER_NETWORK` |
| `LAMBDA_REMOVE_CONTAINERS=1` | `FLOCI_SERVICES_LAMBDA_EPHEMERAL=true` |
| `USE_SSL=1` | `FLOCI_TLS_ENABLED=true` |
| `DEBUG=1` | `QUARKUS_LOG_LEVEL=DEBUG` |

Testei a tradução de persistência diretamente. Subindo `floci/floci:latest` com `PERSISTENCE=1` setado, o log de startup mostra a tradução:

```text
[EmulatorLifecycle] Storage:   persistent  Path: /app/data
```

Os init scripts continuam funcionando. Monte um script em `/etc/localstack/init/ready.d/` exatamente como antes, e o Floci o executa:

```text
[InitializationHooksRunner] Running ready hook with 1 script(s): [/etc/localstack/init/ready.d/ready.d-marker.sh]
```

Os endpoints `/_localstack/health` e `/_localstack/init` continuam sendo servidos, então health checks e ferramentas que os consultam seguem funcionando:

```bash
curl -s http://localhost:4566/_localstack/health
# {"edition":"community","services":{"s3":"running","dynamodb":"running","lambda":"running", ...}}
```

Se seus init scripts chamam o AWS CLI ou boto3, use `floci/floci:latest-compat`. Para desativar completamente a tradução automática, defina `LOCALSTACK_PARITY=false`.

Um caminho de mount muda: o LocalStack persiste em `/var/lib/localstack`, o Floci em `/app/data`. Se você monta um volume para persistência, reaponte-o (o guia oficial também observa isso).

### Dev Services do Quarkus

Se você chegou ao Floci pelas extensões `quarkus-amazon-services`, é quase certo que estava no Dev Service `localstack` padrão. A migração é uma única propriedade:

```properties
# Antes
quarkus.aws.devservices.provider=localstack

# Depois
quarkus.aws.devservices.provider=floci
```

Como visto na pegadinha acima, não tente manter `provider=localstack` e só trocar a imagem para uma do Floci. Troque o provider, para a extensão usar o container do próprio Floci.

### Diferenças conhecidas

A maior parte da migração é no-op, mas algumas coisas realmente diferem. Do guia oficial:

| Área | LocalStack | Floci |
| :--- | :--- | :--- |
| Executor de Lambda | Configurável (`LAMBDA_EXECUTOR`) | Sempre containers Docker |
| `LAMBDA_REMOTE_DOCKER` | Suportado | Não suportado (use um bucket de hot-reload por função) |
| Seleção de serviços | `SERVICES=sqs,s3,...` | Não precisa, todos os serviços sobem |
| Diretório de dados | `/var/lib/localstack` | `/app/data` |
| Variável de log | `LS_LOG` / `DEBUG` | `QUARKUS_LOG_LEVEL` |

O que continua idêntico: porta `4566`, as credenciais `test`/`test`, toda chamada de SDK e CLI, os caminhos de init script em `/etc/localstack/init/` e os endpoints `/_localstack/health` e `/_localstack/init`.

---

## 7. Escolhendo um modo de armazenamento

Como o Floci persiste dados é configurável através de `FLOCI_STORAGE_MODE`. A escolha certa depende de você estar rodando testes efêmeros ou um ambiente local que quer preservar entre reinicializações.

| Modo | Comportamento | Melhor para | Durabilidade |
| :--- | :--- | :--- | :---: |
| `memory` | Inteiramente em RAM, perdido quando o container para | CI e testes efêmeros | Nenhuma |
| `persistent` | Gravado em disco a cada escrita | Preservação simples de estado local | Média |
| `hybrid` | Velocidade em memória com flush assíncrono a cada 5 segundos | Desenvolvimento local | Boa |
| `wal` | Write-ahead log, cada mutação registrada antes de responder | Durabilidade máxima | Máxima |

Para CI, fique com o padrão `memory`: é o mais rápido e você não quer estado vazando entre execuções de qualquer forma. Para um ambiente local ao qual você sempre volta, o `hybrid` te dá persistência entre reinicializações sem pagar uma escrita em disco a cada operação.

---

## 8. Além da AWS: Azure e GCP

A AWS é o carro-chefe, mas o mesmo projeto traz emuladores irmãos para as outras duas grandes nuvens:

- **floci-az** emula serviços do Azure (Blob, Queue, Table, Cosmos DB, Key Vault, Service Bus / Event Hub, Functions e mais).
- **floci-gcp** emula serviços do Google Cloud (GCS, Pub/Sub, Datastore, Secret Manager e outros).

Ambos seguem a mesma filosofia do emulador AWS: gratuito, open source e a um container de distância. Se sua stack é multi-cloud, você mantém o mesmo padrão de emulação local nas três.

---

## Conclusão

O Floci é aquele raro "drop-in replacement" que de fato faz jus à expressão. Tudo neste artigo rodou no ambiente do box lá em cima: as chamadas de CLI, uma Lambda real em Docker, um app Quarkus apoiado em DynamoDB e S3 tanto pelo provider Floci dos Dev Services quanto pelo módulo Testcontainers, e uma configuração no estilo LocalStack com init scripts e tradução de ambiente.

O destaque para quem desenvolve com Quarkus é a integração via Dev Services. Uma linha, `quarkus.aws.devservices.provider=floci`, e seu loop de dev e seus testes ganham uma AWS local de verdade sem nada para subir na mão. A migração a partir de um Dev Service de LocalStack é essa mesma linha.

Mantenha as expectativas honestas, e o próprio projeto é transparente nisso: o Floci é um emulador, e alguns serviços são propositalmente parciais (Bedrock Runtime e Textract são stubs in-process, por exemplo), então confira a cobertura por serviço antes de depender de um caso bem específico. Mas para o dia a dia (desenvolver localmente e rodar testes rápidos e herméticos no CI) ele cobre o que a maioria dos times realmente usa, de graça, sob MIT, com uma pegada pequena o suficiente para você não pensar duas vezes antes de subir. E há uma simetria agradável nisso: a ferramenta que te dá AWS local é, ela mesma, um binário nativo Quarkus, então o startup em milissegundos que você aprecia nos seus serviços é exatamente o que torna o Floci tão barato de rodar a cada teste.
