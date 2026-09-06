---
title: "I Did It! Top 10 Contributor on Quarkus LangChain4j"
date: 2026-09-06T12:00:00-03:00
draft: false
tags: ["Open Source", "Quarkus", "Career", "Committer", "LangChain4j"]
author: "Matheus Oliveira"
slug: "top-10-contributor-quarkus-langchain4j"
summary: "An ordinary Monday morning, no stage and no audience, I found out I'd reached 10th place among the contributors to quarkus-langchain4j in the world. The story of how I got there in 5 months, and what changed along the way."
description: "From the mentorship with Luiz Real to an ordinary Monday discovering 10th place in the worldwide quarkus-langchain4j contributor ranking: the story of 5 months of focus, talks, mentoring, becoming an Oracle ACE Associate, and the invite to become a triage maintainer of the project."
cover:
  image: "cover.jpg"
  alt: "Matheus Oliveira talking at an event about his open source journey"
  caption: "From zero to top 10 in the world, in 5 months"
  relative: true
---

Monday morning, coffee still hot, I opened the contributors tab of `quarkus-langchain4j` wanting nothing more than to scratch that same old curiosity. I scrolled the list until I found my username. I didn't need to scroll far: 10th place, 38 contributions, ahead of names I used to only admire from a distance.

No stage this time. Nobody pointed at me in front of 200 people. It was just me, alone, in the morning, finding out on my laptop screen that I'd gotten where I wanted to be.

Five months ago that number didn't exist. It's worth telling how I got here.

## From zero

On 03/28/2026 I had a [mentorship session with Luiz Real]({{< ref "posts/2026-04-04-committer-mission/index.en.md" >}}) that set me on this path: becoming a committer for a relevant Quarkus extension within 12 months. I picked `quarkus-langchain4j`, and on 04/15/2026 I opened my first real PR on the project. Zero prior contributions there, zero guarantee anyone would even review it.

Around that time, Matheus Cruz, who also aims high in open source, challenged me: instead of the top 20 I had in mind, why not top 10? I accepted, scared. But I accepted.

From there it became routine: open an issue, understand the code, send a PR, get a review, fix it, repeat. No glamour in most weeks.

## The checkpoint I didn't even know I'd passed

In July, on the TDC Floripa main stage, [I got introduced as top 13]({{< ref "posts/2026-07-26-face-to-face-with-claude-tdc-floripa/index.en.md" >}}) by someone who didn't even know I was in the audience. That number wasn't random to me: 13 was Gastaldi's position, someone I admire a lot, and reaching it meant becoming the Brazilian with the most contributions to `quarkus-langchain4j`. I chased that number for months.

I got up without hesitating, told the story to over 200 people, got the congratulations. The next day, with some free time and a nagging feeling, I checked again: I was already top 12. I had passed my own goal without noticing, too busy celebrating something else.

## What kept happening along the way

While the PRs kept piling up, the rest came along with them, mostly without me asking for it. I started getting invited to speak: Quarkus Club, SouJava, Dev Converge, TDC Floripa. People I'd never met started reaching out for mentoring, wanting to know how to take their first step into open source, and by now I've lost count of how many people I've encouraged to send their own first PR. Somewhere along the way I became an Oracle ACE Associate, a recognition I hadn't even considered when I opened that first PR hoping someone would just review it.

None of that was the original plan. The plan was the ranking. But contributing for real, consistently, seems to pull a lot more behind it than just the number.

## From 12 to 10

And that's how, with no party planned, 12 became 10. It's not just a number on GitHub: it's proof that trading scattered contributions for focus actually works. The original goal was 12 months. I got there in 5.

## And I became a triage maintainer

Something else happened around this same stretch, and it actually weighs more than the number: I got invited to join `quarkus-langchain4j` as a triage maintainer. It's not the full commit access I dreamed about back at the mentorship session with Luiz Real, but it's the first official step inside the project: I can now triage issues, manage labels, and help organize other people's PR flow, with the weight of someone the team trusts.

If you look closely, that's literally the original goal of the mission becoming real, not just a number climbing a ranking. The goal was never just the ranking, it was becoming someone the project trusts to help maintain it. That's started happening.

## Thank you

Before anything else: thank you to Luiz Real, who started all of this with two hard questions during a weekend mentorship session, and to Matheus Cruz, who challenged me to aim higher than I would have on my own.

And a separate thank you to Georgios Andrianakis (geoand) and Jan Martiska (jmartisk), the maintainers of `quarkus-langchain4j`. They reviewed most of my PRs, pointed out mistakes I couldn't see on my own, and taught me to think about the extension's design, not just write the code. If I write better Java today, a good part of that credit is theirs.

## If I could do it, so can you

I'm not sharing this to show off. I'm sharing it to make a point: 5 months ago I had zero contributions to this project. None. What I had was focus, a clear goal, and the willingness to open PR after PR, week after week, even when nobody was watching.

If you've read this blog for a while, you know I keep hammering this point: open source is the greatest equalizer of opportunity in our industry. You don't need an invitation, you don't need a resume, you don't need anyone to pick you. You open the repository and you start.

If you don't know where to start, I wrote a [definitive guide]({{< ref "posts/2026-02-07-open-source-the-definitive-guide-to-start-contributing/index.en.md" >}}) for exactly that. And if you think only people who write code get to contribute, [this other article]({{< ref "posts/2026-07-05-how-to-contribute-to-open-source-without-code/index.en.md" >}}) shows that issues, discussions, articles, and word of mouth count too, and count a lot. There's also my [Practical Open Source Guide](https://news.omatheusmesmo.dev/ebook/), a short ebook to go from zero this week.

Pick a project you actually use, find a small issue, and send your first PR. I'll be rooting for you.

## The job isn't finished

Top 10 and the triage maintainer role were both sub-goals. The real dream is still getting paid to work with open source, and I haven't reached that one yet.

Tomorrow I go back to the Quarkus Zulip and the open issues. But today, just today, I celebrate.

---

## For those who want to see the PRs

The ranking is just the shell. What holds it up is around 33 merged PRs since April. A few I'd single out as the most important:

- **A brand-new Oracle Database extension** ([#2494](https://github.com/quarkiverse/quarkus-langchain4j/pull/2494)): brought Oracle Database from zero into the project's supported embedding stores.
- **`@OnThinking`** ([#2460](https://github.com/quarkiverse/quarkus-langchain4j/pull/2460)): a new annotation to capture the "thinking" output of models that expose that step, straight in the AI Service, no workaround needed.
- **Named stores across 7 vector database integrations** ([pgvector](https://github.com/quarkiverse/quarkus-langchain4j/pull/2409), [Redis](https://github.com/quarkiverse/quarkus-langchain4j/pull/2423), [Neo4j](https://github.com/quarkiverse/quarkus-langchain4j/pull/2426), [Chroma](https://github.com/quarkiverse/quarkus-langchain4j/pull/2433), [Milvus](https://github.com/quarkiverse/quarkus-langchain4j/pull/2434), [Qdrant](https://github.com/quarkiverse/quarkus-langchain4j/pull/2437), and [Weaviate](https://github.com/quarkiverse/quarkus-langchain4j/pull/2440)): a run of PRs bringing multiple named embedding store instances to nearly every relevant provider in the ecosystem.
- **Prompt cache token tracking** ([#2585](https://github.com/quarkiverse/quarkus-langchain4j/pull/2585)): metrics and cost estimation now account for cache tokens, which matters a lot if you're running this in production watching your AI provider bill.
- **Build-time validations for agentic flows** ([#2664](https://github.com/quarkiverse/quarkus-langchain4j/pull/2664)): agent misconfigurations now get caught at build time, before they turn into a silent bug in production.
- **Guardrails and agent monitoring pages in the Dev UI** ([#2699](https://github.com/quarkiverse/quarkus-langchain4j/pull/2699) and [#2674](https://github.com/quarkiverse/quarkus-langchain4j/pull/2674)): visibility into guardrails and agent topology/executions right in the developer interface, no log hunting required.

No single one of those PRs would have gotten me to top 10 on its own. What got me there was the sum: showing up every week, shipping something real, and repeating that for 5 straight months.
