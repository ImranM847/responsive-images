import cache from './response-cache'

export function processImages(fetch) {
  return async function processImages(req, opts) {
    const url = new URL(req.url)
    const accept = req.headers.get("accept") || ""
    let webp = false

    let vary = []
    if (accept.includes("image/webp")) {
      console.log("making it webp")
      vary.push("webp")
      webp = true
    }
    vary = vary.sort()

    // generate a cache key with filename + variants
    const key = ["image", url.pathname].concat(vary).join(':')

    let resp = await cache.get(key)
    if (resp) {
      resp.headers.set("Fly-Cache", "HIT")
      return resp
    }

    // cache miss, do the rest
    req.headers.delete("accept-encoding") // simplify by not having to inflate
    resp = await fetch(req, opts)

    const contentType = resp.headers.get("content-type")

    // skip a bunch of request/response types
    if (
      resp.status != 200 || // skip non 200 status codes
      req.method != "GET" || // skip post/head/etc
      (!contentType.includes("image/"))
    ) {
      return resp // don't do anything for most requests
    }

    // if we got here, it's an image

    let data = await resp.arrayBuffer()
    if (webp) {
      const image = new fly.Image(data)
      const result = await image.webp().toBuffer()
      data = result.data
    }

    resp = new Response(data, resp)
    if (webp) resp.headers.set("content-type", "image/webp")
    resp.headers.set("content-length", data.byteLength)
    await cache.set(key, resp, 3600) // cache for 3600s

    resp.headers.set("Fly-Cache", "MISS")

    return new Response(data, resp)
  }
}