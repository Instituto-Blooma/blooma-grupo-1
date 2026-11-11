import { useState } from 'react';
import { useAuthActions } from '@convex-dev/auth/react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { MedBridgeWordmark } from '@/components/medbridge-brand';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';

function GoogleMark() {
  return (
    <svg aria-hidden="true" className="mr-2 h-4 w-4" viewBox="0 0 24 24">
      <path
        d="M21.6 12.23c0-.74-.07-1.45-.19-2.13H12v4.03h5.39a4.6 4.6 0 0 1-2 3.02v2.5h3.23c1.89-1.74 2.98-4.3 2.98-7.42Z"
        fill="#4285F4"
      />
      <path
        d="M12 22c2.7 0 4.97-.9 6.62-2.44l-3.23-2.5c-.9.6-2.04.96-3.39.96-2.6 0-4.8-1.76-5.59-4.12H3.08v2.58A9.99 9.99 0 0 0 12 22Z"
        fill="#34A853"
      />
      <path
        d="M6.41 13.9A5.99 5.99 0 0 1 6.1 12c0-.66.11-1.3.31-1.9V7.52H3.08A10 10 0 0 0 2 12c0 1.61.39 3.13 1.08 4.48l3.33-2.58Z"
        fill="#FBBC04"
      />
      <path
        d="M12 5.98c1.47 0 2.79.5 3.83 1.48l2.88-2.88C16.96 2.96 14.7 2 12 2A9.99 9.99 0 0 0 3.08 7.52l3.33 2.58c.79-2.36 2.99-4.12 5.59-4.12Z"
        fill="#EA4335"
      />
    </svg>
  );
}

export function AuthForm() {
  const { signIn } = useAuthActions();
  const [isLoading, setIsLoading] = useState(false);

  const handleGoogleSignIn = async () => {
    setIsLoading(true);
    try {
      await signIn('google', { redirectTo: '/' });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível entrar com o Google');
      setIsLoading(false);
    }
  };

  return (
    <Card className="w-full max-w-md mx-auto">
      <CardHeader className="space-y-4">
        <MedBridgeWordmark className="justify-center" />
        <div className="space-y-1 text-center">
          <CardTitle className="font-serif text-2xl font-semibold tracking-tight">Entrar</CardTitle>
          <CardDescription>Entre com a conta Google do seu hospital.</CardDescription>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <Button
          type="button"
          className="w-full"
          onClick={handleGoogleSignIn}
          disabled={isLoading}
          data-testid="button-google-signin"
        >
          {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <GoogleMark />}
          Entrar com o Google
        </Button>
      </CardContent>
    </Card>
  );
}
