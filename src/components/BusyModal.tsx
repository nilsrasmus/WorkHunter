interface Props {
  open: boolean;
  title: string;
  message: string;
}

/** Non-dismissible busy modal — close by setting open=false when work finishes. */
export function BusyModal({ open, title, message }: Props) {
  if (!open) return null;

  return (
    <div className="modal-overlay busy-modal-overlay">
      <div
        className="modal confirm-dialog busy-modal"
        role="status"
        aria-live="polite"
        aria-busy="true"
        aria-labelledby="busy-modal-title"
        aria-describedby="busy-modal-message"
      >
        <div className="modal-header">
          <h2 id="busy-modal-title">{title}</h2>
        </div>
        <div className="modal-body">
          <div className="busy-modal-spinner" aria-hidden="true" />
          <p id="busy-modal-message">{message}</p>
        </div>
      </div>
    </div>
  );
}
