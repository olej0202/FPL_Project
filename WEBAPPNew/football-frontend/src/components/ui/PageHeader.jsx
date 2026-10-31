export default function PageHeader({ title, description, eyebrow, actions, icon: Icon }) {
  return (
    <header className="page-header">
      <div className="page-header__heading">
        {Icon && <span className="page-header__icon"><Icon size={22} aria-hidden="true" /></span>}
        <div className="min-w-0">
          {eyebrow && <p className="page-header__eyebrow">{eyebrow}</p>}
          <h1>{title}</h1>
          {description && <p className="page-header__description">{description}</p>}
        </div>
      </div>
      {actions && <div className="page-header__actions">{actions}</div>}
    </header>
  );
}
