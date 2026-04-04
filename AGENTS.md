# AGENTS.md

## Hugo Blog - Key Facts

### Setup
```bash
git submodule update --init --recursive  # Required after clone
```

### Local Development
```bash
hugo server --buildDrafts
```

### Content Creation
```bash
hugo new content posts/[YYYY-MM-DD-slug-in-english]/index.en.md   # English post
hugo new content posts/[YYYY-MM-DD-slug-in-english]/index.pt.md  # Portuguese post
```

### Hugo Version
- Uses **Hugo Extended** (required for PostCSS/SCSS processing)
- CI uses version `0.146.0` (defined in `gh-pages.yml`)

### Content Structure
- Posts: `content/posts/[YYYY-MM-DD-slug-in-english]/index.[en|pt].md`
- Page bundles with index files for multilingual support
- Frontmatter `slug` is language-specific: use English slug for `index.en.md`, Portuguese slug for `index.pt.md`
- `draft: false` required to publish
- **Internal links:** Use `slug` from frontmatter, not directory name. Portuguese posts: `/posts/slug/`, English posts: `/en/posts/slug/`

### Deployment
- Automated via GitHub Actions on push to `main`
- Builds to `./public/` directory
- Ignores changes to `images/**`, `LICENSE`, `README.md`

### CI Artifacts
- `update-profile.yml` syncs latest posts to a separate profile repo (`omatheusmesmo/omatheusmesmo`)

### Hugo Config (hugo.toml)
- **Default language:** Portuguese (`pt-br`)
- **Permalink format:** `/posts/:slug/`
- **Image processing:** Lanczos resampling, quality 75, smart anchoring
- **Goldmark:** `unsafe = false` — raw HTML not allowed in markdown
- **Comments:** Disqus enabled (`params.comments.enabled`)

### Custom Overrides
- **`assets/css/extended/custom.css`:** Custom styles (minified + fingerprint)
- **`layouts/partials/extend_head.html`:** Adds custom CSS, Schema.org JSON-LD on homepage, preloads first post cover, CSP header
- **`layouts/_default/_markup/render-image.html`:** Converts images to WebP with srcset (720w + original)
