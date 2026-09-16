import { XIcon } from "@phosphor-icons/react"
import { useEffect, useRef, useState } from "react"
import type { ImageSource } from "../types"

function imageUrl(source: ImageSource): string {
  return source.type === "base64" ? `data:${source.media_type};base64,${source.data}` : source.url
}

export function ImageBlock({ source, role }: { source: ImageSource; role?: string }) {
  const src = imageUrl(source)
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        type="button"
        aria-label="View image"
        className={`image-block ${role === "user" ? "image-block-user" : ""}`}
        onClick={() => setOpen(true)}
      >
        <img src={src} alt="" />
      </button>
      {open && <Lightbox src={src} onClose={() => setOpen(false)} />}
    </>
  )
}

/**
 * The image as large as the viewport allows, then at its own pixels.
 *
 * Two states rather than a zoom control: fit shows the whole image, actual is
 * one image pixel per screen pixel with the stage's own scrollbars doing the
 * panning. A real <dialog> opened with showModal gives us the focus trap,
 * Escape, inertness of the page behind, and the top layer for free.
 */
function Lightbox({ src, onClose }: { src: string; onClose: () => void }) {
  const [actual, setActual] = useState(false)
  const dialog = useRef<HTMLDialogElement>(null)
  const close = useRef(onClose)
  close.current = onClose

  useEffect(() => {
    const el = dialog.current
    if (!el) return
    el.showModal()
    // showModal makes the page inert but not unscrollable.
    document.documentElement.dataset["lightboxOpen"] = ""
    // The backdrop reports the dialog as the click target; the empty room
    // around a small image reports the stage. Both are ways out.
    const onClick = (e: MouseEvent) => {
      const t = e.target
      if (t === el || (t instanceof HTMLElement && t.dataset["slot"] === "lightbox-stage")) {
        close.current()
      }
    }
    const onDialogClose = () => close.current()
    el.addEventListener("click", onClick)
    el.addEventListener("close", onDialogClose)
    return () => {
      el.removeEventListener("click", onClick)
      el.removeEventListener("close", onDialogClose)
      delete document.documentElement.dataset["lightboxOpen"]
    }
  }, [])

  return (
    <dialog ref={dialog} className="lightbox" aria-label="Image">
      <div className="lightbox-stage" data-slot="lightbox-stage" data-actual={actual || undefined}>
        <button
          type="button"
          className="lightbox-image"
          aria-label={actual ? "Fit to screen" : "View at actual size"}
          onClick={() => setActual((a) => !a)}
        >
          <img src={src} alt="" />
        </button>
      </div>
      <button type="button" className="lightbox-close" aria-label="Close" onClick={onClose}>
        <XIcon size={20} weight="bold" aria-hidden="true" />
      </button>
    </dialog>
  )
}
