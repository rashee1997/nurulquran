'use client';

import React from 'react';
import { ShieldCheck, Check } from 'lucide-react';

interface VerificationSealProps {
  surahNumber: number;
  surahName: string;
  ayahNumber?: number;
  className?: string;
}

export const VerificationSeal: React.FC<VerificationSealProps> = ({
  surahNumber,
  surahName,
  ayahNumber,
  className = '',
}) => {
  return (
    <div
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-700 dark:text-emerald-400 text-xs font-medium shadow-xs ${className}`}
      title="Canonical Medina Mushaf / Tanzil Hafs script verified"
    >
      <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
      <span className="truncate">
        Verified Uthmani Text &bull; {surahName} {ayahNumber ? `(${surahNumber}:${ayahNumber})` : `(Surah ${surahNumber})`}
      </span>
      <span className="flex items-center justify-center w-3 h-3 rounded-full bg-emerald-600 text-white text-[9px]">
        <Check className="w-2.5 h-2.5" />
      </span>
    </div>
  );
};
