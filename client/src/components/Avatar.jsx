import { useState } from 'react';

/**
 * Avatar: the uploaded photo when there is one, initials otherwise.
 *
 * Initials remain the default rather than a generic silhouette, because a
 * coloured monogram is identifiable at a glance in a chat list where a grey
 * placeholder is not. The photo is a data URI from the user's own profile, so
 * there is nothing to load over the network and no layout shift — but
 * `onError` still falls back to initials, since a truncated or corrupt data
 * URI would otherwise render as a broken-image icon.
 */
export default function Avatar({ name = '?', color = '#0B8A5B', src = null, size = 40, ring = false }) {
  const [failed, setFailed] = useState(false);

  const initials = name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase();

  const shell = `shrink-0 grid place-items-center rounded-full font-semibold text-white select-none overflow-hidden
                 ${ring ? 'ring-2 ring-surface shadow-sm' : ''}`;

  if (src && !failed) {
    return (
      <img
        src={src}
        alt=""
        aria-hidden="true"
        width={size}
        height={size}
        onError={() => setFailed(true)}
        className={`${shell} object-cover`}
        style={{ width: size, height: size, background: color }}
      />
    );
  }

  return (
    <div
      className={shell}
      style={{ width: size, height: size, background: color, fontSize: size * 0.38 }}
      aria-hidden="true"
    >
      {initials || '?'}
    </div>
  );
}
