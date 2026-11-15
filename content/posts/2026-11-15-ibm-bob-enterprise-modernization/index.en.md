---
title: "IBM Bob and the bet on repeatable modernization"
date: 2026-11-15T10:00:00-03:00
draft: false
tags: ["IBM Bob", "AI", "Agentic Coding", "Modernization", "Java", "Quarkus", "Claude Code", "Codex"]
author: "Matheus Oliveira"
slug: "ibm-bob-code-agent-modernization"
summary: "Ask a coding agent to migrate a system to Java 21 on two different days and it may come back with two different approaches. IBM Bob bets on workflows to fix that. What it is, what the Java, IBM i and IBM Z packages promise, what it costs, and what is still worth checking."
description: "IBM Bob in 2026: the V2 architecture, the Agent, Plan and Ask modes, model routing, the Premium Packages for Java, IBM i and IBM Z, Bobcoin pricing, how it compares with Claude Code and Codex, and how to adopt the agent in a team with permissions and cost control."
cover:
  image: "cover.png"
  alt: "The IBM Bob mascot, a smiling robot in a blue hard hat, next to blue and purple geometric shapes, a rocket and lines of binary code"
  caption: "Image: IBM Community, IBM Bob group"
  relative: true
---

Picture two hundred Java 8 modules that have to reach Java 21. Writing the code for each migration is the easy part. The hard part is uncovering business rules nobody documented, touching thousands of files without changing behavior, and getting module 150 to come out the same as module 3. IBM's own blog uses this example: ask an agent to "migrate this to Java 21" on two different days and it may return two different approaches. For a one-off task, that is fine. In a phased project, it is what blows up the schedule.

IBM Bob was designed around that problem, so I went through the documentation, the announcements and what outsiders have published. I haven't run Bob myself: every number here comes with whoever claims it.

## What is live today

Bob became generally available on April 28, 2026, as SaaS with a 30-day trial. It comes as an IDE extension and as Bob Shell, the terminal version, which also runs non-interactively so scripts can call it.

V2, from June 24, replaced the separate foundations of the IDE and the shell with a single agent and a single harness. The five modes became three (Agent acts, Plan gathers context and hands over a plan, Ask only reads), exploratory work can go to subagents that return only a summary, and the old git-based checkpoint became a rollback per task, per turn or per tool call. It also picks up the rules, commands and MCP servers you already use in another tool.

## The workflow is the product

None of that, on its own, sets Bob apart from Claude Code or Codex. The workflows do. IBM starts from the idea that not every step of a modernization should go through a model: scanning dependencies and running tests is plain automation, approving the strategy and reviewing the diff belongs to a person, and the AI takes the complex transformations. The workflow defines where each step lives, and the engine runs them in order, keeps state and handles errors.

On top of that engine, IBM sells the Premium Packages. The Java one interests me most, because it is my turf. It takes applications from Java 8 or 11 to 17, 21 or 25 in build, test, diagnose and fix cycles, with OpenRewrite for the transformations that need to be deterministic. It also covers migration to WebSphere Liberty, replacing JSF or Struts screens with React, Angular or Vue, test generation with JaCoCo and fixing vulnerable dependencies through the OSV database.

Anyone working with Quarkus will notice one line in that package's documentation: among the skills there is a `spring-boot-to-quarkus`, described as a modular, gate-driven migration with compile validation after every phase. I don't know how it holds up on a real Spring project; it would be the first thing I would test.

For IBM Z, the package relies on Z Understand, a static analysis that turns COBOL, PL/I, assembler and JCL into a queryable repository, so Bob can write deterministic queries over the application's metadata instead of relying only on probabilistic generation. In a system with thousands of programs, knowing who calls whom needs an exact answer. The IBM i package reads source members straight from QSYS, skipping the export and import round trip, converts fixed-form RPG to free-form and DDS to DDL, and extracts business rules.

## Side by side with Claude Code and Codex

An independent test published in October confirmed that Bob has what you expect from a good coding agent: skills, MCP, AGENTS.md and plan mode. The most visible difference is the model. Instead of tying everything to one, Bob routes each task among Claude, Mistral, Granite and models tuned for code, security and Java migration, weighing accuracy, latency and cost. The idea, according to IBM, is that completing a line does not need the same model that plans a refactoring, and that nobody should have to spend time choosing.

In that test, Bob delivered a single-page coffee shop, with filtering, a cart and an order confirmation, in under two minutes and with about 32,000 tokens (0.5 Bobcoin, around 20 US cents on the Pro plan), against about 15 minutes and about 130,000 tokens for Claude Code. Bob's interface came out as usable as the competitor's, and even more functional according to the author. On a `python-slugify` issue, both fixed the bug and passed the tests, and Bob got there with a shorter patch and less than half the output tokens. For anyone tracking agent costs, it is a good sign that routing between models makes a difference on the bill.

The rest of the comparison happens away from the editor. The Enterprise plan runs self-hosted and even air-gapped, with customer-hosted models, Bob Shell records the agent's steps for traceability, according to IBM, and Bobcoins have no daily or weekly quota, which a procurement department can budget more easily. Among the people interviewed for one article, some found Bob's plan mode more rigorous and deliberate than Claude Code's, and one described the proposal as a complete development workflow, not just another copilot.

## The numbers are IBM's

The April announcement says more than 80,000 IBM employees use Bob and that surveyed users self-reported an average 45% productivity gain. On specific tasks the numbers were higher: the IBM Instana team reported 70% less time on selected tasks, about 10 hours a week, and the Maximo team estimated 69% savings on code generation and refactoring.

Among customers, Blue Pearl used Bob for Java modernization and, according to IBM, finished in about 3 days work that would have taken more than 30 developer days, which works out to something close to a 90% speedup.

## What it costs in Bobcoins

According to IBM's pricing page, Pro starts at US$ 20 per instance with 50 Bobcoins, Pro+ at US$ 60 with 180 and Ultra at US$ 200 with 1,000; Enterprise is by quote, with Bobcoin limits per team and per user. The trial gives 50 Bobcoins for 30 days, and each extra Bobcoin costs about US$ 0.50, according to the independent test. The Java package starts at US$ 20 and the IBM i one at US$ 40, with the first month free for new subscribers until December 31, 2026. In April, a launch article reported 40 Bobcoins on Pro and 500 on Ultra, so check the page before doing the math.

## Taking it to your team

An agent that runs commands in your terminal deserves the same care as any tool with that kind of power, and Bob ships with quite a bit for it. In V2, file reads are approved by default, but editing files, running commands, calling MCP tools and invoking skills still require explicit approval, which you can tighten or loosen per tool class. Alongside approval sit rollback, custom rules and ignore files. IBM's documentation treats command auto-approve as high risk and recommends allow lists without wildcards, and that is the starting point I would use: Ask or Plan to understand unfamiliar code, Agent once the plan is clear, and narrow permissions for every command you allow.

For anyone leading a team, Bobalytics brings productivity, quality, governance, usage and cost together in one place, and the Enterprise plan adds Bobcoin limits per team and per user. It is the kind of control that tends to be missing when everyone subscribes to a tool on their own.

My suggestion is to start outside work, with a personal project or an open source repository, with no company code or data and no credentials around. An old Java system of your own, or a demo Spring project, works well for using the package's free month and asking a single question: run the same workflow on two or three similar modules and compare the diffs. If they come out consistent, Bob's central promise holds up in practice, and then it is worth taking the topic to the team, with the company's approval and within its AI usage policy. On new code, Bob competes with the general-purpose agents, and its arguments there are model routing and a cost you can predict in Bobcoins.

## Sources

- [IBM Bob general availability announcement, 04/28/2026](https://www.prnewswire.com/news-releases/introducing-ibm-bob-ai-development-partner-that-takes-enterprises-from-ai-assisted-coding-to-production-ready-software-302755018.html)
- [Announcement of 07/09/2026: multi-agent capabilities and modernization workflows](https://canada.newsroom.ibm.com/2026-07-09-ibm-advances-enterprise-ai-software-development-with-multi-agent-capabilities-and-specialized-modernization-workflows)
- [IBM Bob Premium Packages and new architecture](https://www.ibm.com/new/announcements/ibm-bob-expands-with-premium-packages-new-architecture-and-greater-enterprise-control)
- [Bob V2: Faster, better, smarter](https://bob.ibm.com/blog/bob-v2-release-announcement)
- [Java Modernization package documentation](https://bob.ibm.com/docs/ide/premium-packages/java-modernization/java-modernization-index) and [product page](https://www.ibm.com/products/ai-coding-agent/java-modernization)
- [Bob Shell documentation](https://bob.ibm.com/docs/shell) and [pricing](https://www.ibm.com/products/ai-coding-agent/pricing)
- [The Register, 04/28/2026](https://www.theregister.com/software/2026/04/28/ibms-ai-coding-partner-bob-hits-general-availability/5226774)
- [Journal du Net, 10/07/2026](https://www.journaldunet.com/intelligence-artificielle/1555847-que-vaut-ibm-bob-l-agent-de-code-qui-veut-rivaliser-avec-claude-code-et-codex/)
- [TechFinitive: what users and experts think](https://www.techfinitive.com/features/ibm-bob-is-out-so-what-do-users-and-experts-think/)
