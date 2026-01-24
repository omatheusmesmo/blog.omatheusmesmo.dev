---
title: "Why Every Programmer Should Know Vim/Neovim"
date: 2026-01-23T17:00:00-03:00
draft: false
tags: ["Vim", "Neovim", "Productivity", "Tools", "Lua"]
author: "Matheus Oliveira"
slug: "vim-neovim"
summary: "Discover how mastering Vim/Neovim can transform your productivity and change the way you write code, going far beyond just a simple text editor."
cover:
  image: "vim-neovim-cover.png"
  alt: "Illustration of Neovim editor with Lua code"
  caption: "Neovim: Power and extensibility with Lua"
  relative: true
---

If you are a programmer, you have probably heard of **Vim** or its successor, **Neovim**. Maybe you even opened it by accident and panicked when you couldn't exit. Despite its reputation as a "hard editor," knowing it goes far beyond a niche skill. It is a powerful, lightweight, and extremely productive tool that can change the way you write code — even if you don't use it as your main editor.

## What is it?

**Vim** (*Vi IMproved*) is a modal text editor, based on the classic `vi`, present in almost all Unix/Linux systems.

**Neovim** is a modern rewrite of Vim, focused on modularity, extensibility, and performance, offering a smoother experience for modern developers.

## Why should every programmer know them?

### 1. Ubiquity
Vim is installed by default on almost all Linux distributions and Unix-like systems. In emergency situations (like accessing servers via SSH), knowing how to use Vim can be the difference between solving a problem or getting stuck.

### 2. Productivity with shortcuts
Vim was designed to keep your hands on the keyboard. Without needing to use the mouse, you gain agility with commands that allow you to:

```bash
h, j, k, l     # move cursor (left, down, up, right)
w / b          # jump words forward or backward
dd / yy        # delete or copy line
p / P          # paste after or before current position
```

### 3. Powerful Customization
Configure it completely via `.vimrc` (Vim) or `init.lua` (Neovim), creating shortcuts, changing appearance, behavior, and much more.

### 4. Extensibility with plugins
**Neovim** stands out especially in this regard. With modern support for plugins in **Lua**, Python, and other languages, it is possible to transform the editor into a truly minimalist and fast IDE.

---

## Basic features every programmer must know

### Main Modes:
*   **Normal:** Navigation and commands.
*   **Insert:** Text editing (`i`, `a`, `o`).
*   **Visual:** Text selection (`v`, `V`, `Ctrl+v`).
*   **Command-line:** To save, search, exit, etc. (`:`).

### Essential Commands:
```bash
i            # enter insert mode
:w           # save
:q           # exit
:wq          # save and exit
u            # undo
Ctrl + r     # redo
```

---

## Real Productivity: Navigate and Edit like a Ninja

### Navigate to a specific character:
```bash
f(        # go to the next parenthesis on the line
t"        # go to just before the next quote
F=        # go back to the equals sign
;         # repeat the last search
```

> *GIF demonstrating navigation (placeholder)*

### Delete large blocks of text:
```bash
dG            # delete to the end of the file
dgg           # delete to the beginning of the file
d}            # delete to the next block
d/<word>      # delete until the searched word
dtx           # delete until before character x
```

> *GIF demonstrating delete variations (placeholder)*

### Combination of movement + action
```bash
d3w       # delete 3 words
y}        # copy until the end of the paragraph
c$        # change from cursor to end of line
```

---

## What if you want to turn it into an IDE?

With **Neovim**, **Lua**, and a powerful selection of plugins, you can create a modern, elegant, and super functional development environment. Here are some examples based on your configuration:

*   **Smart Navigation:** `telescope.nvim` combined with `telescope-file-browser.nvim` for fast file searching and direct directory navigation.
*   **File Explorer:** `nvim-tree` with `nvim-web-devicons` icons for an interactive and stylish file tree.
*   **Advanced Syntax Highlighting:** `nvim-treesitter` for powerful syntax highlighting and advanced support for various languages.
*   **Autocomplete with LSP:** `nvim-cmp` integrated with the *Language Server Protocol* to complete code smartly and efficiently.
*   **Customizable Status Bar:** `lualine.nvim` for a dynamic and customizable status bar.
*   **Git Integration:** `gitsigns.nvim` to visualize code changes and interact with Git directly within the editor.
*   **Advanced Debugging:** `nvim-dap` to configure and run debugging directly in Neovim.

With this combination, your Neovim transforms into a complete and productive environment, rivaling any modern IDE.

---

## Brazilian Highlight: The Power of Lua 🇧🇷

One of the biggest evolutions of Neovim was the adoption of the **Lua** language as the basis for its configuration and extension. And here is the most special detail:

**Lua is a Brazilian language**, created at PUC-Rio by Roberto Ierusalimschy, Luiz Henrique de Figueiredo, and Waldemar Celes.

Today, Lua is used in games, embedded systems, and also in Neovim, allowing:
*   More readable and powerful configurations.
*   Faster plugin execution.
*   Clear and professional modularization.

### Simple configuration example with Lua:

```lua
vim.opt.number = true
vim.opt.relativenumber = true

vim.keymap.set("n", "<leader>pv", vim.cmd.Ex) 
```

---

## Conclusion

Even if you never use Vim or Neovim as your main editor, knowing its basic commands and philosophy will elevate your level as a programmer:

*   More agility in the terminal and remote servers.
*   Efficient editing without a mouse.
*   Advanced customization with a Brazilian language: **Lua**.
*   Learning concepts applicable to other tools (like Vim-inspired IDE shortcuts).

Learning Vim is not about nostalgia. **It's about power.**
