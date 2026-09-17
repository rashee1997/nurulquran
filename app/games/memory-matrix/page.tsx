import { MemoryMatrixCanvas } from '@/components/games/MemoryMatrixCanvas';

export const metadata = {
  title: 'Ayah Memory Matrix | NurulQuran Games',
  description: 'Match a verse opening with its ending or meaning.',
};

export default function MemoryMatrixPage() {
  return (
    <div className="w-full max-w-5xl mx-auto space-y-6">
      <MemoryMatrixCanvas />
    </div>
  );
}
