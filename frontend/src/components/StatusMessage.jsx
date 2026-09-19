import {
  AlertCircle,
  CheckCircle2,
  Info,
  LoaderCircle,
  RefreshCw,
} from "lucide-react";

const VARIANTS = {
  loading: {
    icon: LoaderCircle,
    title: "Loading",
  },
  error: {
    icon: AlertCircle,
    title: "Something went wrong",
  },
  success: {
    icon: CheckCircle2,
    title: "Saved successfully",
  },
  info: {
    icon: Info,
    title: "Information",
  },
  empty: {
    icon: Info,
    title: "Nothing here yet",
  },
};

function readableMessage(value) {
  if (typeof value === "string") {
    return value;
  }

  if (value instanceof Error) {
    return value.message;
  }

  if (
    value &&
    typeof value === "object" &&
    typeof value.message === "string"
  ) {
    return value.message;
  }

  return "";
}

export default function StatusMessage({
  type = "info",
  title,
  message,
  onRetry,
  retryLabel = "Try again",
  retrying = false,
  children,
}) {
  const variant = VARIANTS[type] ? type : "info";
  const config = VARIANTS[variant];
  const Icon = config.icon;

  const description = readableMessage(message);
  const loading = variant === "loading" || retrying;

  return (
    <div
      className={`status-message status-message--${variant}`}
      role={variant === "error" ? "alert" : "status"}
      aria-atomic="true"
    >
      <Icon
        className={
          variant === "loading"
            ? "status-message__icon spin"
            : "status-message__icon"
        }
        size={22}
        aria-hidden="true"
      />

      <div className="status-message__content">
        <p className="status-message__title">
          {title ?? config.title}
        </p>

        {description && (
          <p className="status-message__description">
            {description}
          </p>
        )}

        {children}
      </div>

      {typeof onRetry === "function" && (
        <button
          type="button"
          className="button button--secondary"
          onClick={onRetry}
          disabled={loading}
          aria-busy={retrying}
        >
          <RefreshCw
            size={16}
            className={retrying ? "spin" : undefined}
            aria-hidden="true"
          />

          {retrying ? "Retrying…" : retryLabel}
        </button>
      )}
    </div>
  );
}