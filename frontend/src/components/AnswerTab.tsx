// Strip Qwen's chain-of-thought <think>...</think> blocks before display.
// While the block is still open (streaming), show skeleton instead of raw reasoning.
function stripThink(raw: string): { text: string; thinking: boolean } {
  const closed = raw.replace(/<think>[\s\S]*?<\/think>\s*/g, '')
  const stillOpen = /<think>/.test(raw) && !raw.includes('</think>')
  return { text: closed.trimStart(), thinking: stillOpen }
}

function SkeletonLines() {
  const widths = [100, 88, 94, 70, 85, 60]
  return (
    <div className="answer-skeleton">
      {widths.map((w, i) => (
        <div
          key={i}
          className="skeleton-line"
          style={{ width: `${w}%`, animationDelay: `${i * 0.1}s` }}
        />
      ))}
    </div>
  )
}

interface AnswerTabProps {
  answer: string
  isStreaming: boolean
  error: string | null
}

export default function AnswerTab({ answer, isStreaming, error }: AnswerTabProps) {
  if (error) {
    return (
      <div className="tab-content">
        <div className="error-banner">
          <span>⚠</span>
          <span>{error}</span>
        </div>
      </div>
    )
  }

  const { text, thinking } = stripThink(answer)

  // Show skeleton while model is thinking or while stream hasn't started yet
  if (thinking || (!text && isStreaming)) {
    return (
      <div className="tab-content">
        <SkeletonLines />
      </div>
    )
  }

  if (!text) {
    return (
      <div className="tab-content">
        <div className="empty-state">
          <div className="empty-state-icon">📝</div>
          <p>Your answer will appear here.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="tab-content">
      <div className="answer-body">
        <div className="answer-text">
          {text}
          {isStreaming && <span className="cursor-blink" />}
        </div>
      </div>
    </div>
  )
}
