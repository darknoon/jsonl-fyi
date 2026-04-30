import { useSettings } from "./settings"

export const SETTINGS_POPOVER_ID = "settings-popover"

export function SettingsPopover() {
  const { renderMarkdown, setRenderMarkdown } = useSettings()
  return (
    <div
      id={SETTINGS_POPOVER_ID}
      popover="auto"
      className="settings-popover"
      role="dialog"
      aria-label="Settings"
    >
      <label className="settings-row">
        <input
          type="checkbox"
          checked={renderMarkdown}
          onChange={(e) => setRenderMarkdown(e.target.checked)}
        />
        <span>Render markdown</span>
      </label>
    </div>
  )
}
