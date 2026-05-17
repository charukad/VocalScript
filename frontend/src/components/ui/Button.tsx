import type { ButtonHTMLAttributes, ReactNode } from 'react';

type ButtonVariant = 'primary' | 'secondary' | 'ghost';

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  leadingIcon?: ReactNode;
};

export const Button = ({
  variant = 'secondary',
  leadingIcon,
  className = '',
  children,
  ...props
}: ButtonProps) => (
  <button
    className={`ui-button ui-button-${variant} ${className}`.trim()}
    {...props}
  >
    {leadingIcon}
    {children}
  </button>
);
