import React from 'react';
import { RouteSkeleton } from '@/components/system/RouteSkeleton';

export default function SurahLoading() {
  return <RouteSkeleton label="Loading the surah text" rows={3} withBanner />;
}
