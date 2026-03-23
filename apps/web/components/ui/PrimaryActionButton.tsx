'use client';

import type { CSSProperties } from 'react';
import { Plus } from 'lucide-react';
import { solidPrimaryActionButtonStyle } from '../../lib/buttonStyles';

type PrimaryActionButtonProps = {
  label: string;
  onClick?: () => void;
  type?: 'button' | 'submit' | 'reset';
  disabled?: boolean;
  style?: CSSProperties;
};

export function PrimaryActionButton({
  label,
  onClick,
  type = 'button',
  disabled = false,
  style,
}: PrimaryActionButtonProps) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      style={{ ...solidPrimaryActionButtonStyle, ...style }}
    >
      <Plus size={13} />
      <span>{label}</span>
    </button>
  );
}
