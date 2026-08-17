---
title: "Using Zettelkasten with Agents"
date: 2026-08-16T12:00:00-03:00
draft: false
tags: ["Zettelkasten", "Obsidian", "Productivity", "AI", "AI Agents", "Context Engineering", "Knowledge Base", "Open Source"]
author: "Matheus Oliveira"
slug: "using-zettelkasten-with-agents"
summary: "How structured note-taking with Zettelkasten became the memory layer for my AI agents, and how it saves me tokens, time and money."
description: "The story of how I adopted the Zettelkasten method in Obsidian and ended up turning my second brain into a knowledge base shared with AI agents."
cover:
  image: "cover.png"
  alt: "A slip-box of notes wired into an AI agent"
  caption: "Zettelkasten and agents: a second brain you share"
  relative: true
---

_No, I am not creating a new rule about how you should use AI. I just want to tell the story of how I started taking better notes, how that helped me work far more effectively with agents, and how much it moved the needle on my own personal and professional development._

## How it all started

About a year and a half ago, I was taking my first big steps in Open Source. A project I was maintaining, BuildCLI, was taking off, and I needed to ship features and do code reviews at the same speed the codebase was growing, and it was growing fast. There was almost no documentation, the little that existed was out of date, and convincing contributors to update it was hard. We are talking about early 2025, AI-assisted development was not that popular yet and the models were not as capable, so "just delegate it to an agent" was not the answer someone would give you in 2026.

One day, browsing the internet, or rather browsing YouTube, I came across a video by Professor Rodrigo Leão based on the book "How to Take Smart Notes" by Sönke Ahrens, and he was talking about the Zettelkasten method, created by the German sociologist Niklas Luhmann. Luhmann accumulated more than 90,000 slips over his lifetime and published around 70 books and more than 400 articles, crediting much of that productivity to the system. He believed writing was a form of thinking: by writing, he organized his ideas better and created new connections between them. Given enough time, a slip-box like that turns into a "second brain".

Video below (in Portuguese):

{{< youtube lBFiqLEIPDY >}}

## What Zettelkasten is

Zettelkasten is a method for organizing notes and ideas that helps you create connections between them and generate insights. The name comes from the German "Zettel" (slip of paper) and "Kasten" (box), a direct reference to the slip-box Luhmann kept.

One caveat: Ahrens describes three types of notes in the book (fleeting, literature and permanent). The fourth type, index notes, comes from Luhmann's own hub notes and became popular in Obsidian as MOC (Map of Content). I use all four, and this is how I split them:

- **Reference notes**: what you took from an external source, written in your own words. Ahrens is insistent on this and it took me a while to get it: the point is not to collect quotes. A copied excerpt tends to hide a lack of understanding, rephrasing forces you to actually understand it.
- **Permanent notes**: your own ideas about a subject, one idea per note, written so that they explain themselves a year from now without depending on the context they were born in.
- **Index notes**: links to other notes, organized hierarchically or by theme. They work as the map you use to navigate everything else.
- **Fleeting notes**: ideas that show up spontaneously, often while reading or talking to someone. They are disposable by design: the rule is to process them into a reference or permanent note within a few days, otherwise the Inbox just piles up junk.

Every note gets a unique identifier and can be linked to the others, and that is where the network comes from: one piece of knowledge pulls in the next, and the whole thing gets explored and expanded over time. The goal is not storage, it is having a system that serves your own thinking and lets you develop ideas more deeply and creatively.

## Obsidian

Zettelkasten was originally done with paper slips, but today there are digital tools that make creating and organizing notes much easier, and the one I use is Obsidian. It keeps everything in markdown, connects notes through links, and throws in a knowledge graph, plugins and themes, which makes it a great tool for anyone applying the method.

I found the app through a second video by Professor Rodrigo Leão, because up to that point I was living in the stone age, using a notepad and plain text files. I knew about Notion, but it never appealed to me, I did not like the idea of having to open a browser and leave my data in somebody else's hands. Obsidian solved exactly that: free, 100% offline, with a fantastic plugin system that lets you add a countless number of features, and no vendor lock-in whatsoever, because at the end of the day it is just markdown files on my machine.

That was all I needed. My Zettelkasten system was ready and I could start taking my notes, I only spent a few days finding the best combination of templates and plugins to soup up my Obsidian... (laughs), watch out for that rabbit hole, do not spend more time configuring than using it.

Professor Rodrigo Leão's second video (also in Portuguese):

{{< youtube Q7LuaSyJM7o >}}

## A Second Brain shared with... an Agent?

The year is ~~2077 and the agents have enslaved humanity~~ 2026, people are using more and more AI and especially agentic workflows, and above all using markdown for nearly everything, `AGENTS.md`, `CLAUDE.md`, `ARCHITECTURE.md`. And as if that were not enough, a new pattern starts taking shape, SDD, Spec Driven Development. I know some of these things already existed in 2025, but I believe it was in 2026 that they really gained traction and started to spread. And I was right in the middle of all of it, contributing to Open Source, using AI and agents, writing specs in markdown and taking notes with Zettelkasten.

As my AI usage grew, I noticed I was creating and maintaining several markdown files that I did not always version in the repository, which led to accidental commits and lost specs. That is where the obvious idea came from: consolidate everything in a single place, my Zettelkasten. My second brain could serve as a reference not only for me, but for my agent as well, and the agent could also build part of that knowledge.

This is what makes it interesting: I had been practicing what people call context engineering without knowing it. The term picked up traction in mid-2025, when Tobi Lütke and Andrej Karpathy used it publicly, and Anthropic later formalized the practice in an engineering article, defining it as "the set of strategies for curating and maintaining the optimal set of tokens (information) during LLM inference". That is exactly what I was doing: taking structured notes as part of my workflow, sharing those notes with the agent, managing the context window effectively, and keeping a knowledge history that can be consulted at any moment, even if the agent is restarted or upgraded.

Every spec and strategic decision I made, especially the ones that cost a lot of tokens, is now safe in my Obsidian vault, which I sync across at least 4 different devices using Syncthing. That gave me a superpower: my agents have a primitive memory system, but one that is agnostic to any provider, and that I benefit from alongside them. If the agent burned, say, 20k tokens to figure out that a certain combination of commands solves a given problem, I write that down and look it up when I hit the same problem again, without having to burn the same 20k tokens all over. It saves money, time and energy.

## Running in Production

This might look like just another personal setup from some tech bro, but I built a lot of things in Open Source this year using this system, and I took the same practice to work. I have been at BMW Techworks Brazil for 8 months, and combining agents with Zettelkasten has been fundamental to my productivity and my learning. I showed it to my colleague Kayan de Souza and he quickly started using it too. He already worked with SDD and markdown files to document and guide his workflow, but he moved to Obsidian (which is a convenience for humans, it could just as easily be a folder or a git repository) and built his own version of a "Knowledge Base", with a lot of success.

And we went further: we gave a presentation to the whole company, including people outside the Brazilian Hub, showing how to use agents with Knowledge Bases in general, not just with Zettelkasten. The presentation went really well and a lot of people walked out interested in adopting the approach.

Here I have to give credit to Kayan, who instead of continuing to argue with me went and measured it. We disagreed: I defended Zettelkasten, because it is a method that has worked for humans for decades and the agent can adapt, and he defended topic-based organization with an index page. He built a benchmark with 859 task runs and two models, and Zettelkasten won the scoreboard on a large knowledge base. At almost double the token cost, granted, which is why his final recommendation is the middle ground, folders with atomic notes. Well worth reading, it is in the resources at the end.

But the number that stuck with me has nothing to do with our argument: having a knowledge base, either one of them, was worth roughly **3x** the result of having none at all, across every phase of the experiment. The choice of format is a detail next to that.

## Start today

You do not need anything sophisticated to get started. A directory with markdown files already does the job, and Obsidian only comes in as comfort when navigating. What actually matters is that the convention is stable enough for the agent to find its own way around.

### Basic structure

Mine looks like this, and the numeric prefixes exist precisely to order the folders and give each theme a short identifier:

```text
00 Inbox/        # fleeting notes, quick capture
01 MOCs/         # per-theme indexes (Map of Content)
02 References/   # literature notes, external sources
03 Zettelkasten/ # permanent notes, original knowledge
80 Templates/    # automation
90 Attachments/  # images and files
```

Every processed note carries four properties in its frontmatter:

```yaml
---
id: 01-202602121500
date: 2026-02-12
tags:
  - type/permanent
  - status/seed
connection: "[[01 - Java]]"
---
```

The `id` is the MOC prefix plus a timestamp, which guarantees uniqueness without me having to think about it. The `connection` is what prevents orphan notes: if a note does not point at a MOC, it shows up nowhere and disappears. And `status` (`seed`, `sprouting`, `evergreen`) marks maturity, because a brand new note does not carry the same weight as one that has already survived a few revisions.

That YAML is not decoration: it is what lets the agent filter by type, by theme and by maturity without having to read the entire vault.

### A skill for the agent

Here is the trick: the agent does not have to guess where to save anything. I have a skill that teaches it the flow, and it fires when I say "create a note about this" or "save this to obsidian".

```markdown
---
name: obsidian-notes
description: "Create and manage notes in the Obsidian Zettelkasten vault. Use when
  the user wants to capture knowledge, create a note about something learned,
  document insights, or organize information in Obsidian. Triggers include requests
  like 'create a note', 'add to obsidian', 'anota isso no obsidian',
  'vamos criar uma nota sobre isso'."
---
```

Notice the triggers are in both Portuguese and English. The `description` is what the agent uses to decide whether to load the skill at all, and since I talk to it in Portuguese most of the time, English-only triggers would mean a skill that never fires. Whatever language you actually work in, it needs to be in there.

But the design decision that matters most in this skill is a different one, and it took me a while to get there. The skill does **not** contain the templates or the MOC list. It contains an instruction to go read them:

> Do NOT hardcode template content or MOC lists in this skill. The vault files are the source of truth, read them dynamically each time to stay in sync with any changes the user makes.

The first version had the template copied inside it. That worked for about two weeks, until I changed the template in the vault and the agent kept generating notes in the old format, because as far as it was concerned the truth lived in the skill. Today the skill is basically a list of "read these files first" plus the decision tree the files do not cover: original insight becomes a permanent note, a summary of an external source becomes a reference note, a quick capture becomes a fleeting note.

Two sources of truth is exactly one more than you can keep in sync.

### An AGENTS.md for the vault

The vault's `AGENTS.md` has exactly one job: recording what the agent gets wrong.

I started out writing a beautiful, complete manual, and it was a waste, because the model already knew half of it. Today the file opens like this, pointing at the real manual and covering only the rest:

> Full manual: `How to Use My Zettelkasten.md`. This file covers only what an agent is likely to get wrong.

What ended up in there, after the agent got each one wrong at least once:

- **Naming convention**: `{prefix}-{timestamp} - {title}.md`, no exceptions
- **The YAML difference**: Inbox notes use plain properties (`ID:`, `Date:`), processed notes use frontmatter with `---` and lowercase keys. The agent kept mixing the two
- **Never leave an orphan note**: without `connection`, the note does not appear in any MOC
- **Language**: which language note content is written in, and which technical terms stay untranslated
- **MOC numbering**: list the `01 MOCs/` folder to find the next free number, never infer it from gaps in the sequence, because some numbers are skipped on purpose and others are reused

That last item is a good example of the principle: I only found out I needed it because the agent created a MOC with a duplicate number. Every line in that file cost me a mistake.

### Recommended plugins

The ones I actually use:

- **Templater**: generates the `id`, picks the MOC and moves the file to the right folder at creation time. It is what turns the convention into automation instead of discipline
- **Dataview**: builds the MOC indexes by query, instead of me maintaining lists by hand
- **Dataview Serializer**: the most important one for this workflow, more on it below
- **Omnisearch**: decent full-text search across the whole vault
- **Kanban**: I track my Open Source issues and PRs
- **Periodic Notes**, **Auto Link Title**, **Paste Image Rename**: day-to-day convenience

Dataview Serializer deserves its own paragraph. A normal Dataview query only renders inside Obsidian, so the file on disk contains the query, not the result. For me that makes no difference, for the agent it is fatal: it reads the file, finds a query block and no content. The Serializer writes the result as real markdown inside the file:

```markdown
<!-- QueryToSerialize: LIST FROM "02 References/01 - Java" -->
<!-- SerializedQuery: LIST FROM "02 References/01 - Java" -->
- [[01-202602091530 - First note title]]
- [[01-202602091700 - Second note title]]
<!-- SerializedQuery END -->
```

Now the MOC is readable by anything that can read text, and the agent can navigate the vault through the indexes instead of scanning every directory. That is just-in-time retrieval in practice: it reads one small MOC and fetches only the note that matters, instead of loading the entire vault into the context window.

## Conclusion

If I can boil all of this down to one sentence: stop throwing context away. The tool and the format matter far less than having something written down somewhere.

Every day we solve problems that cost time, tokens and patience, and then we close the terminal and lose all of it. The agent forgets by the next session, and six months from now I will have forgotten too. Writing it down somewhere structured solves both problems at once, and that is the part that surprised me: I built the system for myself and got agent memory for free, provider-agnostic and versioned by me.

If you already take notes, you are one `AGENTS.md` away from sharing them with your agent. If you do not, start with the fleeting note, which has the lowest friction, and let the rest grow from there.

And watch out for the configuration rabbit hole. Seriously.

---

## Resources

- [How to Take Smart Notes, Sönke Ahrens](https://www.goodreads.com/book/show/34507927-how-to-take-smart-notes)
- [Zettelkasten.de: Introduction to the Zettelkasten Method](https://zettelkasten.de/introduction/)
- [Niklas Luhmann (Wikipedia)](https://en.wikipedia.org/wiki/Niklas_Luhmann)
- [Zettelkasten in practice, Prof. Rodrigo Leão (Portuguese)](https://www.youtube.com/watch?v=lBFiqLEIPDY)
- [Obsidian, Prof. Rodrigo Leão (Portuguese)](https://www.youtube.com/watch?v=Q7LuaSyJM7o)
- [Obsidian](https://obsidian.md/)
- [Effective context engineering for AI agents, Anthropic](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents)
- [Knowledge bases for agents: what I measured across 859 runs, and what I threw away, Kayan de Souza Pereira (Portuguese)](https://medium.com/@kayandesouzapereira/knowledge-bases-para-agentes-o-que-eu-medi-em-859-execu%C3%A7%C3%B5es-e-o-que-joguei-fora-973e3499488e)
- [Open Knowledge Format (OKF), Google Cloud](https://github.com/GoogleCloudPlatform/knowledge-catalog/tree/main/okf)
- [GitHub Spec Kit](https://github.com/github/spec-kit)
- [Syncthing](https://syncthing.net/)
