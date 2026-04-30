import type { CodexSessionMeta } from "./types"

export function SessionHeader({ meta }: { meta: CodexSessionMeta }) {
  const m = meta.payload
  const branch = m.git?.branch
  const sha = m.git?.commit_hash?.slice(0, 7)
  const repo = m.git?.repository_url
  const cwd = m.cwd ? shortPath(m.cwd) : null
  const cli = m.cli_version
    ? `${m.originator ?? "codex"} ${m.cli_version}`
    : m.originator

  return (
    <div className="session-header">
      <div className="session-header-row">
        {branch && <span className="session-branch">{branch}</span>}
        {sha && <span className="session-sha">{sha}</span>}
        {cli && <span className="session-cli">{cli}</span>}
      </div>
      {repo && <div className="session-repo">{repo}</div>}
      {cwd && <div className="session-cwd">{cwd}</div>}
    </div>
  )
}

function shortPath(p: string): string {
  const parts = p.split("/")
  return parts.length > 4 ? `.../${parts.slice(-3).join("/")}` : p
}
