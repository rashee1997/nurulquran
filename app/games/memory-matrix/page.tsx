import { MemoryMatrixCanvas } from '@/components/games/MemoryMatrixCanvas';

export const metadata = {
  title: 'Ayah Memory Matrix | NurulQuran Games',
  description: 'Fast active recall matching opening verse phrases with endings and meanings on an interactive 2D canvas.',
};

export default function MemoryMatrixPage() {
  return (
    <div className="w-full max-w-5xl mx-auto space-y-6">
      <MemoryMatrixCanvas />
    </div>
  );
}
