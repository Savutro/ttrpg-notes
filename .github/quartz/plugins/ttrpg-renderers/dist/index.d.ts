export declare const manifest: {
  name: string
  displayName: string
  description: string
  version: string
  category: "transformer"
  quartzVersion: string
}
export declare const TtrpgRenderers: () => {
  name: string
  htmlPlugins: () => unknown[]
  externalResources: () => {
    css: { content: string; inline: boolean }[]
    js: { loadTime: "afterDOMReady"; contentType: "external"; src: string; spaPreserve: boolean }[] | { loadTime: "afterDOMReady"; contentType: "inline"; script: string }[]
  }
}
