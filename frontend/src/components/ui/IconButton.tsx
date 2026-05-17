import type { ButtonHTMLAttributes, ReactNode } from 'react';

type IconButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  icon: ReactNode;
  active?: boolean;
};

export const IconButton = ({
  icon,
  active = false,
  className = '',
  ...props
}: IconButtonProps) => (
  <button
    className={`ui-icon-button ${active ? 'active' : ''} ${className}`.trim()}
    {...props}
  >
    {icon}
  </button>
);
