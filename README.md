# 🚀 blog.omatheusmesmo.dev

Hello! I'm **Matheus Oliveira**, known online as **@omatheusmesmo**. This repository contains the source code for my personal blog, a space dedicated to sharing insights, technical guides, and lessons learned in the software development universe.

### ✍️ About the Blog
I believe that **no code makes sense without the people behind it.** My goal here is to create a repository of knowledge focusing on:
*   **Java Ecosystem:** From fundamental concepts to advanced Jakarta EE and Quarkus features.
*   **Cloud Native:** Building scalable and resilient architectures.
*   **Open Source:** Sharing the philosophy of collaborative development and my contributions to projects like Jakarta EE and Quarkus.

---

### ✨ Repository Features
*   **Fast & Lightweight:** Built with [Hugo](https://gohugo.io/), the world's fastest static site generator.
*   **Modern Design:** Powered by the [PaperMod](https://github.com/adityatelange/hugo-PaperMod) theme.
*   **Multilingual:** Full support for **English** and **Portuguese**.
*   **Performance Optimized:** Optimized for Google PageSpeed (WebP images, responsive sizes, and LCP/CLS fixes).
*   **SEO Ready:** Sitemap, Robots.txt, and Canonical URLs configured.
*   **Automated Workflow:** CI/CD via GitHub Actions.

### ⚙️ Local Development
To get the development environment ready on your machine:

*   **Prerequisites:** Ensure you have [Hugo Extended](https://gohugo.io/getting-started/installing/) installed.
*   **Clone the Repository:**
    ```bash
    git clone https://github.com/omatheusmesmo/blog.omatheusmesmo.dev.git
    cd blog.omatheusmesmo.dev
    git submodule update --init --recursive
    ```
*   **Run Locally:**
    ```bash
    hugo server --buildDrafts
    ```

### 🚀 Deployment
Deployment is fully automated. Every push to the `main` branch triggers a GitHub Action that builds the site and publishes it to **GitHub Pages**. The blog is accessible via my custom domain: [blog.omatheusmesmo.dev](https://blog.omatheusmesmo.dev).

### ✍️ Creating Content
To generate a new post bundle:
```bash
hugo new content posts/your-post-slug/index.en.md
```

---

### 📧 Let's Connect
Whether you want to talk about Java, Open Source, or Cloud Architecture, I'd love to hear from you:

*   **LinkedIn:** [Matheus Oliveira](https://www.linkedin.com/in/omatheusmesmo/)
*   **GitHub:** [@omatheusmesmo](https://github.com/omatheusmesmo)
*   **Email:** [hi@omatheusmesmo.dev](mailto:hi@omatheusmesmo.dev)
