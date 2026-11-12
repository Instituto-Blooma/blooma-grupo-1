import { createFileRoute, redirect } from '@tanstack/react-router';
import { AuthForm } from '@/components/auth-form';
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
    <div className="relative min-h-screen flex items-center justify-center p-4 overflow-hidden">
      <div className="mb-malha-pontos" aria-hidden="true" />
      <div className="relative z-10 w-full space-y-6">
        <AuthForm />
        <p className="text-center text-sm text-muted-foreground">
          Solicitação de medicamentos entre enfermagem e farmácia
        </p>
      </div>
    </div>
  );
}
