import fs from "node:fs/promises"
import fsSync from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const vaultRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..")
const quartzRoot = path.join(vaultRoot, ".quartz-site")
const contentRoot = path.join(quartzRoot, "content")
const siteDomain = readSiteDomain()

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

const passthroughFiles = new Set([".gitignore", "CNAME"])

if (!fsSync.existsSync(quartzRoot)) {
  throw new Error(`Quartz checkout not found at ${quartzRoot}`)
}

await fs.rm(contentRoot, { recursive: true, force: true })
await fs.mkdir(contentRoot, { recursive: true })

await copyPublicVault(vaultRoot, contentRoot)
await writeGeneratedFolderIndexes()
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
      const artworkStyle = system.artwork ? ` style="background-image:url('${escapeHtml(system.artwork)}')"` : ""
      const count = system.count === 0 ? "No public notes yet" : `${system.count} public note${system.count === 1 ? "" : "s"}`
      return `<a class="system-card${system.count === 0 ? " is-empty" : ""}" href="${system.href}"${artwork}${artworkStyle}><span><strong>${escapeHtml(system.name)}</strong><small>${escapeHtml(count)}</small></span></a>`
    })
    .join("\n")

  return `---
title: TTRPG Notes
---

<p class="system-picker-intro">Choose a system to enter the public campaign notes.</p>

<section class="system-grid">
${cards}
</section>
`
}

async function writeGeneratedFolderIndexes() {
  const folders = await collectFolders(contentRoot)
  folders.sort((a, b) => b.relative.split(path.sep).length - a.relative.split(path.sep).length)

  for (const folder of folders) {
    if (!folder.relative) continue
    const indexPath = path.join(folder.absolute, "index.md")
    if (fsSync.existsSync(indexPath)) continue

    const details = await folderDetails(folder.relative)
    if (details.noteCount === 0 && details.sectionCount === 0) continue

    await fs.writeFile(indexPath, renderFolderIndex(details), "utf8")
  }
}

async function collectFolders(dir, relative = "") {
  const folders = [{ absolute: dir, relative }]
  const entries = await fs.readdir(dir, { withFileTypes: true })

  for (const entry of entries) {
    if (!entry.isDirectory() || ignoredDirs.has(entry.name)) continue
    folders.push(...await collectFolders(path.join(dir, entry.name), path.join(relative, entry.name)))
  }

  return folders
}

async function folderDetails(relative) {
  const absolute = path.join(contentRoot, relative)
  const entries = await fs.readdir(absolute, { withFileTypes: true })
  const dirs = []
  const directNotes = []
  const highlights = []
  let noteCount = 0
  let timelineCount = 0
  let mapCount = 0

  for (const entry of entries) {
    const entryRelative = path.join(relative, entry.name)
    const fullPath = path.join(contentRoot, entryRelative)

    if (entry.isDirectory() && !ignoredDirs.has(entry.name)) {
      const stats = await publicNoteStats(fullPath)
      if (stats.noteCount > 0 || stats.sectionCount > 0) {
        dirs.push({
          name: entry.name,
          href: contentHref(entryRelative, true),
          noteCount: stats.noteCount,
          sectionCount: stats.sectionCount,
          description: folderDescription(entryRelative, entry.name),
        })
        noteCount += stats.noteCount
        timelineCount += stats.timelineCount
        mapCount += stats.mapCount
      }
      continue
    }

    if (entry.isFile() && isPublicMarkdown(entry.name)) {
      const source = await fs.readFile(fullPath, "utf8")
      const title = noteTitle(source, entry.name)
      const note = {
        title,
        href: noteHref(relative, entryRelative),
        description: noteDescription(source),
        hasTimeline: source.includes("```chronos"),
        hasMap: source.includes("```leaflet"),
      }
      directNotes.push(note)
      highlights.push(note)
      noteCount += 1
      if (note.hasTimeline) timelineCount += 1
      if (note.hasMap) mapCount += 1
    }
  }

  const descendantHighlights = await collectHighlights(path.join(contentRoot, relative), relative)
  for (const highlight of descendantHighlights) {
    if (!highlights.some((item) => item.href === highlight.href)) highlights.push(highlight)
  }

  const name = path.basename(relative)
  return {
    name,
    relative,
    breadcrumb: relative.split(path.sep).filter(Boolean),
    description: folderDescription(relative, name),
    artwork: folderArtwork(relative),
    noteCount,
    sectionCount: dirs.length,
    timelineCount,
    mapCount,
    dirs,
    directNotes,
    highlights: highlights.slice(0, 6),
  }
}

async function publicNoteStats(dir) {
  let noteCount = 0
  let sectionCount = 0
  let timelineCount = 0
  let mapCount = 0
  const entries = await fs.readdir(dir, { withFileTypes: true })

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory() && !ignoredDirs.has(entry.name)) {
      const stats = await publicNoteStats(fullPath)
      if (stats.noteCount > 0 || stats.sectionCount > 0) sectionCount += 1
      noteCount += stats.noteCount
      timelineCount += stats.timelineCount
      mapCount += stats.mapCount
    } else if (entry.isFile() && isPublicMarkdown(entry.name)) {
      const source = await fs.readFile(fullPath, "utf8")
      noteCount += 1
      if (source.includes("```chronos")) timelineCount += 1
      if (source.includes("```leaflet")) mapCount += 1
    }
  }

  return { noteCount, sectionCount, timelineCount, mapCount }
}

async function collectHighlights(dir, baseRelative) {
  const highlights = []
  const entries = await fs.readdir(dir, { withFileTypes: true })

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory() && !ignoredDirs.has(entry.name)) {
      highlights.push(...await collectHighlights(fullPath, baseRelative))
      continue
    }
    if (!entry.isFile() || !isPublicMarkdown(entry.name)) continue

    const source = await fs.readFile(fullPath, "utf8")
    if (!source.includes("```chronos") && !source.includes("```leaflet")) continue
    const noteRelative = path.relative(contentRoot, fullPath)
    highlights.push({
      title: noteTitle(source, entry.name),
      href: noteHref(baseRelative, noteRelative),
      description: source.includes("```leaflet") ? "Interactive map" : "Timeline",
      hasTimeline: source.includes("```chronos"),
      hasMap: source.includes("```leaflet"),
    })
  }

  return highlights
}

function renderFolderIndex(details) {
  const artwork = details.artwork ? ` data-artwork="${escapeHtml(details.artwork)}"` : ""
  const sectionCards = details.dirs
    .map((dir) => `<a class="portal-card" href="${escapeHtml(dir.href)}"><strong>${escapeHtml(dir.name)}</strong><small>${escapeHtml(dir.description)}</small><span>${dir.noteCount} note${dir.noteCount === 1 ? "" : "s"}</span></a>`)
    .join("\n")
  const noteCards = details.directNotes
    .map((note) => renderNoteCard(note))
    .join("\n")
  const highlights = details.highlights
    .map((note) => renderNoteCard(note))
    .join("\n")

  return `---
title: ${escapeYaml(details.name)}
---

<section class="portal-hero"${artwork}>
  <p class="portal-kicker">${escapeHtml(details.breadcrumb.slice(0, -1).join(" / ") || "Campaign notes")}</p>
  <p class="portal-summary">${escapeHtml(details.description)}</p>
  <div class="portal-metrics">
    <span>${details.noteCount} note${details.noteCount === 1 ? "" : "s"}</span>
    <span>${details.sectionCount} section${details.sectionCount === 1 ? "" : "s"}</span>
    <span>${details.mapCount} map${details.mapCount === 1 ? "" : "s"}</span>
    <span>${details.timelineCount} timeline${details.timelineCount === 1 ? "" : "s"}</span>
  </div>
</section>

${sectionCards ? `<section class="portal-section"><h2>Sections</h2><div class="portal-grid">${sectionCards}</div></section>` : ""}

${highlights ? `<section class="portal-section"><h2>Highlights</h2><div class="portal-grid">${highlights}</div></section>` : ""}

${noteCards ? `<section class="portal-section"><h2>Notes</h2><div class="portal-list">${noteCards}</div></section>` : ""}
`
}

function renderNoteCard(note) {
  const tags = [
    note.hasMap ? "<span>Map</span>" : "",
    note.hasTimeline ? "<span>Timeline</span>" : "",
  ].filter(Boolean).join("")
  return `<a class="portal-card" href="${escapeHtml(note.href)}"><strong>${escapeHtml(note.title)}</strong><small>${escapeHtml(note.description)}</small>${tags ? `<em>${tags}</em>` : ""}</a>`
}

function folderDescription(relative, name) {
  const key = name.toLowerCase()
  if (key === "daggerheart") return "Campaigns, rules, maps, and setting notes for Daggerheart."
  if (key === "d&d") return "Public notes for D&D games."
  if (key === "age of umbra") return "The public-facing archive for Age of Umbra."
  if (key === "world") return "Places, history, cultures, factions, maps, and timelines."
  if (key === "locations") return "Explorable places and map-linked locations."
  if (key === "campaigns") return "Campaign fronts, introductions, sessions, and player-facing recaps."
  if (key === "rules") return "House rules and table-facing mechanical references."
  if (key === "sessions") return "Session notes and table history."
  return `Public notes in ${relative.split(path.sep).join(" / ")}.`
}

function folderArtwork(relative) {
  return relative.split(path.sep)[0] === "Daggerheart" ? quartzSlugPath("Daggerheart/z_Assets/Umbra.png") : ""
}

function isPublicMarkdown(name) {
  return name.toLowerCase().endsWith(".md") && name.toLowerCase() !== "index.md"
}

function noteTitle(source, fileName) {
  const heading = source.match(/^#\s+(.+)$/m)
  return heading ? heading[1].trim() : fileName.replace(/\.md$/i, "")
}

function noteDescription(source) {
  const description = source.match(/^---[\s\S]*?\ndescription:\s*(.+?)\n[\s\S]*?---/m)
  return description ? stripYamlString(description[1]).slice(0, 120) : "Open note"
}

function noteHref(fromFolderRelative, noteRelative) {
  return contentHref(noteRelative, false)
}

function contentHref(relativePath, isDirectory) {
  const normalized = relativePath.replace(/\\/g, "/")
  const slug = normalized
    .split("/")
    .map((segment) => segment.toLowerCase().endsWith(".md") ? segment.slice(0, -3) : segment)
    .map((segment) => quartzSlugPath(segment))
    .join("/")
  return `/${slug}${isDirectory ? "/" : ""}`
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
    .map((segment) => {
      const normalized = segment
        .trim()
        .toLowerCase()
        .replace(/&/g, "-and-")
        .replace(/\s+/g, "-")
      const hasExtension = /\.[a-z0-9]{2,5}$/i.test(normalized)
      return normalized
        .replace(hasExtension ? /[^a-z0-9._-]+/g : /[^a-z0-9_-]+/g, "-")
        .replace(/-+/g, "-")
        .replace(/^-|-$/g, "")
    })
    .filter(Boolean)
    .join("/")
}

function quartzConfig() {
  return `# yaml-language-server: $schema=./quartz/plugins/quartz-plugins.schema.json
configuration:
  pageTitle: TTRPG Notes
  pageTitleSuffix: ""
  baseUrl: ${siteDomain}
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

function readSiteDomain() {
  const cnamePath = path.join(vaultRoot, "CNAME")
  if (!fsSync.existsSync(cnamePath)) return "notes.savutro.dev"
  return fsSync.readFileSync(cnamePath, "utf8").trim() || "notes.savutro.dev"
}

function escapeYaml(value) {
  return JSON.stringify(String(value))
}

function stripYamlString(value) {
  return String(value).trim().replace(/^["']|["']$/g, "")
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}
