import { classNames } from './classNames';

/** Keep wide statistical tables inside the viewport, with keyboard scrolling. */
export default function TableScroll({ children, label = 'Data table', className, ...props }) {
  return <div role="region" aria-label={label} tabIndex={0} className={classNames('table-scroll', className)} {...props}>{children}</div>;
}
