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

  if (!answer && isStreaming) {
    return (
      <div className="tab-content">
        <SkeletonLines />
      </div>
    )
  }

  if (!answer) {
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
          {answer}
          {isStreaming && <span className="cursor-blink" />}
        </div>
      </div>
    </div>
  )
}
