import type { ReactNode } from 'react';

type StatusStateProps = {
  title: string;
  body?: string;
  tone?: 'neutral' | 'loading' | 'warning' | 'error';
  icon?: ReactNode;
};

export const StatusState = ({ title, body, tone = 'neutral', icon }: StatusStateProps) => (
  <div className={`status-state tone-${tone}`}>
    {tone === 'loading' ? <div className="spinner" /> : icon}
    <strong>{title}</strong>
    {body && <span>{body}</span>}
  </div>
);
