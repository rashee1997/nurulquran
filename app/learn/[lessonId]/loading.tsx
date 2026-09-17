import React from 'react';
import { RouteSkeleton } from '@/components/system/RouteSkeleton';

export default function LessonLoading() {
  return <RouteSkeleton label="Loading the lesson" rows={2} />;
}
