import { useSettings, type ViewMode } from "./settings"

export const SETTINGS_POPOVER_ID = "settings-popover"

const VIEW_MODE_LABEL: Record<ViewMode, string> = {
  normal: "Default",
  compact: "Compact",
  chat: "Chat",
}

export function SettingsButton() {
  const { viewMode } = useSettings()
  return (
    <button
      className="settings-btn"
      aria-label="Settings"
      title="Settings"
      popoverTarget={SETTINGS_POPOVER_ID}
    >
      {viewMode === "normal" ? "View" : VIEW_MODE_LABEL[viewMode]}
    </button>
  )
}

export function SettingsPopover() {
  const { renderMarkdown, setRenderMarkdown, viewMode, setViewMode } = useSettings()
  return (
    <div
      id={SETTINGS_POPOVER_ID}
      popover="auto"
      className="settings-popover"
      role="dialog"
      aria-label="Settings"
    >
      <div className="settings-section">
        {(["chat", "compact", "normal"] as const).map((mode) => (
          <button
            key={mode}
            className={`settings-item ${viewMode === mode ? "settings-item-active" : ""}`}
            onClick={() => setViewMode(mode)}
            role="menuitemradio"
            aria-checked={viewMode === mode}
          >
            <span className="settings-item-check" aria-hidden="true">
              {viewMode === mode ? "✓" : ""}
            </span>
            <span>{VIEW_MODE_LABEL[mode]}</span>
          </button>
        ))}
      </div>
      <div className="settings-divider" />
      <button
        type="button"
        className="settings-row settings-row-clickable"
        role="switch"
        aria-checked={renderMarkdown}
        aria-label="Render markdown"
        onClick={() => setRenderMarkdown(!renderMarkdown)}
      >
        <SwitchVisual checked={renderMarkdown} />
        <span>Markdown</span>
      </button>
    </div>
  )
}

function SwitchVisual({ checked }: { checked: boolean }) {
  return (
    <span className={`switch ${checked ? "switch-on" : ""}`} aria-hidden="true">
      <span className="switch-thumb" />
    </span>
  )
}
