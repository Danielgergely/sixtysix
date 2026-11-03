/** "Leave the game?" and the like: a title, a line of text, a red confirm and a way back. Tapping outside cancels. */
export function ConfirmModal({
  title,
  text,
  confirm,
  cancel,
  onConfirm,
  onCancel,
}: {
  title: string
  text: string
  confirm: string
  cancel: string
  onConfirm: () => void
  onCancel: () => void
}) {
  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-title">{title}</div>
        <p className="modal-text">{text}</p>
        <button className="btn-play btn-danger" onClick={onConfirm}>
          {confirm}
        </button>
        <button className="btn-secondary" onClick={onCancel}>
          {cancel}
        </button>
      </div>
    </div>
  )
}
