---
title: "Why Every Developer Should Use Linux"
date: 2026-03-29T10:00:00-03:00
draft: false
tags: ["Linux", "Development", "Tools", "Productivity", "DevOps", "Open Source"]
author: "Matheus Oliveira"
slug: "why-developer-should-use-linux"
summary: "Top reasons why developers choose Linux: native tools, performance, security, and parity with production environments."
description: "Explore why Linux is a solid choice for developers — technical advantages, essential tools, practical workflows, and how to get started."
cover:
  image: "image.png"
  alt: "SNES-style pixel art scene featuring Linus Torvalds facing a giant monster shaped like a GPU representing big tech companies, with the caption 'LINUS: Open Source Atack!'"
  caption: "LINUS: Open Source Atack! The open source battle against big tech."
  relative: true
---

**TL;DR:** Linux offers native development tools, greater parity with production servers, excellent performance, and fine-grained system control — which is why many developers prefer to migrate or adopt Linux in their workflow.

## Introduction

"Real developers use Linux." You’ve heard it before, probably from someone with a superiority complex and an unkempt beard. I’m not going to force you to `rm -rf /windows` — but the numbers speak for themselves.

According to the **Stack Overflow Developer Survey 2024** (65k respondents), **Ubuntu alone is used by ~28% of developers** professionally. Add Debian (~10%), Fedora (~5%), Arch (~4%), and other distros, and the base of devs working on some flavor of Linux is massive. Throw in the **~17% using WSL** (yes, Windows running a Linux kernel under the hood) and the conclusion is clear: Linux isn’t niche, it’s mainstream.

In this article, I’ll explain, in a practical way, **why** this happens, what the real advantages are, and how to start without needing to format your entire computer today.

## Why use Linux as a developer?

### Stability and performance

The Linux kernel is designed for continuous load — servers that stay up for weeks or months are the norm. For development, this means less overhead, better support for intensive I/O, and more predictability in environments that mirror production.

- Less memory consumption in infrastructure services.
- CLI tools with low resource costs.

**Practical tip:** if you need to reproduce production issues locally (logs, containers, services), Linux reduces the chance of "it works on my machine" due to OS differences.

### Tools and ecosystem

Most dev-first tools (Git, Docker, systemd, SSH, OpenJDK, networking tools) were designed with Linux as the primary target. Installing, automating, and integrating these tools is more direct on Linux.

- Package managers (apt, dnf, pacman) facilitate installations and updates.
- Modern CLI tools: ripgrep, fd, bat, eza (active fork of exa, which was abandoned), fzf, zoxide (smart cd), atuin (shell history with sync).

### Control and customization

In Linux, you have access to the entire system: permissions, network, kernel params, and dotfiles. This allows you to create a tailor-made environment — from an ultra-fast prompt to scripts that run repetitive tasks automatically.

- Setting up aliases, prompts (starship), and managing services with systemd are trivial routines.
- The transition to **Wayland** (now default in GNOME and KDE) brought better HiDPI support, touchpad gestures, and input isolation between windows — a significant upgrade for multi-monitor setups.

### Security and permissions

Unix permission models, namespaces, and mechanisms like AppArmor/SELinux help reduce attack vectors. Additionally:

- **cgroups v2** enable fine-grained CPU and memory isolation per container — the foundation of all Docker and Kubernetes security.
- **seccomp** and **capabilities** restrict which syscalls processes can execute, reducing the attack surface.
- Less proprietary software installed means a smaller malware surface in daily use.
- Kernel security updates are fast and don’t require forced reboots (with **livepatch**).

### Similarity with production environments (DevOps)

Most cloud servers run Linux. Using Linux locally reduces differences between dev and prod — which simplifies deployments, debugging, and CI/CD pipelines (containers, systemd, crontab, network stack).

## Essential Linux tools for developers

### Terminal and shells (bash, zsh, fish)

The terminal is the central tool. Learning a good shell (zsh + plugins or fish) and utilities like tmux, fzf, and ripgrep dramatically increases productivity.

Installation example (Debian/Ubuntu):

```bash
sudo apt update && sudo apt install -y git zsh tmux ripgrep fd-find neovim
```

### Package managers and SDKs

For multiple language versions, use dedicated managers: `sdkman`, `asdf`, `mise` (modern asdf alternative written in Rust, much faster), `pyenv`, `nvm`. They make it trivial to switch JDK/Node/Python between projects without version conflicts.

### Containers, Docker, and runtimes

Docker and Podman run natively on Linux — building images, testing compose, and running containers is faster and more reliable than in compatibility layers (VMs).

- **Real performance:** If you use **Testcontainers** with Quarkus or Spring, the difference is massive. On Linux, containers spin up almost instantly because there's no overhead from an intermediate virtual machine.
- Tip: try `podman` for rootless containers.

### Editors and IDEs (neovim, VS Code, JetBrains)

In Linux, you find everything: terminal-friendly editors (neovim), VS Code (with Remote - Containers), and JetBrains IDEs. Integration with the system (fonts, clipboard, performance) is usually better.

## Practical workflows and productivity

### Local development that reflects production

Use containers (Docker/Podman) and orchestration tools to replicate services: database, cache, broker. This reduces surprises at deployment and facilitates integration tests.

### Automation, scripts, and CI/CD

Create shell scripts or Makefiles for repetitive tasks; use systemd user services for background tasks. Integrating these routines into CI is straightforward because the runner environment is Linux.

### Debugging, profiling, and monitoring

Native tools (strace, perf, tcpdump, iotop) are powerful for diagnosing issues that only appear in production. For Java/Go/Node applications, there are profilers that work better on Linux.

## Myths and truths about using Linux

- **"Linux is only for experts"** — Myth. Distributions like Ubuntu, Pop!_OS, and Linux Mint have graphical installers, app stores, and interfaces as intuitive as Windows. Ubuntu alone, for example, is used by nearly 28% of professional developers (Stack Overflow Survey 2024).
- **"Software is missing"** — Myth. Essential development tools exist natively, and popular proprietary software (VS Code, JetBrains, Slack, Zoom, Spotify) has Linux builds. For other apps, **Flatpak** and **Snap** work as "universal stores" with thousands of applications.
- **"You can't game on it"** — Myth. The **Steam Deck** proved Linux is viable for gaming. With **Proton** (Valve's compatibility layer), thousands of Windows games run on Linux. It's no longer an excuse not to switch.
- **"Hardware doesn't work"** — Nearly a myth in 2026. NVIDIA open-source drivers (`nvidia-open`), native Intel/AMD support, and Valve's work with the Steam Deck have drastically improved compatibility. Issues still exist with very specific hardware, but they’re the exception.

## How to get started: distributions and initial configuration

Quick recommendations:

- Beginners: **Ubuntu LTS**, **Pop!_OS**, or **Debian Stable** (the rock-solid stable foundation for many others).
- Intermediate: **Fedora** (newer packages and cutting-edge technologies).
- Advanced/Enthusiasts: **Arch Linux** or **Omarchy** (DHH's Arch-based setup with Hyprland, fully focused on keyboard navigation and functional aesthetics). Using a *Tiling Window Manager* (like Hyprland) eliminates time spent hunting for windows with the mouse — your code is on one screen, the terminal on another, the browser on another, all via shortcuts.
- On Windows: **WSL2** is an excellent entry point, but keep in mind that file I/O (especially in large Java/Maven projects) is still slower than native Linux.

Minimum setup (Ubuntu/Debian):

```bash
# update the system
sudo apt update && sudo apt upgrade -y

# basic tools
sudo apt install -y build-essential git curl wget zsh neovim ripgrep fd-find bat

# Docker: install via official repository (not the distro's docker.io)
# https://docs.docker.com/engine/install/ubuntu/
sudo usermod -aG docker $USER

# eza and zoxide: install via cargo or GitHub binaries
# cargo install eza zoxide

ssh-keygen -t ed25519 -C "your@email.com"
```

Then, adapt your dotfiles, install an SDK manager (`sdkman`/`asdf`), and set up your preferred editor.

## Conclusion

Linux is not a magic requirement for being a good developer — you can be productive on any OS. But ignoring the advantages it offers is like insisting on using `System.out.println()` when a robust logging framework exists: it works, but you’re leaving performance and control on the table.

If you’ve never tried it, you don’t need to format everything today. Open a WSL, spin up a VM, or install a dual-boot. Set up an environment that solves real problems in your daily life. And if you already use Linux, invest time in mastering the terminal and the tools it offers — the return on productivity is exponential.

> The best operating system is the one that gets out of your way and lets you solve problems. For most development scenarios, that system is Linux.

## Recommended Reading / Resources

- Official Ubuntu / Fedora / Arch Documentation
- Tools: `ripgrep`, `fd`, `bat`, `fzf`, `tmux`
- [To learn neovim]({{< ref "posts/2026-01-23-vim-neovim/index.en.md" >}})
- [Guide on how to contribute to open source]({{< ref "posts/2026-02-07-open-source-the-definitive-guide-to-start-contributing/index.en.md" >}})
