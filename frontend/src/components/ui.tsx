import type { ButtonHTMLAttributes, ReactNode } from "react";

type Tone = "default" | "success" | "warning" | "danger";

export function Button({
  variant = "primary",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "success" | "ghost" | "danger";
}) {
  return (
    <button
      {...props}
      className={`button button-${variant} ${className}`.trim()}
    />
  );
}

export function Badge({
  children,
  tone = "default",
}: {
  children: ReactNode;
  tone?: Tone;
}) {
  const toneClass =
    tone === "success"
      ? "badge-success"
      : tone === "warning"
        ? "badge-warning"
        : tone === "danger"
          ? "badge-danger"
          : "";
  return <span className={`badge ${toneClass}`.trim()}>{children}</span>;
}

export function Alert({
  children,
  tone = "default",
}: {
  children: ReactNode;
  tone?: "default" | "warning" | "error";
}) {
  const toneClass =
    tone === "warning" ? "alert-warning" : tone === "error" ? "alert-error" : "";
  return <div className={`alert ${toneClass}`.trim()}>{children}</div>;
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <div>
        <strong>{title}</strong>
        <div>{description}</div>
        {action && <div style={{ marginTop: 16 }}>{action}</div>}
      </div>
    </div>
  );
}

export function SkeletonLine({
  width = "100%",
  height = 12,
}: {
  width?: string;
  height?: number;
}) {
  return (
    <span
      className="skeleton-line"
      style={{
        display: "inline-block",
        width,
        height,
        borderRadius: 999,
      }}
    />
  );
}
