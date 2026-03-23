'use client';

import { useMemo, useState } from 'react';
import { API_BASE_URL } from '../../lib/api';
import type { CSSProperties } from 'react';

type UserAvatarProps = {
  avatarUrl?: string | null;
  displayName?: string | null;
  email?: string | null;
  size: number;
  title?: string;
  className?: string;
  style?: CSSProperties;
  fallbackTextClassName?: string;
};

function getInitial(displayName?: string | null, email?: string | null): string {
  const label = (displayName || email || '?').trim();
  return label.charAt(0).toUpperCase() || '?';
}

export function UserAvatar({
  avatarUrl,
  displayName,
  email,
  size,
  title,
  className,
  style,
  fallbackTextClassName,
}: UserAvatarProps) {
  const [imgFailed, setImgFailed] = useState(false);
  const src = useMemo(() => {
    if (!avatarUrl) return null;
    if (avatarUrl.startsWith('http')) return avatarUrl;
    return `${API_BASE_URL}${avatarUrl}`;
  }, [avatarUrl]);

  const initial = getInitial(displayName, email);

  return (
    <span
      title={title ?? displayName ?? email ?? ''}
      className={className}
      style={{
        width: size,
        height: size,
        borderRadius: 999,
        overflow: 'hidden',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        ...style,
      }}
    >
      {src && !imgFailed ? (
        <img
          src={src}
          alt={displayName ?? email ?? 'User avatar'}
          onError={() => setImgFailed(true)}
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
        />
      ) : (
        <span className={fallbackTextClassName}>{initial}</span>
      )}
    </span>
  );
}
