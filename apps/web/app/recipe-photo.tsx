'use client';

import { useState } from 'react';

export function RecipePhoto({
  alt,
  className,
  photoUrl,
  placeholderText,
}: {
  readonly alt: string;
  readonly className: string;
  readonly photoUrl: string | null;
  readonly placeholderText?: string;
}) {
  const [failedUrl, setFailedUrl] = useState<string>();

  if (photoUrl !== null && photoUrl !== failedUrl) {
    return (
      // Signed private URLs cannot pass through Next.js image optimisation.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        alt={alt}
        className={`${className} recipe-photo-image`}
        onError={() => setFailedUrl(photoUrl)}
        src={photoUrl}
      />
    );
  }

  return (
    <div
      aria-label={alt === '' ? undefined : `No photo for ${alt}`}
      className={`${className} recipe-photo-placeholder`}
    >
      <span aria-hidden="true">M</span>
      {placeholderText === undefined ? null : <p>{placeholderText}</p>}
    </div>
  );
}
