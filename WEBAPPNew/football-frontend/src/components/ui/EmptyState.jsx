import Button from './Button';

export default function EmptyState({ title, description, icon: Icon, actionLabel, onAction }) {
  return (
    <div className="empty-state">
      {Icon && <span className="empty-state__icon"><Icon size={26} aria-hidden="true" /></span>}
      <h2>{title}</h2>
      {description && <p>{description}</p>}
      {actionLabel && <Button onClick={onAction}>{actionLabel}</Button>}
    </div>
  );
}
