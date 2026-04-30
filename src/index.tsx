import { createRoot } from "react-dom/client"
import { preloadHighlighter } from "@pierre/diffs"
import { App } from "./App"
import { SettingsProvider } from "./settings"

void preloadHighlighter({
  themes: ["pierre-light", "pierre-dark"],
  langs: [
    "tsx",
    "ts",
    "jsx",
    "js",
    "json",
    "css",
    "html",
    "md",
    "py",
    "sh",
    "yaml",
    "toml",
    "rust",
    "go",
  ],
})

createRoot(document.getElementById("root")!).render(
  <SettingsProvider>
    <App />
  </SettingsProvider>,
)
