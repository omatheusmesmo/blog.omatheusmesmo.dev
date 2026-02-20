---
title: "Zero Trust in Practice: Protecting Secrets with OCI Vault and Quarkus"
date: 2026-02-20T07:00:00-03:00
draft: false
tags: ["Oracle FreeStack Journey", "Quarkus", "OCI", "Security", "Vault", "Cloud Native"]
author: "Matheus Oliveira"
slug: "zero-trust-vault-oci-quarkus"
summary: "Upgrade your security to Zero Trust. Learn how to use OCI Vault and Hardware Security Modules (HSM) to protect your Quarkus application's database secrets."
description: "Learn how to secure your Quarkus application using OCI Vault. This guide covers OCI CLI setup, HSM-backed secrets, and implementing a custom CredentialsProvider in Java."
cover:
  image: "oci-vault-security.png"
  alt: "OCI Vault security illustration"
  caption: "Zero Trust Security with OCI Vault and Quarkus"
  relative: true
---

*This article is part of the ["Oracle FreeStack Journey"](https://blog.omatheusmesmo.dev/en/tags/oracle-freestack-journey/) series. In the [previous article]({{< ref "posts/2026-02-17-quarkus-oracle-converged-database-json/index.en.md" >}}), we explored the power of Oracle's converged database with native JSON. If you're just arriving, I recommend starting with [Phase 0]({{< ref "posts/2026-02-15-oracle-cloud-free-tier-setup/index.en.md" >}}) to set up your free infrastructure.*

In the previous post, we connected our Quarkus API to the Oracle 26ai database. However, we left a classic vulnerability: the database password was in plain text in the `.env` file. In a professional environment, this is a risk.

Today, we will raise the security level to the **Zero Trust** standard. The goal is not necessarily to eliminate the `.env` file, but rather to ensure that it contains only **identifiers (OCIDs)** and never **secrets**. We will use **OCI Vault** with hardware protection (**HSM**) so that the real password never touches our local disk.

## Identifiers vs. Secrets: What can stay in the .env?

In the Zero Trust model, we handle configuration as follows:
- **The Identifier (OCID):** It is the "address" of the resource in the cloud. Knowing the OCID of a secret is like knowing the address of a bank branch: you know where it is, but that doesn't give you the key to the vault. Therefore, keeping the OCID in the `.env` is acceptable.
- **The Secret (Password):** It is the value that gives real access to the data. This value **never** should touch your disk or be injected as a string into the environment.

### Security Comparison: Understanding the Risks

To better visualize the security gain, we compare three common approaches:

| Criterion | 1. `.env` file (Fixed Password) | 2. Environment Variables (OS) | 3. OCI Vault (Zero Trust) |
| :--- | :--- | :--- | :--- |
| **Where does the password live?** | **Disk:** Written in plain text in the file. | **Memory/OS:** Injected into the operating system process. | **HSM:** Isolated security hardware in the cloud. |
| **If the project leaks (Git)?** | 🚨 **Critical:** The attacker has the database password immediately. | ⚠️ **Medium:** The password is not in the code, but it could be in CI/CD scripts. | ✅ **Secure:** Only the ID (OCID) leaks. Without IAM authentication, it is useless. |
| **If the server is hacked?** | Just read the `.env` file to steal the password. | Just list the process variables (`env` or `/proc`). | The password only exists in the application's memory, never in the file system. |
| **Audit** | None. You don't know who read the file. | None. | **Total:** The Vault records *who*, *when*, and *from where* the password was requested. |

By using the Vault, we transform a **confidentiality** risk (leaking the password) into an **identity** challenge (authenticating the application). It is much easier to protect and revoke an identity than to hunt down a leaked password on the internet.

### Is it Free? (Always Free Limits)

Many developers avoid "Enterprise" security services for fear of hidden costs. Oracle Cloud offers a generous **Always Free** tier for the Vault:
*   **20 Master Encryption Key Versions:** Protected by Hardware (**HSM**), which would cost thousands of dollars from other providers.
*   **150 Secrets:** More than enough capacity to store database passwords, API tokens, and private keys for multiple personal projects.

---

## Step 1: Identity Configuration (OCI CLI)

We configure the OCI CLI to establish trust between our local environment and the cloud. Before running the configuration command, you will need to collect some information from the Oracle Console:

### 1.1. Collecting Identifiers (OCIDs)
The CLI will ask for three vital pieces of information. Locate them before starting:
1.  **Tenancy OCID:** Click on the "avatar" icon (Profile) in the top right corner -> Click on **Tenancy: [YourName]**. Copy the OCID (starts with `ocid1.tenancy...`).
2.  **User OCID:** Click the Profile again -> **User Settings**. Copy the OCID (starts with `ocid1.user...`).
3.  **Region:** Check your region's name at the top of the page (e.g., `sa-saopaulo-1` or `us-ashburn-1`).

### 1.2. Installation and Setup
With the data in hand, install and configure the CLI. During the `setup config` process, answer `Y` (Yes) to generate a new RSA key pair.

```bash
# Automated installation (Linux/Unix)
bash -c "$(curl -L https://raw.githubusercontent.com/oracle/oci-cli/master/scripts/install/install.sh)"

# Interactive configuration (Have the OCIDs ready!)
oci setup config
```

### 1.3. The Handshake (Public Key Upload)
At the end of the setup, the terminal will show the **Public Key Fingerprint** and the path to the `oci_api_key_public.pem` file.
1.  Copy the content of that `.pem` file.
2.  Go back to the OCI Console, in **User Settings** > **API Keys**.
3.  Click **Add API Key** > **Paste Public Key** and paste the content.
4.  Click **Add**.

### 1.4. Critical Adjustment: Automation (Passphrase)
For Quarkus to be able to start without hanging and asking for a password in the terminal, we need to ensure that authentication is silent. Edit your configuration file:

```bash
nano ~/.oci/config
```

Check the `pass_phrase` line:
*   **If you created a password for the key:** Add the line `pass_phrase=YourSecretPassword`.
*   **If you DID NOT create a password (Empty Enter):** Completely remove the `pass_phrase` line.

Without this, the application will fail when trying to connect to the Vault during boot.

---

## Step 2: The Vault, the Key, and the Secret in the OCI Console

1.  **Create the Vault:** Go to **Identity & Security > Vault**. Create `FreeStack-Vault`.
2.  **Create the Master Key:** Inside the vault, under **Resources > Master Encryption Keys**, create `FreeStack-Master-Key` with **HSM**.
3.  **Create the Secret:** Go to **Identity & Security > Secret Management**. Create the `db-password` secret linked to the HSM key.
4.  **OCID:** Copy the **Secret OCID** (prefix `ocid1.vaultsecret`).

---

## Step 3: Implementation in Quarkus

### 3.1. Dependencies (pom.xml)
We add the Oracle SDK and Quarkus credentials support:

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
This service manages the connection and secret retrieval via the OCI SDK.

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
This is the component that integrates the Vault into the Quarkus ecosystem. By implementing `CredentialsProvider`, we allow Quarkus to manage the credential's lifecycle.

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

## Wallet vs Vault: Where does one end and the other begin?

A common question at this stage is: *"If I'm using the Vault for the password, do I still need the Wallet?"*

The short answer is **yes**. They solve different problems:

1.  **Wallet (Transport Layer):** Deals with **Mutual TLS (mTLS)**. It contains the certificates that ensure the "pipe" between your Java and Oracle Cloud is encrypted and authentic. Without the Wallet, you can't even get to the bank's "door."
2.  **Vault (Authentication Layer):** Deals with **Credentials**. It holds the "key" (ADMIN password) that opens the database. Without the Vault, you'd have to leave that key under the mat (your `.env` file).

**The Real Advantage:** By separating the two, you create defense-in-depth. If someone steals your code and your Wallet, they still don't have the password. And even if they guessed the password, they would need your OCI API Key to access the Vault. It is the gold standard of cloud security.

---

## The Linking Link: How does everything fit together?

You might be wondering: *How does the database know it should call this code?*

The magic happens in `application.properties`. When we define `quarkus.datasource.credentials-provider`, Quarkus changes its initialization lifecycle:

1.  **Boot:** Quarkus starts and sees that the Datasource requires a credentials provider.
2.  **Lookup:** It looks for the CDI Bean with the name `@Named("oci-vault-provider")`.
3.  **Request:** Quarkus calls the `getCredentials()` method.
4.  **OCI Call:** Our code goes to the Oracle Cloud, accesses the HSM, and brings the password.
5.  **Injection:** Quarkus receives the password in memory and injects it into the connection pool (Agroal).
6.  **Ready:** The database connects and the application starts.

```properties
# Activates the dynamic credentials provider
quarkus.datasource.credentials-provider=oci-vault-provider

# Vault Configurations
oci.secret.ocid=${OCI_SECRET_OCID}
oci.auth.instance-principal=${OCI_INSTANCE_PRINCIPAL:false}
```

---

## Conclusion: Absolute Security

By removing the `.env` fallback, we force a culture of rigorous security. Now, your database password resides exclusively within cryptographic hardware in the cloud and is only accessed by authorized identities.

In the next article, we will take another step: **OCI Object Storage**.

---
## Resources
- [Quarkus OCI FreeStack Repository](https://github.com/omatheusmesmo/quarkus-oci-freestack)
- [OCI Java SDK Documentation](https://docs.oracle.com/en-us/iaas/Content/API/SDKDocs/javasdk.htm)
