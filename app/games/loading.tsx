import React from 'react';
import { RouteSkeleton } from '@/components/system/RouteSkeleton';

export default function GamesLoading() {
  return <RouteSkeleton label="Loading the practice game" rows={2} />;
}
