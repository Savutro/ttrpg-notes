export const manifest = {
  name: "ttrpg-renderers",
  displayName: "TTRPG Renderers",
  description: "Renders selected Obsidian TTRPG plugin code blocks for Quartz.",
  version: "0.1.0",
  category: "transformer",
  quartzVersion: ">=5.0.0",
}

export const TtrpgRenderers = () => ({
  name: "TtrpgRenderers",
  htmlPlugins() {
    return [ttrpgRenderersPlugin]
  },
  externalResources() {
    return {
      css: [
        {
          inline: true,
          content: `
.system-picker-intro { color: var(--gray); margin-top: -0.5rem; }
.system-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 18rem), 1fr)); gap: 1rem; margin-top: 1.5rem; }
.system-card { min-height: 17rem; border: 1px solid var(--lightgray); background: #242019; background-size: cover; background-position: center; color: white; display: flex; align-items: flex-end; text-decoration: none; position: relative; overflow: hidden; }
.system-card::before { content: ""; position: absolute; inset: 0; background: linear-gradient(180deg, rgba(0,0,0,0.08), rgba(0,0,0,0.76)); }
.system-card::after { content: ""; position: absolute; inset: 0; opacity: 0.28; background-image: radial-gradient(circle at 20% 20%, rgba(255,255,255,0.16), transparent 16rem), linear-gradient(135deg, transparent 0 48%, rgba(255,255,255,0.12) 49% 51%, transparent 52%); pointer-events: none; }
.system-card span { position: relative; z-index: 1; display: grid; gap: 0.2rem; padding: 1rem; }
.system-card strong { color: white; font-size: 1.6rem; line-height: 1.1; }
.system-card small { color: rgba(255,255,255,0.82); font-family: var(--bodyFont); }
.ttrpg-leaflet { width: 100%; min-height: 24rem; border: 1px solid var(--lightgray); background: #10100f; margin: 1rem 0; overflow: hidden; }
.ttrpg-leaflet-map { width: 100%; height: 100%; min-height: inherit; }
.ttrpg-chronos { margin: 1.25rem 0; border-left: 2px solid var(--secondary); display: grid; gap: 0.85rem; padding-left: 1rem; }
.ttrpg-chronos-event { display: grid; grid-template-columns: minmax(7rem, 11rem) minmax(0, 1fr); gap: 1rem; align-items: start; }
.ttrpg-chronos-date { color: var(--secondary); font-weight: 700; font-family: var(--codeFont); }
.ttrpg-chronos-label { min-width: 0; }
@media (max-width: 640px) {
  .ttrpg-chronos-event { grid-template-columns: 1fr; gap: 0.15rem; }
}
`,
        },
        {
          content: "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css",
        },
      ],
      js: [
        {
          loadTime: "afterDOMReady",
          contentType: "external",
          src: "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js",
          spaPreserve: true,
        },
        {
          loadTime: "afterDOMReady",
          contentType: "inline",
          script: leafletInitScript,
        },
      ],
    }
  },
})

function ttrpgRenderersPlugin() {
  return (tree) => {
    walk(tree, (node, index, parent) => {
      if (!parent || index === undefined) return

      const block = findCodeBlock(node)
      if (!block) return

      const language = codeLanguage(block.pre, block.code)
      const source = codeText(block.code)

      if (language === "leaflet") {
        parent.children[index] = renderLeaflet(source)
      }

      if (language === "chronos") {
        parent.children[index] = renderChronos(source)
      }
    })
  }
}

function renderLeaflet(source) {
  const config = parseConfigBlock(source)
  const image = quartzAssetPath(normalizeWikiTarget(config.image ?? ""))
  const bounds = parseBounds(config.bounds) ?? [[0, 0], [1000, 1000]]
  const height = config.height ?? "640px"
  const width = config.width ?? "100%"
  const center = [
    numberOr(config.lat, (bounds[0][0] + bounds[1][0]) / 2),
    numberOr(config.long, (bounds[0][1] + bounds[1][1]) / 2),
  ]

  return h("div", {
    className: ["ttrpg-leaflet"],
    style: `height:${escapeAttribute(height)};width:${escapeAttribute(width)}`,
    dataMapImage: image,
    dataMapBounds: JSON.stringify(bounds),
    dataMapCenter: JSON.stringify(center),
    dataMapMinZoom: String(numberOr(config.minZoom, -2)),
    dataMapMaxZoom: String(numberOr(config.maxZoom, 4)),
    dataMapDefaultZoom: String(numberOr(config.defaultZoom, "")),
  }, [
    h("div", { className: ["ttrpg-leaflet-map"] }, []),
  ])
}

function renderChronos(source) {
  const events = source
    .split(/\r?\n/)
    .map((line) => line.match(/^\s*[-*]\s+\[([^\]]+)\]\s+(.+?)\s*$/))
    .filter(Boolean)
    .map((match) => {
      const range = match[1].replace("~", " - ")
      return h("div", { className: ["ttrpg-chronos-event"] }, [
        h("div", { className: ["ttrpg-chronos-date"] }, [text(range)]),
        h("div", { className: ["ttrpg-chronos-label"] }, [text(match[2])]),
      ])
    })

  return h("div", { className: ["ttrpg-chronos"] }, events.length ? events : [
    h("div", { className: ["ttrpg-chronos-event"] }, [
      h("div", { className: ["ttrpg-chronos-label"] }, [text(source.trim())]),
    ]),
  ])
}

function parseConfigBlock(source) {
  const config = {}
  for (const rawLine of source.split(/\r?\n/)) {
    const index = rawLine.indexOf(":")
    if (index === -1) continue
    config[rawLine.slice(0, index).trim()] = rawLine.slice(index + 1).trim()
  }
  return config
}

function parseBounds(value) {
  if (!value) return undefined
  try {
    const parsed = JSON.parse(value)
    if (Array.isArray(parsed) && Array.isArray(parsed[0]) && Array.isArray(parsed[1])) {
      return parsed
    }
  } catch {}
  return undefined
}

function normalizeWikiTarget(value) {
  const match = value.match(/^\[\[(.+?)\]\]$/)
  return match ? match[1] : value
}

function quartzAssetPath(value) {
  return value
    .split("/")
    .map((part) => encodeURIComponent(slugSegment(part)))
    .join("/")
}

function slugSegment(value) {
  return value
    .trim()
    .replace(/&/g, "and")
    .replace(/\s+/g, "-")
    .toLowerCase()
}

function numberOr(value, fallback) {
  const number = Number(value)
  return Number.isFinite(number) ? number : fallback
}

function findCodeBlock(node) {
  if (node.type !== "element") return undefined
  if (node.tagName === "pre") {
    const code = node.children?.find((child) => child.type === "element" && child.tagName === "code")
    return code ? { pre: node, code } : undefined
  }
  if (node.tagName === "figure") {
    for (const child of node.children ?? []) {
      const block = findCodeBlock(child)
      if (block) return block
    }
  }
  return undefined
}

function codeLanguage(pre, code) {
  const dataLanguage =
    pre?.properties?.dataLanguage ??
    pre?.properties?.["data-language"] ??
    code?.properties?.dataLanguage ??
    code?.properties?.["data-language"]
  if (dataLanguage) return String(dataLanguage).trim().toLowerCase()

  const classes = code?.properties?.className ?? []
  const languageClass = classes.find((className) => String(className).startsWith("language-"))
  return languageClass ? String(languageClass).replace("language-", "").trim().toLowerCase() : ""
}

function codeText(code) {
  return collectText(code).trim()
}

function collectText(node) {
  if (!node) return ""
  if (node.type === "text") return node.value ?? ""
  return (node.children ?? []).map(collectText).join("")
}

function walk(node, visitor, parent, index) {
  visitor(node, index, parent)
  const children = node.children ?? []
  for (let i = 0; i < children.length; i++) {
    walk(children[i], visitor, node, i)
  }
}

function h(tagName, properties = {}, children = []) {
  return { type: "element", tagName, properties, children }
}

function text(value) {
  return { type: "text", value }
}

function escapeAttribute(value) {
  return String(value).replace(/"/g, "&quot;")
}

const leafletInitScript = `
function resolveTtrpgAsset(rawPath) {
  const normalizedPath = normalizeQuartzImagePath(rawPath)
  if (!normalizedPath) return ""
  if (/^(https?:)?\\/\\//.test(normalizedPath) || normalizedPath.startsWith("/") || normalizedPath.startsWith("#")) return normalizedPath

  const slug = document.body.dataset.slug || "index"
  const rootPrefix = "../".repeat(Math.max(0, slug.split("/").length - 1))
  return rootPrefix + normalizedPath
}

function normalizeQuartzImagePath(rawPath) {
  return String(rawPath || "").replace(/-(png|jpe?g|webp|gif|svg)$/i, ".$1")
}

function initTtrpgSystemCards() {
  document.querySelectorAll(".system-card[data-artwork]:not([data-artwork-ready])").forEach((card) => {
    card.style.backgroundImage = 'url("' + resolveTtrpgAsset(card.dataset.artwork || "") + '")'
    card.dataset.artworkReady = "true"
  })
}

function initTtrpgLeafletMaps() {
  if (!window.L) return
  document.querySelectorAll(".ttrpg-leaflet:not([data-map-ready])").forEach((frame) => {
    const target = frame.querySelector(".ttrpg-leaflet-map")
    const rawImage = frame.dataset.mapImage || ""
    const image = resolveTtrpgAsset(rawImage)
    const bounds = JSON.parse(frame.dataset.mapBounds || "[[0,0],[1000,1000]]")
    const center = JSON.parse(frame.dataset.mapCenter || "null")
    const minZoom = Number(frame.dataset.mapMinZoom || -2)
    const maxZoom = Number(frame.dataset.mapMaxZoom || 4)
    const defaultZoom = Number(frame.dataset.mapDefaultZoom)
    const map = L.map(target, {
      crs: L.CRS.Simple,
      minZoom,
      maxZoom,
      attributionControl: false,
    })

    L.imageOverlay(image, bounds).addTo(map)
    map.fitBounds(bounds)
    if (!Number.isNaN(defaultZoom)) map.setZoom(defaultZoom)
    if (Array.isArray(center)) map.panTo(center)
    frame.dataset.mapReady = "true"
  })
}

function initTtrpgRenderers() {
  initTtrpgSystemCards()
  initTtrpgLeafletMaps()
}

document.addEventListener("nav", initTtrpgRenderers)
document.addEventListener("render", initTtrpgRenderers)
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initTtrpgRenderers)
} else {
  initTtrpgRenderers()
}
`
