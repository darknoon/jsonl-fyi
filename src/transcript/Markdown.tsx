import ReactMarkdown, { type Components } from "react-markdown"
import remarkGfm from "remark-gfm"
import { remarkKeepDisallowed } from "./remarkKeepDisallowed"
import { remarkInlineOnly } from "./remarkInlineOnly"
import { useSettings } from "../settings"

const COMPONENTS: Components = {
  a: ({ node: _node, ...props }) => (
    <a
      {...props}
      className="md-link"
      target="_blank"
      rel="noreferrer noopener"
    />
  ),
  code: ({ node: _node, className, children, ...props }) => {
    const lang = /language-(\w+)/.exec(className ?? "")?.[1]
    // Inline code has no language class; block code is wrapped in <pre> by
    // react-markdown, so the same component handles both. We only set
    // data-lang when there's an actual language tag.
    return (
      <code
        {...props}
        className={lang ? "md-code" : "md-code-inline"}
        data-lang={lang}
      >
        {children}
      </code>
    )
  },
  pre: ({ node: _node, ...props }) => <pre {...props} className="md-code-block" />,
  ul: ({ node: _node, ...props }) => <ul {...props} className="md-list" />,
  ol: ({ node: _node, ...props }) => <ol {...props} className="md-list" />,
  blockquote: ({ node: _node, ...props }) => (
    <blockquote {...props} className="md-quote" />
  ),
  table: ({ node: _node, ...props }) => <table {...props} className="md-table" />,
  h1: ({ node: _node, ...props }) => <h1 {...props} className="md-heading" />,
  h2: ({ node: _node, ...props }) => <h2 {...props} className="md-heading" />,
  h3: ({ node: _node, ...props }) => <h3 {...props} className="md-heading" />,
  h4: ({ node: _node, ...props }) => <h4 {...props} className="md-heading" />,
  h5: ({ node: _node, ...props }) => <h5 {...props} className="md-heading" />,
  h6: ({ node: _node, ...props }) => <h6 {...props} className="md-heading" />,
}

export function Markdown({
  source,
  inline = false,
}: {
  source: string
  inline?: boolean
}) {
  const { renderMarkdown } = useSettings()

  if (!renderMarkdown) {
    if (inline) return <>{source}</>
    return (
      <div className="assistant-text" style={{ whiteSpace: "pre-wrap" }}>
        {source}
      </div>
    )
  }

  const plugins = inline
    ? [remarkGfm, remarkKeepDisallowed, remarkInlineOnly]
    : [remarkGfm, remarkKeepDisallowed]

  if (inline) {
    return (
      <span className="md-content md-inline">
        <ReactMarkdown remarkPlugins={plugins} components={COMPONENTS}>
          {source}
        </ReactMarkdown>
      </span>
    )
  }

  return (
    <div className="md-content">
      <ReactMarkdown remarkPlugins={plugins} components={COMPONENTS}>
        {source}
      </ReactMarkdown>
    </div>
  )
}
