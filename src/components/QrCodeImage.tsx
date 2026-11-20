import React, { useEffect, useState } from 'react';
import { generateQrDataUrl } from '../lib/qr';

interface QrCodeImageProps {
  payload: string;
  size?: number;
  className?: string;
}

export const QrCodeImage: React.FC<QrCodeImageProps> = ({ payload, size = 196, className = '' }) => {
  const [src, setSrc] = useState<string>('');

  useEffect(() => {
    let active = true;
    generateQrDataUrl(payload, size)
      .then((url) => {
        if (active) setSrc(url);
      })
      .catch(() => {
        if (active) setSrc('');
      });
    return () => {
      active = false;
    };
  }, [payload, size]);

  if (!src) {
    return (
      <div
        style={{ width: size, height: size }}
        className={`rounded-xl bg-slate-200 animate-pulse flex items-center justify-center text-xs text-slate-500 ${className}`}
      >
        Generating QR...
      </div>
    );
  }

  return (
    <img
      src={src}
      alt="Entry QR Code"
      width={size}
      height={size}
      className={`rounded-lg block ${className}`}
    />
  );
};
