import { AyahAssemblyCanvas } from '@/components/games/AyahAssemblyCanvas';

export const metadata = {
  title: 'Celestial Ayah Assembly | NurulQuran Games',
  description: 'Place the words of a verse in Quranic order.',
};

export default function AyahAssemblyPage() {
  return (
    <div className="w-full max-w-5xl mx-auto space-y-6">
      <AyahAssemblyCanvas />
    </div>
  );
}
