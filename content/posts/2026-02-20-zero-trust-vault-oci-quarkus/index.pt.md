---
title: "Zero Trust na Prática: Protegendo segredos com OCI Vault e Quarkus"
date: 2026-02-20T07:00:00-03:00
draft: false
tags: ["Jornada Oracle FreeStack", "Quarkus", "OCI", "Security", "Vault", "Cloud Native"]
author: "Matheus Oliveira"
slug: "proteger-segredos-oci-vault-quarkus"
summary: "Eleve sua segurança para o padrão Zero Trust. Aprenda como usar o OCI Vault e Hardware Security Modules (HSM) para proteger os segredos do banco de dados da sua aplicação Quarkus."
description: "Aprenda como proteger sua aplicação Quarkus usando o OCI Vault. Este guia cobre o setup da OCI CLI, segredos protegidos por HSM e a implementação de um CredentialsProvider customizado em Java."
cover:
  image: "oci-vault-security.png"
  alt: "Ilustração de segurança OCI Vault"
  caption: "Segurança Zero Trust com OCI Vault e Quarkus"
  relative: true
---

*Este artigo faz parte da série ["Jornada Oracle FreeStack"](https://blog.omatheusmesmo.dev/tags/jornada-oracle-freestack/). No [artigo anterior]({{< ref "posts/2026-02-17-quarkus-oracle-converged-database-json/index.pt.md" >}}), exploramos o poder do banco convergente da Oracle com JSON nativo. Se você está chegando agora, recomendo começar pela [Etapa 0]({{< ref "posts/2026-02-15-oracle-cloud-free-tier-setup/index.pt.md" >}}) para configurar sua infraestrutura gratuita.*

No post anterior, conectamos nossa API Quarkus ao banco de dados Oracle 26ai. No entanto, deixamos uma vulnerabilidade clássica: a senha do banco estava em texto puro no arquivo `.env`. Em um ambiente profissional, isso é um risco.

Hoje, vamos elevar o nível de segurança para o padrão **Zero Trust**. O objetivo não é necessariamente eliminar o arquivo `.env`, mas sim garantir que ele contenha apenas **identificadores (OCIDs)** e nunca **segredos**. Utilizaremos o **OCI Vault** com proteção via hardware (**HSM**) para que a senha real nunca toque o nosso disco local.

## Identificadores vs. Segredos: O que pode ficar no .env?

No modelo Zero Trust, tratamos a configuração da seguinte forma:
- **O Identificador (OCID):** É o "endereço" do recurso na nuvem. Saber o OCID de um segredo é como saber o endereço de uma agência bancária: você sabe onde ela fica, mas isso não te dá a chave do cofre. Por isso, manter o OCID no `.env` é aceitável.
- **O Segredo (Senha):** É o valor que dá acesso real aos dados. Este valor **nunca** deve tocar o seu disco ou ser injetado como string no ambiente.

### Comparativo de Segurança: Entendendo os Riscos

Para visualizar melhor o ganho de segurança, comparamos três abordagens comuns:

| Critério | 1. Arquivo `.env` (Senha Fixa) | 2. Variáveis de Ambiente (SO) | 3. OCI Vault (Zero Trust) |
| :--- | :--- | :--- | :--- |
| **Onde a senha vive?** | **Disco:** Gravada em texto puro no arquivo. | **Memória/SO:** Injetada no processo do sistema operacional. | **HSM:** Hardware de segurança isolado na nuvem. |
| **Se o projeto vazar (Git)?** | 🚨 **Crítico:** O invasor tem a senha do banco imediatamente. | ⚠️ **Médio:** A senha não está no código, mas pode estar em scripts de CI/CD. | ✅ **Seguro:** Vaza apenas o ID (OCID). Sem autenticação IAM, é inútil. |
| **Se o servidor for invadido?** | Basta ler o arquivo `.env` para roubar a senha. | Basta listar as variáveis do processo (`env` ou `/proc`). | A senha só existe na memória da aplicação, nunca no sistema de arquivos. |
| **Auditoria** | Nenhuma. Você não sabe quem leu o arquivo. | Nenhuma. | **Total:** O Vault registra *quem*, *quando* e *de onde* a senha foi solicitada. |

Ao usar o Vault, transformamos um risco de **confidencialidade** (vazar a senha) em um desafio de **identidade** (autenticar a aplicação). É muito mais fácil proteger e revogar uma identidade do que caçar uma senha vazada na internet.

### É Grátis? (Limites do Always Free)

Muitos desenvolvedores evitam serviços de segurança "Enterprise" por medo de custos ocultos. O Oracle Cloud oferece uma camada **Always Free** generosa para o Vault:
*   **20 Versões de Chaves Mestras (Master Encryption Keys):** Protegidas por Hardware (**HSM**), o que custaria milhares de dólares em outros provedores.
*   **150 Segredos (Secrets):** Capacidade mais do que suficiente para armazenar senhas de banco, tokens de API e chaves privadas para múltiplos projetos pessoais.

---

## Passo 1: Configuração da Identidade (OCI CLI)

Configuramos a OCI CLI para estabelecer a confiança entre nosso ambiente local e a nuvem. Antes de rodar o comando de configuração, você precisará coletar algumas informações no Console da Oracle:

### 1.1. Coletando os Identificadores (OCIDs)
O CLI pedirá três informações vitais. Localize-as antes de começar:
1.  **Tenancy OCID:** Clique no ícone de "boneco" (Perfil) no canto superior direito -> Clique em **Tenancy: [SeuNome]**. Copie o OCID (começa com `ocid1.tenancy...`).
2.  **User OCID:** Clique novamente no Perfil -> **User Settings**. Copie o OCID (começa com `ocid1.user...`).
3.  **Region:** Verifique o nome da sua região no topo da página (ex: `sa-saopaulo-1` ou `us-ashburn-1`).

### 1.2. Instalação e Setup
Com os dados em mãos, instale e configure a CLI. Durante o processo `setup config`, responda `Y` (Yes) para gerar um novo par de chaves RSA.

```bash
# Instalação automatizada (Linux/Unix)
bash -c "$(curl -L https://raw.githubusercontent.com/oracle/oci-cli/master/scripts/install/install.sh)"

# Configuração interativa (Tenha os OCIDs em mãos!)
oci setup config
```

### 1.3. O Aperto de Mão (Upload da Chave Pública)
Ao final do setup, o terminal mostrará a **Public Key Fingerprint** e o caminho do arquivo `oci_api_key_public.pem`.
1.  Copie o conteúdo desse arquivo `.pem`.
2.  Volte ao Console OCI, em **User Settings** > **API Keys**.
3.  Clique em **Add API Key** > **Paste Public Key** e cole o conteúdo.
4.  Clique em **Add**.

### 1.4. Ajuste Crítico: Automação (Passphrase)
Para que o Quarkus consiga iniciar sem travar pedindo senha no terminal, precisamos garantir que a autenticação seja silenciosa. Edite seu arquivo de configuração:

```bash
nano ~/.oci/config
```

Verifique a linha `pass_phrase`:
*   **Se você criou uma senha para a chave:** Adicione a linha `pass_phrase=SuaSenhaSecreta`.
*   **Se você NÃO criou senha (Enter vazio):** Remova completamente a linha `pass_phrase`.

Sem isso, a aplicação falhará ao tentar conectar no Vault durante o boot.

---

## Passo 2: O Cofre, a Chave e o Segredo no Console OCI

1.  **Criar o Vault:** Vá em **Identidade e Segurança > Vault**. Crie o `FreeStack-Vault`.
2.  **Criar a Chave Mestra:** Dentro do cofre, em **Recursos > Chaves de Criptografia Principais**, crie a `FreeStack-Master-Key` com **HSM**.
3.  **Criar o Segredo:** Vá em **Identidade e Segurança > Gerenciamento de Segredos**. Crie o segredo `db-password` vinculado à chave HSM.
4.  **OCID:** Copie o **OCID do Segredo** (prefixo `ocid1.vaultsecret`).

---

## Passo 3: Implementação no Quarkus

### 3.1. Dependências (pom.xml)
Adicionamos o SDK da Oracle e o suporte a credenciais do Quarkus:

```xml
<dependency>
    <groupId>io.quarkus</groupId>
    <artifactId>quarkus-credentials</artifactId>
</dependency>
<dependency>
    <groupId>com.oracle.oci.sdk</groupId>
    <artifactId>oci-java-sdk-secrets</artifactId>
    <version>3.54.0</version>
</dependency>
<dependency>
    <groupId>com.oracle.oci.sdk</groupId>
    <artifactId>oci-java-sdk-common-httpclient-jersey3</artifactId>
    <version>3.54.0</version>
</dependency>
```

### 3.2. OciVaultService.java
Este serviço gerencia a conexão e a recuperação do segredo através do OCI SDK.

```java
@ApplicationScoped
public class OciVaultService {
    private static final Logger LOG = Logger.getLogger(OciVaultService.class);

    @ConfigProperty(name = "oci.secret.ocid")
    Optional<String> secretOcid;

    @ConfigProperty(name = "oci.auth.instance-principal", defaultValue = "false")
    boolean useInstancePrincipal;

    public String getSecretValue() {
        if (secretOcid.isEmpty() || secretOcid.get().startsWith("ocid1.vaultsecret.oc1.xxx")) {
            throw new RuntimeException("CRITICAL ERROR: OCI Secret OCID is not configured.");
        }

        LOG.info("Retrieving secret from OCI Vault: " + secretOcid.get());

        try (SecretsClient secretsClient = createSecretsClient()) {
            GetSecretBundleRequest getSecretBundleRequest = GetSecretBundleRequest.builder()
                    .secretId(secretOcid.get())
                    .build();

            GetSecretBundleResponse getSecretBundleResponse = secretsClient.getSecretBundle(getSecretBundleRequest);
            Base64SecretBundleContentDetails contentDetails = (Base64SecretBundleContentDetails) 
                    getSecretBundleResponse.getSecretBundle().getSecretBundleContent();

            byte[] decodedBytes = Base64.getDecoder().decode(contentDetails.getContent());
            return new String(decodedBytes);
        } catch (Exception e) {
            LOG.error("Error retrieving secret from OCI Vault", e);
            throw new RuntimeException("Could not retrieve secret from OCI Vault.", e);
        }
    }

    private SecretsClient createSecretsClient() throws Exception {
        BasicAuthenticationDetailsProvider provider;
        if (useInstancePrincipal) {
            provider = InstancePrincipalsAuthenticationDetailsProvider.builder().build();
        } else {
            ConfigFileReader.ConfigFile configFile = ConfigFileReader.parseDefault();
            provider = new ConfigFileAuthenticationDetailsProvider(configFile);
        }
        return SecretsClient.builder().build(provider);
    }
}
```

### 3.3. OciVaultCredentialsProvider.java
Este é o componente que integra o Vault ao ecossistema Quarkus. Ao implementar `CredentialsProvider`, permitimos que o Quarkus gerencie o ciclo de vida da credencial.

```java
@ApplicationScoped
@Named("oci-vault-provider")
public class OciVaultCredentialsProvider implements CredentialsProvider {

    @Inject
    OciVaultService vaultService;

    @Override
    public Map<String, String> getCredentials(String credentialsProviderName) {
        Map<String, String> credentials = new HashMap<>();
        String password = vaultService.getSecretValue();
        credentials.put(PASSWORD_PROPERTY_NAME, password);
        return credentials;
    }
}
```

---

## Wallet vs Vault: Onde termina um e começa o outro?

Uma dúvida comum nesta etapa é: *"Se estou usando o Vault para a senha, ainda preciso da Wallet?"*

A resposta curta é **sim**. Eles resolvem problemas diferentes:

1.  **Wallet (Camada de Transporte):** Trata do **Mutual TLS (mTLS)**. Ela contém os certificados que garantem que o "tubo" entre seu Java e a Oracle Cloud seja criptografado e autêntico. Sem a Wallet, você não consegue nem chegar na "porta" do banco.
2.  **Vault (Camada de Autenticação):** Trata das **Credenciais**. Ele guarda a "chave" (senha do ADMIN) que abre o banco. Sem o Vault, você teria que deixar essa chave debaixo do tapete (seu arquivo `.env`).

**A Vantagem Real:** Ao separar os dois, você cria uma defesa em profundidade. Se alguém roubar seu código e sua Wallet, eles ainda não têm a senha. E mesmo que adivinhassem a senha, precisariam da sua Chave de API da OCI para acessar o Vault. É o padrão ouro de segurança em nuvem.

---

## O Elo de Ligação: Como tudo se encaixa?

Você deve estar se perguntando: *Como o banco de dados sabe que deve chamar esse código?* 

A mágica acontece no `application.properties`. Quando definimos `quarkus.datasource.credentials-provider`, o Quarkus altera seu ciclo de vida de inicialização:

1.  **Boot:** O Quarkus inicia e vê que o Datasource exige um provedor de credenciais.
2.  **Lookup:** Ele procura pelo CDI Bean com o nome `@Named("oci-vault-provider")`.
3.  **Request:** O Quarkus chama o método `getCredentials()`.
4.  **OCI Call:** Nosso código vai até a Oracle Cloud, acessa o HSM e traz a senha.
5.  **Injection:** O Quarkus recebe a senha em memória e a injeta no pool de conexões (Agroal).
6.  **Ready:** O banco de dados conecta e a aplicação sobe.

```properties
# Ativa o provedor de credenciais dinâmico
quarkus.datasource.credentials-provider=oci-vault-provider

# Configurações do Vault
oci.secret.ocid=${OCI_SECRET_OCID}
oci.auth.instance-principal=${OCI_INSTANCE_PRINCIPAL:false}
```

---

## Conclusão: Segurança Absoluta

Ao remover o fallback do `.env`, forçamos uma cultura de segurança rigorosa. Agora, a senha do seu banco de dados reside exclusivamente dentro de um hardware criptográfico na nuvem e só é acessada por identidades autorizadas.

No próximo artigo, daremos um passo além: **OCI Object Storage**.

---
## Recursos
- [Repositório Quarkus OCI FreeStack](https://github.com/omatheusmesmo/quarkus-oci-freestack)
- [Documentação OCI Java SDK](https://docs.oracle.com/en-us/iaas/Content/API/SDKDocs/javasdk.htm)
