import { MutashabihatRadarCanvas } from '@/components/games/MutashabihatRadarCanvas';

export const metadata = {
  title: 'Mutashabihat Radar | NurulQuran Games',
  description: 'Practice telling similar verses apart.',
};

export default function MutashabihatRadarPage() {
  return (
    <div className="w-full max-w-5xl mx-auto space-y-6">
      <MutashabihatRadarCanvas />
    </div>
  );
}
