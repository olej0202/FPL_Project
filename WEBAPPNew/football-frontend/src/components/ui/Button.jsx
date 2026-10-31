import { classNames } from './classNames';

/** Standard actions share touch targets, focus treatment and disabled states. */
export default function Button({
  as: Component = 'button', variant = 'secondary', size = 'md',
  className, children, type, ...props
}) {
  return (
    <Component
      type={Component === 'button' ? type || 'button' : undefined}
      className={classNames('ui-button', `ui-button--${variant}`, `ui-button--${size}`, className)}
      {...props}
    >
      {children}
    </Component>
  );
}
