import { createFileRoute, redirect } from '@tanstack/react-router';
import { AuthForm } from '@/components/auth-form';
import { BloomaDotField } from '@/components/blooma-brand';
import { validateLoginSearch } from '@/lib/route-guards';

export const Route = createFileRoute('/login')({
  validateSearch: validateLoginSearch,
  beforeLoad: ({ context, search }) => {
    if (context.auth.isAuthenticated) {
      throw redirect({ href: search.redirect ?? '/' });
    }
  },
  component: LoginPage,
});

function LoginPage() {
  return (
    <div className="relative min-h-screen flex items-center justify-center p-4 overflow-hidden bg-background">
      <BloomaDotField />
      <div className="relative z-10 w-full space-y-6">
        <AuthForm />
        <p className="text-center font-serif text-sm text-muted-foreground">
          Solicitação de medicamentos entre enfermagem e farmácia
        </p>
      </div>
    </div>
  );
}
