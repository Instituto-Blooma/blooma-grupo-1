import { useEffect, useId, useState, type ComponentType, type ReactNode } from 'react';
import {
  AArrowDown,
  AArrowUp,
  ALargeSmall,
  ChevronDown,
  Contrast,
  Pause,
  Play,
  Square,
  Volume2,
} from 'lucide-react';
import {
  accessibilityActions,
  canDecreaseFont,
  canIncreaseFont,
  useAccessibilityPreferences,
} from '@/lib/accessibility';
import { isSpeechSupported, speechActions, useSpeechStatus } from '@/lib/speech';
import { cn } from '@/lib/utils';

type BarButtonProps = {
  icon: ComponentType<{ className?: string }>;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  pressed?: boolean;
  testId: string;
};

function BarButton({ icon: Icon, label, onClick, disabled, pressed, testId }: BarButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={pressed}
      data-testid={testId}
      className={cn(
        'inline-flex min-h-9 items-center gap-1.5 rounded-md border px-2.5 py-1 text-sm font-medium transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1',
        'disabled:cursor-not-allowed disabled:opacity-50',
        pressed
          ? 'border-primary bg-primary text-primary-foreground'
          : 'border-border bg-background hover:bg-muted'
      )}
    >
      <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
      <span>{label}</span>
    </button>
  );
}

function Group({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap items-center gap-1.5">
      <span className="mr-0.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      {children}
    </div>
  );
}

/**
 * Accessibility button at the top of every page; clicking it opens the accessibility bar
 * (read aloud, font size, high contrast). Preferences are saved on this device; the VLibras
 * widget is separate and left untouched.
 */
export function AccessibilityBar() {
  const preferences = useAccessibilityPreferences();
  const speech = useSpeechStatus();
  const panelId = useId();
  const [isOpen, setIsOpen] = useState(false);
  const [speechSupported, setSpeechSupported] = useState(false);
  const [announcement, setAnnouncement] = useState('');

  useEffect(() => {
    setSpeechSupported(isSpeechSupported());
  }, []);

  const announce = (message: string) => {
    // Clear first so repeating the same message is announced again.
    setAnnouncement('');
    window.setTimeout(() => setAnnouncement(message), 50);
  };

  const fontPercent = Math.round(preferences.fontScale * 100);
  const speechNote =
    speech === 'lendo' ? 'lendo em voz alta' : speech === 'pausado' ? 'leitura pausada' : null;

  return (
    <div
      data-leitura-ignorar=""
      data-testid="accessibility-bar"
      className="border-b bg-muted/60 text-foreground"
    >
      <div className="container flex justify-end px-4 py-1.5 md:px-6">
        <button
          type="button"
          onClick={() => setIsOpen((open) => !open)}
          aria-expanded={isOpen}
          aria-controls={panelId}
          data-testid="a11y-toggle"
          className="inline-flex min-h-9 items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1 text-sm font-semibold transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
        >
          Acessibilidade
          {speechNote ? (
            <span className="font-normal text-muted-foreground">({speechNote})</span>
          ) : null}
          <ChevronDown
            className={cn('h-4 w-4 transition-transform', isOpen && 'rotate-180')}
            aria-hidden="true"
          />
        </button>
      </div>

      <nav
        id={panelId}
        aria-label="Barra de acessibilidade"
        hidden={!isOpen}
        className="border-t"
        data-testid="a11y-panel"
      >
        <div className="container flex flex-wrap items-center gap-x-5 gap-y-2 px-4 py-2 md:px-6">
          <Group label="Leitura">
            <BarButton
              icon={Volume2}
              label="Ler em voz alta"
              testId="a11y-read-start"
              disabled={!speechSupported}
              pressed={speech !== 'parado'}
              onClick={() => {
                const started = speechActions.start();
                announce(started ? 'Leitura iniciada' : 'Não há texto para ler nesta tela');
              }}
            />
            <BarButton
              icon={Pause}
              label="Pausar"
              testId="a11y-read-pause"
              disabled={speech !== 'lendo'}
              onClick={() => {
                speechActions.pause();
                announce('Leitura pausada');
              }}
            />
            <BarButton
              icon={Play}
              label="Continuar"
              testId="a11y-read-resume"
              disabled={speech !== 'pausado'}
              onClick={() => {
                speechActions.resume();
                announce('Leitura continuada');
              }}
            />
            <BarButton
              icon={Square}
              label="Interromper"
              testId="a11y-read-stop"
              disabled={speech === 'parado'}
              onClick={() => {
                speechActions.stop();
                announce('Leitura interrompida');
              }}
            />
            {!speechSupported ? (
              <span className="text-xs text-muted-foreground">
                Este navegador não oferece leitura em voz alta.
              </span>
            ) : null}
          </Group>

          <Group label={`Fonte ${fontPercent}%`}>
            <BarButton
              icon={AArrowUp}
              label="Aumentar fonte"
              testId="a11y-font-increase"
              disabled={!canIncreaseFont(preferences)}
              onClick={() => {
                accessibilityActions.increaseFont();
                announce('Fonte aumentada');
              }}
            />
            <BarButton
              icon={AArrowDown}
              label="Diminuir fonte"
              testId="a11y-font-decrease"
              disabled={!canDecreaseFont(preferences)}
              onClick={() => {
                accessibilityActions.decreaseFont();
                announce('Fonte diminuída');
              }}
            />
            <BarButton
              icon={ALargeSmall}
              label="Restaurar fonte"
              testId="a11y-font-reset"
              disabled={preferences.fontScale === 1}
              onClick={() => {
                accessibilityActions.resetFont();
                announce('Tamanho da fonte restaurado');
              }}
            />
          </Group>

          <Group label="Cores">
            <BarButton
              icon={Contrast}
              label="Alto contraste"
              testId="a11y-high-contrast"
              pressed={preferences.highContrast}
              onClick={() => {
                accessibilityActions.toggleHighContrast();
                announce(
                  preferences.highContrast ? 'Alto contraste desativado' : 'Alto contraste ativado'
                );
              }}
            />
          </Group>
        </div>
      </nav>
      <p className="sr-only" role="status" aria-live="polite">
        {announcement}
      </p>
    </div>
  );
}
