import type { ImageSource } from "../types"

export function ImageBlock({ source, role }: { source: ImageSource; role?: string }) {
  const src =
    source.type === "base64" ? `data:${source.media_type};base64,${source.data}` : source.url
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
