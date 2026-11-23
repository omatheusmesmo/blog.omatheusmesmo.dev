---
title: "Oracle Cloud on localhost with floci-oci"
date: 2026-11-23T10:00:00-03:00
draft: false
tags: ["Floci", "floci-oci", "OCI", "Oracle Cloud", "Quarkus", "Java", "Testcontainers", "Terraform", "OpenTofu", "OCI CLI", "PostgreSQL", "Object Storage", "KMS", "Queue", "Local Development", "CI", "Cloud"]
author: "Matheus Oliveira"
slug: "floci-oci-oracle-cloud-localhost"
summary: "Oracle Cloud never had a LocalStack. floci-oci, the OCI member of the Floci family, is a free emulator that the official SDKs, the OCI CLI and the oracle/oci Terraform provider talk to unchanged. I built an expense receipts pipeline on OCI PostgreSQL, Vault, pre-authenticated uploads, Queue and KMS, and ran it end to end on my laptop, with no Oracle Cloud account."
description: "Hands-on guide to floci-oci 0.7.0, the free open source Oracle Cloud Infrastructure emulator. Build a Quarkus expense receipts service on OCI Database with PostgreSQL (password from a Vault secret, TLS verify-full), Object Storage pre-authenticated uploads, Queue with a dead-letter queue and KMS envelope encryption. Test it with Testcontainers, drive it from the unmodified OCI CLI and provision it with Terraform and OpenTofu, with a zero drift plan."
cover:
  image: "cover.png"
  alt: "A thick red rounded capsule holding line icons of a bucket, a queue, a key and a database, linked by a dotted line to a laptop labelled localhost:4599"
  caption: "Oracle Cloud on localhost with floci-oci"
  relative: true
---

In May I wrote about [Floci as a free LocalStack alternative](/en/posts/floci-localstack-alternative/), and that article closed with Floci's siblings for Azure and GCP. There is a fourth one now, and it fills a gap that has been open for a long time. Oracle Cloud Infrastructure has no official local emulator: no LocalStack equivalent and no all-in-one dev container. As the [floci-oci README](https://github.com/floci-io/floci-oci) puts it, testing an OCI integration has meant a real tenancy, real credentials and real network round trips, even in CI.

[floci-oci](https://floci.io/floci-oci/) is that missing piece: one container, one port, MIT licensed, and the official SDKs, the OCI CLI and the `oracle/oci` Terraform provider talk to it without changes.

To see how far it goes, I built something you would actually run in production rather than a hello world: an **expense receipts pipeline**. An employee opens a claim, uploads the receipt straight to Object Storage through a pre-authenticated URL and submits it. A worker picks the job from OCI Queue, checks the file, encrypts it with a KMS data key and marks the claim ready for review. The claims live in OCI Database with PostgreSQL, whose password never leaves the Vault. Every service in that sentence is an OCI service, and floci-oci emulates all of them. I tested it end to end, drove it from the OCI CLI and provisioned it with Terraform and OpenTofu, on my laptop, with no Oracle Cloud account. The code is in the [`cloud/floci-oci` demo](https://github.com/omatheusmesmo/demos/tree/main/cloud/floci-oci), and every output below comes from a real run.

> **Tested on**
> floci-oci 0.7.0 (PostgreSQL 16 sidecar) · Quarkus 3.40.1 · OCI Java SDK 3.102.0 · Testcontainers 2.0.5 · Terraform 1.10.5 · OpenTofu 1.9.1 · `oracle/oci` provider 9.12.1 · OCI CLI 3.96.0 · Java 25 · Docker 29.9.2

---

## 1. What is floci-oci?

floci-oci gives you OCI-shaped services on `http://localhost:4599`. It is the OCI member of the [Floci](https://github.com/floci-io) family, and every member takes its own port:

| Emulator | Cloud | Port |
| :--- | :--- | :---: |
| floci | AWS | 4566 |
| floci-az | Azure | 4577 |
| floci-gcp | GCP | 4588 |
| **floci-oci** | **OCI** | **4599** |

Like its AWS sibling, it is a Quarkus application compiled to a native binary. Here is the 0.7.0 image starting on my machine:

```text
floci-oci 0.7.0 native (powered by Quarkus 3.40.1.1) started in 0.038s. Listening on: http://0.0.0.0:4599
```

What makes it feel like OCI is the wire protocol. Every response carries an `opc-request-id`, lists page through `opc-next-page`, writes honour `etag` and `if-match`, resources get real OCIDs, async operations go through work requests, and errors use OCI's own codes (`NotAuthorizedOrNotFound`, `BucketNotFound`...). That is why the SDKs and Terraform work unchanged.

Authentication is the part that removes the most friction. Every OCI request is signed with an API key, and floci-oci **parses the signature but never verifies it**. It reads the tenancy and the user from the signature's `keyId` and ignores the rest, so any locally generated RSA key works. There is no key to upload and no fingerprint to register.

The 0.7.0 release covers Identity, Object Storage (with multipart, pre-authenticated requests, versioning and an S3 compatibility API), Queue, Streaming, Vault and KMS (with real cryptography), Secrets, Functions, Container Engine for Kubernetes, Database with PostgreSQL, Organizations, Governance Rules and Work Requests. Functions, OKE and PostgreSQL run real containers next to the emulator (Fn Project, k3s and PostgreSQL), while the rest is emulated in process. Events, Notifications, Logging, Monitoring and Networking are not in 0.7.0, so check the [services overview](https://floci.io/floci-oci/services/) for the tag you pin, not for `main`.

One more thing is missing from that list: **floci-oci has no Oracle Database or Autonomous Database service**. Oracle publishes an [Autonomous Database Free container](https://github.com/oracle/adb-free) that could back it the same way PostgreSQL is backed today, so I opened [floci-io/floci-oci#143](https://github.com/floci-io/floci-oci/issues/143) to request it. Until then, OCI Database with PostgreSQL is the database you can provision through the OCI API, and that is what this demo uses.

Releases ship on the 15th and the last day of each month, and a `nightly` tag tracks `main` in between.

---

## 2. Start in 30 seconds

A `compose.yaml` is all it takes. I use the `compat` variant, which adds the OCI CLI and a ready-made throwaway profile:

```yaml
services:
  floci-oci:
    image: floci/floci-oci:0.7.0-compat
    container_name: floci-oci
    ports:
      - "4599:4599"
    environment:
      FLOCI_OCI_DOCKER_ENDPOINT_MODE: published
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
```

The Docker socket and `FLOCI_OCI_DOCKER_ENDPOINT_MODE` are there for PostgreSQL. Each DB system is a real `postgres:16-alpine` container that floci-oci starts through the socket. When the emulator runs in a container, it reports the database endpoint as that container's name by default, which only other containers can resolve. `published` makes it report `localhost` and the published host port instead, which is what an application running on your machine needs. Without PostgreSQL, the first four lines are enough.

```bash
docker compose up -d --wait
curl -s localhost:4599/_floci/health
```

```json
{"status":"UP","cloud":"oci","services":{"functions":"running","governancerules":"running","identity":"running","kms":"running","objectstorage":"running","oke":"running","organizations":"running","psql":"running","queue":"running","streaming":"running","vault":"running"},"edition":"community","original_edition":"floci-always-free","version":"0.7.0"}
```

The compat image ships `ocilocal`, a four-line wrapper that runs `oci --endpoint http://localhost:4599 "$@"`. Its bundled API key exists only because the OCI CLI refuses to run without one, and it is public on purpose. Never point that profile at a real tenancy.

---

## 3. The demo: an expense receipts pipeline

The service has four endpoints and one background worker:

| Step | OCI service | What happens |
| :--- | :--- | :--- |
| `POST /expenses` | Database with PostgreSQL, Object Storage | Insert the claim as `AWAITING_RECEIPT` and return a pre-authenticated URL that accepts one upload of `incoming/<id>` for 15 minutes |
| `PUT` to that URL | Object Storage | The client uploads the receipt itself, with no OCI credentials and without going through the service |
| `POST /expenses/{id}/submit` | Object Storage, PostgreSQL, Queue | Check the upload exists and is not too large, mark the claim `SUBMITTED`, enqueue a job |
| Worker | Queue, KMS, Object Storage, PostgreSQL | Check the file is a PDF, PNG or JPEG, encrypt it with its own KMS data key, store it under `receipts/<id>`, mark the claim `READY_FOR_REVIEW` (or `REJECTED`), delete the upload |
| `GET /expenses/{id}/receipt` | Object Storage, KMS | Unwrap the data key, decrypt, check the SHA-256 and serve the original file to the reviewer |

A job that keeps failing is not lost: after three deliveries the queue moves it to its dead-letter queue. The infrastructure (bucket, vault, master key, queue, secret and DB system) comes from Terraform, never from the application.

Here is one claim, run by hand against `make dev`:

```bash
$ curl -s -X POST localhost:8080/expenses -H 'Content-Type: application/json' \
    -d '{"employee":"ana","merchant":"Hotel Aurora","amount":189.90,"currency":"BRL","spentOn":"2026-11-20"}'
{
    "expense": {
        "id": "2ed1168e-9ed7-46e2-997d-93afe8b2964d",
        "status": "AWAITING_RECEIPT",
        ...
    },
    "upload": {
        "method": "PUT",
        "url": "http://localhost:4599/p/YTBkYzQ1N2YtNjMyZi00Y2JiLWIxYTktZDA4MDU4NTVmOGIw/n/floci-local/b/expense-receipts/o/incoming/2ed1168e-9ed7-46e2-997d-93afe8b2964d",
        "expiresAt": "2026-11-23T23:29:06.943100690Z"
    }
}

$ curl -X PUT --data-binary @receipt.pdf "$UPLOAD_URL"                       # 200
$ curl -X POST localhost:8080/expenses/2ed1168e-.../submit                    # 202, "status":"SUBMITTED"
$ curl localhost:8080/expenses/2ed1168e-...
{..."status":"READY_FOR_REVIEW","receiptContentType":"application/pdf","receiptSize":51,...}
$ curl -o back.pdf localhost:8080/expenses/2ed1168e-.../receipt && cmp receipt.pdf back.pdf && echo identical
identical
```

The worker took under a second to process the job.

---

## 4. Wiring the OCI SDK into Quarkus

### 4.1 No extension, and that is fine

This is where OCI differs most from the AWS article. There, one property (`quarkus.aws.devservices.provider=floci`) gave me a local AWS. For OCI, the Quarkus extension registry has no extension for the OCI Java SDK (I checked on November 23, 2026), and so there is no Floci Dev Services provider either. You wire the SDK yourself: the `oci-java-sdk-bom`, one HTTP client provider (`oci-java-sdk-common-httpclient-jersey3`) and one module per service. This demo uses `objectstorage`, `queue`, `keymanagement` and `secrets`.

A CDI producer builds one signer and one client per service:

```java
@Singleton
public class OciClients {

    @Produces
    @Singleton
    AuthenticationDetailsProvider signer(OciConfig config) {
        OciConfig.Auth auth = config.auth();
        return switch (auth.mode()) {
            case THROWAWAY_KEY -> ThrowawayKey.signer(
                    auth.tenancyId().orElseThrow(() -> missing("oci.auth.tenancy-id")),
                    auth.userId().orElseThrow(() -> missing("oci.auth.user-id")),
                    Region.fromRegionId(config.region()));
            case CONFIG_FILE -> fromConfigFile(auth.profile());
        };
    }

    @Produces
    @Singleton
    ObjectStorageClient objectStorage(AuthenticationDetailsProvider signer, OciConfig config) {
        ObjectStorageClient client = ObjectStorageClient.builder()
                .region(Region.fromRegionId(config.region()))
                .build(signer);
        config.endpoint().ifPresent(client::setEndpoint);
        return client;
    }

    @Produces
    @Singleton
    KmsCryptoClient kmsCrypto(AuthenticationDetailsProvider signer, ExpensesConfig expenses) {
        return KmsCryptoClient.builder()
                .endpoint(expenses.keys().cryptoEndpoint())
                .build(signer);
    }

    void close(@Disposes ObjectStorageClient client) {
        client.close();
    }
}
```

There are two signer modes. `config-file` reads `~/.oci/config`, the way the OCI CLI does, and it is the default for production. `throwaway-key` is for dev and test: it generates an RSA key in memory at startup, and floci-oci accepts it because the signature is never checked. The configuration is the same two-profile split you would use anyway:

```properties
oci.region=us-ashburn-1
oci.auth.mode=config-file

%dev,test.oci.endpoint=http://localhost:4599
%dev,test.oci.auth.mode=throwaway-key
%dev,test.oci.auth.tenancy-id=ocid1.tenancy.oc1..flocilocaltenancy0000000000000000000000000000000000000000
%dev,test.oci.auth.user-id=ocid1.user.oc1..flocidemouser00000000000000000000000000000000000000000000000
```

### 4.2 Endpoints that come from resources

Look at the `KmsCryptoClient` producer above: it does not use `oci.endpoint`. On real OCI, the KMS crypto API is not regional. Each vault has its own `cryptoEndpoint` and `managementEndpoint` hostnames. The Queue data plane works the same way, through the queue's `messagesEndpoint`. So both are configuration of the service (`expenses.keys.crypto-endpoint`, `expenses.jobs.messages-endpoint`), filled from the Terraform outputs. That holds on real OCI too.

floci-oci returns its own address for all of them. The [KMS documentation](https://github.com/floci-io/floci-oci/blob/0.7.0/docs/services/kms-vault.md) explains why: the OCI SDKs reject an endpoint with a path, so the emulator cannot encode the vault in the URL. That has a consequence worth knowing. `CreateKey` carries no vault id, so a new key goes to the most recently created active vault in the compartment. With one vault per compartment, which is the usual setup, this is exact.

### 4.3 The database password lives in the Vault

The DB system is created with `password_type = "VAULT_SECRET"`: its admin password is a secret in the Vault, and floci-oci reads it from its own Vault when it starts the PostgreSQL container. The application reads the same secret. Quarkus has a hook for exactly this, the `CredentialsProvider` from `quarkus-credentials`, which the datasource calls before it opens connections:

```java
@ApplicationScoped
@Unremovable
@Named(VaultSecretCredentialsProvider.NAME)
public class VaultSecretCredentialsProvider implements CredentialsProvider {

    public static final String NAME = "oci-vault-secret";

    private final SecretsClient secrets;
    private final DatabaseConfig database;

    public VaultSecretCredentialsProvider(SecretsClient secrets, DatabaseConfig database) {
        this.secrets = secrets;
        this.database = database;
    }

    @Override
    public Map<String, String> getCredentials(String credentialsProviderName) {
        Base64SecretBundleContentDetails content = (Base64SecretBundleContentDetails) secrets
                .getSecretBundle(GetSecretBundleRequest.builder()
                        .secretId(database.passwordSecretId())
                        .stage(GetSecretBundleRequest.Stage.Current)
                        .build())
                .getSecretBundle()
                .getSecretBundleContent();
        String password = new String(Base64.getDecoder().decode(content.getContent()), StandardCharsets.UTF_8);
        return Map.of(USER_PROPERTY_NAME, database.username(), PASSWORD_PROPERTY_NAME, password);
    }
}
```

```properties
quarkus.datasource.db-kind=postgresql
quarkus.datasource.jdbc.url=${EXPENSES_DATABASE_JDBC_URL}
quarkus.datasource.credentials-provider=oci-vault-secret
quarkus.datasource.credentials-provider-name=oci-vault-secret
quarkus.flyway.migrate-at-start=true
quarkus.hibernate-orm.schema-management.strategy=validate
```

The configuration holds the secret's OCID, never the password. The JDBC URL comes from the DB system's connection details, and it verifies the server: every DB system has its own self-signed certificate, returned as `caCertificate`, and its SAN covers `localhost`, so `sslmode=verify-full` works:

```text
jdbc:postgresql://localhost:15432/postgres?sslmode=verify-full&sslrootcert=.../.certs/expenses-db-ca.pem
```

Flyway runs at startup, against a database that Terraform created through the OCI API:

```text
INFO  [org.flywaydb.core.FlywayExecutor] Database: jdbc:postgresql://localhost:15432/postgres?sslmode=verify-full&... (PostgreSQL 16.15)
INFO  [org.flywaydb.core.internal.command.DbMigrate] Successfully applied 1 migration to schema "public", now at version v1
```

### 4.4 Uploads that never touch the service

Receipts are files, and routing every upload through the API would make the service a proxy for bytes it does not need to see. Object Storage has a better answer: a **pre-authenticated request** (PAR), a URL that grants one operation on one object until it expires. The service creates an `ObjectWrite` PAR for `incoming/<id>` and hands it to the client:

```java
public String uploadUrl(UUID expenseId, Instant expiresAt) {
    PreauthenticatedRequest par = objectStorage.createPreauthenticatedRequest(
            CreatePreauthenticatedRequestRequest.builder()
                    .namespaceName(storage.namespace())
                    .bucketName(storage.bucket())
                    .createPreauthenticatedRequestDetails(CreatePreauthenticatedRequestDetails.builder()
                            .name("receipt-upload-" + expenseId)
                            .objectName(incoming(expenseId))
                            .accessType(CreatePreauthenticatedRequestDetails.AccessType.ObjectWrite)
                            .timeExpires(Date.from(expiresAt))
                            .build())
                    .build())
            .getPreauthenticatedRequest();
    String fullPath = par.getFullPath();
    if (fullPath != null && URI.create(fullPath).isAbsolute()) {
        return fullPath;
    }
    return objectStorage.getEndpoint() + par.getAccessUri();
}
```

floci-oci scopes the PAR the way OCI does. The upload URL cannot write any other object, and it cannot even read the object it writes: both return `404 NotAuthorizedOrNotFound`, and a test checks it.

The last four lines are there because of the first floci-oci bug I hit. Real OCI returns `fullPath` as the complete URL. floci-oci 0.7.0 returns it as the same relative path as `accessUri`, so my first version handed the client `/p/...` and Java's `HttpClient` refused it with `URI with undefined scheme`. While reading the code I also saw that Get and List return `fullPath`, token included, although OCI shows the token only once, on create. I reported both in [floci-io/floci-oci#144](https://github.com/floci-io/floci-oci/issues/144). The workaround resolves a relative path against the Object Storage endpoint, which is also what you do with `accessUri` on real OCI, so the code is correct on both.

### 4.5 The worker: Queue, retries and a dead-letter queue

Submitting a claim enqueues its id. A scheduled method takes up to ten jobs per poll, using Queue's long polling:

```java
@Scheduled(every = "${expenses.jobs.poll-every}", concurrentExecution = Scheduled.ConcurrentExecution.SKIP)
void poll() {
    for (GetMessage job : jobs.take(BATCH)) {
        try {
            processor.process(UUID.fromString(job.getContent().trim()));
            jobs.done(job);
        } catch (RuntimeException e) {
            LOG.warnf("Receipt job '%s' failed on delivery %d, leaving it to the queue: %s",
                    job.getContent(), job.getDeliveryCount(), e.getMessage());
        }
    }
}
```

A failed job is not acknowledged. When its visibility timeout ends, the queue delivers it again, and after three deliveries (`dead_letter_queue_delivery_count = 3`) it moves to the dead-letter queue. That only works if processing is idempotent, so the processor checks the claim's state first:

```java
public void process(UUID expenseId) {
    Expense expense = QuarkusTransaction.requiringNew().call(() -> Expense.<Expense>findById(expenseId));
    if (expense == null) {
        throw new IllegalStateException("No expense " + expenseId);
    }
    switch (expense.status) {
        case AWAITING_RECEIPT -> throw new IllegalStateException("Expense " + expenseId + " is not submitted yet");
        case READY_FOR_REVIEW, REJECTED -> {
            bucket.delete(ReceiptBucket.incoming(expenseId));
            return;
        }
        case SUBMITTED -> {
        }
    }

    byte[] file = bucket.read(ReceiptBucket.incoming(expenseId));
    Optional<String> contentType = ReceiptFormat.detect(file);
    if (file.length > maxBytes) {
        reject(expenseId, "The receipt is larger than " + maxBytes + " bytes");
    } else if (contentType.isEmpty()) {
        reject(expenseId, "The receipt is not a PDF, PNG or JPEG file");
    } else {
        ReceiptCipher.Sealed sealed = cipher.seal(file);
        bucket.write(ReceiptBucket.stored(expenseId), sealed.body());
        accept(expenseId, contentType.get(), file, sealed.wrappedKey());
    }
    bucket.delete(ReceiptBucket.incoming(expenseId));
}
```

The `AWAITING_RECEIPT` branch is a bug the emulator helped me find. `submit` enqueues the job inside its transaction, so a failed enqueue rolls the submission back. But that also means the worker can receive the job *before* the transaction commits, while the claim still reads `AWAITING_RECEIPT`. My first version treated any state other than `SUBMITTED` as "already done" and acknowledged the job, and the claim stayed `SUBMITTED` forever. With a real queue a few milliseconds away, I could write a test that holds the claim in that window on purpose. It failed on the old code and passes now, because the job goes back to the queue and is processed on the next delivery.

### 4.6 Envelope encryption with KMS

Receipts carry personal data, so they are stored encrypted. KMS `Encrypt` takes at most 4 KB, which rules out encrypting a PDF directly. The standard answer is **envelope encryption**: ask KMS for a fresh data key, encrypt the file locally with it, and store only the wrapped (KMS-encrypted) copy of the key:

```java
public Sealed seal(byte[] plaintext) {
    GeneratedKey dataKey = crypto.generateDataEncryptionKey(GenerateDataEncryptionKeyRequest.builder()
                    .generateKeyDetails(GenerateKeyDetails.builder()
                            .keyId(masterKeyId)
                            .includePlaintextKey(true)
                            .keyShape(KeyShape.builder().algorithm(KeyShape.Algorithm.Aes).length(32).build())
                            .build())
                    .build())
            .getGeneratedKey();
    byte[] key = Base64.getDecoder().decode(dataKey.getPlaintext());
    try {
        byte[] iv = new byte[IV_BYTES];
        RANDOM.nextBytes(iv);
        byte[] ciphertext = aesGcm(Cipher.ENCRYPT_MODE, key, iv).doFinal(plaintext);
        byte[] body = ByteBuffer.allocate(iv.length + ciphertext.length).put(iv).put(ciphertext).array();
        return new Sealed(body, dataKey.getCiphertext());
    } catch (GeneralSecurityException e) {
        throw new IllegalStateException("Cannot encrypt the receipt", e);
    } finally {
        Arrays.fill(key, (byte) 0);
    }
}
```

The bucket holds `receipts/<id>` as IV plus AES-GCM ciphertext. The database holds the wrapped key and the SHA-256 of the original. To serve the receipt, the service asks KMS to decrypt the wrapped key, decrypts the file and checks the hash. The plaintext key exists only in memory, and only for as long as one file takes.

---

## 5. Testing against floci-oci

The application never creates OCI resources. In tests, a `QuarkusTestResourceLifecycleManager` starts floci-oci with Testcontainers, provisions the whole stack through the SDK (bucket, vault, key, queue, secret and DB system, waiting for it to be `ACTIVE`), and passes the identifiers and the JDBC URL to the application as configuration. Terraform does the same job in dev mode (section 7).

### The container needs three things

```java
public FlociOciContainer() {
    super(DockerImageName.parse("floci/floci-oci:0.7.0"));
    this.hostPort = freePort();
    withExposedPorts(4599);
    withCreateContainerCmdModifier(cmd -> cmd.getHostConfig()
            .withPortBindings(List.of(new PortBinding(Ports.Binding.bindPort(hostPort), new ExposedPort(4599)))));
    withEnv("FLOCI_OCI_BASE_URL", "http://localhost:" + hostPort);
    withEnv("FLOCI_OCI_DOCKER_ENDPOINT_MODE", "published");
    withFileSystemBind("/var/run/docker.sock", "/var/run/docker.sock");
    waitingFor(Wait.forHttp("/_floci/health").forPort(4599).forStatusCode(200));
}
```

**Its own address.** This was the one surprise in the setup. floci-oci builds the endpoints it returns (the vault's `cryptoEndpoint`, the queue's `messagesEndpoint`, the PAR URLs) from `FLOCI_OCI_BASE_URL`, which defaults to `http://localhost:4599`. I read the code to confirm it: the request's own host is used only when it names an OCI region. With the random port that Testcontainers maps, the endpoints would point at a port where nothing listens. So the container binds a free host port chosen up front and tells the emulator its address.

**The Docker socket and `published` mode**, for the PostgreSQL container, as in section 2.

**A reset before stopping.** Testcontainers removes the emulator with a kill, so floci-oci gets no chance to stop its PostgreSQL containers, and my first runs left one behind per test class. The container's `stop()` now calls `POST /_floci/state/reset` first, which removes them with their volumes.

### What the tests prove

Each test drives a claim through the REST API, the way a client would, and then checks the OCI side directly:

```java
@Test
void keepsOnlyTheEncryptedReceiptInTheBucket() throws Exception {
    Claim claim = open("bruno");
    upload(claim.uploadUrl(), PDF);
    submit(claim.id()).statusCode(202);
    awaitStatus(claim.id(), ExpenseStatus.READY_FOR_REVIEW);

    byte[] stored = readObject(ReceiptBucket.stored(claim.id()));

    assertThat(new String(stored, StandardCharsets.ISO_8859_1)).doesNotContain("%PDF");
    assertThat(stored.length).isGreaterThan(PDF.length);
    assertThatThrownBy(() -> headObject(ReceiptBucket.incoming(claim.id())))
            .isInstanceOfSatisfying(BmcException.class, e -> assertThat(e.getStatusCode()).isEqualTo(404));
}
```

`upload` is a plain `java.net.http.HttpClient` PUT with no OCI signature, which is what a browser or a mobile app would send. Other tests check that the downloaded receipt is identical to the upload, that a text file is `REJECTED`, that submitting without an upload or twice is a `409`, that the upload URL cannot touch any other object, and that claims are listed from the database.

**The dead-letter queue is real.** A job the worker can never process lands in it after three deliveries, which `GetStats` shows:

```java
@Test
void movesAJobThatKeepsFailingToTheDeadLetterQueue() {
    long deadLettersBefore = deadLetters();
    enqueueRaw("not-an-expense-id");

    await().atMost(PROCESSING).until(() -> deadLetters() > deadLettersBefore);
}
```

```text
WARN  [ReceiptWorker] Receipt job 'not-an-expense-id' failed on delivery 1, leaving it to the queue: Invalid UUID string: not-an-expense-id
WARN  [ReceiptWorker] Receipt job 'not-an-expense-id' failed on delivery 2, leaving it to the queue: Invalid UUID string: not-an-expense-id
WARN  [ReceiptWorker] Receipt job 'not-an-expense-id' failed on delivery 3, leaving it to the queue: Invalid UUID string: not-an-expense-id
```

**The cryptography is real.** Every receipt gets its own data key, and after a master key rotation, a receipt sealed before the rotation still opens:

```java
@Test
void opensAReceiptSealedBeforeTheMasterKeyWasRotated() {
    ReceiptCipher.Sealed beforeRotation = cipher.seal(RECEIPT);

    rotateMasterKey();
    ReceiptCipher.Sealed afterRotation = cipher.seal(RECEIPT);

    assertThat(cipher.open(beforeRotation.body(), beforeRotation.wrappedKey())).isEqualTo(RECEIPT);
    assertThat(cipher.open(afterRotation.body(), afterRotation.wrappedKey())).isEqualTo(RECEIPT);
}
```

The wrapped key explains how. Decoded, it starts with `ocid1.keyversion.oc1.iad...` (you can see it in the CLI output in section 6). In the [0.7.0 source](https://github.com/floci-io/floci-oci/blob/0.7.0/src/main/java/io/floci/oci/services/kms/KmsService.java), the envelope is the key version OCID, a random 12 byte IV and the AES-GCM output with a 128 bit tag, so KMS knows which version to decrypt with. That format is the emulator's own: real OCI ciphertext is opaque, so never parse it in application code.

**Tenancies are isolated.** floci-oci uses the tenancy in the signature's `keyId` as a storage partition. One container serves two tenancies that cannot see each other:

```java
@Test
void aBucketOfOneTenancyIsInvisibleToTheOther() {
    createBucket(tenancyA, TENANCY_A, "invoices");

    assertThat(bucketNames(tenancyA, TENANCY_A)).contains("invoices");
    assertThatThrownBy(() -> bucketNames(tenancyB, TENANCY_A))
            .isInstanceOfSatisfying(BmcException.class, e -> assertNotFound(e, "NotAuthorizedOrNotFound"));
    assertThatThrownBy(() -> tenancyB.getBucket(GetBucketRequest.builder()
            .namespaceName(namespace(tenancyB)).bucketName("invoices").build()))
            .isInstanceOfSatisfying(BmcException.class, e -> assertNotFound(e, "BucketNotFound"));
}
```

My first version of this test asserted that tenancy B's listing of tenancy A's compartment was empty. floci-oci rejected the call with `404 NotAuthorizedOrNotFound`, which is what real OCI answers for a compartment you cannot see, and a better assertion than mine.

```text
[INFO] Tests run: 11, Failures: 0, Errors: 0, Skipped: 0 -- in dev.omatheusmesmo.demos.flocioci.expense.ExpenseWorkflowTest
[INFO] Tests run: 2, Failures: 0, Errors: 0, Skipped: 0 -- in dev.omatheusmesmo.demos.flocioci.expense.ReceiptCipherRotationTest
[INFO] Tests run: 2, Failures: 0, Errors: 0, Skipped: 0 -- in dev.omatheusmesmo.demos.flocioci.tenancy.TenancyIsolationTest
[INFO] Tests run: 15, Failures: 0, Errors: 0, Skipped: 0
[INFO] BUILD SUCCESS
```

`make test` needs nothing but Docker. It starts floci-oci, and floci-oci starts PostgreSQL.

---

## 6. The OCI CLI, unchanged

These commands come from [`scripts/cli-tour.sh`](https://github.com/omatheusmesmo/demos/blob/main/cloud/floci-oci/scripts/cli-tour.sh), run against the resources Terraform creates in section 7. The CLI is the stock 3.96.0, and `ocilocal` only adds the endpoint.

**Database with PostgreSQL:** the DB system is `ACTIVE`, and its endpoint is the PostgreSQL container's published port:

```bash
$ oci psql db-system-collection list-db-systems --compartment-id $TENANCY --output table
+-------------+---------------------+--------+---------+
| name        | shape               | state  | version |
+-------------+---------------------+--------+---------+
| expenses-db | VM.Standard.E4.Flex | ACTIVE | 16.15   |
+-------------+---------------------+--------+---------+

$ oci psql connection-details get --db-system-id $DB_SYSTEM_ID --query 'data."primary-db-endpoint"'
{
  "fqdn": "localhost",
  "ip-address": null,
  "port": 15432
}
```

Terraform sent `16` and `PostgreSQL.VM.Standard.E4.Flex`. floci-oci reports the server's own version and the bare shape, as its [documentation](https://github.com/floci-io/floci-oci/blob/0.7.0/docs/services/psql.md) describes, and the provider accepts both without drift.

**Secrets:** the password secret, without printing the password:

```bash
$ oci secrets secret-bundle get --secret-id $EXPENSES_DATABASE_PASSWORD_SECRET_ID
{
  "stages": [
    "CURRENT",
    "LATEST"
  ],
  "type": "BASE64",
  "version": 1
}
```

**Pre-authenticated upload:** create a write-only URL, then upload with plain `curl`:

```bash
$ oci os preauth-request create -bn expense-receipts --access-type ObjectWrite --object-name incoming/cli-tour
/p/M2I0MTEwNjEtYWQ2ZC00NTJlLTgwOGQtOGMyMzIwMTI0MGI4/n/floci-local/b/expense-receipts/o/incoming/cli-tour

$ curl -X PUT --data-binary @receipt.pdf "http://localhost:4599$ACCESS_URI"
HTTP 200, no OCI signature

$ oci os object list -bn expense-receipts --prefix incoming/
[
  {
    "name": "incoming/cli-tour",
    "size": 22
  }
]
```

**KMS:** a data key, wrapped only (`--include-plaintext-key false`):

```bash
$ oci kms crypto generate-data-encryption-key --key-id $EXPENSES_KEYS_KEY_ID \
    --key-shape '{"algorithm": "AES", "length": 32}' --include-plaintext-key false
{
  "ciphertext": "AAAAVW9jaWQxLmtleXZlcnNpb24ub2MxLmlhZC55bTR5aXF4aWEzbnQ2bmp0YXplbGJxb3p2cDdhbHV2aXY0bmltZ252ZGhnMnMycGlxMmdkbHRnZDQyb2h2Vywd3haDGvfiGbrKOh+Q6+OU/XpBpbQZtE5YHBOulh2SBdKUHPX3qfbvfkv7xQjU/Iay04QpkEK0htE=",
  "plaintext": null
}
```

**Queue** statistics, and **errors** in the OCI shape and code:

```bash
$ oci queue messages get-stats --queue-id $EXPENSES_JOBS_QUEUE_ID --query 'data.queue'
{
  "in-flight-messages": 0,
  "size-in-bytes": 0,
  "visible-messages": 0
}

$ oci os bucket get -bn does-not-exist
    "code": "BucketNotFound",
    "message": "Either the bucket named 'does-not-exist' does not exist in the namespace 'floci-local' or you are not authorized to access it",
    "status": 404,
```

---

## 7. Terraform and OpenTofu

In dev mode, the resources come from Terraform, with the official `oracle/oci` provider and no fork or wrapper. The provider has per-client host overrides, and an environment variable points each client the module uses at the emulator:

```bash
export TF_VAR_CLIENT_HOST_OVERRIDES="oci_identity.IdentityClient=http://localhost:4599;oci_object_storage.ObjectStorageClient=http://localhost:4599;oci_kms.KmsVaultClient=http://localhost:4599;oci_vault.VaultsClient=http://localhost:4599;oci_queue.QueueAdminClient=http://localhost:4599;oci_psql.PostgresqlClient=http://localhost:4599"
```

The module is what you would write for a real tenancy, split by concern (`storage.tf`, `keys.tf`, `queue.tf`, `database.tf`). The database part:

```hcl
resource "random_password" "database" {
  length  = 32
  special = false
}

resource "oci_vault_secret" "database_password" {
  compartment_id = var.tenancy_ocid
  vault_id       = oci_kms_vault.expenses.id
  key_id         = oci_kms_key.receipts.id
  secret_name    = "expenses-db-password"

  secret_content {
    content_type = "BASE64"
    content      = base64encode(random_password.database.result)
  }
}

resource "oci_psql_db_system" "expenses" {
  compartment_id              = var.tenancy_ocid
  display_name                = "expenses-db"
  db_version                  = "16"
  shape                       = "PostgreSQL.VM.Standard.E4.Flex"
  instance_ocpu_count         = 2
  instance_memory_size_in_gbs = 32

  network_details {
    subnet_id = var.database_subnet_id
  }

  storage_details {
    is_regionally_durable = true
    system_type           = "OCI_OPTIMIZED_STORAGE"
  }

  credentials {
    username = "expenses"

    password_details {
      password_type  = "VAULT_SECRET"
      secret_id      = oci_vault_secret.database_password.id
      secret_version = "1"
    }
  }
}

data "oci_psql_db_system_connection_detail" "expenses" {
  db_system_id = oci_psql_db_system.expenses.id
}
```

Networking is not emulated in 0.7.0, so `database_subnet_id` is a placeholder OCID that floci-oci stores as given. On a real tenancy it is your private subnet. The queue sets `dead_letter_queue_delivery_count = 3`, which is the dead-letter queue from section 4.5.

`make provision` runs Terraform in a container, applies the module, and writes the outputs to `.env` and the CA certificate to `.certs/`, which Quarkus reads in dev mode:

```text
oci_kms_vault.expenses: Creation complete after 0s [id=ocid1.vault.oc1.iad.jxrxiyyhqrnr2l5ise6kbebrtfvr2bavcoe4dv5sc3q3mauqqak2vt46k4gi]
oci_queue_queue.receipt_processing: Creation complete after 0s [id=ocid1.queue.oc1.iad.y45i7cibtgdruaj3evziltoaj4kbwfjodwlycsxdcyq4zpse7jsakpwxpewf]
oci_objectstorage_bucket.receipts: Creation complete after 0s [id=n/floci-local/b/expense-receipts]
oci_kms_key.receipts: Creation complete after 0s [id=ocid1.key.oc1.iad.yy37i4s46kxzv6g3aqdflu64brohfvhlfsmd2amkphir5n6h4gp3tcxqqsgk]
oci_vault_secret.database_password: Creation complete after 1s [id=ocid1.vaultsecret.oc1.iad.j43t4ttk5bduhusugsb3hoyqd7iv6rvf442jzwwuod4keqoe4l4czcttfhog]
oci_psql_db_system.expenses: Still creating... [10s elapsed]
oci_psql_db_system.expenses: Creation complete after 10s [id=ocid1.postgresqldbsystem.oc1.iad.cxcivjieuq5n4pnh62o7vwdjnoig7usgedl5vlpqb2badjnlr3z2ldc4yrmi]

Apply complete! Resources: 7 added, 0 changed, 0 destroyed.
```

Those 10 seconds are a real PostgreSQL container starting. The provider polls the work request until the DB system is `ACTIVE`, exactly as it does on OCI, where the same step takes a lot longer.

The real test of an emulator for infrastructure as code is the next plan. If any attribute comes back different from what the provider sent, Terraform wants to change it, and every plan shows drift. `make drift` runs `plan -detailed-exitcode`:

```text
No changes. Your infrastructure matches the configuration.

Terraform has compared your real infrastructure against your configuration
and found no differences, so no changes are needed.
```

The exit code was 0. `TOOL=tofu make provision drift destroy` gave the same result with OpenTofu 1.9.1.

`destroy` taught me something. It hung on the bucket, retrying until it gave up, because the CLI tour had left an object in it. That is faithful behaviour: OCI refuses to delete a bucket that still holds objects. So `make destroy` empties the bucket with `oci os object bulk-delete` first. There is one small difference to know about. floci-oci 0.7.0 answers that delete with `409` and the code `Conflict`, while the `main` branch already returns `BucketNotEmpty` (changed in [#133](https://github.com/floci-io/floci-oci/pull/133), after the 0.7.0 release).

---

## 8. Things to keep in mind

- **floci-oci outlives your app.** Quarkus live reload restarts the application, not the emulator, so the bucket, the queue and the database keep their data between runs. That is why claim ids are random UUIDs. `POST /_floci/state/reset` clears everything, PostgreSQL containers included, and `make down` calls it before stopping compose.
- **PostgreSQL needs the Docker socket.** That gives the emulator control of your Docker daemon, which is fine on a laptop or a CI runner and something to think about anywhere else. Where Docker is not available, `FLOCI_OCI_SERVICES_PSQL_MOCK=true` makes every DB system `ACTIVE` with nothing listening, which is enough for Terraform and API tests but not for JDBC.
- **Signatures are never verified.** That is what makes it frictionless, and also why it is a test tool only. `FLOCI_OCI_AUTH_REQUIRE_SIGNATURE=true` rejects unsigned requests, but it still does not check the signature.
- **No Networking and no Oracle Database in 0.7.0.** Subnet OCIDs are stored as given, and [#143](https://github.com/floci-io/floci-oci/issues/143) requests Autonomous Database, backed by the Autonomous Database Free container.
- **Known gaps.** The README lists what is not implemented yet: identity domains, dynamic groups, tag namespaces, queue consumer groups, KMS key backup and replication, and secret rotation, among others. I also hit the PAR `fullPath` issue ([#144](https://github.com/floci-io/floci-oci/issues/144)). Check the [services overview](https://floci.io/floci-oci/services/) before you rely on an edge case.
- **Pin the image.** Releases come twice a month and behaviour moves (the `BucketNotEmpty` change above is one example). Pin `0.7.0` in compose and in tests, the same tag in both places, and upgrade on purpose.

---

## Conclusion

OCI is the cloud where local emulation was hardest to find, and floci-oci changes that. In this demo, the stock OCI CLI, the official Java SDK and the official Terraform provider all ran against it. The one workaround in the application code, for a relative PAR path, is also correct on real OCI. And the emulator behaved like OCI where it mattered: a real PostgreSQL created through the OCI API, with its password in the Vault and a certificate that verifies; PAR URLs scoped to one object; a queue that retries and dead-letters; envelope encryption that survives key rotation; tenancy isolation with OCI's own error codes; and a Terraform plan with zero drift.

The Quarkus side needs more wiring than the AWS story, because there is no OCI extension and no Dev Services provider for floci-oci yet. But that wiring fits in a handful of small classes: a signer, one client per service, endpoints as configuration, a credentials provider for the database, and a container plus a test resource on the test side. Having a real queue and a real database a few milliseconds away also paid off in an unexpected way: it let me reproduce a race in my own worker with a deterministic test.

If you build on OCI, the [`cloud/floci-oci` demo](https://github.com/omatheusmesmo/demos/tree/main/cloud/floci-oci) is a starting point: `make test` runs everything with only Docker installed, and `make dev` gives you the full local loop.
