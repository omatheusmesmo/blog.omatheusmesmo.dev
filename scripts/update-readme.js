const fs = require('fs');
const path = require('path');

const POSTS_DIR = path.join(__dirname, '../content/posts');
const README_PATH = path.join(__dirname, '../profile-repo/README.md');
const BASE_URL = 'https://blog.omatheusmesmo.dev/en/posts';

const START_MARKER = '<!-- BLOG-POST-LIST:START -->';
const END_MARKER = '<!-- BLOG-POST-LIST:END -->';

function getLatestPosts() {
    if (!fs.existsSync(POSTS_DIR)) {
        console.error(`Error: Posts directory not found at ${POSTS_DIR}`);
        return [];
    }

    const folders = fs.readdirSync(POSTS_DIR);
    const posts = [];

    folders.forEach(folder => {
        const folderPath = path.join(POSTS_DIR, folder);
        if (fs.statSync(folderPath).isDirectory()) {
            const filePath = path.join(folderPath, 'index.en.md');
            if (fs.existsSync(filePath)) {
                const content = fs.readFileSync(filePath, 'utf-8');
                
                const titleMatch = content.match(/title:\s*["'](.*?)["']/);
                const dateMatch = content.match(/date:\s*(.*)/);
                const slugMatch = content.match(/slug:\s*["'](.*?)["']/);
                const draftMatch = content.match(/draft:\s*(true|false)/);
                const summaryMatch = content.match(/summary:\s*["'](.*?)["']/);

                const isDraft = draftMatch ? draftMatch[1] === 'true' : false;

                if (!isDraft && titleMatch && dateMatch) {
                    posts.push({
                        title: titleMatch[1],
                        date: new Date(dateMatch[1]),
                        slug: slugMatch ? slugMatch[1] : folder,
                        summary: summaryMatch ? summaryMatch[1] : ''
                    });
                }
            }
        }
    });

    // Sort by date DESC (Newest first)
    return posts.sort((a, b) => b.date - a.date);
}

function updateReadme() {
    console.log('--- Starting Profile README Update ---');

    if (!fs.existsSync(README_PATH)) {
        console.error(`Error: Profile README not found at ${README_PATH}`);
        process.exit(1);
    }

    const allPosts = getLatestPosts();
    console.log(`Found ${allPosts.length} published posts.`);

    if (allPosts.length === 0) {
        console.log('No posts found. Skipping update.');
        return;
    }

    // Featured = 5 most recent posts
    const featuredCount = 5;
    const featuredPosts = allPosts.slice(0, featuredCount);
    const archivedPosts = allPosts.slice(featuredCount);

    let markdown = featuredPosts
        .map(post => `- **[${post.title}](${BASE_URL}/${post.slug}/)**  \n  ${post.summary}`)
        .join('\n\n');

    if (archivedPosts.length > 0) {
        markdown += `\n\n<details>\n<summary>📂 <b>View all posts (${archivedPosts.length} more)</b></summary>\n\n`;
        markdown += archivedPosts
            .map(post => `- [${post.title}](${BASE_URL}/${post.slug}/)`)
            .join('\n');
        markdown += `\n</details>`;
    }

    const readmeContent = fs.readFileSync(README_PATH, 'utf-8');
    const markerRegex = new RegExp(`${START_MARKER}[\\s\\S]*${END_MARKER}`);
    
    if (markerRegex.test(readmeContent)) {
        const newContent = `${START_MARKER}\n\n${markdown}\n\n${END_MARKER}`;
        fs.writeFileSync(README_PATH, readmeContent.replace(markerRegex, newContent));
        console.log('SUCCESS: Profile README updated with latest posts.');
    } else {
        console.error('ERROR: Markers not found in README.');
        process.exit(1);
    }
}

updateReadme();
