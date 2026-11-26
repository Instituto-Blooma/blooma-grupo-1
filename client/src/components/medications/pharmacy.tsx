import { useState } from 'react';
import { useMutation } from 'convex/react';
import { toast } from 'sonner';
import { AlertTriangle, Check, Lock, Send, Snowflake, X } from 'lucide-react';
import { api } from '../../../../convex/_generated/api';
import {
  REFUSAL_REASONS,
  URGENCY_LABEL,
  URGENCY_RANK,
} from '../../../../convex/lib/medicationOptions';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { getDeviceId } from '@/lib/device-id';
import { cn } from '@/lib/utils';
import {
  DeliveryErrorNotice,
  RefrigeratedBadge,
  StatusBadge,
  URGENCY_STYLE,
  UrgencyBadge,
  errorMessage,
  formatElapsed,
  formatLocation,
  groupPrescriptions,
  matchesBedFilter,
  medicationCountLabel,
  requestFields,
  requestTitle,
  requesterLabel,
  type BedFilterValue,
  type MedicationRequest,
  type Prescription,
} from './shared';

const IN_QUEUE = (request: MedicationRequest) =>
  request.status === 'solicitado' || request.status === 'em_separacao';

/** Accepted on another pharmacy device: shown gray and cannot be opened here. */
function isHeldElsewhere(prescription: Prescription, deviceId: string) {
  return prescription.items.some(
    (item) =>
      item.status === 'em_separacao' &&
      item.acceptedByDevice !== null &&
      item.acceptedByDevice !== deviceId
  );
}

/** A medication sent back after a delivery error comes first, then the most urgent. */
function leadRank(item: MedicationRequest) {
  return (item.needsRedelivery ? -10 : 0) + URGENCY_RANK[item.urgency];
}

/**
 * The item that decides the prescription's color and label: its most urgent medication still
 * waiting for the pharmacy (3 "Rotina" + 1 "Urgente" shows red, "Urgente").
 */
function leadItem(prescription: Prescription) {
  const pending = prescription.items.filter(IN_QUEUE);
  const candidates = pending.length > 0 ? pending : prescription.items;
  return candidates.reduce<MedicationRequest | undefined>(
    (best, item) => (best === undefined || leadRank(item) < leadRank(best) ? item : best),
    undefined
  );
}

const REDELIVERY_TILE =
  'border-purple-500 bg-purple-50 hover:bg-purple-100 dark:bg-purple-950/50 dark:hover:bg-purple-950';

const URGENCY_TILE: Record<MedicationRequest['urgency'], string> = {
  urgente: 'border-red-500 bg-red-50 hover:bg-red-100 dark:bg-red-950/50 dark:hover:bg-red-950',
  prioritario:
    'border-amber-400 bg-amber-50 hover:bg-amber-100 dark:bg-amber-950/50 dark:hover:bg-amber-950',
  rotina:
    'border-emerald-500 bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/50 dark:hover:bg-emerald-950',
};

function PrescriptionTile({
  prescription,
  deviceId,
  now,
  onOpen,
}: {
  readonly prescription: Prescription;
  readonly deviceId: string;
  readonly now: number;
  readonly onOpen: () => void;
}) {
  const held = isHeldElsewhere(prescription, deviceId);
  const lead = leadItem(prescription);
  const mine = prescription.items.some(
    (item) => item.status === 'em_separacao' && item.acceptedByDevice === deviceId
  );
  const count = prescription.items.length;

  return (
    <button
      type="button"
      onClick={onOpen}
      disabled={held}
      aria-disabled={held}
      data-testid="pharmacy-request"
      className={cn(
        'flex min-h-36 flex-col items-center justify-center gap-2 rounded-2xl border-4 p-5 text-center transition-colors focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ring',
        held || !lead
          ? 'cursor-not-allowed border-muted bg-muted text-muted-foreground'
          : lead.needsRedelivery
            ? REDELIVERY_TILE
            : URGENCY_TILE[lead.urgency]
      )}
    >
      <span className="text-2xl font-bold">{requestTitle(prescription)}</span>
      {count > 1 ? (
        <span className="rounded-full bg-background/80 px-3 py-0.5 text-sm font-semibold">
          {medicationCountLabel(count)}
        </span>
      ) : null}
      {held ? (
        <span className="flex items-center gap-1.5 font-semibold">
          <Lock className="h-4 w-4" />
          Solicitação em andamento
        </span>
      ) : lead ? (
        <>
          {lead.needsRedelivery ? (
            <span className="flex items-center gap-1.5 font-semibold text-purple-900 dark:text-purple-100">
              <AlertTriangle className="h-4 w-4" aria-hidden="true" />
              Erro na entrega
            </span>
          ) : null}
          <span className="flex items-center gap-1.5 font-semibold">
            <span className={cn('h-3 w-3 rounded-full', URGENCY_STYLE[lead.urgency].dot)} />
            {URGENCY_LABEL[lead.urgency]}
          </span>
          <span className="text-sm text-muted-foreground">
            {mine
              ? 'Em preparação por este aparelho'
              : `Pedida ${formatElapsed(prescription.createdAt, now)}`}
          </span>
        </>
      ) : null}
    </button>
  );
}

/** Pharmacy: open prescriptions as big numbered buttons, in attendance order. */
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
  const [openKey, setOpenKey] = useState<string | null>(null);
  const visible = requests.filter((request) => matchesBedFilter(request, filter));
  // Server order is the queue order (urgency, nearest deadline, oldest). Grouping only the
  // pending items keeps each prescription at the position of its most urgent pending medication.
  const pendingOrder = groupPrescriptions(visible.filter(IN_QUEUE)).map((group) => group.key);
  const allGroups = new Map(groupPrescriptions(visible).map((group) => [group.key, group]));
  const queue = pendingOrder
    .map((key) => allGroups.get(key))
    .filter((group): group is Prescription => group !== undefined);
  const open = openKey ? (allGroups.get(openKey) ?? null) : null;

  return (
    <section className="space-y-4">
      <div>
        <h2 className="font-serif text-2xl font-semibold">Solicitações</h2>
        <p className="text-muted-foreground">Toque em uma solicitação para ver a ficha.</p>
      </div>
      {queue.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">
          Nenhuma solicitação aguardando a farmácia neste filtro.
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {queue.map((prescription) => (
            <PrescriptionTile
              key={prescription.key}
              prescription={prescription}
              deviceId={deviceId}
              now={now}
              onOpen={() => setOpenKey(prescription.key)}
            />
          ))}
        </div>
      )}
      <PrescriptionSheet
        key={openKey ?? 'fechada'}
        organizationId={organizationId}
        prescription={open}
        deviceId={deviceId}
        now={now}
        onClose={() => setOpenKey(null)}
      />
    </section>
  );
}

function RejectForm({
  isSaving,
  onCancel,
  onConfirm,
}: {
  readonly isSaving: boolean;
  readonly onCancel: () => void;
  readonly onConfirm: (reason: string) => void;
}) {
  const [reason, setReason] = useState('');
  return (
    <div className="space-y-3 rounded-lg border-2 border-red-300 p-3 dark:border-red-900">
      <Label className="text-base">Justificativa da rejeição (a enfermagem verá este texto)</Label>
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
        placeholder="Escreva a justificativa"
        rows={2}
        aria-label="Justificativa da rejeição"
      />
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button variant="ghost" onClick={onCancel} disabled={isSaving}>
          Voltar
        </Button>
        <Button
          variant="destructive"
          disabled={!reason.trim() || isSaving}
          onClick={() => onConfirm(reason)}
          data-testid="confirm-reject"
        >
          Confirmar rejeição
        </Button>
      </div>
    </div>
  );
}

type Pharmacist = { name: string; crf: string };

/** Identification asked when the pharmacy accepts a medication. */
function AcceptForm({
  itemId,
  pharmacist,
  isSaving,
  onChange,
  onCancel,
  onConfirm,
}: {
  readonly itemId: string;
  readonly pharmacist: Pharmacist;
  readonly isSaving: boolean;
  readonly onChange: (pharmacist: Pharmacist) => void;
  readonly onCancel: () => void;
  readonly onConfirm: () => void;
}) {
  const ready = pharmacist.name.trim() !== '' && pharmacist.crf.trim() !== '';
  return (
    <div className="space-y-3 rounded-lg border-2 border-primary/40 p-3">
      <p className="font-semibold">Identificação do profissional da farmácia</p>
      <div className="grid gap-3 sm:grid-cols-[2fr_1fr]">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`aceite-nome-${itemId}`} className="text-base">
            Nome
          </Label>
          <Input
            id={`aceite-nome-${itemId}`}
            className="h-11"
            value={pharmacist.name}
            onChange={(event) => onChange({ ...pharmacist, name: event.target.value })}
            autoComplete="off"
            maxLength={80}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`aceite-crf-${itemId}`} className="text-base">
            Nº de identificação
          </Label>
          <Input
            id={`aceite-crf-${itemId}`}
            className="h-11"
            value={pharmacist.crf}
            onChange={(event) => onChange({ ...pharmacist, crf: event.target.value })}
            autoComplete="off"
            maxLength={80}
          />
        </div>
      </div>
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button variant="ghost" onClick={onCancel} disabled={isSaving}>
          Voltar
        </Button>
        <Button disabled={!ready || isSaving} onClick={onConfirm} data-testid="confirm-accept">
          <Check className="mr-2 h-4 w-4" />
          Confirmar aceite
        </Button>
      </div>
    </div>
  );
}

function SheetItem({
  item,
  now,
  canAccept,
  canSend,
  canReject,
  isSaving,
  pharmacist,
  onPharmacistChange,
  onAccept,
  onSend,
  onReject,
}: {
  readonly item: MedicationRequest;
  readonly now: number;
  readonly canAccept: boolean;
  readonly canSend: boolean;
  readonly canReject: boolean;
  readonly isSaving: boolean;
  readonly pharmacist: Pharmacist;
  readonly onPharmacistChange: (pharmacist: Pharmacist) => void;
  readonly onAccept: () => void;
  readonly onSend: (refrigerated: boolean) => void;
  readonly onReject: (reason: string) => void;
}) {
  const [isRejecting, setIsRejecting] = useState(false);
  const [refrigerated, setRefrigerated] = useState(false);
  const [isAccepting, setIsAccepting] = useState(false);
  // Location and requester are shown once for the whole prescription.
  const fields = requestFields(item, now).filter(
    (field) => field.label !== 'Setor e leito' && field.label !== 'Solicitado por'
  );

  return (
    <li className="space-y-3 rounded-xl border p-3" data-testid="sheet-item">
      <div className="flex flex-wrap items-center gap-2">
        {item.itemCount > 1 ? (
          <span className="text-sm font-semibold text-muted-foreground">
            Medicamento {item.itemIndex} de {item.itemCount}
          </span>
        ) : null}
        <UrgencyBadge urgency={item.urgency} />
        <StatusBadge status={item.status} />
        {item.refrigerated ? <RefrigeratedBadge /> : null}
      </div>
      <DeliveryErrorNotice request={item} now={now} />
      <dl className="divide-y rounded-lg border">
        {fields.map((field) => (
          <div key={field.label} className="grid grid-cols-[minmax(0,11rem)_1fr] gap-3 px-3 py-2">
            <dt className="text-sm text-muted-foreground">{field.label}</dt>
            <dd className="font-medium">{field.value}</dd>
          </div>
        ))}
      </dl>
      {item.status === 'recusado' && item.refusalReason ? (
        <p className="font-medium text-red-700 dark:text-red-300">
          Justificativa da rejeição: {item.refusalReason}
        </p>
      ) : null}
      {isAccepting && canAccept ? (
        <AcceptForm
          itemId={item._id}
          pharmacist={pharmacist}
          isSaving={isSaving}
          onChange={onPharmacistChange}
          onCancel={() => setIsAccepting(false)}
          onConfirm={() => {
            onAccept();
            setIsAccepting(false);
          }}
        />
      ) : isRejecting ? (
        <RejectForm
          isSaving={isSaving}
          onCancel={() => setIsRejecting(false)}
          onConfirm={(reason) => {
            onReject(reason);
            setIsRejecting(false);
          }}
        />
      ) : canAccept || canSend || canReject ? (
        <div className="space-y-3">
          {canSend ? (
            <Label
              htmlFor={`refrigerado-${item._id}`}
              className="flex cursor-pointer items-center gap-3 rounded-lg border-2 border-sky-300 bg-sky-50 p-3 text-base font-medium dark:border-sky-800 dark:bg-sky-950/40"
            >
              <Checkbox
                id={`refrigerado-${item._id}`}
                checked={refrigerated}
                onCheckedChange={(value) => setRefrigerated(value === true)}
                data-testid="mark-refrigerated"
              />
              <Snowflake className="h-4 w-4 text-sky-700 dark:text-sky-300" aria-hidden="true" />
              Medicamento refrigerado (avisar a enfermagem para guardar na geladeira)
            </Label>
          ) : null}
          <div className="flex flex-wrap gap-2">
            {canAccept ? (
              <Button
                size="lg"
                disabled={isSaving}
                onClick={() => setIsAccepting(true)}
                data-testid="accept-request"
              >
                <Check className="mr-2 h-4 w-4" />
                Aceitar
              </Button>
            ) : null}
            {canSend ? (
              <Button
                size="lg"
                disabled={isSaving}
                onClick={() => onSend(refrigerated)}
                data-testid="mark-sent"
              >
                <Send className="mr-2 h-4 w-4" />
                Marcar como enviado
              </Button>
            ) : null}
            {canReject ? (
              <Button
                size="lg"
                variant="outline"
                className="border-2 border-red-300 text-red-700 hover:bg-red-50 dark:border-red-900 dark:text-red-300 dark:hover:bg-red-950"
                disabled={isSaving}
                onClick={() => setIsRejecting(true)}
                data-testid="reject-request"
              >
                <X className="mr-2 h-4 w-4" />
                Rejeitar
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}
    </li>
  );
}

function PrescriptionSheet({
  organizationId,
  prescription,
  deviceId,
  now,
  onClose,
}: {
  readonly organizationId: string;
  readonly prescription: Prescription | null;
  readonly deviceId: string;
  readonly now: number;
  readonly onClose: () => void;
}) {
  const acceptRequest = useMutation(api.medications.acceptRequest);
  const markSent = useMutation(api.medications.markSent);
  const refuse = useMutation(api.medications.refuse);
  const [isSaving, setIsSaving] = useState(false);
  // Typed once per open ficha so accepting several medications does not ask again; not stored.
  const [pharmacist, setPharmacist] = useState<Pharmacist>({ name: '', crf: '' });

  const run = async (action: () => Promise<unknown>, success: string) => {
    setIsSaving(true);
    try {
      await action();
      toast.success(success);
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setIsSaving(false);
    }
  };

  const held = prescription ? isHeldElsewhere(prescription, deviceId) : false;
  const stillOpen = prescription?.items.some(IN_QUEUE) ?? false;
  const requester = prescription ? requesterLabel(prescription) : null;

  return (
    <Dialog open={prescription !== null} onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        {prescription ? (
          <>
            <DialogHeader>
              <DialogTitle className="flex flex-wrap items-center gap-2 text-2xl">
                {requestTitle(prescription)}
                {prescription.items.length > 1 ? (
                  <span className="rounded-full bg-secondary px-3 py-0.5 text-sm font-semibold text-secondary-foreground">
                    {medicationCountLabel(prescription.items.length)}
                  </span>
                ) : null}
              </DialogTitle>
              <DialogDescription>
                Pedida {formatElapsed(prescription.createdAt, now)}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-1 rounded-lg bg-muted px-3 py-2">
              <p className="font-semibold">
                {formatLocation(prescription.sectorName, prescription.bedLabel)}
              </p>
              <p className="text-sm">
                Solicitado por: <span className="font-medium">{requester ?? 'Não informado'}</span>
              </p>
            </div>

            {held ? (
              <p className="flex items-center gap-2 rounded-lg bg-muted p-3 font-medium">
                <Lock className="h-4 w-4" />
                Solicitação em andamento em outro aparelho da farmácia.
              </p>
            ) : !stillOpen ? (
              <p className="flex items-center gap-2 rounded-lg bg-muted p-3 font-medium">
                <Lock className="h-4 w-4" />
                Esta solicitação já saiu da fila da farmácia.
              </p>
            ) : null}

            <ul className="space-y-3">
              {prescription.items.map((item) => {
                const mine = item.status === 'em_separacao' && item.acceptedByDevice === deviceId;
                return (
                  <SheetItem
                    key={item._id}
                    item={item}
                    now={now}
                    isSaving={isSaving}
                    pharmacist={pharmacist}
                    onPharmacistChange={setPharmacist}
                    canAccept={!held && item.status === 'solicitado'}
                    canSend={!held && mine}
                    canReject={!held && (mine || item.status === 'solicitado')}
                    onAccept={() =>
                      void run(
                        () =>
                          acceptRequest({
                            organizationId,
                            requestId: item._id,
                            deviceId,
                            pharmacistName: pharmacist.name,
                            pharmacistCrf: pharmacist.crf,
                          }),
                        `${item.medication} aceito: em preparação`
                      )
                    }
                    onSend={(refrigerated) =>
                      void run(
                        () =>
                          markSent({ organizationId, requestId: item._id, deviceId, refrigerated }),
                        `${item.medication} enviado para ${prescription.sectorName} · ${prescription.bedLabel}${refrigerated ? ' (refrigerado)' : ''}`
                      )
                    }
                    onReject={(reason) =>
                      void run(
                        () => refuse({ organizationId, requestId: item._id, reason, deviceId }),
                        `${item.medication} rejeitado. A enfermagem verá a justificativa.`
                      )
                    }
                  />
                );
              })}
            </ul>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
