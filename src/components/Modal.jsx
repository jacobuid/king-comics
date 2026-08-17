import { useEffect } from 'preact/hooks'

function Modal({ open, title, content, actions = [], onClose }) {
  useEffect(() => {
    if (!open) return undefined

    function handleKeyDown(event) {
      if (event.key === 'Escape') onClose?.()
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      class="modal-backdrop"
      onMouseDown={(event) => {
        if (event.currentTarget === event.target) onClose?.()
      }}
    >
      <section class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">
        <h2 id="modal-title">{title}</h2>
        <div class="modal-content">{content}</div>
        <div class="modal-actions">
          {actions.map((action) => (
            <button
              class={`modal-action ${action.tone ?? ''}`.trim()}
              type="button"
              key={action.label}
              disabled={action.disabled}
              onClick={action.onClick}
            >
              {action.label}
            </button>
          ))}
        </div>
      </section>
    </div>
  )
}

export default Modal
