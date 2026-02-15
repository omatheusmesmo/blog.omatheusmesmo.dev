---
title: "Oracle Cloud Free Tier: Como Ter 24GB de RAM e Banco de Dados Grátis para Sempre"
date: 2026-02-15T08:00:00-03:00
draft: false
tags: ["Jornada Oracle FreeStack", "Oracle Cloud", "Free Tier", "Setup", "OCI", "Cloud Infrastructure"]
author: "Matheus Oliveira"
slug: "oracle-cloud-free-tier-24gb-ram-gratis"
summary: "Um guia passo a passo para criar sua conta no Oracle Cloud Free Tier e garantir 24GB de RAM e bancos de dados gratuitos para sempre."
description: "Aprenda como se inscrever no Oracle Cloud Free Tier, escolher a melhor Home Region e garantir seus recursos gratuitos para a vida toda."
cover:
  image: "oracle-free-tier-setup.png"
  alt: "Interface de criação de conta da Oracle Cloud"
  caption: "Sua jornada começa aqui: Garantindo o poder da nuvem sem custos"
  relative: true
---

Bem-vindo à **Jornada Oracle FreeStack**! Nesta série de artigos, exploraremos todo o poder do **Oracle Free Tier** para construir um backend robusto em Quarkus. Como "Fase 0" e ponto de partida essencial, este guia detalhado foca na criação da sua conta no Oracle Cloud Free Tier. Antes de escrevermos qualquer código Java, precisamos do nosso "data center" na nuvem. Ao contrário de outros provedores com créditos que expiram, a **Oracle Cloud Infrastructure (OCI)** oferece um dos programas mais generosos do mercado: o **Always Free**. Este programa não é um período de teste limitado; ele oferece recursos computacionais e de banco de dados que permanecem gratuitos enquanto sua conta estiver ativa. Vamos garantir que você crie sua conta corretamente para aproveitar ao máximo esta jornada.

## Comparativo de Mercado: OCI vs AWS (Free Tier)

Para desenvolvedores Java, a diferença de recursos entre os principais provedores de nuvem é significativa. Abaixo, uma comparação entre os recursos permanentes (Always Free) da Oracle e o nível gratuito da AWS:

| Recurso            | Oracle Cloud (Always Free)    | AWS (Free Tier - 12 meses)       |
| :----------------- | :---------------------------- | :------------------------------- |
| **Banco de Dados** | 2 x Autonomous DB (20GB cada) | 1 x RDS (20GB - apenas 12 meses) |
| **Memória RAM**    | Até 24 GB (ARM Ampere)        | 750 MB (t2.micro/t3.micro)       |
| **Processamento**  | 4 OCPUs (ARM) + 2 cores (AMD) | 1 vCPU (apenas 12 meses)         |
| **Armazenamento**  | 200 GB (NVMe SSD)             | 30 GB                            |
| **Banda Mensal**   | 10 TB                         | 100 GB                           |

A superioridade da OCI em termos de memória e banco de dados gerenciado (Autonomous) torna esta a plataforma ideal para rodar workloads Java modernos com Quarkus.

---

## Checklist de Inscrição

Para que sua conta seja aprovada sem problemas, tenha em mãos:

1. **E-mail Válido**: Use um e-mail que você acessa frequentemente. Evite e-mails temporários, pois são bloqueados automaticamente.
2. **Cartão de Crédito Internacional**: Será feita uma "retenção de autorização" (geralmente US$ 1.00 ou R$ 1,00). 
    - **Importante:** Este valor **não é cobrado**; é apenas uma verificação de validade que o seu banco estornará em poucos dias.
    - **Atenção:** A Oracle não aceita cartões pré-pagos ou cartões de débito que exijam PIN. Use um cartão de crédito tradicional ou um débito que funcione na função crédito.
3. **Endereço Residencial**: Deve ser idêntico ao endereço de cobrança do cartão. Inconsistências aqui são a maior causa de rejeição.
4. **Respeite a Regra**: É permitida apenas **uma conta por pessoa**. Tentar criar múltiplas contas pode levar ao banimento de todas elas.

---

## Passo a Passo da Criação de Conta

### 1. Início do Cadastro
Acesse [oracle.com/cloud/free](https://www.oracle.com/cloud/free/) e selecione a opção **Start for Free**.

![Tela inicial do portal Oracle Cloud com destaque para o botão Start for Free](oracle-cloud-home-screen.png)

### 2. Informações de Identidade e Região
Insira seu país e seu nome completo. Use informações reais e atualizadas. 

### 3. A Escolha Crucial: Home Region
A *Home Region* é onde seu data center principal residirão seus recursos Always Free. 

> [!IMPORTANT]
> A escolha da região é permanente. Se você escolher uma região sem disponibilidade de recursos "Always Free", poderá encontrar o erro **"out of host capacity"**.

- **Dica:** Se encontrar erro de capacidade ao criar sua instância depois, aguarde alguns dias ou tente criar em um *Availability Domain* diferente dentro da mesma região.
- **Sugestão:** Brazil East (São Paulo) é excelente, mas US East (Ashburn) costuma ter maior volume de hardware disponível.

![Seletor de Home Region durante o cadastro com aviso sobre a impossibilidade de alteração posterior](oracle-cloud-region-selector.png)

### 4. Verificação de Crédito e Segurança
Após os dados do cartão, você configurará o **MFA (Multi-Factor Authentication)**. Não ignore este passo; ele é fundamental para proteger sua infraestrutura.

---

## Dicas Técnicas para Evitar Rejeição

O sistema de provisionamento da Oracle é rigoroso para evitar abusos. Siga estas diretrizes:

- **Rede**: Não utilize **VPN** ou Proxy. O IP deve ser residencial ou de rede móvel da sua região.
- **Navegador**: Desative bloqueadores como o do **Brave** ou extensões que mascarem sua identidade.
- **Cartão**: Utilize cartões físicos. Cartões virtuais de uso único são frequentemente rejeitados.
- **Suporte**: Lembre-se que contas Always Free possuem **Suporte da Comunidade** (fóruns). O suporte técnico oficial via tickets (My Oracle Support) é reservado para contas pagas ou durante o Free Trial.

## Lista Completa de Serviços Always Free

Para que você tenha uma visão clara da robustez desta oferta, aqui estão os principais serviços que você pode usar sem custo por tempo ilimitado:

### Banco de Dados e Dados
- **Autonomous Database**: 2 instâncias (Transaction Processing, Data Warehouse ou JSON Database).
- **NoSQL Database**: Disponível em regiões selecionadas.
- **HeatWave**: Processamento acelerado para MySQL.
- **APEX**: Desenvolvimento de aplicações Low-Code integrado ao banco.

### Computação e Armazenamento
- **Arm-based Ampere A1**: Até 4 instâncias com 24GB de RAM distribuídos.
- **AMD-based Compute**: 2 instâncias Micro (1GB RAM cada).
- **Block Volume**: 200 GB de armazenamento em disco.
- **Object Storage**: 10 GB de armazenamento de objetos.
- **Archive Storage**: 10 GB para backup frio.

### Rede e Segurança
- **Flexible Load Balancer**: 1 instância (10 Mbps).
- **VPN Connect & Site-to-Site VPN**: Para conexões seguras.
- **VCN (Virtual Cloud Network)**: Toda a rede virtual privada.
- **Vault**: Gestão de chaves e segredos (ESSENCIAL para a Etapa 3).
- **Bastions**: Acesso seguro às suas instâncias sem IP público.
- **Security Advisor**: Recomendações de segurança integradas.

### Observabilidade e Gestão
- **Monitoring & Notifications**: Métricas e alertas.
- **Logging**: Coleta de logs da infraestrutura.
- **Application Performance Monitoring (APM)**: Rastreamento detalhado de performance.
- **Resource Manager**: Automação com Terraform.
- **Service Connector Hub**: Integração de dados entre serviços.

### Outros Serviços
- **Email Delivery**: Até 3.000 emails por mês.
- **Content Management Starter Edition**: Gestão de ativos digitais.

### Detalhamento dos Recursos Técnicos

- **Autonomous Database (ATP)**: Você recebe duas instâncias completas. Isso permite ter um ambiente de Desenvolvimento e um de Produção sem custo. O banco já vem com autoconfiguração, autosegurança e autoescalonamento.
- **Instâncias ARM Ampere A1**: São processadores de última geração. Com 24GB de RAM, você pode rodar múltiplos containers Docker ou instâncias Quarkus com alto desempenho.

---

### Bonus: O Free Trial de 30 Dias

Além dos serviços **Always Free** (que são para sempre), ao se cadastrar você ganha automaticamente **US$ 300,00 em créditos** para usar em qualquer serviço da Oracle Cloud por 30 dias. Isso é excelente para testar recursos "parrudos" que não estão no tier gratuito, como instâncias de GPU ou bancos de dados Exadata.

---

## Conclusão

Com sua conta ativa, você tem em mãos uma das infraestruturas de nuvem mais modernas do mundo. Este foi o seu passo inicial na **Jornada Oracle FreeStack**.

O próximo passo será conectar sua aplicação ao banco de dados e começar a construir. No nosso próximo artigo, vamos explorar como construir um Backend Quarkus com Oracle Autonomous Database.

---

## Recursos
- [Oracle Cloud Free Tier FAQ](https://www.oracle.com/cloud/free/faq.html)
- [Documentação Oficial OCI](https://docs.oracle.com/en-us/iaas/Content/home.htm)
- [Repositório do Projeto](https://github.com/omatheusmesmo/Quarkus-OCI-FreeStack)
