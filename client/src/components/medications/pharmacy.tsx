import { useState } from 'react';
import { useMutation } from 'convex/react';
import { toast } from 'sonner';
import { Check, Lock, Send, X } from 'lucide-react';
import { api } from '../../../../convex/_generated/api';
import type { Id } from '../../../../convex/_generated/dataModel';
import { REFUSAL_REASONS, URGENCY_LABEL } from '../../../../convex/lib/medicationOptions';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { getDeviceId } from '@/lib/device-id';
import { cn } from '@/lib/utils';
import {
  StatusBadge,
  URGENCY_STYLE,
  UrgencyBadge,
  errorMessage,
  formatElapsed,
  matchesBedFilter,
  requestFields,
  requestTitle,
  type BedFilterValue,
  type MedicationRequest,
} from './shared';

/** Accepted on another pharmacy device: shown gray and cannot be opened here. */
function isHeldElsewhere(request: MedicationRequest, deviceId: string) {
  return (
    request.status === 'em_separacao' &&
    request.acceptedByDevice !== null &&
    request.acceptedByDevice !== deviceId
  );
}

const URGENCY_TILE: Record<MedicationRequest['urgency'], string> = {
  urgente: 'border-red-500 bg-red-50 hover:bg-red-100 dark:bg-red-950/50 dark:hover:bg-red-950',
  prioritario:
    'border-amber-400 bg-amber-50 hover:bg-amber-100 dark:bg-amber-950/50 dark:hover:bg-amber-950',
  rotina:
    'border-emerald-500 bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/50 dark:hover:bg-emerald-950',
};

function RequestTile({
  request,
  deviceId,
  now,
  onOpen,
}: {
  readonly request: MedicationRequest;
  readonly deviceId: string;
  readonly now: number;
  readonly onOpen: () => void;
}) {
  const held = isHeldElsewhere(request, deviceId);
  const mine = request.status === 'em_separacao' && !held;

  return (
    <button
      type="button"
      onClick={onOpen}
      disabled={held}
      aria-disabled={held}
      data-testid="pharmacy-request"
      className={cn(
        'flex min-h-36 flex-col items-center justify-center gap-2 rounded-2xl border-4 p-5 text-center transition-colors focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ring',
        held
          ? 'cursor-not-allowed border-muted bg-muted text-muted-foreground'
          : URGENCY_TILE[request.urgency]
      )}
    >
      <span className="text-2xl font-bold">{requestTitle(request)}</span>
      {held ? (
        <span className="flex items-center gap-1.5 font-semibold">
          <Lock className="h-4 w-4" />
          Solicitação em andamento
        </span>
      ) : (
        <>
          <span className="flex items-center gap-1.5 font-semibold">
            <span className={cn('h-3 w-3 rounded-full', URGENCY_STYLE[request.urgency].dot)} />
            {URGENCY_LABEL[request.urgency]}
          </span>
          <span className="text-sm text-muted-foreground">
            {mine
              ? 'Em preparação por este aparelho'
              : `Pedida ${formatElapsed(request.createdAt, now)}`}
          </span>
        </>
      )}
    </button>
  );
}

/** Pharmacy: open requests as big numbered buttons, in attendance order. */
export function PharmacyQueue({
  organizationId,
  requests,
  filter,
  now,
}: {
  readonly organizationId: string;
  readonly requests: ReadonlyArray<MedicationRequest>;
  readonly filter: BedFilterValue;
  readonly now: number;
}) {
  const deviceId = getDeviceId();
  const [openId, setOpenId] = useState<Id<'medicationRequests'> | null>(null);
  // Server order: urgency, then nearest deadline (none last), then oldest.
  const queue = requests.filter(
    (request) =>
      (request.status === 'solicitado' || request.status === 'em_separacao') &&
      matchesBedFilter(request, filter)
  );
  const open = requests.find((request) => request._id === openId) ?? null;

  return (
    <section className="space-y-4">
      <div>
        <h2 className="font-serif text-2xl font-semibold">Solicitações</h2>
        <p className="text-muted-foreground">
          Ordem de atendimento: Urgente, Prioritário e Rotina; dentro de cada nível, o prazo mais
          próximo primeiro. Toque em uma solicitação para ver a ficha.
        </p>
      </div>
      {queue.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">
          Nenhuma solicitação aguardando a farmácia neste filtro.
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {queue.map((request) => (
            <RequestTile
              key={request._id}
              request={request}
              deviceId={deviceId}
              now={now}
              onOpen={() => setOpenId(request._id)}
            />
          ))}
        </div>
      )}
      <RequestSheet
        organizationId={organizationId}
        request={open}
        deviceId={deviceId}
        now={now}
        onClose={() => setOpenId(null)}
      />
    </section>
  );
}

function RequestSheet({
  organizationId,
  request,
  deviceId,
  now,
  onClose,
}: {
  readonly organizationId: string;
  readonly request: MedicationRequest | null;
  readonly deviceId: string;
  readonly now: number;
  readonly onClose: () => void;
}) {
  const acceptRequest = useMutation(api.medications.acceptRequest);
  const markSent = useMutation(api.medications.markSent);
  const refuse = useMutation(api.medications.refuse);
  const [isRejecting, setIsRejecting] = useState(false);
  const [reason, setReason] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const close = () => {
    setIsRejecting(false);
    setReason('');
    onClose();
  };

  const run = async (action: () => Promise<unknown>, success: string, closeAfter: boolean) => {
    setIsSaving(true);
    try {
      await action();
      toast.success(success);
      if (closeAfter) {
        close();
      }
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setIsSaving(false);
    }
  };

  const held = request ? isHeldElsewhere(request, deviceId) : false;
  const canAct =
    request !== null &&
    !held &&
    (request.status === 'solicitado' || request.status === 'em_separacao');

  return (
    <Dialog open={request !== null} onOpenChange={(open) => (open ? undefined : close())}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        {request ? (
          <>
            <DialogHeader>
              <DialogTitle className="flex flex-wrap items-center gap-2 text-2xl">
                {requestTitle(request)}
                <UrgencyBadge urgency={request.urgency} />
                <StatusBadge status={request.status} />
              </DialogTitle>
              <DialogDescription>
                Ficha preenchida pela enfermagem · pedida {formatElapsed(request.createdAt, now)}
              </DialogDescription>
            </DialogHeader>

            <dl className="divide-y rounded-lg border">
              {requestFields(request, now).map((field) => (
                <div
                  key={field.label}
                  className="grid grid-cols-[minmax(0,11rem)_1fr] gap-3 px-3 py-2"
                >
                  <dt className="text-sm text-muted-foreground">{field.label}</dt>
                  <dd className="font-medium">{field.value}</dd>
                </div>
              ))}
            </dl>

            {held || !canAct ? (
              <p className="flex items-center gap-2 rounded-lg bg-muted p-3 font-medium">
                <Lock className="h-4 w-4" />
                {held
                  ? 'Solicitação em andamento em outro aparelho da farmácia.'
                  : 'Esta solicitação já saiu da fila da farmácia.'}
              </p>
            ) : isRejecting ? (
              <div className="space-y-3 rounded-lg border-2 border-red-300 p-3 dark:border-red-900">
                <Label htmlFor="justificativa" className="text-base">
                  Justificativa da rejeição (a enfermagem verá este texto)
                </Label>
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
                  id="justificativa"
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  placeholder="Escreva a justificativa"
                  rows={3}
                />
                <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                  <Button variant="ghost" onClick={() => setIsRejecting(false)} disabled={isSaving}>
                    Voltar
                  </Button>
                  <Button
                    variant="destructive"
                    size="lg"
                    disabled={!reason.trim() || isSaving}
                    onClick={() =>
                      void run(
                        () => refuse({ organizationId, requestId: request._id, reason, deviceId }),
                        `${requestTitle(request)} rejeitada. A enfermagem verá a justificativa.`,
                        true
                      )
                    }
                    data-testid="confirm-reject"
                  >
                    Confirmar rejeição
                  </Button>
                </div>
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {request.status === 'solicitado' ? (
                  <Button
                    size="lg"
                    className="h-14 text-lg"
                    disabled={isSaving}
                    onClick={() =>
                      void run(
                        () => acceptRequest({ organizationId, requestId: request._id, deviceId }),
                        `${requestTitle(request)} aceita: em preparação`,
                        false
                      )
                    }
                    data-testid="accept-request"
                  >
                    <Check className="mr-2 h-5 w-5" />
                    Aceitar
                  </Button>
                ) : (
                  <Button
                    size="lg"
                    className="h-14 text-lg"
                    disabled={isSaving}
                    onClick={() =>
                      void run(
                        () => markSent({ organizationId, requestId: request._id, deviceId }),
                        `${requestTitle(request)} enviada para ${request.sectorName} · ${request.bedLabel}`,
                        true
                      )
                    }
                    data-testid="mark-sent"
                  >
                    <Send className="mr-2 h-5 w-5" />
                    Marcar como enviado
                  </Button>
                )}
                <Button
                  size="lg"
                  variant="outline"
                  className="h-14 border-2 border-red-300 text-lg text-red-700 hover:bg-red-50 dark:border-red-900 dark:text-red-300 dark:hover:bg-red-950"
                  disabled={isSaving}
                  onClick={() => setIsRejecting(true)}
                  data-testid="reject-request"
                >
                  <X className="mr-2 h-5 w-5" />
                  Rejeitar
                </Button>
              </div>
            )}
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
