---
title: "Floci: a Free, Drop-in LocalStack Alternative Built on Quarkus"
date: 2026-05-31T10:00:00-03:00
draft: false
tags: ["Floci", "LocalStack", "AWS", "Quarkus", "Java", "Dev Services", "Testcontainers", "DynamoDB", "S3", "SQS", "Lambda", "Docker", "Native Image", "Local Development", "CI", "Cloud"]
author: "Matheus Oliveira"
slug: "floci-localstack-alternative"
summary: "LocalStack Community froze in March 2026 and now asks for an auth token. Floci is the no-strings-attached replacement: a free, MIT-licensed, Quarkus-native local AWS emulator. I test it for real: AWS CLI, a real Lambda, two ways of wiring a Quarkus app (Dev Services and Testcontainers), and a LocalStack migration."
description: "Hands-on guide to Floci, the free open-source LocalStack alternative built on Quarkus. Run AWS locally with docker compose, drive S3, DynamoDB, SQS and Lambda from the CLI, wire a Quarkus app to it two ways (the amazon-services Dev Services floci provider and the Floci Testcontainers module), and migrate from LocalStack at the image and Dev Services level."
cover:
  image: "floci-localstack-cover.png"
  alt: "SNES 16-bit pixel art sky with a fluffy popcorn cloud (floccus) raining AWS service icons (S3, DynamoDB, Lambda) onto a pixel laptop, neon FLOCI sign above"
  caption: "Floccus, the popcorn cloud: Floci raining local AWS onto your machine"
  relative: true
---

For years, running AWS on your laptop meant one tool: LocalStack. Then, in [March 2026, LocalStack's Community edition was effectively sunset](https://blog.localstack.cloud/the-road-ahead-for-localstack/). It now requires an auth token to run, and its security updates are frozen. For a tool that lives in your `docker-compose.yml` and your CI pipeline, "log in to keep using the free tier" is a hard pill to swallow.

This is the gap [Floci](https://floci.io/) wants to fill. It is a free, open-source, MIT-licensed local AWS emulator. No account, no auth token, no feature gates. Just `docker compose up`. And there is a detail that makes it especially interesting for readers of this blog: Floci is built on **Quarkus**, which is exactly why it starts in milliseconds and idles on a few megabytes of RAM. In one of my runs the native binary logged `started in 0.033s`.

In this article I will not just read the marketing. I will run Floci for real: drive S3, DynamoDB, SQS and a real Lambda from the AWS CLI, then wire a Quarkus application to it **two ways** (the `quarkus-amazon-services` Dev Services Floci provider, and the Floci Testcontainers module), and finally migrate a LocalStack setup at both the image and the Dev Services level. Every command, config, and output below was executed on the environment in the box.

> **Tested on**
> Java 25 (OpenJDK 25.0.2) · Maven 3.9.14 · Quarkus 3.36.0 (quarkus-amazon-services 3.19.0) · Testcontainers 2.0.5 · Docker 29.4.1 · Floci 1.5.20 (community)

---

## 1. What is Floci?

Floci gives you AWS-shaped services on your machine without a cloud account. You point your AWS SDK, CLI, Terraform, CDK or test suite at `http://localhost:4566` and keep your existing workflow. Any region works, and credentials can be any non-empty values.

The name comes from [floccus](https://en.wikipedia.org/wiki/Cirrocumulus_floccus), a cloud that forms in small, fluffy tufts (literally "a lock of wool"), which the Floci project itself likens to popcorn. Light, fluffy, and free.

Here is how it compares to LocalStack Community, using the numbers published by the Floci project:

| Capability | Floci | LocalStack Community |
| :--- | :---: | :---: |
| Auth token required | No | Yes |
| Security updates | Yes | Frozen |
| Startup time | ~24 ms | ~3.3 s |
| Idle memory | ~13 MiB | ~143 MiB |
| Docker image size | ~90 MB | ~1.0 GB |
| License | MIT | Restricted |
| API Gateway v2 / HTTP API | Yes | No |
| Cognito | Yes | No |
| RDS, ElastiCache, MSK | Real Docker | No |

That startup time and idle memory footprint are not an accident. They are what you get when the emulator itself is a Quarkus application compiled to a native image. The same properties that make Quarkus a great fit for serverless make Floci practical to spin up and tear down on every CI run.

Floci covers around 52 AWS services. The services where fidelity really matters (Lambda, RDS, ElastiCache, MSK, ECS, EC2, EKS, OpenSearch) run in **real Docker containers** instead of shallow mocks. The rest run in-process.

---

## 2. Start in 30 seconds

The simplest way to run Floci is Docker Compose. Create a `compose.yaml`:

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

The Docker socket mount is only needed for the Docker-backed services (Lambda, RDS, and friends). If you only need S3, DynamoDB or SQS, you can drop it.

Now point your AWS environment at the local endpoint. Credentials are not validated, so any non-empty value works:

```bash
export AWS_ENDPOINT_URL=http://localhost:4566
export AWS_DEFAULT_REGION=us-east-1
export AWS_ACCESS_KEY_ID=test
export AWS_SECRET_ACCESS_KEY=test
```

That is it. Floci is now answering AWS API calls on port `4566`.

If you would rather not write a compose file, the project's [Floci CLI](https://github.com/floci-io/floci-cli) does the same two steps: `floci start` to launch the emulator, then `eval $(floci env)` to export those variables for you.

None of this is Java-specific. It is just the standard AWS endpoint-plus-credentials pattern, so the same setup drives any SDK or tool: boto3, the JavaScript and Go SDKs, the AWS CLI, Terraform, OpenTofu, CDK. The project backs that breadth with roughly 1,968 automated compatibility tests across its SDKs and IaC integrations (Java, Node, Python, Go, Rust, the AWS CLI, Terraform, OpenTofu, and CDK). The Quarkus sections below are the deep dive simply because that is this blog's focus.

---

## 3. Driving AWS from the CLI

Let me exercise the three services almost every project touches: S3, DynamoDB and SQS. These run in-process, so no extra containers are pulled.

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

Same commands you already run against AWS, same shapes in the responses. Nothing about your tooling changes.

---

## 4. A real Lambda, in a real container

The CLI examples so far hit in-process services. Lambda is different: Floci runs your function in a **real Docker container** based on the official AWS runtime image, so the execution model matches production. Since this whole article is about a Quarkus-native tool, let me deploy a Quarkus-native function to it. You could use any supported runtime (Python, Node, Go); I am using Quarkus because it is what this blog is about.

Scaffold a Lambda with the Quarkus CLI:

```bash
quarkus create app dev.omatheusmesmo:hello-floci-lambda \
  --extension=io.quarkus:quarkus-amazon-lambda
```

The handler is a bean implementing `RequestHandler`:

```java
public class GreetingLambda implements RequestHandler<Map<String, String>, Map<String, String>> {

    @Override
    public Map<String, String> handleRequest(Map<String, String> event, Context context) {
        String name = event.getOrDefault("name", "world");
        return Map.of("message", "hello " + name + " from floci lambda");
    }
}
```

Build a native executable. On Quarkus 3.36 the default Mandrel builder image is JDK 25, so this is a Java 25 native build with no GraalVM install required:

```bash
mvn package -Dnative -Dquarkus.native.container-build=true
```

That produces `target/function.zip`, which contains a single `bootstrap` native binary. Deploy it to the `provided.al2023` custom runtime:

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

Two notes. The IAM role ARN can be anything; Floci does not enforce it. And the handler is `bootstrap`: on real AWS the handler is ignored for `provided` runtimes, but Floci validates it against a file in the zip, and the zip contains exactly one file named `bootstrap`.

Invoke it (AWS CLI v2 wants `--cli-binary-format raw-in-base64-out` for an inline payload):

```bash
aws lambda invoke --function-name hello-floci \
  --cli-binary-format raw-in-base64-out \
  --payload '{"name":"matheus"}' out.json

cat out.json
# {"message":"hello matheus from floci lambda"}
```

The first invocation pulls the runtime image, so it is slower; subsequent calls reuse a warm container pool. Going native is also what lets you run **Java 25** on Lambda at all: the managed Java runtime tops out at `java21`, so a native binary on `provided.al2023` is the idiomatic way to ship the latest language version, with a fast cold start as a bonus. This is the kind of fidelity shallow mocks cannot offer, and it is why Floci reaches for Docker on the services where it counts.

---

## 5. Wiring a Quarkus application to Floci

The CLI is fine for a smoke test, but the real value is your application talking to Floci during development and tests. I will build a tiny orders service: a REST endpoint that stores an order in DynamoDB and writes a receipt to S3.

Scaffold it with the Quarkus CLI:

```bash
quarkus create app dev.omatheusmesmo:floci-quarkus-demo \
  --extension=rest-jackson,amazon-s3,amazon-dynamodb
```

The AWS SDK v2 extensions need a sync HTTP client, so add the URL connection client to your `pom.xml`:

```xml
<dependency>
    <groupId>software.amazon.awssdk</groupId>
    <artifactId>url-connection-client</artifactId>
</dependency>
```

### The application code

A small `Order` record and a service that writes to both stores on save, then reads back from DynamoDB:

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

A `Bootstrap` bean creates the table and bucket on startup, so the app provisions what it needs:

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
        } catch (ResourceInUseException alreadyExists) {
        }
        try {
            s3.createBucket(b -> b.bucket(bucket));
        } catch (BucketAlreadyOwnedByYouException alreadyExists) {
        }
    }
}
```

And a thin REST resource. The Quarkus REST idiom is to return the payload directly and let `@ResponseStatus` and exceptions set the status code, rather than hand-building `Response` objects:

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

There are two ways to give this app a Floci to talk to. Pick one per module (running both at once starts two Floci instances and the app may bind to the wrong one).

### Approach A: Dev Services (the one-property way)

This is the cleanest path if you use the `quarkus-amazon-services` extensions. Since version **3.18.0**, the extension ships a native **Floci provider** for Dev Services, so you do not configure an endpoint at all: Quarkus starts Floci for you in dev and test, and wires the clients to it. The Quarkus 3.36 platform bundles amazon-services 3.19.0, so this works out of the box on 3.36.

The whole `application.properties`:

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

No `endpoint-override`, no static credentials, no profiles. Two notes: `quarkus.s3.path-style-access=true` is required for S3 against a local endpoint (virtual-host bucket addressing like `my-bucket.localhost` does not resolve), and the `url` sync client is the lightweight HTTP client I added above.

The `init-scripts-folder` is a LocalStack-style seeding hook. Floci mounts it at `/etc/floci/init/start.d` and runs the scripts after the HTTP server is up. The `latest-compat` image (not plain `latest`) is what ships the AWS CLI, `awslocal`, and boto3 for scripts to use. `src/main/resources/floci-init/01-init.sh`:

```bash
#!/bin/bash
export AWS_ACCESS_KEY_ID=test
export AWS_SECRET_ACCESS_KEY=test
export AWS_DEFAULT_REGION=us-east-1
aws --endpoint-url http://localhost:4566 s3 mb s3://init-bucket
echo "floci-init-complete"
```

`init-completion-msg` makes Floci wait for that marker line before reporting ready, so provisioning never races your first call. It is optional (the `start.d` hooks finished before readiness in my runs), but cheap insurance.

Run `quarkus dev` and Floci comes up on its own:

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

Tests need zero extra wiring. A plain `@QuarkusTest` runs against the auto-provisioned Floci, and you can assert the init script ran by checking the bucket it created:

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

> **Gotcha worth knowing.** The obvious idea is to keep `provider=localstack` (the default) and just point `quarkus.aws.devservices.localstack.image-name` at a Floci image. It does not work. The LocalStack Dev Service runs through Testcontainers' `LocalStackContainer`, which overrides the image entrypoint with a LocalStack-specific bootstrap. Floci's entrypoint then runs without its own command and the container exits immediately, leaving you with a misleading "Wait strategy failed. Container exited with code 0". Use `provider=floci` instead, which uses Floci's own container and entrypoint.

### Approach B: point at a Floci you run, plus the Testcontainers module

If you are not on the amazon-services extensions, or you want explicit control (for example pointing at a long-running Floci, or one started by the CLI), configure the endpoint directly:

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

With Floci up on `4566`, the app behaves exactly the same, and because the receipt really lands in S3 you can read it back with the CLI, proving the app and the CLI share one store:

```bash
curl -X POST http://localhost:8080/orders -H 'Content-Type: application/json' \
  -d '{"id":"order-42","customer":"matheus","total":199.9}'
# {"id":"order-42","customer":"matheus","total":199.9}  [HTTP 201]

aws s3 cp s3://order-receipts/order-42.txt -
# Receipt for order order-42 - customer matheus - total 199.9
```

For isolated tests, Floci ships a Testcontainers module so each run gets a fresh, throwaway instance. Add the dependency (use `2.6.0` for Testcontainers 2.x, or `1.4.0` for Testcontainers 1.x):

```xml
<dependency>
    <groupId>io.floci</groupId>
    <artifactId>testcontainers-floci</artifactId>
    <version>2.6.0</version>
    <scope>test</scope>
</dependency>
```

A `QuarkusTestResourceLifecycleManager` starts the container on a random port and overrides the endpoint before the app boots:

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

One caveat I hit while testing: do not combine this with the Approach A Dev Service in the same module. With both on the classpath you get two Floci instances and the app can bind to the wrong one. Choose Dev Services *or* the Testcontainers module per module.

---

## 6. Migrating from LocalStack

Migration happens at two levels, depending on how you run LocalStack today.

### Containers and CLI

At the image level the migration is deliberately boring. The port, the credentials, the SDK configuration and the CLI endpoint pattern are identical. You swap the image:

```yaml
# Before
image: localstack/localstack

# After
image: floci/floci:latest
```

LocalStack environment variables are translated automatically. The translation is on by default, and any Floci variable you set explicitly wins over it. A few of the common ones, from the [official migration guide](https://floci.io/floci/getting-started/migrate-from-localstack/):

| LocalStack | Floci equivalent |
| :--- | :--- |
| `LOCALSTACK_HOST` | `FLOCI_HOSTNAME` |
| `PERSISTENCE=1` | `FLOCI_STORAGE_MODE=persistent` |
| `EDGE_PORT` | `FLOCI_PORT` |
| `LAMBDA_DOCKER_NETWORK` | `FLOCI_SERVICES_LAMBDA_DOCKER_NETWORK` |
| `LAMBDA_REMOVE_CONTAINERS=1` | `FLOCI_SERVICES_LAMBDA_EPHEMERAL=true` |
| `USE_SSL=1` | `FLOCI_TLS_ENABLED=true` |
| `DEBUG=1` | `QUARKUS_LOG_LEVEL=DEBUG` |

I tested the persistence translation directly. Starting `floci/floci:latest` with `PERSISTENCE=1` set, the startup log shows the translation:

```text
[EmulatorLifecycle] Storage:   persistent  Path: /app/data
```

Init scripts keep working. Mount a script under `/etc/localstack/init/ready.d/` exactly as before, and Floci runs it:

```text
[InitializationHooksRunner] Running ready hook with 1 script(s): [/etc/localstack/init/ready.d/ready.d-marker.sh]
```

The `/_localstack/health` and `/_localstack/init` endpoints are still served, so health checks and tooling that probe them keep working:

```bash
curl -s http://localhost:4566/_localstack/health
# {"edition":"community","services":{"s3":"running","dynamodb":"running","lambda":"running", ...}}
```

If your init scripts call the AWS CLI or boto3, use `floci/floci:latest-compat`. To opt out of the automatic translation entirely, set `LOCALSTACK_PARITY=false`.

One mount path does change: LocalStack persists to `/var/lib/localstack`, Floci to `/app/data`. If you mount a volume for persistence, repoint it (the official guide notes this too).

### Quarkus Dev Services

If you reached Floci through the `quarkus-amazon-services` extensions, you were almost certainly on the default `localstack` Dev Service. The migration is a single property:

```properties
# Before
quarkus.aws.devservices.provider=localstack

# After
quarkus.aws.devservices.provider=floci
```

As covered in the gotcha above, do not try to keep `provider=localstack` and only change the image to a Floci one. Switch the provider so the extension uses Floci's own container.

### Known differences

Most of a migration is a no-op, but a few things genuinely differ. From the official guide:

| Area | LocalStack | Floci |
| :--- | :--- | :--- |
| Lambda executor | Configurable (`LAMBDA_EXECUTOR`) | Always Docker containers |
| `LAMBDA_REMOTE_DOCKER` | Supported | Not supported (use a hot-reload bucket per function) |
| Service selection | `SERVICES=sqs,s3,...` | Not needed, all services start |
| Data directory | `/var/lib/localstack` | `/app/data` |
| Log variable | `LS_LOG` / `DEBUG` | `QUARKUS_LOG_LEVEL` |

What stays identical: port `4566`, the `test`/`test` credentials, every SDK and CLI call, the `/etc/localstack/init/` script paths, and the `/_localstack/health` and `/_localstack/init` endpoints.

---

## 7. Choosing a storage mode

How Floci persists data is configurable through `FLOCI_STORAGE_MODE`. The right choice depends on whether you are running ephemeral tests or a local environment you want to survive restarts.

| Mode | Behavior | Best for | Durability |
| :--- | :--- | :--- | :---: |
| `memory` | Entirely in RAM, lost when the container stops | CI and ephemeral tests | None |
| `persistent` | Flushed to disk on every write | Simple local state preservation | Medium |
| `hybrid` | In-memory speed with async flush every 5 seconds | Local development | Good |
| `wal` | Write-ahead log, every mutation logged before responding | Maximum durability | Highest |

For CI, stick with the default `memory`: it is the fastest and you do not want state leaking between runs anyway. For a local environment you keep coming back to, `hybrid` gives you persistence across restarts without paying for a disk write on every operation.

---

## 8. Beyond AWS: Azure and GCP

AWS is the flagship, but the same project ships sibling emulators for the other two big clouds:

- **floci-az** emulates Azure services (Blob, Queue, Table, Cosmos DB, Key Vault, Service Bus / Event Hub, Functions, and more).
- **floci-gcp** emulates Google Cloud services (GCS, Pub/Sub, Datastore, Secret Manager, and others).

Both follow the same philosophy as the AWS emulator: free, open source, and a single container away. If your stack is multi-cloud, you can keep the same local-emulation pattern across all three.

---

## Conclusion

Floci is the rare "drop-in replacement" that actually lives up to the phrase. Everything in this article ran on the environment in the box at the top: the CLI calls, a real Dockerized Lambda, a Quarkus app backed by DynamoDB and S3 through both the Dev Services Floci provider and the Testcontainers module, and a LocalStack-style setup with init scripts and environment translation.

The standout for Quarkus developers is the Dev Services integration. One line, `quarkus.aws.devservices.provider=floci`, and your dev loop and tests get a real local AWS with nothing to start by hand. The migration from a LocalStack Dev Service is the same single line.

Keep expectations honest, and the project is upfront about this too: Floci is an emulator, and a few services are deliberately partial (Bedrock Runtime and Textract ship as in-process stubs, for example), so check the per-service coverage before you lean on a specific corner case. But for the day-to-day loop (developing locally and running fast, hermetic tests in CI) it covers what most teams actually use, for free, under MIT, with a footprint small enough that you will not think twice about starting it. And there is a pleasant symmetry to it: the tool that gives you local AWS is itself a Quarkus native binary, so the millisecond startup you appreciate in your own services is exactly what makes Floci so cheap to run on every test.
