import { useState, type FormEvent } from 'react';
import { useMutation } from 'convex/react';
import { toast } from 'sonner';
import { api } from '../../../../convex/_generated/api';
import type { Id } from '../../../../convex/_generated/dataModel';
import {
  MEDICATION_ROUTES,
  URGENCY_LABEL,
  type Urgency,
} from '../../../../convex/lib/medicationOptions';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { URGENCY_STYLE, formatLocation, type BedFilterValue, type SectorWithBeds } from './shared';

const URGENCY_HINT: Record<Urgency, string> = {
  urgente: 'Risco imediato ao paciente',
  prioritario: 'Precisa ser atendido logo',
  rotina: 'Pode seguir a ordem normal',
};

type FormState = {
  sectorId: Id<'sectors'> | null;
  bedId: Id<'beds'> | null;
  medication: string;
  quantity: string;
  dose: string;
  route: string;
  urgency: Urgency | null;
  notes: string;
};

function initialState(preset: BedFilterValue): FormState {
  return {
    sectorId: preset.sectorId,
    bedId: preset.bedId,
    medication: '',
    quantity: '1',
    dose: '',
    route: '',
    urgency: null,
    notes: '',
  };
}

export function NewRequestDialog({
  open,
  onOpenChange,
  organizationId,
  sectors,
  preset,
}: {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly organizationId: string;
  readonly sectors: ReadonlyArray<SectorWithBeds>;
  readonly preset: BedFilterValue;
}) {
  const createRequest = useMutation(api.medications.createRequest);
  // The parent remounts this dialog (via `key`) each time it opens, so the form starts fresh
  // with the sector/bed filter that was active at that moment.
  const [form, setForm] = useState<FormState>(() => initialState(preset));
  const [isSaving, setIsSaving] = useState(false);

  const sector = sectors.find((item) => item._id === form.sectorId) ?? null;
  const bed = sector?.beds.find((item) => item._id === form.bedId) ?? null;
  const quantity = Number(form.quantity);
  const missing: string[] = [];
  if (!bed) missing.push('setor e leito');
  if (!form.medication.trim()) missing.push('medicamento');
  if (!Number.isInteger(quantity) || quantity < 1) missing.push('quantidade');
  if (!form.dose.trim()) missing.push('dose');
  if (!form.route) missing.push('via');
  if (!form.urgency) missing.push('urgência');

  const update = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((current) => ({ ...current, [key]: value }));

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (missing.length > 0 || !sector || !bed || !form.urgency) {
      return;
    }
    setIsSaving(true);
    try {
      await createRequest({
        organizationId,
        bedId: bed._id,
        medication: form.medication,
        quantity,
        dose: form.dose,
        route: form.route,
        urgency: form.urgency,
        notes: form.notes.trim() ? form.notes : undefined,
      });
      toast.success(
        `Solicitação enviada para a farmácia (${formatLocation(sector.name, bed.label)})`
      );
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível enviar a solicitação');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <form onSubmit={handleSubmit} className="space-y-5" data-testid="new-request-form">
          <DialogHeader>
            <DialogTitle>Nova solicitação de medicamento</DialogTitle>
            <DialogDescription>
              A farmácia recebe o pedido na hora, organizado pela urgência.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="nova-setor">Setor</Label>
              <Select
                value={form.sectorId ?? undefined}
                onValueChange={(value) =>
                  setForm((current) => ({
                    ...current,
                    sectorId: value as Id<'sectors'>,
                    bedId: null,
                  }))
                }
              >
                <SelectTrigger id="nova-setor">
                  <SelectValue placeholder="Escolha o setor" />
                </SelectTrigger>
                <SelectContent>
                  {sectors.map((item) => (
                    <SelectItem key={item._id} value={item._id}>
                      Setor: {item.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="nova-leito">Leito</Label>
              <Select
                value={form.bedId ?? undefined}
                disabled={!sector}
                onValueChange={(value) => update('bedId', value as Id<'beds'>)}
              >
                <SelectTrigger id="nova-leito">
                  <SelectValue placeholder={sector ? 'Escolha o leito' : 'Escolha o setor antes'} />
                </SelectTrigger>
                <SelectContent>
                  {sector?.beds.map((item) => (
                    <SelectItem key={item._id} value={item._id}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          {sector && bed ? (
            <p className="-mt-2 rounded-md bg-muted px-3 py-2 text-sm font-medium">
              Destino: {formatLocation(sector.name, bed.label)}
            </p>
          ) : null}

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="nova-medicamento">Medicamento</Label>
            <Input
              id="nova-medicamento"
              value={form.medication}
              onChange={(event) => update('medication', event.target.value)}
              placeholder="Ex.: Dipirona"
              autoComplete="off"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="nova-dose">Dose</Label>
              <Input
                id="nova-dose"
                value={form.dose}
                onChange={(event) => update('dose', event.target.value)}
                placeholder="Ex.: 500 mg"
                autoComplete="off"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="nova-via">Via</Label>
              <Select
                value={form.route || undefined}
                onValueChange={(value) => update('route', value)}
              >
                <SelectTrigger id="nova-via">
                  <SelectValue placeholder="Escolha" />
                </SelectTrigger>
                <SelectContent>
                  {MEDICATION_ROUTES.map((route) => (
                    <SelectItem key={route} value={route}>
                      {route}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="nova-quantidade">Quantidade</Label>
              <Input
                id="nova-quantidade"
                type="number"
                min={1}
                max={999}
                step={1}
                value={form.quantity}
                onChange={(event) => update('quantity', event.target.value)}
              />
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <Label>Urgência</Label>
            <RadioGroup
              value={form.urgency ?? ''}
              onValueChange={(value) => update('urgency', value as Urgency)}
              className="grid gap-2 sm:grid-cols-3"
            >
              {(Object.keys(URGENCY_LABEL) as Urgency[]).map((urgency) => (
                <Label
                  key={urgency}
                  htmlFor={`urgencia-${urgency}`}
                  className={cn(
                    'flex cursor-pointer flex-col gap-1 rounded-lg border-2 p-3 font-normal transition-colors',
                    form.urgency === urgency ? URGENCY_STYLE[urgency].ring : 'border-muted'
                  )}
                >
                  <span className="flex items-center gap-2 font-semibold">
                    <RadioGroupItem id={`urgencia-${urgency}`} value={urgency} />
                    <span className={cn('h-2.5 w-2.5 rounded-full', URGENCY_STYLE[urgency].dot)} />
                    {URGENCY_LABEL[urgency]}
                  </span>
                  <span className="text-xs text-muted-foreground">{URGENCY_HINT[urgency]}</span>
                </Label>
              ))}
            </RadioGroup>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="nova-observacao">
              Observação <span className="font-normal text-muted-foreground">(opcional)</span>
            </Label>
            <Textarea
              id="nova-observacao"
              value={form.notes}
              onChange={(event) => update('notes', event.target.value)}
              placeholder="Recado para a farmácia"
              rows={2}
            />
          </div>

          <DialogFooter className="gap-2 sm:items-center">
            {missing.length > 0 ? (
              <p className="text-xs text-muted-foreground sm:mr-auto">
                Falta preencher: {missing.join(', ')}
              </p>
            ) : null}
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={missing.length > 0 || isSaving}>
              {isSaving ? 'Enviando...' : 'Enviar para a farmácia'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
