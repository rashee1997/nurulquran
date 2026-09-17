import { MutashabihatRadarCanvas } from '@/components/games/MutashabihatRadarCanvas';

export const metadata = {
  title: 'Mutashabihat Radar | NurulQuran Games',
  description: 'AI-assisted twin verse discernment mini-game targeting similar verses with 2D canvas radar sweep.',
};

export default function MutashabihatRadarPage() {
  return (
    <div className="w-full max-w-5xl mx-auto space-y-6">
      <MutashabihatRadarCanvas />
    </div>
  );
}
