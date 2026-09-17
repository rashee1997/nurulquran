import React from 'react';
import { notFound } from 'next/navigation';
import { getLessonById } from '@/lib/learning/curriculum';
import { LessonRunner } from '@/components/learning/LessonRunner';
import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';

interface LessonPageProps {
  params: Promise<{ lessonId: string }>;
}

export default async function LessonPage({ params }: LessonPageProps) {
  const { lessonId } = await params;
  const lesson = getLessonById(lessonId);

  if (!lesson) {
    notFound();
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Link
          href="/learn"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors"
        >
          <ChevronLeft className="w-4 h-4" />
          <span>Back to Curriculum Map</span>
        </Link>
      </div>

      <LessonRunner lesson={lesson} />
    </div>
  );
}
