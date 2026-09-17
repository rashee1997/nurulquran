import { AyahAssemblyCanvas } from '@/components/games/AyahAssemblyCanvas';

export const metadata = {
  title: 'Celestial Ayah Assembly | NurulQuran Games',
  description: 'Connect floating 2D words in authentic Quranic sequence with orbital physics and recitation feedback.',
};

export default function AyahAssemblyPage() {
  return (
    <div className="w-full max-w-5xl mx-auto space-y-6">
      <AyahAssemblyCanvas />
    </div>
  );
}
