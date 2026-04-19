---
title: "Why You Should Be Part of the Quarkus Community"
date: 2026-04-18T15:00:00-03:00
draft: false
tags: ["Open Source", "Quarkus", "Career", "Community"]
author: "Matheus Oliveira"
slug: "why-you-should-be-part-of-quarkus-community"
summary: "Contributing to open source doesn't have to be scary. A true story of how interacting with the Quarkus community led to a contribution to a newly launched project in less than 48 hours."
description: "Discover how Quarkus community channels (Zulip, Community Call) can accelerate your open-source contributions and boost your career. A real case with Quarkus Agent MCP."
cover:
  image: "why-you-should-be-part-of-quarkus-community.png"
  alt: "Quarkus Logo and open-source symbols"
  caption: ""
  relative: true
---

Many developers look at large Open Source projects and feel there is no room for them. You open the repository, see thousands of issues, complex discussions, and think: *"What could I possibly add here?"*

Today, I want to show you the opposite. I want to share the exact journey of how I contributed to a new Quarkus ecosystem project just hours after its release—not by being a code genius, but by **being in the right place and talking to the right people**.

The idea is simple: to convince you to actively participate in the Quarkus community and show you how it can bring a massive return on investment for your career.

## The Case: Quarkus Agent MCP

The [Quarkus Agent MCP](https://github.com/quarkusio/quarkus-agent-mcp) is a brand-new project that makes Quarkus development easier by integrating AI through the Model Context Protocol (MCP). I found out about its very first release on April 13, 2026, and incredibly, **just two days later**, I had already created an issue report and had my Pull Request merged into the main branch.

How did this happen so fast? The key wasn't just reading code; it was *listening to the community*.

## The Contribution Timeline

- **04/13/2026 - The Discovery:** While poking around repositories (a hobby of mine), I found the first release of the Quarkus Agent MCP. I decided to test it. The README instructions told users to run a JBang command pointing to Maven Central, but the command failed. The `uber-jar` was missing.
    - Since AI tools were already suggesting the command from the repo, I opened [Issue #24](https://github.com/quarkusio/quarkus-agent-mcp/issues/24) detailing a temporary *workaround* so other developers could use local builds in their IDEs (VS Code, OpenCode) until the official release came through. Glancing over the repo, I noticed the GitHub Actions *workflow* for the last release had failed, which explained the missing package.

- **04/14/2026 - The Context (Quarkus Community Call & Zulip):**
    - I was watching the **Quarkus Community Call** on Google Meet. The team mentioned the MCP project and, quite transparently, noted that the automated release had failed (confirming my suspicion). I mentioned in the chat that George Gastaldi might be able to shed some light on failing pipelines.
    - A few hours later, Max Andersen started a topic on the **Quarkus Zulip Chat** requesting help for the workflow. Since I had already been investigating it, I immediately posted the *GitHub Actions* error log in the thread.
    - Gastaldi and Smet replied quickly, pointing out that the workflow format needed to be updated to match the Quarkus Gizmo repository layout.

- **04/14 to 04/15/2026 - Execution and Merge:**
    - With the right technical direction given by the core team itself, I figured out how to solve it. I opened [PR #32](https://github.com/quarkusio/quarkus-agent-mcp/pull/32) fixing the release process, specifically adapted to build the `uber-jar` and update the JBang catalog.
    - **04/15/2026:** Phillip Kruger (the repository's lead maintainer) made a very small adjustment, and the PR was *merged*.

## Official Quarkus Communities

If you go to the [Support When You Need It](https://quarkus.io/support/) page, you'll see more than just the obvious choices (StackOverflow and GitHub). The richest channels—where the real magic happens—are the **Quarkus Community Call, Zulip Chat, Development Mailing List, and Quarkus Insights**.

### Quarkus Community Call
A periodic video meeting (via Google Meet) where the core team presents product updates, discusses the roadmap, and does Q&As. Participating means having front-row seats to the ecosystem's future. It is a chance to hear about current pain points (like a broken *workflow*) and ask questions directly to the software architects.

### Zulip Chat
Zulip (hosted at `quarkusio.zulipchat.com`) is the beating heart of the project. Unlike Slack or Discord, Zulip requires every message to belong to a *Topic*. This keeps technical discussions structured like a forum rather than an endless wall of text. This is where you bring your heavy doubts, align on architecture before coding a massive Pull Request, and talk *peer-to-peer* with the framework creators.

### Development Mailing List
The traditional email forum, focused on the more formal engineering aspects. This is where critical release announcements, deep architectural changes, design proposals, and important votes circulate. It's a showcase of *Enterprise* open-source decision-making.

### Quarkus Insights
A weekly YouTube live podcast! A super relaxed, technical conversation among developers and community experts. Each episode highlights a different extension, design pattern, or success story. It is a fantastic place to see how the technology applies to the real world and learn straight from the authors of those implementations.

## The (Real) Benefits of Joining the Community

My two-day interaction generated value quickly for a specific reason: the Quarkus community is extremely accessible. When you actively participate:

1. **Technical Visibility:** Your Pull Requests become more than just code. You build a reputation alongside top-tier global engineers.
2. **Context Over Code:** Knowing **why** something is broken saves hours. Zulip or the Calls provide you with the whole chessboard, making your contributions highly accurate.
3. **Organic Networking and Mentorship:** Working on PRs reviewed by the very tech leaders who wrote Java specifications turns you into a better engineer—for free.
4. **Building an Active Portfolio:** In job interviews, saying *"I am proficient in Quarkus and help maintain some of its AI infrastructure integrations"* carries a vastly different weight than showing off an abandoned CRUD app on GitHub.

## Conclusion

Don't try to contribute to Open Source by coding alone in the dark. The technical barrier to entry collapses once you interact with maintainers. An Open Source project isn't just a repository; it's a group of people solving problems together.

Join Zulip. Tune in to the next Community Call. Help report a bug you faced today. Your first step is just to say *"Hello!,"* and your chance to have your code running in production globally starts right there.
