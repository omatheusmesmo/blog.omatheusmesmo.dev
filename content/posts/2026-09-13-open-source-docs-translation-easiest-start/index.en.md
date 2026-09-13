---
title: "Docs and Translation: The Easiest Way to Start Contributing to Open Source"
date: 2026-09-13T09:00:00-03:00
draft: false
tags: ["Open Source", "Documentation", "Translation", "Beginners", "Community"]
author: "Matheus Oliveira"
slug: "docs-and-translation-easiest-way-to-start-open-source"
summary: "Want to contribute to Open Source but freeze before you even open the editor? Documentation and translation are the easiest door in, and you can ship your first PR today."
description: "Don't know where to start with Open Source? Discover why fixing and translating documentation is the easiest, fastest, and most underrated path to your first real contribution."
cover:
  image: "cover.png"
  alt: "16-bit SNES-style pixel art of a character walking through an open wooden gate, past a scribe's desk with a half-translated scroll, into a sunlit village square with a fountain, castle, and bridge in the background"
  caption: "The door almost nobody uses"
  relative: true
---

How many times have you thought "I want to contribute to Open Source" and then frozen at the first issue you opened? C++ code from 2009, an architecture nobody explains, a `CONTRIBUTING.md` written for someone who's already been a maintainer for five years.

So you close the tab and go back to work. Again.

There's a shorter path, and it isn't hidden: it's sitting in the `docs/` folder of a project you already use every day.

## Why nobody touches the documentation

Every Open Source project has the same problem: docs age faster than code. An example that no longer runs on the current version, a command that changed, an entire section written only in English for a project with thousands of non-native speakers. Maintainers know this. They just don't have time, because they're busy reviewing feature PRs.

That's where you come in. Not with an 800-line PR rewriting the caching architecture. With a three-line fix that makes someone else's life easier.

## Why docs and translation, specifically

Three reasons, no fluff:

**The technical bar is close to zero.** You don't need to understand the build system, run integration tests, or know the difference between two similarly named classes. You need to read carefully and write clearly.

**Fast reviews, immediate feedback.** A maintainer can approve a typo fix or a translated paragraph in minutes. Compare that to a feature PR sitting for two months because nobody has time to validate the logic behind it.

**Impact you can actually feel.** If you've ever had to read clunky translated docs, or worse, no translation at all, you know exactly how much that pushes good people away from a project. Every time you improve a doc, you remove that barrier from someone's path before they even arrive.

And yes, this counts as a real contribution: it shows up on your GitHub profile, it enters your commit history, and this kind of consistent contribution is exactly what builds reputation inside a community.

## How to do it today

Three steps, no complexity:

1. **Pick a project you already use.** It doesn't need to be the most famous repo on GitHub. It can be that one library you import every single day at work.
2. **Look for the right label.** Most large projects have a `documentation`, `good first issue`, or `help wanted` tag. If none exists, open one yourself pointing out what's outdated, incomplete, or poorly translated.
3. **Send a small PR.** Fix a broken example, update a command, translate a page or even a single paragraph. Nobody expects perfection on a first PR. They expect clarity.

Do this a few times and you'll notice something interesting: to fix documentation properly, you end up reading the code behind it. Without realizing it, you're already learning the project's architecture, which opens the door for the next step, whenever you're ready to touch real code.

## A real example: Quarkus's own localization projects

If you use Quarkus (or want to), there's a perfect example right under your nose: [pt.quarkus.io](https://github.com/quarkusio/pt.quarkus.io), the Brazilian Portuguese localization project for the official website.

The workflow is simple: the site's text lives in `.adoc` files, gets automatically extracted into `.po` files (the standard localization format), goes through an AI pre-translation pass, and lands in front of you marked "fuzzy", meaning nobody has reviewed it yet. Your job is to open that file, polish the translation, clear the fuzzy mark, and send the PR. No Java, no understanding the extension's internals, no need to know what `@ApplicationScoped` even means.

The same pattern exists for [Japanese](https://github.com/quarkusio/ja.quarkus.io), [Chinese](https://github.com/quarkusio/cn.quarkus.io), and [Spanish](https://github.com/quarkusio/es.quarkus.io). If a project you use has a large enough community, look for something similar before assuming it doesn't exist.

I can say this with some authority because I'm a maintainer of `pt.quarkus.io` today. But two years ago I wasn't maintaining anything: I was just clearing fuzzy `.po` files, taking my first steps into the Quarkus ecosystem through that exact repository. It was the door in, not the destination.

## "But my English isn't that good" / "I barely know the project"

Nobody expects professional-translator fluency. They expect someone who understands the source content and writes clearly in the target language. If you can read the docs well enough to follow them, you already have what it takes.

And about knowing the project deeply: you don't need to. Often the person best positioned to spot a confusing paragraph is exactly the person still learning, because whoever wrote that doc has long forgotten what it's like to be new there.

## Documentation is the front door

Think of it this way: documentation is the front door of any project. It's the first thing someone reads before deciding whether that library is worth installing or whether to look for another one. A confusing front door pushes good people away before they ever see the rest of the house.

If you've already read the [definitive guide to start contributing]({{< ref "posts/2026-02-07-open-source-the-definitive-guide-to-start-contributing/index.en.md" >}}) or the piece on [how to contribute without writing code]({{< ref "posts/2026-07-05-how-to-contribute-to-open-source-without-code/index.en.md" >}}), you already know there are several doors in. In my experience mentoring people who want to get started, documentation and translation are the fastest ones to walk through.

## Start today

Pick a project right now. Open the `docs/` folder. Find a confusing sentence, a broken example, or an untranslated page. Fix it. Send the PR.

It doesn't need to be perfect. It needs to exist.

If you want a more complete step by step to go from zero to your first PR, with everything I've learned mentoring people who are just starting out, I wrote the [Practical Open Source Guide](https://news.omatheusmesmo.dev/ebook/), a short ebook to get you moving this very week.
