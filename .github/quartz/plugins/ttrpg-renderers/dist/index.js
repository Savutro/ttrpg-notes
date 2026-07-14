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
.ttrpg-chronos-scroll { overflow-x: auto; margin: 1.25rem 0; }
.ttrpg-chronos { position: relative; min-width: 34rem; height: var(--chronos-height, 14rem); border: 1px solid #66717a; background: #f7ecd8; color: #596874; overflow: hidden; }
.ttrpg-chronos-gridline { position: absolute; top: 0; bottom: 1.75rem; border-left: 1px solid rgba(84, 92, 98, 0.22); }
.ttrpg-chronos-axis { position: absolute; left: 0; right: 0; bottom: 1.75rem; border-top: 1px solid #66717a; }
.ttrpg-chronos-tick { position: absolute; top: 0; height: 1.9rem; border-left: 1px solid rgba(84, 92, 98, 0.24); }
.ttrpg-chronos-tick span { position: absolute; top: 0.35rem; left: 0.28rem; white-space: nowrap; color: #687884; font-size: 1rem; line-height: 1; }
.ttrpg-chronos-event { position: absolute; height: 2.35rem; min-width: 5rem; background: #cf5d5c; color: white; display: flex; align-items: center; padding: 0 0.45rem; box-sizing: border-box; font-weight: 700; line-height: 1.1; overflow: hidden; white-space: nowrap; }
.ttrpg-chronos-event.is-instant { width: auto !important; min-width: min(19rem, calc(100% - var(--chronos-left, 0%))); }
.ttrpg-chronos-event.is-instant::before { content: ""; position: absolute; left: 0; top: 100%; height: 4.6rem; border-left: 1px solid #cf5d5c; }
.ttrpg-chronos-label { overflow: hidden; text-overflow: clip; }
.ttrpg-chronos-empty { padding: 1rem; }
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
  const events = parseChronosEvents(source)
  if (events.length === 0) {
    return h("div", { className: ["ttrpg-chronos"] }, [
      h("div", { className: ["ttrpg-chronos-empty"] }, [text(source.trim())]),
    ])
  }

  const minEventYear = Math.min(...events.map((event) => event.start))
  const maxEventYear = Math.max(...events.map((event) => event.end))
  const axisMin = Math.floor((minEventYear - 20) / 10) * 10
  const axisMax = Math.ceil((maxEventYear + 5) / 10) * 10
  const span = Math.max(1, axisMax - axisMin)
  const lanes = assignChronosLanes(events)
  const height = Math.max(180, lanes * 46 + 86)
  const ticks = []

  for (let year = axisMin; year <= axisMax; year += 10) {
    ticks.push(year)
  }

  return h("div", { className: ["ttrpg-chronos-scroll"] }, [
    h("div", { className: ["ttrpg-chronos"], style: `--chronos-height:${height}px` }, [
      ...ticks.map((year) =>
        h("div", {
          className: ["ttrpg-chronos-gridline"],
          style: `left:${chronosPercent(year, axisMin, span)}%`,
        }),
      ),
      ...events.map((event) => {
        const left = chronosPercent(event.start, axisMin, span)
        const width = Math.max(0.8, chronosPercent(event.end, axisMin, span) - left)
        const top = 8 + event.lane * 46
        return h("div", {
          className: ["ttrpg-chronos-event", event.isInstant ? "is-instant" : ""],
          style: `--chronos-left:${left}%;left:${left}%;top:${top}px;width:${width}%`,
          title: `${event.label} (${event.rawRange})`,
        }, [
          h("span", { className: ["ttrpg-chronos-label"] }, [text(event.label)]),
        ])
      }),
      h("div", { className: ["ttrpg-chronos-axis"] }, ticks.map((year) =>
        h("div", {
          className: ["ttrpg-chronos-tick"],
          style: `left:${chronosPercent(year, axisMin, span)}%`,
        }, [
          h("span", {}, [text(String(year))]),
        ]),
      )),
    ]),
  ])
}

function parseChronosEvents(source) {
  return source
    .split(/\r?\n/)
    .map((line) => line.match(/^\s*[-*]\s+\[([^\]]+)\]\s+(.+?)\s*$/))
    .filter(Boolean)
    .map((match) => {
      const range = parseChronosRange(match[1])
      if (!range) return undefined
      return {
        rawRange: match[1].replace("~", " - "),
        start: range.start,
        end: range.end,
        isInstant: range.isInstant,
        label: match[2],
        lane: 0,
      }
    })
    .filter(Boolean)
}

function parseChronosRange(value) {
  const years = String(value).match(/-?\d+/g)?.map(Number) ?? []
  if (years.length === 0 || !Number.isFinite(years[0])) return undefined
  const start = years[0]
  const end = Number.isFinite(years[1]) ? years[1] : start
  return {
    start: Math.min(start, end),
    end: Math.max(start, end),
    isInstant: years.length === 1,
  }
}

function assignChronosLanes(events) {
  const lanes = []
  const ordered = [...events].sort((a, b) => a.start - b.start || a.end - b.end)

  for (const event of ordered) {
    const visualEnd = event.isInstant ? event.start + Math.max(16, event.label.length * 0.72) : event.end
    let lane = lanes.findIndex((end) => event.start >= end + 1)
    if (lane === -1) {
      lane = lanes.length
      lanes.push(visualEnd)
    } else {
      lanes[lane] = visualEnd
    }
    event.lane = lane
  }

  return Math.max(1, lanes.length)
}

function chronosPercent(year, axisMin, span) {
  return ((year - axisMin) / span) * 100
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

  const basePath = window.location.protocol === "file:" ? "" : (document.body.dataset.basepath || "").replace(/\\/$/, "")
  if (basePath) return basePath + "/" + normalizedPath.replace(/^\\/+/, "")

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
