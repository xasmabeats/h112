import {
  type ReactNode,
  type ReactElement,
  Children,
  cloneElement,
  isValidElement,
  useId,
} from 'react';
import { statuses, type Status } from '../types';
export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow: string;
  title: string;
  description: string;
  actions?: ReactNode;
}) {
  return (
    <header className="page-header">
      <div>
        <div className="eyebrow">{eyebrow}</div>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      <div className="header-actions">{actions}</div>
    </header>
  );
}
export function Badge({ status }: { status: Status }) {
  return (
    <span className={`badge status-${status.toLowerCase()}`}>
      <i />
      {status}
    </span>
  );
}
export function StatusSelect({
  value,
  onChange,
  label = 'Workflow status',
}: {
  value: Status;
  onChange: (s: Status) => void;
  label?: string;
}) {
  return (
    <select aria-label={label} value={value} onChange={(e) => onChange(e.target.value as Status)}>
      {statuses.map((s) => (
        <option key={s}>{s}</option>
      ))}
    </select>
  );
}
export function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  const id = useId();
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {Children.map(children, (child) =>
        isValidElement(child) &&
        typeof child.type === 'string' &&
        ['input', 'select', 'textarea'].includes(child.type)
          ? cloneElement(child as ReactElement<{ id?: string; 'aria-describedby'?: string }>, {
              id,
              'aria-describedby': hint ? id + '-hint' : undefined,
            })
          : child,
      )}
      {hint && <small id={id + '-hint'}>{hint}</small>}
    </div>
  );
}
export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <div className="empty-symbol">◇</div>
      <h3>{title}</h3>
      <div>{children}</div>
    </div>
  );
}
export function ErrorMessage({ error }: { error: string }) {
  return error ? (
    <p className="error" role="alert">
      {error}
    </p>
  ) : null;
}
export function errorText(error: unknown) {
  return error instanceof Error
    ? error.name === 'QuotaExceededError'
      ? 'Browser storage is full. Export a backup and free storage before trying again.'
      : error.message
    : 'Something went wrong. Please try again.';
}
