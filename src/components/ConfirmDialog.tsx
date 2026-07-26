import { useI18n } from "../lib/i18n";

interface Props {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** When true, only show a single dismiss button (no cancel). */
  alertOnly?: boolean;
  danger?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/** In-app confirm/alert dialog matching WorkHunter modal styling. */
export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel,
  cancelLabel,
  alertOnly = false,
  danger = false,
  busy = false,
  onConfirm,
  onCancel,
}: Props) {
  const { t } = useI18n();
  if (!open) return null;

  const dismiss = busy ? undefined : onCancel;

  return (
    <div className="modal-overlay" onClick={dismiss}>
      <div
        className="modal confirm-dialog"
        onClick={(e) => e.stopPropagation()}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        aria-describedby="confirm-dialog-message"
      >
        <div className="modal-header">
          <h2 id="confirm-dialog-title">{title}</h2>
        </div>
        <div className="modal-body">
          <p id="confirm-dialog-message" className="confirm-dialog-message">
            {message}
          </p>
        </div>
        <div className="modal-footer" role="group">
          {!alertOnly && (
            <button
              type="button"
              className="btn btn-secondary"
              onClick={onCancel}
              disabled={busy}
            >
              {cancelLabel ?? t("common.cancel")}
            </button>
          )}
          <button
            type="button"
            className={`btn ${danger ? "btn-danger" : "btn-primary"}`}
            onClick={onConfirm}
            disabled={busy}
          >
            {confirmLabel ?? (alertOnly ? t("common.close") : t("common.delete"))}
          </button>
        </div>
      </div>
    </div>
  );
}
