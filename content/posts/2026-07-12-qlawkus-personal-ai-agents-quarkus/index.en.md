---
title: "Qlawkus: Build Personal AI Agents in Java with Quarkus"
date: 2026-07-12T09:00:00-03:00
draft: false
tags: ["Quarkus", "Java", "AI", "AI Agents", "LLM", "Open Source"]
author: "Matheus Oliveira"
slug: "qlawkus-personal-ai-agents-quarkus"
summary: "Introducing Qlawkus, a set of Quarkus extensions for building personal AI agents in Java: memory that's automatically injected, procedural skills, voice-enabled messaging, and composition via agent.yml."
description: "Qlawkus is a set of Quarkus extensions for building personal AI agents in Java, where memory is injected into the prompt automatically instead of depending on the model deciding to search for it, plus procedural skills, Discord/Telegram messaging with voice, and a pom generated from an agent.yml manifest. Here's how it works and how to get started."
cover:
  image: "cover.png"
  alt: "Minimalist diagram showing a central 'Agent' node connected to four modules: Soul, Memory, Skills and Tools, on a dark purple background"
  caption: "Cognition, memory, skills, messaging and tools - assembled by extension, one at a time"
  relative: true
---

If you've been writing Java for a while, you've probably tried wiring up a personal AI agent with some Python framework, or just glued everything together in a loose script. It works for a week, until the context grows too large and the "agent" forgets who you are. I wrote [Qlawkus](https://qlawkus.omatheusmesmo.dev) to solve exactly that problem, and to do it the way we already trust for building backends: Quarkus, extensions, and no hidden magic.

---

## TL;DR

> Qlawkus is a set of Quarkus extensions (the `deployment` + `runtime` pattern), built on top of quarkus-langchain4j, for assembling a **personal, fully autonomous** AI agent. The core difference: relevant memory is **injected into the prompt automatically before every reply** via RAG, instead of depending on the model deciding to call a search tool. You compose the agent by picking only the capabilities you need - Postgres/pgvector-backed memory or markdown-only, Discord, Telegram with voice, Google Workspace, an admin console - through an `agent.yml` manifest that generates the pom before the build. It's open source (Apache 2.0), runs with a single `docker compose up`, and is under active development (`0.8.x`). PRs, issues, and stars are very welcome.

---

## This isn't the only way to do this

I should be upfront about something before going further: I'm an active contributor to [quarkus-langchain4j](https://docs.quarkiverse.io/quarkus-langchain4j/dev/), and I don't want this post to read like "forget the extension, use Qlawkus instead." That's not the point. quarkus-langchain4j already gives you everything you need to build an agent from scratch - `@RegisterAiService`, RAG, tools, streaming, guardrails, every provider. It's the foundation. Qlawkus doesn't compete with it - it's built on top of it.

Qlawkus solves a more specific problem: a **personal, single-user agent with the explicit goal of being fully autonomous** - one that learns about you over time, writes its own skills, evolves its own personality (`Soul`), and acts on your behalf (git, shell, Google Workspace) without you rebuilding the foundation every time. To do that, it's opinionated by choice: a bunch of decisions that stay open in a general-purpose agent - how memory gets injected, how a skill ages out, how one messaging channel talks to another - already come resolved a specific way here.

So "why Qlawkus instead of plain quarkus-langchain4j" is somewhat the wrong question. The right one is: do you want to decide every piece yourself, or do you want a personal autonomous agent with those decisions already made? quarkus-langchain4j serves both cases equally well - it's the foundation underneath either one.

The inspiration for this specific combination (triple memory, skills, single-user, fully autonomous) came from two projects outside the Java ecosystem: [OpenClaw](https://github.com/openclaw/openclaw) and Nous Research's [Hermes Agent](https://github.com/NousResearch/hermes-agent). Qlawkus takes that philosophy and rebuilds it on Quarkus - extensions, dependency injection, native image, everything the Java community already trusts in production.

---

## The problem: memory that depends on the model remembering to look

Most personal AI agents out there handle memory in one of two ways, and both have a catch:

1. **Search tool** - the model decides, each turn, whether it's worth calling a function to search past memory. In practice, it only searches when it realizes it needs to - and the issue is precisely that the most important piece of information is usually the one the model *doesn't know* it should look for.
2. **Dump everything into the prompt** - simple, but it doesn't scale. The more the agent learns about you, the bigger the prompt, and the more expensive and slower every turn becomes.

Qlawkus doesn't pick a side: before every reply, a RAG step (`ActiveMemoryAugmentor`) embeds the user's message and injects only the facts relevant to that turn - not everything, not nothing. This happens **without any tool call**, so recall never depends on the model "remembering to check." And if the agent still needs to dig deeper, it has the `searchTranscripts` tool to deliberately search the full conversation history.

## What goes into the prompt, every turn

* **`Soul`** - the agent's own identity, mood, and behavioral bias.
* **`UserProfile`** - a coherent, curated profile of the person it serves (maintained by a tool and refined nightly by a curation job).
* **Relevant facts** - retrieved via RAG from a pgvector-backed fact store, each tagged with its source (`remember-tool`, `semantic-extractor`, `episodic-consolidator`, `transcript`).
* **Skills index** - the name and description of every procedure the agent has already learned (the full body is only loaded on demand, via `viewSkill`).

Background jobs keep all of this clean on their own: semantic deduplication of near-duplicate facts, nightly journal consolidation, and curation that folds scattered facts into a coherent `UserProfile`. You don't need to tidy up manually.

## Skills: procedural memory the agent writes itself

Beyond knowing facts (declarative memory), Qlawkus also learns *how* to do recurring things (procedural memory). Each skill is a plain `SKILL.md` file - YAML frontmatter with `name`/`description`, Markdown body - following the [agentskills.io spec](https://agentskills.io), so it's portable to any other agent speaking the same format:

```markdown
---
name: open-a-pr
description: Open a GitHub pull request from the current branch with a clean summary
---

# Open a pull request

1. Confirm the branch is pushed: `git status -sb`.
2. Draft a title that reads well in a changelog.
3. Open it: `gh pr create --title "<title>" --body "<summary>"`.
```

The agent creates, uses, and curates its own skills: an observer distills a reusable skill from each completed conversation, a curation job removes redundancy, and a lifecycle job ages unused skills (`ACTIVE -> STALE -> ARCHIVED`) without ever deleting them for good.

## Not just a chatbot: an agent built for engineering

That `open-a-pr` example above isn't hypothetical. Qlawkus started life as an "autonomous personal engineering agent," with a sandboxed shell (`qlawkus.shell.*`) confined to the workspace root, a denylist of dangerous commands by default (`sudo *`, `rm -rf /*`, `mkfs*`, `dd if=*`, `shutdown`, `reboot`...), and an optional allowlist mode to lock it down further. Pair that with `git`/`gh cli` integration and you can let the agent clone, test, and open a PR on its own, when authorized to.

There's also a smaller detail that captures the project's spirit: on boot, the agent generates a "startup thought" - a short reflection, in its own `Soul`'s voice. It's code, but it's also personality. The default `Soul` shipped in the repo (`default-soul.md`) makes that plain:

> "Do, don't describe. If something needs doing and I have the tools, I do it (...) Be resourceful before asking. Read the file. Check the logs. Search the history. Try the obvious thing. Come back with answers, not questions - unless asking prevents a mistake."

That's what gets injected into the prompt as `Soul` - not a generic "you are a helpful assistant," but an actual behavioral bias shaping how the agent acts.

## Assemble only what you need

This is where the "Quarkus extension" angle really pays off. Instead of one monolith with everything baked in, each capability - the Postgres/pgvector backend, Discord, Telegram, Google Workspace, an admin console - is an optional extension. An `agent.yml` manifest decides what's in:

```yaml
version: 1

build-time:
  default: enabled
  except:
    - brag
    - skill-hub

runtime:
  qlawkus.skill-hub.approval-mode: hitl
```

`mvn qlawkus:generate` reads that manifest and reconciles `pom.xml` *before* the build - a capability you didn't ask for never even reaches the classpath. Want a fully database-free agent, running on markdown files alone? You can build that. Want it running with Postgres, Discord, and Google Workspace? That works too.

## Running in 3 commands

```bash
git clone https://github.com/omatheusmesmo/qlawkus.git
cd qlawkus
mvn install -pl client -am -DskipTests
cd app && mvn quarkus:dev
```

Dev Services automatically spins up Postgres with pgvector and Ollama via Testcontainers - no `.env` required. Within seconds you can talk to the agent:

```bash
curl -X POST http://localhost:8080/api/chat/sync -u qlawkus:qlawkus \
  -H 'Content-Type: application/json' -d '{"message":"Hello, who are you?"}'
```

For production (or a more realistic test), `./run.sh local` brings everything up in Docker with no API key at all (local Ollama), and `./run.sh prod` boots with the LLM provider of your choice (NVIDIA, OpenAI, DeepSeek, Mistral, Groq, xAI, OpenRouter - anything OpenAI-compatible).

## What's in the box

* **Messaging** - Discord and Telegram with voice support (STT via Whisper, TTS with multiple providers per language), shared context across channels.
* **Tools** - the full Google Workspace suite (Gmail, Calendar, Drive, Sheets, Storage), a sandboxed shell tool, a brag-document generator for your résumé.
* **Resilience** - a primary LLM with automatic Ollama fallback behind a circuit breaker.
* **Secrets** - an encrypted PKCS12 keystore on a mounted volume, no database required just to hold API keys.
* **Admin console** - a server-rendered UI (Qute + HTMX, zero Node.js) to manage memory, skills, configuration, and scheduled jobs.

## Why this matters if you already live in the Quarkus ecosystem

If you already write Quarkus at work, Qlawkus isn't "yet another stack to learn": it's the same extension model (`deployment` + `runtime`), the same `@ConfigMapping`, the same `quarkus:dev` live reload, and the same path to a native image you already use. The difference is that instead of exposing REST endpoints for a client, you're assembling an agent that learns about you and acts on your behalf.

## What's next

The roadmap is public, it lives right in the README, and the project is far from finished:

* **M8 (in progress)** - the composable platform is already live: `agent.yml` → pom, database-free secrets, the build-and-redeploy loop, and the control-plane UI (onboarding, management, config editor, scheduling) are all shipped. What's left is the final polish: Dev UI cards and a round of end-to-end QA.
* **M9 (pending)** - observability (metrics, tracing) and a more mature native build.
* **M10 (pending)** - deeper autonomy and job orchestration: the agent deciding and scheduling its own work, not just reacting to messages.

## Come contribute

Qlawkus is at `0.8.x`, actively under development, licensed under Apache 2.0. If you:

* want a personal agent that actually remembers you without turning into a bloated prompt;
* like the idea of assembling exactly the capabilities you need, without carrying the rest;
* or just want to see how a cognition/memory system is built from scratch in Java,

the full documentation (architecture, memory, skills, composition, messaging, configuration) is on the [official site](https://qlawkus.omatheusmesmo.dev) - start with the [Quick Start](https://qlawkus.omatheusmesmo.dev/quickstart/). The code is on the [GitHub repository](https://github.com/omatheusmesmo/qlawkus): a star helps with visibility, a bug report or feature request as an issue is a real contribution, and PRs are always welcome.

So, what would it take for you to trust an AI agent with your long-term memory? Let me know in the comments, I'd genuinely love to hear.
