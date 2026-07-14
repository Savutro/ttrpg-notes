export const manifest = {
  name: "ttrpg-renderers",
  displayName: "TTRPG Renderers",
  description: "Renders selected Obsidian TTRPG plugin code blocks for Quartz.",
  version: "0.2.0",
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
          content: rendererStyles,
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
          contentType: "external",
          src: "https://unpkg.com/chronos-timeline-md@1.1.0/dist/iife-entry.global.js",
          spaPreserve: true,
        },
        {
          loadTime: "afterDOMReady",
          contentType: "inline",
          script: rendererInitScript,
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
  const images = getAll(config, ["image", "images", "imageLayer", "imageLayers"])
    .flatMap(splitListValue)
    .map((value) => quartzAssetPath(normalizeWikiTarget(value)))
    .filter(Boolean)
  const bounds = parseBounds(firstOf(config, ["bounds", "imageBounds"])) ?? [[0, 0], [1000, 1000]]
  const height = firstOf(config, ["height"], "640px")
  const width = firstOf(config, ["width"], "100%")
  const center = parseCoordinatePair(firstOf(config, ["center"])) ?? [
    numberOr(firstOf(config, ["lat", "latitude"]), (bounds[0][0] + bounds[1][0]) / 2),
    numberOr(firstOf(config, ["long", "lng", "longitude"]), (bounds[0][1] + bounds[1][1]) / 2),
  ]
  const markers = getAll(config, ["marker", "markers"])
    .flatMap(splitMultilineValue)
    .map(parseMarker)
    .filter(Boolean)
  const geojson = getAll(config, ["geojson", "geoJson", "geoJSON"])
    .flatMap(splitListValue)
    .map((value) => quartzAssetPath(normalizeWikiTarget(value)))
    .filter(Boolean)

  return h("div", {
    className: ["ttrpg-leaflet", parseBoolean(firstOf(config, ["darkMode"])) ? "is-dark" : ""].filter(Boolean),
    style: `height:${escapeAttribute(height)};width:${escapeAttribute(width)}`,
    dataMapImages: JSON.stringify(images),
    dataMapBounds: JSON.stringify(bounds),
    dataMapCenter: JSON.stringify(center),
    dataMapMinZoom: String(numberOr(firstOf(config, ["minZoom"]), images.length ? -2 : 1)),
    dataMapMaxZoom: String(numberOr(firstOf(config, ["maxZoom"]), images.length ? 4 : 18)),
    dataMapDefaultZoom: String(numberOr(firstOf(config, ["defaultZoom", "zoom"]), images.length ? 0 : 10)),
    dataMapTileServer: firstOf(config, ["tileServer", "tileLayer", "urlTemplate", "tiles"], ""),
    dataMapAttribution: firstOf(config, ["attribution"], ""),
    dataMapMarkers: JSON.stringify(markers),
    dataMapGeojson: JSON.stringify(geojson),
    dataMapNoUi: String(parseBoolean(firstOf(config, ["noUI", "noUi", "hideControls"]))),
    dataMapLock: String(parseBoolean(firstOf(config, ["lock", "locked"]))),
    dataMapNoScrollZoom: String(parseBoolean(firstOf(config, ["noScrollZoom", "disableScrollZoom"]))),
  }, [
    h("div", { className: ["ttrpg-leaflet-map"] }, []),
  ])
}

function renderChronos(source) {
  return h("div", { className: ["ttrpg-chronos-shell"] }, [
    h("div", { className: ["ttrpg-chronos-native"] }, [
      h("div", { className: ["ttrpg-chronos-canvas"] }, []),
      h("script", { type: "application/json", className: ["ttrpg-chronos-source"] }, [
        text(JSON.stringify(source).replace(/<\/script/gi, "<\\/script")),
      ]),
    ]),
    renderChronosFallback(source),
  ])
}

function renderChronosFallback(source) {
  const events = parseChronosEvents(source)
  if (events.length === 0) {
    return h("div", { className: ["ttrpg-chronos-fallback", "ttrpg-chronos"] }, [
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

  for (let year = axisMin; year <= axisMax; year += 10) ticks.push(year)

  return h("div", { className: ["ttrpg-chronos-fallback", "ttrpg-chronos-scroll"] }, [
    h("div", { className: ["ttrpg-chronos"], style: `--chronos-height:${height}px` }, [
      ...ticks.map((year) =>
        h("div", {
          className: ["ttrpg-chronos-gridline"],
          style: `left:${chronosPercent(year, axisMin, span)}%`,
        }),
      ),
      ...events.map((event) => {
        const left = chronosPercent(event.start, axisMin, span)
        const width = event.isInstant ? 0.8 : Math.max(0.8, chronosPercent(event.end, axisMin, span) - left)
        const top = 8 + event.lane * 46
        return h("div", {
          className: ["ttrpg-chronos-event", event.kind ? `is-${event.kind}` : "", event.isInstant ? "is-instant" : ""],
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
    .map((line) => line.match(/^\s*([-@*=])\s+\[([^\]]+)\]\s+(.+?)\s*$/))
    .filter(Boolean)
    .map((match) => {
      const range = parseChronosRange(match[2])
      if (!range) return undefined
      const kind = match[1] === "@" ? "period" : match[1] === "*" ? "point" : match[1] === "=" ? "marker" : "event"
      return {
        rawRange: match[2].replace("~", " - "),
        start: range.start,
        end: range.end,
        isInstant: range.isInstant || kind === "point" || kind === "marker",
        label: cleanChronosLabel(match[3]),
        kind,
        lane: 0,
      }
    })
    .filter(Boolean)
}

function cleanChronosLabel(value) {
  return value
    .replace(/^#[a-zA-Z0-9_-]+\s+/, "")
    .replace(/^\{[^}]+\}\s+/, "")
    .split("|")[0]
    .trim()
}

function parseChronosRange(value) {
  const years = String(value).match(/-?\d{1,6}/g)?.map(Number) ?? []
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
    const line = rawLine.trim()
    if (!line || line.startsWith("#")) continue
    const match = line.match(/^([A-Za-z][\w-]*)\s*:\s*(.*)$/)
    if (!match) continue
    const key = match[1]
    const value = stripQuotes(match[2].trim())
    if (config[key] === undefined) {
      config[key] = value
    } else if (Array.isArray(config[key])) {
      config[key].push(value)
    } else {
      config[key] = [config[key], value]
    }
  }
  return config
}

function firstOf(config, keys, fallback = undefined) {
  for (const key of keys) {
    if (config[key] === undefined) continue
    return Array.isArray(config[key]) ? config[key][0] : config[key]
  }
  return fallback
}

function getAll(config, keys) {
  const values = []
  for (const key of keys) {
    const value = config[key]
    if (Array.isArray(value)) values.push(...value)
    else if (value !== undefined && value !== "") values.push(value)
  }
  return values
}

function splitListValue(value) {
  const trimmed = String(value ?? "").trim()
  if (!trimmed) return []
  if (trimmed.startsWith("[[") && trimmed.endsWith("]]")) return [trimmed]
  if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
    try {
      const parsed = JSON.parse(trimmed)
      if (Array.isArray(parsed)) return parsed.map(String)
    } catch {}
  }
  return trimmed.split(/\s*,\s*/).filter(Boolean)
}

function splitMultilineValue(value) {
  return String(value ?? "")
    .split(/\s*;\s*/)
    .map((part) => part.trim())
    .filter(Boolean)
}

function parseBounds(value) {
  if (!value) return undefined
  try {
    const parsed = JSON.parse(value)
    if (Array.isArray(parsed) && Array.isArray(parsed[0]) && Array.isArray(parsed[1])) return parsed
  } catch {}

  const numbers = String(value).match(/-?\d+(?:\.\d+)?/g)?.map(Number) ?? []
  if (numbers.length >= 4) return [[numbers[0], numbers[1]], [numbers[2], numbers[3]]]
  return undefined
}

function parseCoordinatePair(value) {
  if (!value) return undefined
  try {
    const parsed = JSON.parse(value)
    if (Array.isArray(parsed) && Number.isFinite(Number(parsed[0])) && Number.isFinite(Number(parsed[1]))) {
      return [Number(parsed[0]), Number(parsed[1])]
    }
  } catch {}
  const numbers = String(value).match(/-?\d+(?:\.\d+)?/g)?.map(Number) ?? []
  return numbers.length >= 2 ? [numbers[0], numbers[1]] : undefined
}

function parseMarker(value) {
  const numbers = String(value).match(/-?\d+(?:\.\d+)?/g)?.map(Number) ?? []
  if (numbers.length < 2) return undefined
  const label = String(value)
    .replace(/-?\d+(?:\.\d+)?/g, "")
    .replace(/^[,\s-]+|[,\s-]+$/g, "")
    .trim()
  return {
    lat: numbers[0],
    lng: numbers[1],
    label: normalizeWikiLabel(label) || "Marker",
  }
}

function normalizeWikiTarget(value) {
  const match = String(value).trim().match(/^\[\[(.+?)\]\]$/)
  const target = match ? match[1] : value
  return String(target).split("|")[0].trim()
}

function normalizeWikiLabel(value) {
  const match = String(value).trim().match(/^\[\[(.+?)(?:\|(.+?))?\]\]$/)
  if (!match) return String(value).trim()
  return (match[2] || match[1].split("/").pop() || "").replace(/\.md$/i, "").trim()
}

function quartzAssetPath(value) {
  const raw = String(value ?? "").trim()
  if (!raw || /^(https?:)?\/\//.test(raw) || raw.startsWith("/") || raw.startsWith("#")) return raw
  return raw
    .split("/")
    .map((part) => encodeURIComponent(slugSegment(part)))
    .join("/")
}

function slugSegment(value) {
  const raw = String(value).trim().replace(/&/g, "and").replace(/\s+/g, "-").toLowerCase()
  const hasExtension = /\.[a-z0-9]{2,5}$/i.test(raw)
  return raw
    .replace(hasExtension ? /[^a-z0-9._-]+/g : /[^a-z0-9_-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
}

function numberOr(value, fallback) {
  const number = Number(value)
  return Number.isFinite(number) ? number : fallback
}

function parseBoolean(value) {
  return ["true", "yes", "1", "on"].includes(String(value ?? "").trim().toLowerCase())
}

function stripQuotes(value) {
  return value.replace(/^["']|["']$/g, "")
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
  for (let i = 0; i < children.length; i++) walk(children[i], visitor, node, i)
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

const rendererStyles = `
.system-picker-intro { color: var(--gray); margin-top: -0.5rem; }
.system-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 18rem), 1fr)); gap: 1rem; margin-top: 1.5rem; }
.system-card { min-height: 17rem; border: 1px solid color-mix(in srgb, var(--lightgray) 78%, white 22%); background: #242019; background-size: cover; background-position: center; color: white; display: flex; align-items: flex-end; text-decoration: none; position: relative; overflow: hidden; box-shadow: inset 0 0 0 1px rgba(255,255,255,0.08); }
.system-card::before { content: ""; position: absolute; inset: 0; background: linear-gradient(180deg, rgba(0,0,0,0.08), rgba(0,0,0,0.76)); }
.system-card::after { content: ""; position: absolute; inset: 0; opacity: 0.24; background-image: linear-gradient(135deg, transparent 0 48%, rgba(255,255,255,0.12) 49% 51%, transparent 52%); pointer-events: none; }
.system-card.is-empty { background: linear-gradient(135deg, color-mix(in srgb, var(--light) 78%, var(--secondary) 22%), color-mix(in srgb, var(--light) 92%, var(--dark) 8%)); border-color: color-mix(in srgb, var(--secondary) 36%, var(--lightgray) 64%); }
.system-card.is-empty::before { background: linear-gradient(180deg, rgba(0,0,0,0), rgba(0,0,0,0.34)); }
.system-card span { position: relative; z-index: 1; display: grid; gap: 0.2rem; padding: 1rem; }
.system-card strong { color: white; font-size: 1.6rem; line-height: 1.1; }
.system-card small { color: rgba(255,255,255,0.82); font-family: var(--bodyFont); }
.portal-hero { border: 1px solid var(--lightgray); min-height: 12rem; padding: 1.25rem; margin: 0 0 1.25rem; display: flex; flex-direction: column; justify-content: flex-end; gap: 0.75rem; background: color-mix(in srgb, var(--light) 82%, var(--secondary) 18%); background-size: cover; background-position: center; position: relative; overflow: hidden; }
.portal-hero[data-artwork] { color: white; }
.portal-hero[data-artwork]::before { content: ""; position: absolute; inset: 0; background: linear-gradient(90deg, rgba(0,0,0,0.78), rgba(0,0,0,0.2)); }
.portal-hero > * { position: relative; z-index: 1; }
.portal-kicker { margin: 0; color: inherit; opacity: 0.82; text-transform: uppercase; letter-spacing: 0.08em; font-size: 0.78rem; font-weight: 700; }
.portal-summary { max-width: 44rem; margin: 0; font-size: 1.05rem; color: inherit; }
.portal-metrics { display: flex; flex-wrap: wrap; gap: 0.45rem; }
.portal-metrics span, .portal-card em span { border: 1px solid currentColor; color: inherit; opacity: 0.8; padding: 0.1rem 0.4rem; font-size: 0.78rem; font-style: normal; }
.portal-section { margin: 1.4rem 0; }
.popover-hint:has(.portal-hero) .page-listing { display: none; }
.portal-section h2 { margin-bottom: 0.65rem; font-size: 1.05rem; }
.portal-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 14rem), 1fr)); gap: 0.75rem; }
.portal-list { display: grid; gap: 0.55rem; }
.portal-card { min-height: 5rem; border: 1px solid var(--lightgray); padding: 0.85rem; display: grid; gap: 0.28rem; text-decoration: none; color: var(--dark); background: color-mix(in srgb, var(--light) 92%, var(--lightgray) 8%); }
.portal-card:hover { border-color: var(--secondary); color: var(--dark); }
.portal-card strong { color: var(--dark); line-height: 1.2; }
.portal-card small { color: var(--gray); }
.portal-card span { color: var(--secondary); font-size: 0.82rem; }
.portal-card em { display: flex; gap: 0.35rem; flex-wrap: wrap; font-style: normal; color: var(--secondary); }
.ttrpg-leaflet { width: 100%; min-height: 24rem; border: 1px solid var(--lightgray); background: #10100f; margin: 1rem 0; overflow: hidden; }
.ttrpg-leaflet-map { width: 100%; height: 100%; min-height: inherit; }
.ttrpg-leaflet.is-dark .leaflet-image-layer { filter: invert(1) hue-rotate(180deg) brightness(0.86); }
.ttrpg-chronos-shell { margin: 1.25rem 0; }
.ttrpg-chronos-native { border: 1px solid var(--lightgray); background: var(--light); color: var(--dark); overflow: hidden; --chronos-bg-primary: var(--light); --chronos-bg-secondary: color-mix(in srgb, var(--light) 88%, var(--lightgray) 12%); --chronos-text-normal: var(--dark); --chronos-text-muted: var(--gray); --chronos-accent: var(--secondary); --chronos-interactive: var(--secondary); --chronos-interactive-hover: var(--tertiary); --chronos-border: var(--lightgray); --chronos-text-on-accent: white; }
.ttrpg-chronos-canvas { min-height: 14rem; }
.ttrpg-chronos-shell[data-chronos-error] .ttrpg-chronos-native { display: none; }
.ttrpg-chronos-shell[data-chronos-ready] .ttrpg-chronos-fallback { display: none; }
.ttrpg-chronos-scroll { overflow-x: auto; }
.ttrpg-chronos { position: relative; min-width: 34rem; height: var(--chronos-height, 14rem); border: 1px solid #66717a; background: #f7ecd8; color: #596874; overflow: hidden; }
.ttrpg-chronos-gridline { position: absolute; top: 0; bottom: 1.75rem; border-left: 1px solid rgba(84, 92, 98, 0.22); }
.ttrpg-chronos-axis { position: absolute; left: 0; right: 0; bottom: 1.75rem; border-top: 1px solid #66717a; }
.ttrpg-chronos-tick { position: absolute; top: 0; height: 1.9rem; border-left: 1px solid rgba(84, 92, 98, 0.24); }
.ttrpg-chronos-tick span { position: absolute; top: 0.35rem; left: 0.28rem; white-space: nowrap; color: #687884; font-size: 1rem; line-height: 1; }
.ttrpg-chronos-event { position: absolute; height: 2.35rem; min-width: 5rem; background: #cf5d5c; color: white; display: flex; align-items: center; padding: 0 0.45rem; box-sizing: border-box; font-weight: 700; line-height: 1.1; overflow: hidden; white-space: nowrap; }
.ttrpg-chronos-event.is-period { background: rgba(207, 93, 92, 0.24); color: #8d3332; border: 1px solid rgba(207, 93, 92, 0.5); }
.ttrpg-chronos-event.is-point, .ttrpg-chronos-event.is-marker { background: #8f3029; }
.ttrpg-chronos-event.is-instant { width: auto !important; min-width: min(19rem, calc(100% - var(--chronos-left, 0%))); }
.ttrpg-chronos-event.is-instant::before { content: ""; position: absolute; left: 0; top: 100%; height: 4.6rem; border-left: 1px solid currentColor; }
.ttrpg-chronos-label { overflow: hidden; text-overflow: clip; }
.ttrpg-chronos-empty { padding: 1rem; }
@media (max-width: 700px) {
  .system-grid { gap: 0.75rem; margin-top: 1rem; }
  .system-card { min-height: 10rem; border-color: color-mix(in srgb, var(--secondary) 42%, var(--lightgray) 58%); box-shadow: inset 0 0 0 1px rgba(255,255,255,0.16); }
  .system-card span { padding: 0.9rem; }
  .system-card strong { font-size: 1.35rem; }
  .portal-hero { min-height: 10rem; padding: 1rem; }
  .portal-grid { grid-template-columns: 1fr; }
  .ttrpg-chronos { min-width: 38rem; }
}
`

const rendererInitScript = `
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

function initTtrpgArtwork() {
  document.querySelectorAll("[data-artwork]:not([data-artwork-ready])").forEach((element) => {
    element.style.backgroundImage = 'url("' + resolveTtrpgAsset(element.dataset.artwork || "") + '")'
    element.dataset.artworkReady = "true"
  })
}

function initTtrpgLeafletMaps() {
  if (!window.L) return
  document.querySelectorAll(".ttrpg-leaflet:not([data-map-ready])").forEach((frame) => {
    const target = frame.querySelector(".ttrpg-leaflet-map")
    const images = JSON.parse(frame.dataset.mapImages || "[]").map(resolveTtrpgAsset)
    const bounds = JSON.parse(frame.dataset.mapBounds || "[[0,0],[1000,1000]]")
    const center = JSON.parse(frame.dataset.mapCenter || "null")
    const markers = JSON.parse(frame.dataset.mapMarkers || "[]")
    const geojson = JSON.parse(frame.dataset.mapGeojson || "[]").map(resolveTtrpgAsset)
    const minZoom = Number(frame.dataset.mapMinZoom || -2)
    const maxZoom = Number(frame.dataset.mapMaxZoom || 18)
    const defaultZoom = Number(frame.dataset.mapDefaultZoom)
    const locked = frame.dataset.mapLock === "true"
    const noUi = frame.dataset.mapNoUi === "true"
    const noScrollZoom = frame.dataset.mapNoScrollZoom === "true"
    const isImageMap = images.length > 0
    const map = L.map(target, {
      crs: isImageMap ? L.CRS.Simple : undefined,
      minZoom,
      maxZoom,
      zoomControl: !noUi,
      attributionControl: !noUi,
      dragging: !locked,
      touchZoom: !locked,
      doubleClickZoom: !locked,
      boxZoom: !locked,
      keyboard: !locked,
      scrollWheelZoom: !locked && !noScrollZoom,
    })

    if (isImageMap) {
      images.forEach((image) => L.imageOverlay(image, bounds).addTo(map))
      map.fitBounds(bounds)
      if (!Number.isNaN(defaultZoom)) map.setZoom(defaultZoom)
      if (Array.isArray(center)) map.panTo(center)
      if (locked) map.setMaxBounds(bounds)
    } else {
      const tileServer = frame.dataset.mapTileServer || "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      const attribution = frame.dataset.mapAttribution || "&copy; OpenStreetMap contributors"
      L.tileLayer(tileServer, { attribution }).addTo(map)
      map.setView(Array.isArray(center) ? center : [0, 0], Number.isNaN(defaultZoom) ? 2 : defaultZoom)
    }

    markers.forEach((marker) => {
      if (!Number.isFinite(marker.lat) || !Number.isFinite(marker.lng)) return
      const leafletMarker = L.marker([marker.lat, marker.lng]).addTo(map)
      if (marker.label) leafletMarker.bindPopup(marker.label)
    })

    geojson.forEach((url) => {
      fetch(url)
        .then((response) => response.json())
        .then((data) => L.geoJSON(data).addTo(map))
        .catch(() => {})
    })

    setTimeout(() => map.invalidateSize(), 50)
    frame._leafletMap = map
    frame.dataset.mapReady = "true"
  })
}

function initTtrpgChronos() {
  const ChronosTimeline = window.ChronosTimeline && (window.ChronosTimeline.ChronosTimeline || window.ChronosTimeline)
  if (!ChronosTimeline || typeof ChronosTimeline.render !== "function") return
  document.querySelectorAll(".ttrpg-chronos-shell:not([data-chronos-ready])").forEach((shell) => {
    const canvas = shell.querySelector(".ttrpg-chronos-canvas")
    const sourceElement = shell.querySelector(".ttrpg-chronos-source")
    if (!canvas || !sourceElement) return

    let source = ""
    try {
      source = JSON.parse(sourceElement.textContent || '""')
    } catch {
      source = sourceElement.textContent || ""
    }

    try {
      const timeline = ChronosTimeline.render(canvas, withChronosDefaults(source), {
        selectedLocale: "en",
        align: "center",
        clickToUse: false,
        roundRanges: true,
        useUtc: false,
        useAI: false,
        theme: {
          cssVariables: {
            "chronos-bg-primary": "var(--light)",
            "chronos-bg-secondary": "color-mix(in srgb, var(--light) 88%, var(--lightgray) 12%)",
            "chronos-text-normal": "var(--dark)",
            "chronos-text-muted": "var(--gray)",
            "chronos-accent": "var(--secondary)",
            "chronos-interactive": "var(--secondary)",
            "chronos-interactive-hover": "var(--tertiary)",
            "chronos-border": "var(--lightgray)",
            "chronos-text-on-accent": "#ffffff",
          },
        },
      })
      shell._chronosTimeline = timeline
      shell.dataset.chronosReady = "true"
    } catch (error) {
      shell.dataset.chronosError = error && error.message ? error.message : String(error)
      console.warn("Chronos render failed", error)
    }
  })
}

function withChronosDefaults(source) {
  if (/^\\s*>\\s*HEIGHT\\b/im.test(source)) return source
  return "> HEIGHT 244\\n" + source
}

function initTtrpgRenderers() {
  initTtrpgArtwork()
  initTtrpgLeafletMaps()
  initTtrpgChronos()
}

document.addEventListener("nav", initTtrpgRenderers)
document.addEventListener("render", initTtrpgRenderers)
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initTtrpgRenderers)
} else {
  initTtrpgRenderers()
}
`
