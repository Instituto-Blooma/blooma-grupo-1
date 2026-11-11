import { MedBridgeWordmark } from '@/components/medbridge-brand';

export function AuthLoadingScreen() {
  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center gap-4 p-4 bg-background"
      data-testid="auth-loading"
      aria-busy="true"
    >
      <MedBridgeWordmark compact />
    </div>
  );
}
