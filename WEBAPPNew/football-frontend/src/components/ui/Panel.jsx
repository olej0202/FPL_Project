import { classNames } from './classNames';

export default function Panel({ as: Component = 'section', className, children, ...props }) {
  return <Component className={classNames('ui-panel', className)} {...props}>{children}</Component>;
}
