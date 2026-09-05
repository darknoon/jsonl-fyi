import { useEffect, useState } from "react"
import type { ImageSource } from "../types"

function dataUrl(source: ImageSource): string {
  return source.type === "base64" ? `data:${source.media_type};base64,${source.data}` : source.url
}

/** Decode a base64 payload into a Blob; returns null if the payload is malformed. */
export function base64ToBlob(data: string, mediaType: string): Blob | null {
  try {
    const bin = atob(data)
    const bytes = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
    return new Blob([bytes], { type: mediaType })
  } catch {
    return null
  }
}

/**
 * Resolve an image source to a URL usable as both an <img src> and a link
 * target. Base64 images start as a data: URL (works for SSR and first paint),
 * then swap to a blob: URL once mounted. Browsers block top-level navigation
 * to data: URLs, so a plain data: href opens a blank tab; blob: URLs open fine.
 */
export function useImageUrl(source: ImageSource): string {
  const [url, setUrl] = useState(() => dataUrl(source))
  useEffect(() => {
    if (source.type !== "base64" || typeof URL.createObjectURL !== "function") return
    const blob = base64ToBlob(source.data, source.media_type)
    if (!blob) return
    const blobUrl = URL.createObjectURL(blob)
    setUrl(blobUrl)
    return () => {
      URL.revokeObjectURL(blobUrl)
      setUrl(dataUrl(source))
    }
  }, [source])
  return url
}

export function ImageBlock({ source, role }: { source: ImageSource; role?: string }) {
  const src = useImageUrl(source)
  return (
    <a
      href={src}
      target="_blank"
      rel="noreferrer"
      className={`image-block ${role === "user" ? "image-block-user" : ""}`}
    >
      <img src={src} alt="" />
    </a>
  )
}
