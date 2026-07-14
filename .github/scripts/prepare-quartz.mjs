import fs from "node:fs/promises"
import fsSync from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const vaultRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..")
const quartzRoot = path.join(vaultRoot, ".quartz-site")
const contentRoot = path.join(quartzRoot, "content")

const ignoredDirs = new Set([
  ".git",
  ".github",
  ".obsidian",
  ".quartz-site",
  ".site",
  ".trash",
  "_site",
  "node_modules",
  "z_Private",
  "z_Templates",
])

const passthroughFiles = new Set([".gitignore"])

if (!fsSync.existsSync(quartzRoot)) {
  throw new Error(`Quartz checkout not found at ${quartzRoot}`)
}

await fs.rm(contentRoot, { recursive: true, force: true })
await fs.mkdir(contentRoot, { recursive: true })

await copyPublicVault(vaultRoot, contentRoot)
await fs.writeFile(path.join(contentRoot, "index.md"), await renderSystemPicker(), "utf8")
await fs.writeFile(path.join(quartzRoot, "quartz.config.yaml"), quartzConfig(), "utf8")

console.log(`Prepared Quartz content in ${contentRoot}`)

async function copyPublicVault(fromDir, toDir) {
  const entries = await fs.readdir(fromDir, { withFileTypes: true })

  for (const entry of entries) {
    if (entry.isDirectory() && (entry.name.startsWith(".") || ignoredDirs.has(entry.name))) continue
    if (entry.isDirectory() && ignoredDirs.has(entry.name)) continue
    if (entry.isFile() && (entry.name.startsWith(".") || passthroughFiles.has(entry.name))) continue

    const from = path.join(fromDir, entry.name)
    const to = path.join(toDir, entry.name)

    if (entry.isDirectory()) {
      await fs.mkdir(to, { recursive: true })
      await copyPublicVault(from, to)
    } else if (entry.isFile()) {
      await fs.mkdir(path.dirname(to), { recursive: true })
      await fs.copyFile(from, to)
    }
  }
}

async function renderSystemPicker() {
  const systems = []
  const entries = await fs.readdir(vaultRoot, { withFileTypes: true })

  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith(".") || ignoredDirs.has(entry.name)) continue
    const notes = await countMarkdownFiles(path.join(vaultRoot, entry.name))
    if (notes === 0) await ensureEmptySystemIndex(entry.name)
    systems.push({
      name: entry.name,
      count: notes,
      href: `${quartzSlugPath(entry.name)}/`,
      artwork: entry.name === "Daggerheart" ? quartzSlugPath("Daggerheart/z_Assets/Umbra.png") : "",
    })
  }

  systems.sort((a, b) => a.name.localeCompare(b.name))

  const cards = systems
    .map((system) => {
      const artwork = system.artwork ? ` data-artwork="${escapeHtml(system.artwork)}"` : ""
      const count = system.count === 0 ? "No public notes yet" : `${system.count} public note${system.count === 1 ? "" : "s"}`
      return `<a class="system-card${system.count === 0 ? " is-empty" : ""}" href="${system.href}"${artwork}><span><strong>${escapeHtml(system.name)}</strong><small>${escapeHtml(count)}</small></span></a>`
    })
    .join("\n")

  return `---
title: TTRPG Notes
---

# TTRPG Notes

<p class="system-picker-intro">Choose a system to enter the public campaign notes.</p>

<section class="system-grid">
${cards}
</section>
`
}

async function countMarkdownFiles(dir) {
  let count = 0
  const entries = await fs.readdir(dir, { withFileTypes: true })

  for (const entry of entries) {
    if (entry.isDirectory() && ignoredDirs.has(entry.name)) continue
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      count += await countMarkdownFiles(fullPath)
    } else if (entry.isFile() && entry.name.toLowerCase().endsWith(".md")) {
      count += 1
    }
  }

  return count
}

async function ensureEmptySystemIndex(systemName) {
  const indexPath = path.join(contentRoot, systemName, "index.md")
  if (fsSync.existsSync(indexPath)) return

  await fs.mkdir(path.dirname(indexPath), { recursive: true })
  await fs.writeFile(
    indexPath,
    `---\ntitle: ${systemName}\n---\n\n# ${systemName}\n\nNo public notes yet.\n`,
    "utf8",
  )
}

function quartzSlugPath(vaultPath) {
  return vaultPath
    .split(/[\\/]+/)
    .map((segment) =>
      segment
        .trim()
        .toLowerCase()
        .replace(/&/g, "-and-")
        .replace(/\s+/g, "-")
        .replace(/[^a-z0-9_-]+/g, "-")
        .replace(/-+/g, "-")
        .replace(/^-|-$/g, ""),
    )
    .filter(Boolean)
    .join("/")
}

function quartzConfig() {
  return `# yaml-language-server: $schema=./quartz/plugins/quartz-plugins.schema.json
configuration:
  pageTitle: TTRPG Notes
  pageTitleSuffix: ""
  enableSPA: true
  enablePopovers: true
  analytics:
    provider: none
  locale: en-US
  ignorePatterns:
    - "**/z_Private/**"
    - "**/z_Templates/**"
    - ".obsidian/**"
  theme:
    fontOrigin: googleFonts
    cdnCaching: true
    typography:
      header: Merriweather
      body: Source Sans 3
      code: IBM Plex Mono
    colors:
      lightMode:
        light: "#faf8f2"
        lightgray: "#ded6c8"
        gray: "#9b9488"
        darkgray: "#504b43"
        dark: "#26231f"
        secondary: "#8f3029"
        tertiary: "#b46b4d"
        highlight: rgba(143, 48, 41, 0.12)
        textHighlight: "#f3d87a88"
      darkMode:
        light: "#181915"
        lightgray: "#38372f"
        gray: "#777265"
        darkgray: "#d9d2c0"
        dark: "#f1ecdf"
        secondary: "#f0a06f"
        tertiary: "#d3bc7d"
        highlight: rgba(240, 160, 111, 0.14)
        textHighlight: "#b3aa0288"
plugins:
  - source: github:quartz-community/created-modified-date
    enabled: true
    order: 10
    options:
      defaultDateType: modified
      priority:
        - frontmatter
        - git
        - filesystem
  - source: github:quartz-community/note-properties
    enabled: true
    order: 15
    options:
      includeAll: false
  - source: github:quartz-community/syntax-highlighting
    enabled: true
    order: 20
    options:
      theme:
        light: github-light
        dark: github-dark
      keepBackground: false
  - source: github:quartz-community/obsidian-flavored-markdown
    enabled: true
    order: 30
    options:
      enableInHtmlEmbed: false
      enableCheckbox: true
  - source: github:quartz-community/github-flavored-markdown
    enabled: true
    order: 40
  - source: ../.github/quartz/plugins/ttrpg-renderers
    enabled: true
    order: 45
  - source: github:quartz-community/table-of-contents
    enabled: true
    order: 50
    layout:
      position: right
      priority: 30
  - source: github:quartz-community/crawl-links
    enabled: true
    order: 60
    options:
      markdownLinkResolution: shortest
  - source: github:quartz-community/description
    enabled: true
    order: 70
  - source: github:quartz-community/fonts
    enabled: true
  - source: github:quartz-community/remove-draft
    enabled: true
  - source: github:quartz-community/alias-redirects
    enabled: true
  - source: github:quartz-community/content-index
    enabled: true
    options:
      enableSiteMap: true
      enableRSS: false
  - source: github:quartz-community/favicon
    enabled: true
  - source: github:quartz-community/og-image
    enabled: true
  - source: github:quartz-community/canvas-page
    enabled: true
  - source: github:quartz-community/content-page
    enabled: true
  - source: github:quartz-community/folder-page
    enabled: true
  - source: github:quartz-community/tag-page
    enabled: true
  - source: github:quartz-community/explorer
    enabled: true
    layout:
      position: left
      priority: 50
  - source: github:quartz-community/search
    enabled: true
    layout:
      position: left
      priority: 20
      group: toolbar
      groupOptions:
        grow: true
  - source: github:quartz-community/backlinks
    enabled: true
    layout:
      position: right
      priority: 50
  - source: github:quartz-community/article-title
    enabled: true
    layout:
      position: beforeBody
      priority: 10
  - source: github:quartz-community/content-meta
    enabled: true
    layout:
      position: beforeBody
      priority: 20
  - source: github:quartz-community/page-title
    enabled: true
    layout:
      position: left
      priority: 10
  - source: github:quartz-community/darkmode
    enabled: true
    layout:
      position: left
      priority: 30
      group: toolbar
  - source: github:quartz-community/breadcrumbs
    enabled: true
    layout:
      position: beforeBody
      priority: 5
      condition: not-index
  - source: github:quartz-community/footer
    enabled: true
    options:
      links: {}
`
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}
