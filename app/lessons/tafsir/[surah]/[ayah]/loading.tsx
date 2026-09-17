import React from 'react';
import { RouteSkeleton } from '@/components/system/RouteSkeleton';

export default function TafsirLessonLoading() {
  return <RouteSkeleton label="Loading the verse and its commentary" rows={3} withBanner />;
}
