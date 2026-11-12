import React from 'react';

/**
 * UserBadge — standardized user pill badge used throughout the app.
 *
 * Displays the user's avatar (or an initial fallback) alongside their name,
 * inside a pill whose background matches the user's profile colour.
 *
 * Variants
 *   default     — avatar pill + name, truncates with ellipsis when space is tight
 *   pictureOnly — circular avatar only, no name text
 *
 * Sizes
 *   sm  — 20 px diameter, 0.75 rem font, 4 px gap
 *   md  — 24 px diameter, 0.875 rem font, 8 px gap   (default)
 *   lg  — 28 px diameter, 1 rem font,    12 px gap
 */

const DEFAULT_COLOR = '#6b7280';

const SIZE_CONFIG = {
  sm: { height: 20, fontSize: '0.75rem', gap: 4 },
  md: { height: 24, fontSize: '0.875rem', gap: 8 },
  lg: { height: 28, fontSize: '1rem', gap: 12 },
} as const;

export type UserBadgeSize = keyof typeof SIZE_CONFIG;

export type UserBadgeUser = {
  name?: string | null;
  email?: string | null;
  color?: string | null;
  avatarUrl?: string | null;
  image?: string | null;
};

export type UserBadgeProps = React.HTMLAttributes<HTMLSpanElement> & {
  user: UserBadgeUser;
  size?: UserBadgeSize;
  /** Render only the circular avatar, hiding the name. */
  pictureOnly?: boolean;
};

export function UserBadge({
  user,
  size = 'md',
  pictureOnly = false,
  className,
  style,
  ...rest
}: UserBadgeProps) {
  const { height, fontSize, gap } = SIZE_CONFIG[size];
  const avatarSrc = user.avatarUrl ?? user.image ?? null;
  const displayName = user.name ?? user.email ?? 'Desconhecido';
  const initial = displayName.charAt(0).toUpperCase();
  const color = user.color || DEFAULT_COLOR;

  /** Shared avatar circle — used by both variants */
  const avatarCircle = (
    <span
      style={{
        width: height,
        height,
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
        borderRadius: '50%',
      }}
    >
      {avatarSrc ? (
        <img
          src={avatarSrc}
          alt={displayName}
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
        />
      ) : (
        <span
          style={{
            width: '100%',
            height: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: 'rgba(0,0,0,0.22)',
            fontSize: `calc(${fontSize} * 0.85)`,
            fontWeight: 700,
            color: 'white',
          }}
        >
          {initial}
        </span>
      )}
    </span>
  );

  /* ── Picture-only variant ──────────────────────────────────────────── */
  if (pictureOnly) {
    return (
      <span
        title={displayName}
        {...rest}
        className={className}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: height,
          height,
          borderRadius: '50%',
          backgroundColor: color,
          overflow: 'hidden',
          flexShrink: 0,
          ...style,
        }}
      >
        {avatarCircle}
      </span>
    );
  }

  /* ── Full variant (avatar + name) ──────────────────────────────────── */
  return (
    <span
      {...rest}
      className={className}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        height,
        borderRadius: 9999,
        backgroundColor: color,
        overflow: 'hidden',
        gap,
        paddingRight: gap,
        color: 'white',
        fontSize,
        fontWeight: 500,
        whiteSpace: 'nowrap',
        lineHeight: '1.25rem',
        /* Allow badge to shrink in constrained containers (e.g. table cells)
           so the name span can apply its ellipsis truncation. */
        flexShrink: 1,
        minWidth: 0,
        maxWidth: '100%',
        ...style,
      }}
    >
      {avatarCircle}

      {/* Name — truncates with ellipsis when the badge is width-constrained */}
      <span
        style={{
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          minWidth: 0,
          lineHeight: '1.25rem',
        }}
      >
        {displayName}
      </span>
    </span>
  );
}
