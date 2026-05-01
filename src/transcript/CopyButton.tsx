import { useCallback, useEffect, useRef, useState, type MouseEvent } from "react"

type Props = {
  /** Text to copy. May be a thunk so callers can avoid building large strings until click. */
  text: string | (() => string)
  className?: string
  /** Defaults to "Copy". */
  ariaLabel?: string
}

async function writeToClipboard(value: string): Promise<boolean> {
  // Modern path: navigator.clipboard.writeText
  try {
    if (
      typeof navigator !== "undefined" &&
      navigator.clipboard &&
      typeof navigator.clipboard.writeText === "function"
    ) {
      await navigator.clipboard.writeText(value)
      return true
    }
  } catch {
    // fall through to execCommand fallback
  }

  // Fallback: offscreen <textarea> + document.execCommand("copy")
  try {
    if (typeof document === "undefined") return false
    const textarea = document.createElement("textarea")
    textarea.value = value
    // Position offscreen so it doesn't flash visually or scroll the page.
    textarea.setAttribute("readonly", "")
    textarea.style.position = "fixed"
    textarea.style.top = "0"
    textarea.style.left = "0"
    textarea.style.width = "1px"
    textarea.style.height = "1px"
    textarea.style.padding = "0"
    textarea.style.border = "none"
    textarea.style.outline = "none"
    textarea.style.boxShadow = "none"
    textarea.style.background = "transparent"
    textarea.style.opacity = "0"
    document.body.appendChild(textarea)
    textarea.focus()
    textarea.select()
    let ok = false
    try {
      ok = document.execCommand("copy")
    } finally {
      textarea.remove()
    }
    return ok
  } catch {
    return false
  }
}

export function CopyButton({ text, className, ariaLabel = "Copy" }: Props) {
  const [copied, setCopied] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const mountedRef = useRef(true)

  useEffect(() => {
    return () => {
      mountedRef.current = false
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current)
        timerRef.current = null
      }
    }
  }, [])

  const onClick = useCallback(
    async (e: MouseEvent<HTMLButtonElement>) => {
      // The button is often inside a clickable card; don't toggle the parent.
      e.stopPropagation()
      e.preventDefault()
      const value = typeof text === "function" ? text() : text
      const ok = await writeToClipboard(value)
      if (!ok) {
        console.warn("CopyButton: failed to copy")
        return
      }
      if (!mountedRef.current) return
      setCopied(true)
      if (timerRef.current !== null) clearTimeout(timerRef.current)
      timerRef.current = setTimeout(() => {
        timerRef.current = null
        if (mountedRef.current) setCopied(false)
      }, 1500)
    },
    [text],
  )

  const classes = ["copy-button"]
  if (copied) classes.push("copy-button--copied")
  if (className) classes.push(className)

  return (
    <button
      type="button"
      className={classes.join(" ")}
      aria-label={ariaLabel}
      data-copied={copied || undefined}
      onClick={onClick}
    >
      {/* Both icons render always; CSS cross-fades based on [data-copied]. */}
      <span
        className="copy-button-icon copy-button-icon-copy"
        aria-hidden="true"
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <rect x="9" y="9" width="13" height="13" rx="2" />
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
        </svg>
      </span>
      <span
        className="copy-button-icon copy-button-icon-check"
        aria-hidden="true"
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <polyline points="20 6 9 17 4 12" />
        </svg>
      </span>
    </button>
  )
}
