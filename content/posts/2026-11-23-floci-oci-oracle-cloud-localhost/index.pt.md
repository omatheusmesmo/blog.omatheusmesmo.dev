---
title: "Oracle Cloud no localhost com o floci-oci"
date: 2026-11-23T10:00:00-03:00
draft: false
tags: ["Floci", "floci-oci", "OCI", "Oracle Cloud", "Quarkus", "Java", "Testcontainers", "Terraform", "OpenTofu", "OCI CLI", "PostgreSQL", "Object Storage", "KMS", "Queue", "Desenvolvimento Local", "CI", "Cloud"]
author: "Matheus Oliveira"
slug: "floci-oci-oracle-cloud-local"
summary: "A Oracle Cloud nunca teve um LocalStack. O floci-oci, o membro OCI da família Floci, é um emulador gratuito com o qual os SDKs oficiais, a OCI CLI e o provider oracle/oci do Terraform conversam sem mudanças. Construí um pipeline de comprovantes de despesa sobre OCI PostgreSQL, Vault, uploads pré-autenticados, Queue e KMS e rodei tudo de ponta a ponta no meu notebook, sem conta na Oracle Cloud."
description: "Guia prático do floci-oci 0.7.0, o emulador gratuito e open source da Oracle Cloud Infrastructure. Construa um serviço Quarkus de comprovantes de despesa sobre OCI Database with PostgreSQL (senha num secret do Vault, TLS verify-full), uploads por pre-authenticated request no Object Storage, Queue com dead-letter queue e envelope encryption com KMS. Teste com Testcontainers, use pela OCI CLI sem modificações e provisione com Terraform e OpenTofu, com plan sem drift."
cover:
  image: "cover.png"
  alt: "Uma cápsula vermelha arredondada com ícones de um bucket, uma fila, uma chave e um banco de dados, ligada por uma linha pontilhada a um notebook com o rótulo localhost:4599"
  caption: "Oracle Cloud no localhost com o floci-oci"
  relative: true
---

Em maio escrevi sobre o [Floci como alternativa gratuita ao LocalStack](/posts/floci-alternativa-localstack/), e aquele artigo terminava com os irmãos do Floci para Azure e GCP. Agora existe um quarto, e ele preenche uma lacuna antiga. A Oracle Cloud Infrastructure não tem emulador local oficial: nada equivalente ao LocalStack, nenhum container de desenvolvimento completo. Como diz o [README do floci-oci](https://github.com/floci-io/floci-oci), testar uma integração com OCI sempre exigiu uma tenancy real, credenciais reais e chamadas de rede reais, até no CI.

O [floci-oci](https://floci.io/floci-oci/) é essa peça que faltava: um container, uma porta, licença MIT, e os SDKs oficiais, a OCI CLI e o provider `oracle/oci` do Terraform conversam com ele sem mudanças.

Para ver até onde ele vai, construí algo que você colocaria em produção, e não um hello world: um **pipeline de comprovantes de despesa**. A pessoa abre um pedido de reembolso, envia o comprovante direto para o Object Storage por uma URL pré-autenticada e submete. Um worker pega o job na OCI Queue, confere o arquivo, criptografa com uma data key do KMS e marca o pedido como pronto para revisão. Os pedidos ficam no OCI Database with PostgreSQL, cuja senha nunca sai do Vault. Todo serviço dessa descrição é um serviço da OCI, e o floci-oci emula todos eles. Testei de ponta a ponta, usei pela OCI CLI e provisionei com Terraform e OpenTofu, no meu notebook, sem conta na Oracle Cloud. O código está na [demo `cloud/floci-oci`](https://github.com/omatheusmesmo/demos/tree/main/cloud/floci-oci), e cada saída abaixo vem de uma execução real.

> **Testado com**
> floci-oci 0.7.0 (sidecar PostgreSQL 16) · Quarkus 3.40.1 · OCI Java SDK 3.102.0 · Testcontainers 2.0.5 · Terraform 1.10.5 · OpenTofu 1.9.1 · provider `oracle/oci` 9.12.1 · OCI CLI 3.96.0 · Java 25 · Docker 29.9.2

---

## 1. O que é o floci-oci?

O floci-oci entrega serviços com cara de OCI em `http://localhost:4599`. Ele é o membro OCI da família [Floci](https://github.com/floci-io), e cada membro usa a sua própria porta:

| Emulador | Cloud | Porta |
| :--- | :--- | :---: |
| floci | AWS | 4566 |
| floci-az | Azure | 4577 |
| floci-gcp | GCP | 4588 |
| **floci-oci** | **OCI** | **4599** |

Como o irmão da AWS, é uma aplicação Quarkus compilada para binário nativo. Esta é a imagem 0.7.0 subindo na minha máquina:

```text
floci-oci 0.7.0 native (powered by Quarkus 3.40.1.1) started in 0.038s. Listening on: http://0.0.0.0:4599
```

O que faz ele parecer OCI é o protocolo. Toda resposta traz um `opc-request-id`, as listagens paginam por `opc-next-page`, as escritas respeitam `etag` e `if-match`, os recursos ganham OCIDs de verdade, operações assíncronas passam por work requests, e os erros usam os códigos da própria OCI (`NotAuthorizedOrNotFound`, `BucketNotFound`...). É por isso que os SDKs e o Terraform funcionam sem mudanças.

A autenticação é a parte que mais tira atrito. Toda requisição OCI é assinada com uma API key, e o floci-oci **lê a assinatura mas nunca a verifica**. Ele extrai a tenancy e o usuário do `keyId` da assinatura e ignora o resto, então qualquer chave RSA gerada localmente serve. Não há chave para enviar nem fingerprint para registrar.

A versão 0.7.0 cobre Identity, Object Storage (com multipart, pre-authenticated requests, versionamento e uma API compatível com S3), Queue, Streaming, Vault e KMS (com criptografia real), Secrets, Functions, Container Engine for Kubernetes, Database with PostgreSQL, Organizations, Governance Rules e Work Requests. Functions, OKE e PostgreSQL rodam containers reais ao lado do emulador (Fn Project, k3s e PostgreSQL), e o resto é emulado no próprio processo. Events, Notifications, Logging, Monitoring e Networking não estão na 0.7.0, então consulte a [visão geral dos serviços](https://floci.io/floci-oci/services/) da tag que você fixar, e não a do `main`.

Falta mais uma coisa nessa lista: **o floci-oci não tem serviço de Oracle Database nem de Autonomous Database**. A Oracle publica um [container do Autonomous Database Free](https://github.com/oracle/adb-free) que poderia sustentar esse serviço do mesmo jeito que o PostgreSQL é sustentado hoje, então abri a [floci-io/floci-oci#143](https://github.com/floci-io/floci-oci/issues/143) pedindo isso. Até lá, o OCI Database with PostgreSQL é o banco que dá para provisionar pela API da OCI, e é ele que esta demo usa.

As releases saem no dia 15 e no último dia de cada mês, e uma tag `nightly` acompanha o `main` entre elas.

---

## 2. Comece em 30 segundos

Um `compose.yaml` basta. Uso a variante `compat`, que adiciona a OCI CLI e um profile descartável já configurado:

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

O socket do Docker e o `FLOCI_OCI_DOCKER_ENDPOINT_MODE` estão ali por causa do PostgreSQL. Cada DB system é um container `postgres:16-alpine` real que o floci-oci sobe pelo socket. Quando o emulador roda em container, ele informa o endpoint do banco, por padrão, como o nome desse container, que só outros containers conseguem resolver. Com `published`, ele informa `localhost` e a porta publicada no host, que é o que uma aplicação rodando na sua máquina precisa. Sem PostgreSQL, as quatro primeiras linhas bastam.

```bash
docker compose up -d --wait
curl -s localhost:4599/_floci/health
```

```json
{"status":"UP","cloud":"oci","services":{"functions":"running","governancerules":"running","identity":"running","kms":"running","objectstorage":"running","oke":"running","organizations":"running","psql":"running","queue":"running","streaming":"running","vault":"running"},"edition":"community","original_edition":"floci-always-free","version":"0.7.0"}
```

A imagem compat traz o `ocilocal`, um wrapper de quatro linhas que roda `oci --endpoint http://localhost:4599 "$@"`. A API key que vem junto existe só porque a OCI CLI se recusa a rodar sem uma, e ela é pública de propósito. Nunca aponte esse profile para uma tenancy real.

---

## 3. A demo: um pipeline de comprovantes de despesa

O serviço tem quatro endpoints e um worker em background:

| Passo | Serviço OCI | O que acontece |
| :--- | :--- | :--- |
| `POST /expenses` | Database with PostgreSQL, Object Storage | Insere o pedido como `AWAITING_RECEIPT` e devolve uma URL pré-autenticada que aceita um único upload de `incoming/<id>` por 15 minutos |
| `PUT` nessa URL | Object Storage | O cliente envia o comprovante sozinho, sem credenciais OCI e sem passar pelo serviço |
| `POST /expenses/{id}/submit` | Object Storage, PostgreSQL, Queue | Confere que o upload existe e não é grande demais, marca o pedido como `SUBMITTED` e enfileira um job |
| Worker | Queue, KMS, Object Storage, PostgreSQL | Confere que o arquivo é PDF, PNG ou JPEG, criptografa com uma data key própria do KMS, guarda em `receipts/<id>`, marca o pedido como `READY_FOR_REVIEW` (ou `REJECTED`) e apaga o upload |
| `GET /expenses/{id}/receipt` | Object Storage, KMS | Desembrulha a data key, descriptografa, confere o SHA-256 e entrega o arquivo original para quem revisa |

Um job que falha sempre não se perde: depois de três entregas a fila move ele para a sua dead-letter queue. A infraestrutura (bucket, vault, master key, fila, secret e DB system) vem do Terraform, nunca da aplicação.

Este é um pedido feito à mão contra o `make dev`:

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

O worker levou menos de um segundo para processar o job.

---

## 4. Ligando o OCI SDK ao Quarkus

### 4.1 Sem extensão, e tudo bem

É aqui que a OCI mais se diferencia do artigo da AWS. Lá, uma propriedade (`quarkus.aws.devservices.provider=floci`) me dava uma AWS local. Para a OCI, o registro de extensões do Quarkus não tem extensão para o OCI Java SDK (conferi em 23 de novembro de 2026), e por isso também não existe provider de Dev Services do Floci. Você liga o SDK por conta própria: o `oci-java-sdk-bom`, um provider de cliente HTTP (`oci-java-sdk-common-httpclient-jersey3`) e um módulo por serviço. Esta demo usa `objectstorage`, `queue`, `keymanagement` e `secrets`.

Um producer CDI monta um signer e um cliente por serviço:

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

São dois modos de signer. O `config-file` lê o `~/.oci/config`, como a OCI CLI faz, e é o padrão em produção. O `throwaway-key` é para dev e teste: gera uma chave RSA em memória na inicialização, e o floci-oci aceita porque a assinatura nunca é conferida. A configuração é a mesma divisão em dois profiles que você usaria de qualquer jeito:

```properties
oci.region=us-ashburn-1
oci.auth.mode=config-file

%dev,test.oci.endpoint=http://localhost:4599
%dev,test.oci.auth.mode=throwaway-key
%dev,test.oci.auth.tenancy-id=ocid1.tenancy.oc1..flocilocaltenancy0000000000000000000000000000000000000000
%dev,test.oci.auth.user-id=ocid1.user.oc1..flocidemouser00000000000000000000000000000000000000000000000
```

### 4.2 Endpoints que vêm dos recursos

Repare no producer do `KmsCryptoClient` acima: ele não usa o `oci.endpoint`. Na OCI real, a API de criptografia do KMS não é regional. Cada vault tem os seus próprios hostnames de `cryptoEndpoint` e `managementEndpoint`. O data plane da Queue funciona do mesmo jeito, pelo `messagesEndpoint` da fila. Então os dois são configuração do serviço (`expenses.keys.crypto-endpoint`, `expenses.jobs.messages-endpoint`), preenchidos a partir dos outputs do Terraform. Isso vale na OCI real também.

O floci-oci devolve o próprio endereço para todos eles. A [documentação do KMS](https://github.com/floci-io/floci-oci/blob/0.7.0/docs/services/kms-vault.md) explica o motivo: os SDKs da OCI rejeitam endpoint com path, então o emulador não consegue codificar o vault na URL. Isso tem uma consequência que vale conhecer. O `CreateKey` não leva o id do vault, então uma chave nova vai para o vault ativo criado por último no compartment. Com um vault por compartment, que é o arranjo comum, isso é exato.

### 4.3 A senha do banco mora no Vault

O DB system é criado com `password_type = "VAULT_SECRET"`: a senha de admin é um secret no Vault, e o floci-oci lê esse secret do próprio Vault quando sobe o container do PostgreSQL. A aplicação lê o mesmo secret. O Quarkus tem um gancho exatamente para isso, o `CredentialsProvider` do `quarkus-credentials`, que o datasource chama antes de abrir conexões:

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

A configuração guarda o OCID do secret, nunca a senha. A URL JDBC vem dos connection details do DB system e verifica o servidor: cada DB system tem o seu próprio certificado autoassinado, devolvido como `caCertificate`, e o SAN dele cobre `localhost`, então o `sslmode=verify-full` funciona:

```text
jdbc:postgresql://localhost:15432/postgres?sslmode=verify-full&sslrootcert=.../.certs/expenses-db-ca.pem
```

O Flyway roda na inicialização, contra um banco que o Terraform criou pela API da OCI:

```text
INFO  [org.flywaydb.core.FlywayExecutor] Database: jdbc:postgresql://localhost:15432/postgres?sslmode=verify-full&... (PostgreSQL 16.15)
INFO  [org.flywaydb.core.internal.command.DbMigrate] Successfully applied 1 migration to schema "public", now at version v1
```

### 4.4 Uploads que nunca passam pelo serviço

Comprovantes são arquivos, e passar todo upload pela API faria do serviço um proxy de bytes que ele não precisa ver. O Object Storage tem uma resposta melhor: a **pre-authenticated request** (PAR), uma URL que permite uma operação em um objeto até expirar. O serviço cria uma PAR `ObjectWrite` para `incoming/<id>` e entrega ao cliente:

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

O floci-oci limita a PAR do jeito que a OCI faz. A URL de upload não escreve em nenhum outro objeto, e não consegue nem ler o objeto que ela escreve: os dois casos devolvem `404 NotAuthorizedOrNotFound`, e um teste confere isso.

As quatro últimas linhas existem por causa do primeiro bug do floci-oci que encontrei. A OCI real devolve o `fullPath` como a URL completa. O floci-oci 0.7.0 devolve o mesmo path relativo do `accessUri`, então a minha primeira versão entregava `/p/...` ao cliente, e o `HttpClient` do Java recusava com `URI with undefined scheme`. Lendo o código, vi também que o Get e o List devolvem o `fullPath` com o token, embora a OCI mostre o token uma única vez, na criação. Reportei os dois na [floci-io/floci-oci#144](https://github.com/floci-io/floci-oci/issues/144). O contorno resolve um path relativo contra o endpoint do Object Storage, que é o mesmo que você faz com o `accessUri` na OCI real, então o código é correto nos dois.

### 4.5 O worker: Queue, retentativas e dead-letter queue

Submeter um pedido enfileira o id dele. Um método agendado pega até dez jobs por consulta, usando o long polling da Queue:

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

Um job que falha não é confirmado. Quando o visibility timeout termina, a fila entrega de novo, e depois de três entregas (`dead_letter_queue_delivery_count = 3`) ele vai para a dead-letter queue. Isso só funciona se o processamento for idempotente, então o processor confere o estado do pedido primeiro:

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

O ramo `AWAITING_RECEIPT` é um bug que o emulador me ajudou a achar. O `submit` enfileira o job dentro da sua transação, então uma falha ao enfileirar desfaz a submissão. Só que isso também significa que o worker pode receber o job *antes* do commit, enquanto o pedido ainda aparece como `AWAITING_RECEIPT`. A minha primeira versão tratava qualquer estado diferente de `SUBMITTED` como "já processado" e confirmava o job, e o pedido ficava `SUBMITTED` para sempre. Com uma fila real a poucos milissegundos, consegui escrever um teste que segura o pedido nessa janela de propósito. Ele falhava no código antigo e passa agora, porque o job volta para a fila e é processado na entrega seguinte.

### 4.6 Envelope encryption com KMS

Comprovantes têm dados pessoais, então são guardados criptografados. O `Encrypt` do KMS aceita no máximo 4 KB, o que descarta criptografar um PDF direto. A resposta padrão é **envelope encryption**: pedir ao KMS uma data key nova, criptografar o arquivo localmente com ela e guardar só a cópia embrulhada (criptografada pelo KMS) da chave:

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

O bucket guarda `receipts/<id>` como IV mais o ciphertext AES-GCM. O banco guarda a chave embrulhada e o SHA-256 do original. Para entregar o comprovante, o serviço pede ao KMS para descriptografar a chave embrulhada, descriptografa o arquivo e confere o hash. A chave em texto claro só existe em memória, e só pelo tempo de um arquivo.

---

## 5. Testando contra o floci-oci

A aplicação nunca cria recursos OCI. Nos testes, um `QuarkusTestResourceLifecycleManager` sobe o floci-oci com Testcontainers, provisiona a stack inteira pelo SDK (bucket, vault, chave, fila, secret e DB system, esperando ele ficar `ACTIVE`) e passa os identificadores e a URL JDBC para a aplicação como configuração. O Terraform faz o mesmo papel no modo dev (seção 7).

### O container precisa de três coisas

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

**O próprio endereço.** Essa foi a única surpresa da configuração. O floci-oci monta os endpoints que devolve (o `cryptoEndpoint` do vault, o `messagesEndpoint` da fila, as URLs das PARs) a partir do `FLOCI_OCI_BASE_URL`, que por padrão é `http://localhost:4599`. Li o código para confirmar: o host da própria requisição só é usado quando nomeia uma região da OCI. Com a porta aleatória que o Testcontainers mapeia, os endpoints apontariam para uma porta onde nada escuta. Então o container fixa uma porta livre do host escolhida antes e informa o endereço ao emulador.

**O socket do Docker e o modo `published`**, para o container do PostgreSQL, como na seção 2.

**Um reset antes de parar.** O Testcontainers remove o emulador com um kill, então o floci-oci não tem chance de parar os containers do PostgreSQL, e as minhas primeiras execuções deixavam um para trás por classe de teste. O `stop()` do container agora chama `POST /_floci/state/reset` antes, que remove esses containers junto com os volumes.

### O que os testes provam

Cada teste leva um pedido pela API REST, como um cliente faria, e depois confere o lado da OCI diretamente:

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

O `upload` é um PUT simples com `java.net.http.HttpClient`, sem assinatura OCI, que é o que um navegador ou um app mobile mandaria. Outros testes conferem que o comprovante baixado é idêntico ao enviado, que um arquivo de texto vira `REJECTED`, que submeter sem upload ou duas vezes dá `409`, que a URL de upload não mexe em nenhum outro objeto e que os pedidos são listados a partir do banco.

**A dead-letter queue é real.** Um job que o worker nunca consegue processar cai nela depois de três entregas, e o `GetStats` mostra:

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

**A criptografia é real.** Cada comprovante ganha a sua própria data key, e depois de uma rotação da master key, um comprovante selado antes da rotação continua abrindo:

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

A chave embrulhada explica como. Decodificada, ela começa com `ocid1.keyversion.oc1.iad...` (dá para ver na saída da CLI na seção 6). No [código da 0.7.0](https://github.com/floci-io/floci-oci/blob/0.7.0/src/main/java/io/floci/oci/services/kms/KmsService.java), o envelope é o OCID da versão da chave, um IV aleatório de 12 bytes e a saída do AES-GCM com tag de 128 bits, então o KMS sabe com qual versão descriptografar. Esse formato é do emulador: o ciphertext da OCI real é opaco, então nunca faça parse dele no código da aplicação.

**As tenancies são isoladas.** O floci-oci usa a tenancy do `keyId` da assinatura como partição de armazenamento. Um container atende duas tenancies que não se enxergam:

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

A primeira versão desse teste afirmava que a listagem da tenancy B no compartment da tenancy A vinha vazia. O floci-oci rejeitou a chamada com `404 NotAuthorizedOrNotFound`, que é o que a OCI real responde para um compartment que você não enxerga, e uma asserção melhor que a minha.

```text
[INFO] Tests run: 11, Failures: 0, Errors: 0, Skipped: 0 -- in dev.omatheusmesmo.demos.flocioci.expense.ExpenseWorkflowTest
[INFO] Tests run: 2, Failures: 0, Errors: 0, Skipped: 0 -- in dev.omatheusmesmo.demos.flocioci.expense.ReceiptCipherRotationTest
[INFO] Tests run: 2, Failures: 0, Errors: 0, Skipped: 0 -- in dev.omatheusmesmo.demos.flocioci.tenancy.TenancyIsolationTest
[INFO] Tests run: 15, Failures: 0, Errors: 0, Skipped: 0
[INFO] BUILD SUCCESS
```

O `make test` não precisa de nada além do Docker. Ele sobe o floci-oci, e o floci-oci sobe o PostgreSQL.

---

## 6. A OCI CLI, sem modificações

Estes comandos vêm do [`scripts/cli-tour.sh`](https://github.com/omatheusmesmo/demos/blob/main/cloud/floci-oci/scripts/cli-tour.sh), rodado contra os recursos que o Terraform cria na seção 7. A CLI é a 3.96.0 original, e o `ocilocal` só adiciona o endpoint.

**Database with PostgreSQL:** o DB system está `ACTIVE`, e o endpoint dele é a porta publicada do container do PostgreSQL:

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

O Terraform mandou `16` e `PostgreSQL.VM.Standard.E4.Flex`. O floci-oci informa a versão do próprio servidor e o shape sem prefixo, como descreve a [documentação](https://github.com/floci-io/floci-oci/blob/0.7.0/docs/services/psql.md), e o provider aceita os dois sem drift.

**Secrets:** o secret da senha, sem imprimir a senha:

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

**Upload pré-autenticado:** crie uma URL só de escrita e envie com `curl` puro:

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

**KMS:** uma data key, só embrulhada (`--include-plaintext-key false`):

```bash
$ oci kms crypto generate-data-encryption-key --key-id $EXPENSES_KEYS_KEY_ID \
    --key-shape '{"algorithm": "AES", "length": 32}' --include-plaintext-key false
{
  "ciphertext": "AAAAVW9jaWQxLmtleXZlcnNpb24ub2MxLmlhZC55bTR5aXF4aWEzbnQ2bmp0YXplbGJxb3p2cDdhbHV2aXY0bmltZ252ZGhnMnMycGlxMmdkbHRnZDQyb2h2Vywd3haDGvfiGbrKOh+Q6+OU/XpBpbQZtE5YHBOulh2SBdKUHPX3qfbvfkv7xQjU/Iay04QpkEK0htE=",
  "plaintext": null
}
```

**Queue:** as estatísticas da fila. E os **erros** saem no formato e com os códigos da OCI:

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

## 7. Terraform e OpenTofu

No modo dev, os recursos vêm do Terraform, com o provider oficial `oracle/oci` e nenhum fork ou wrapper. O provider tem overrides de host por cliente, e uma variável de ambiente aponta cada cliente que o módulo usa para o emulador:

```bash
export TF_VAR_CLIENT_HOST_OVERRIDES="oci_identity.IdentityClient=http://localhost:4599;oci_object_storage.ObjectStorageClient=http://localhost:4599;oci_kms.KmsVaultClient=http://localhost:4599;oci_vault.VaultsClient=http://localhost:4599;oci_queue.QueueAdminClient=http://localhost:4599;oci_psql.PostgresqlClient=http://localhost:4599"
```

O módulo é o que você escreveria para uma tenancy real, separado por assunto (`storage.tf`, `keys.tf`, `queue.tf`, `database.tf`). A parte do banco:

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

O Networking não é emulado na 0.7.0, então `database_subnet_id` é um OCID de exemplo que o floci-oci guarda como veio. Numa tenancy real, é a sua subnet privada. A fila define `dead_letter_queue_delivery_count = 3`, que é a dead-letter queue da seção 4.5.

O `make provision` roda o Terraform num container, aplica o módulo e grava os outputs no `.env` e o certificado da CA em `.certs/`, que o Quarkus lê no modo dev:

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

Esses 10 segundos são um container PostgreSQL de verdade subindo. O provider consulta o work request até o DB system ficar `ACTIVE`, exatamente como faz na OCI, onde o mesmo passo demora bem mais.

O teste de verdade de um emulador para infraestrutura como código é o plan seguinte. Se qualquer atributo voltar diferente do que o provider mandou, o Terraform quer mudar, e todo plan mostra drift. O `make drift` roda `plan -detailed-exitcode`:

```text
No changes. Your infrastructure matches the configuration.

Terraform has compared your real infrastructure against your configuration
and found no differences, so no changes are needed.
```

O exit code foi 0. `TOOL=tofu make provision drift destroy` deu o mesmo resultado com o OpenTofu 1.9.1.

O `destroy` me ensinou uma coisa. Ele travou no bucket, tentando de novo até desistir, porque o tour da CLI tinha deixado um objeto lá. É um comportamento fiel: a OCI se recusa a apagar um bucket que ainda tem objetos. Então o `make destroy` esvazia o bucket com `oci os object bulk-delete` antes. Há uma diferença pequena para conhecer. O floci-oci 0.7.0 responde esse delete com `409` e o código `Conflict`, enquanto o branch `main` já devolve `BucketNotEmpty` (mudança da [#133](https://github.com/floci-io/floci-oci/pull/133), depois da release 0.7.0).

---

## 8. Pontos de atenção

- **O floci-oci sobrevive à sua aplicação.** O live reload do Quarkus reinicia a aplicação, não o emulador, então o bucket, a fila e o banco mantêm os dados entre execuções. É por isso que os ids dos pedidos são UUIDs aleatórios. `POST /_floci/state/reset` limpa tudo, inclusive os containers do PostgreSQL, e o `make down` chama esse reset antes de parar o compose.
- **O PostgreSQL precisa do socket do Docker.** Isso dá ao emulador controle do seu daemon Docker, o que é tranquilo num notebook ou num runner de CI e merece reflexão em qualquer outro lugar. Onde não há Docker, `FLOCI_OCI_SERVICES_PSQL_MOCK=true` deixa todo DB system `ACTIVE` sem nada escutando, o que basta para Terraform e testes de API, mas não para JDBC.
- **As assinaturas nunca são verificadas.** É isso que tira o atrito, e é também por isso que ele serve só para testes. `FLOCI_OCI_AUTH_REQUIRE_SIGNATURE=true` rejeita requisições sem assinatura, mas continua sem conferir a assinatura.
- **Sem Networking e sem Oracle Database na 0.7.0.** OCIDs de subnet são guardados como vieram, e a [#143](https://github.com/floci-io/floci-oci/issues/143) pede o Autonomous Database, sustentado pelo container do Autonomous Database Free.
- **Lacunas conhecidas.** O README lista o que ainda não foi implementado: identity domains, dynamic groups, tag namespaces, consumer groups da Queue, backup e replicação de chaves do KMS e rotação de secrets, entre outros. Eu também esbarrei no problema do `fullPath` da PAR ([#144](https://github.com/floci-io/floci-oci/issues/144)). Consulte a [visão geral dos serviços](https://floci.io/floci-oci/services/) antes de depender de um caso de borda.
- **Fixe a imagem.** As releases saem duas vezes por mês e o comportamento muda (a mudança do `BucketNotEmpty` acima é um exemplo). Fixe `0.7.0` no compose e nos testes, a mesma tag nos dois lugares, e atualize de propósito.

---

## Conclusão

A OCI é a cloud em que emulação local era mais difícil de achar, e o floci-oci muda isso. Nesta demo, a OCI CLI original, o Java SDK oficial e o provider oficial do Terraform rodaram contra ele. O único contorno no código da aplicação, para um path relativo de PAR, também é correto na OCI real. E o emulador se comportou como a OCI onde importava: um PostgreSQL real criado pela API da OCI, com a senha no Vault e um certificado que verifica; URLs de PAR limitadas a um objeto; uma fila que tenta de novo e manda para a dead-letter queue; envelope encryption que sobrevive à rotação de chave; isolamento de tenancy com os códigos de erro da própria OCI; e um plan do Terraform sem drift.

O lado do Quarkus pede mais fiação que a história da AWS, porque ainda não existe extensão OCI nem provider de Dev Services para o floci-oci. Mas essa fiação cabe num punhado de classes pequenas: um signer, um cliente por serviço, endpoints como configuração, um credentials provider para o banco e, no lado dos testes, um container e um test resource. Ter uma fila real e um banco real a poucos milissegundos também compensou de um jeito inesperado: me deixou reproduzir uma condição de corrida no meu próprio worker com um teste determinístico.

Se você constrói sobre a OCI, a [demo `cloud/floci-oci`](https://github.com/omatheusmesmo/demos/tree/main/cloud/floci-oci) é um ponto de partida: `make test` roda tudo só com o Docker instalado, e `make dev` entrega o ciclo local completo.
