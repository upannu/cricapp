"use client";

export interface ConfirmModalProps {
  icon: React.ReactNode;
  iconBg: string;
  title: string;
  message: string;
  confirmLabel: string;
  confirmBusyLabel?: string;
  cancelLabel?: string;
  /** Styles the confirm button — "danger" for a destructive action, "warning" for something
   * reversible but worth pausing on (e.g. deactivating), "default" otherwise. */
  confirmVariant?: "default" | "danger" | "warning";
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  /** Extra content between the message and the button row — e.g. Reassign All Players' target-
   * coach picker. Most confirms don't need this. */
  children?: React.ReactNode;
}

const CONFIRM_BUTTON_CLASSES: Record<NonNullable<ConfirmModalProps["confirmVariant"]>, string> = {
  default: "bg-pace-green text-black hover:opacity-90",
  danger: "bg-red-500/20 text-red-400 border border-red-500/30 hover:bg-red-500/30",
  warning: "bg-amber/20 text-amber border border-amber/30 hover:bg-amber/30",
};

/**
 * The centered "are you sure?" dialog — extracted from AcademyClient's original status-toggle
 * confirm so every confirm-gated row action (Academy's Deactivate/Activate, Coaches' status and
 * marketplace toggles, Resend Invite) shares one widget instead of each screen re-styling its own.
 */
export function ConfirmModal({
  icon, iconBg, title, message, confirmLabel, confirmBusyLabel, cancelLabel = "Cancel",
  confirmVariant = "default", loading = false, onConfirm, onCancel, children,
}: ConfirmModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onCancel} />
      <div className="relative bg-surface rounded-2xl w-full max-w-sm shadow-2xl border border-zinc-700/60 p-6">
        <div className={`w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-4 ${iconBg}`}>
          {icon}
        </div>
        <h3 className="text-white font-bold text-center mb-1">{title}</h3>
        <p className={`text-zinc-400 text-sm text-center ${children ? "mb-4" : "mb-6"}`}>{message}</p>
        {children && <div className="mb-6">{children}</div>}
        <div className="flex gap-3">
          <button type="button" onClick={onCancel} disabled={loading}
            className="flex-1 px-4 py-2.5 text-sm font-medium text-zinc-400 border border-zinc-700 rounded-xl hover:text-white hover:border-zinc-500 transition-colors cursor-pointer disabled:opacity-60">
            {cancelLabel}
          </button>
          <button type="button" onClick={onConfirm} disabled={loading}
            className={`flex-1 px-4 py-2.5 text-sm font-bold rounded-xl transition-colors cursor-pointer disabled:opacity-60 ${CONFIRM_BUTTON_CLASSES[confirmVariant]}`}>
            {loading ? (confirmBusyLabel ?? "Saving…") : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
