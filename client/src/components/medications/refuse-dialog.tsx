import { useEffect, useState } from 'react';
import { REFUSAL_REASONS } from '../../../../convex/lib/medicationOptions';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { formatLocation, type MedicationRequest } from './shared';

export function RefuseDialog({
  request,
  onClose,
  onConfirm,
}: {
  readonly request: MedicationRequest | null;
  readonly onClose: () => void;
  readonly onConfirm: (reason: string) => Promise<void>;
}) {
  const [reason, setReason] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (request) {
      setReason('');
    }
  }, [request]);

  const handleConfirm = async () => {
    setIsSaving(true);
    try {
      await onConfirm(reason.trim());
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={request !== null} onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Recusar solicitação</DialogTitle>
          <DialogDescription>
            {request
              ? `${request.medication} ${request.dose} · ${formatLocation(request.sectorName, request.bedLabel)}`
              : null}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <Label>Motivo (a enfermagem verá este texto)</Label>
          <div className="flex flex-wrap gap-2">
            {REFUSAL_REASONS.map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setReason(option)}
                className={cn(
                  'rounded-full border px-3 py-1 text-sm transition-colors',
                  reason === option
                    ? 'border-red-500 bg-red-50 text-red-800 dark:bg-red-950 dark:text-red-200'
                    : 'hover:bg-muted'
                )}
              >
                {option}
              </button>
            ))}
          </div>
          <Textarea
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Ou escreva o motivo"
            rows={2}
            aria-label="Motivo da recusa"
          />
        </div>
        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            variant="destructive"
            disabled={!reason.trim() || isSaving}
            onClick={() => void handleConfirm()}
          >
            {isSaving ? 'Recusando...' : 'Recusar solicitação'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
