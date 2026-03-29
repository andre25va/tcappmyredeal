/**
 * MRD-UI-004 | Button  —  LOCKED DESIGN
 * ─────────────────────────────────────────────────────────────────
 * Canonical button for MyReDeal.
 *
 * SOURCE OF TRUTH — import this everywhere.
 * Wraps DaisyUI btn classes into typed props so variants stay consistent.
 *
 * Usage:
 *   <Button onClick={save}>Save</Button>
 *   <Button variant="ghost" size="sm" onClick={cancel}>Cancel</Button>
 *   <Button variant="error" loading={saving} icon={<Trash size={14} />}>Delete</Button>
 *   <Button variant="primary" square icon={<Plus size={16} />} />  ← icon-only square
 *
 * Variant shortcuts:
 *   'primary'  → btn-primary   (blue, main CTA)
 *   'secondary'→ btn-secondary
 *   'ghost'    → btn-ghost     (no background, default for cancel/close)
 *   'error'    → btn-error     (red destructive)
 *   'warning'  → btn-warning
 *   'success'  → btn-success
 *   'neutral'  → btn-neutral
 *   'outline'  → btn-outline
 * ─────────────────────────────────────────────────────────────────
 */

import React from 'react';
import { Loader2 } from 'lucide-react';

type ButtonVariant =
  | 'primary' | 'secondary' | 'ghost' | 'error'
  | 'warning' | 'success' | 'neutral' | 'outline';

type ButtonSize = 'xs' | 'sm' | 'md' | 'lg';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  /** Icon rendered before children (or alone if no children) */
  icon?: React.ReactNode;
  /** Icon-only square button */
  square?: boolean;
  children?: React.ReactNode;
}

const variantClass: Record<ButtonVariant, string> = {
  primary:   'btn-primary',
  secondary: 'btn-secondary',
  ghost:     'btn-ghost',
  error:     'btn-error',
  warning:   'btn-warning',
  success:   'btn-success',
  neutral:   'btn-neutral',
  outline:   'btn-outline',
};

const sizeClass: Record<ButtonSize, string> = {
  xs: 'btn-xs',
  sm: 'btn-sm',
  md: '',
  lg: 'btn-lg',
};

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = 'ghost',
      size = 'sm',
      loading = false,
      icon,
      square = false,
      children,
      disabled,
      className = '',
      ...rest
    },
    ref
  ) => {
    const classes = [
      'btn',
      variantClass[variant],
      sizeClass[size],
      square ? 'btn-square' : '',
      'gap-1',
      className,
    ]
      .filter(Boolean)
      .join(' ');

    return (
      <button ref={ref} className={classes} disabled={disabled || loading} {...rest}>
        {loading ? (
          <Loader2 size={14} className="animate-spin" />
        ) : icon ? (
          <span className="flex-none">{icon}</span>
        ) : null}
        {children}
      </button>
    );
  }
);

Button.displayName = 'Button';

// ── IconButton shorthand ───────────────────────────────────────────
/** Square icon-only button — common in toolbars and list rows */
export function IconButton({
  icon,
  label,
  ...props
}: Omit<ButtonProps, 'children' | 'square'> & { icon: React.ReactNode; label: string }) {
  return (
    <Button square icon={icon} aria-label={label} {...props} />
  );
}
