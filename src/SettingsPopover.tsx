import { useSettings, type ViewMode } from "./settings"

export const SETTINGS_POPOVER_ID = "settings-popover"

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
      <label className="settings-row">
        <span>View mode</span>
        <select
          value={viewMode}
          onChange={(e) => setViewMode(e.currentTarget.value as ViewMode)}
        >
          <option value="normal">Normal</option>
          <option value="compact">Compact</option>
        </select>
      </label>
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
