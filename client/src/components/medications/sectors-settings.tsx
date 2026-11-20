import { useState, type FormEvent } from 'react';
import { useMutation, useQuery } from 'convex/react';
import { toast } from 'sonner';
import { BedDouble, Plus, RotateCcw, Save, Trash2 } from 'lucide-react';
import { usePermission } from '@djpanda/convex-tenants/react';
import { api } from '../../../../convex/_generated/api';
import type { Id } from '../../../../convex/_generated/dataModel';
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
import { errorMessage } from './shared';

const MAX_BEDS = 100;

type StructureSector = {
  _id: Id<'sectors'>;
  name: string;
  active: boolean;
  bedCount: number;
  bedLabels: ReadonlyArray<string>;
  hasRequests: boolean;
};

function parseBedCount(value: string) {
  const count = Number(value);
  return Number.isInteger(count) && count >= 1 && count <= MAX_BEDS ? count : null;
}

function NewSectorForm({ organizationId }: { readonly organizationId: string }) {
  const createSector = useMutation(api.hospitalStructure.createSector);
  const [name, setName] = useState('');
  const [beds, setBeds] = useState('1');
  const [isSaving, setIsSaving] = useState(false);
  const bedCount = parseBedCount(beds);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim() || bedCount === null) {
      return;
    }
    setIsSaving(true);
    try {
      await createSector({ organizationId, name, bedCount });
      toast.success(
        `Setor "${name.trim()}" criado com ${bedCount} ${bedCount === 1 ? 'leito' : 'leitos'}`
      );
      setName('');
      setBeds('1');
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-3 rounded-xl border bg-card p-4 shadow-sm sm:flex-row sm:items-end"
      data-testid="new-sector-form"
    >
      <div className="flex flex-1 flex-col gap-1.5">
        <Label htmlFor="novo-setor-nome">Nome do setor</Label>
        <Input
          id="novo-setor-nome"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Ex.: UTI Adulto, Enfermaria Clínica"
          maxLength={60}
          autoComplete="off"
        />
      </div>
      <div className="flex flex-col gap-1.5 sm:w-44">
        <Label htmlFor="novo-setor-leitos">Quantidade de leitos</Label>
        <Input
          id="novo-setor-leitos"
          type="number"
          min={1}
          max={MAX_BEDS}
          step={1}
          value={beds}
          onChange={(event) => setBeds(event.target.value)}
        />
      </div>
      <Button type="submit" disabled={!name.trim() || bedCount === null || isSaving}>
        <Plus className="mr-1 h-4 w-4" />
        {isSaving ? 'Adicionando...' : 'Adicionar setor'}
      </Button>
    </form>
  );
}

function SectorCard({
  organizationId,
  sector,
  onRemove,
}: {
  readonly organizationId: string;
  readonly sector: StructureSector;
  readonly onRemove: (sector: StructureSector) => void;
}) {
  const renameSector = useMutation(api.hospitalStructure.renameSector);
  const setBedCount = useMutation(api.hospitalStructure.setBedCount);
  const [name, setName] = useState(sector.name);
  const [beds, setBeds] = useState(String(sector.bedCount));
  const [isSaving, setIsSaving] = useState(false);
  const bedCount = parseBedCount(beds);
  const nameChanged = name.trim() !== sector.name;
  const bedsChanged = bedCount !== null && bedCount !== sector.bedCount;

  const handleSave = async () => {
    if (!name.trim() || bedCount === null) {
      return;
    }
    setIsSaving(true);
    try {
      if (nameChanged) {
        await renameSector({ organizationId, sectorId: sector._id, name });
      }
      if (bedsChanged) {
        await setBedCount({ organizationId, sectorId: sector._id, bedCount });
      }
      toast.success(`Setor "${name.trim()}" atualizado`);
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setIsSaving(false);
    }
  };

  const reducing = bedCount !== null && bedCount < sector.bedCount;

  return (
    <li className="space-y-3 rounded-xl border bg-card p-4 shadow-sm" data-testid="sector-card">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex flex-1 flex-col gap-1.5">
          <Label htmlFor={`setor-${sector._id}-nome`}>Nome do setor</Label>
          <Input
            id={`setor-${sector._id}-nome`}
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={60}
          />
        </div>
        <div className="flex flex-col gap-1.5 sm:w-44">
          <Label htmlFor={`setor-${sector._id}-leitos`}>Quantidade de leitos</Label>
          <Input
            id={`setor-${sector._id}-leitos`}
            type="number"
            min={1}
            max={MAX_BEDS}
            step={1}
            value={beds}
            onChange={(event) => setBeds(event.target.value)}
          />
        </div>
        <div className="flex gap-2">
          <Button
            onClick={() => void handleSave()}
            disabled={
              (!nameChanged && !bedsChanged) || !name.trim() || bedCount === null || isSaving
            }
            data-testid="save-sector"
          >
            <Save className="mr-1 h-4 w-4" />
            {isSaving ? 'Salvando...' : 'Salvar'}
          </Button>
          <Button
            variant="outline"
            onClick={() => onRemove(sector)}
            aria-label={`Remover o setor ${sector.name}`}
            data-testid="remove-sector"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>
      {reducing ? (
        <p className="text-sm text-muted-foreground">
          Os leitos a partir do Leito {String(bedCount + 1).padStart(2, '0')} serão retirados.
          Leitos que já tiveram pedidos ficam guardados no Histórico.
        </p>
      ) : null}
      <div className="flex flex-wrap gap-1.5" aria-label={`Leitos de ${sector.name}`}>
        {sector.bedLabels.map((label) => (
          <span
            key={label}
            className="inline-flex items-center gap-1 rounded-md bg-secondary px-2 py-0.5 text-xs font-normal text-secondary-foreground"
          >
            <BedDouble className="h-3 w-3" aria-hidden="true" />
            {label}
          </span>
        ))}
      </div>
    </li>
  );
}

/** Settings > Setores e leitos: the hospital builds its own sectors and bed counts. */
export function SectorsSettings({ organizationId }: { readonly organizationId: string }) {
  const structure = useQuery(api.hospitalStructure.listStructure, { organizationId });
  const removeSector = useMutation(api.hospitalStructure.removeSector);
  const reactivateSector = useMutation(api.hospitalStructure.reactivateSector);
  const canManage = usePermission({
    organizationId,
    permission: 'settings:manage',
    checkPermissionQuery: api.tenants.checkPermission,
  });
  const [removing, setRemoving] = useState<StructureSector | null>(null);
  const [isRemoving, setIsRemoving] = useState(false);

  if (structure === undefined || canManage.isLoading) {
    return <p className="text-muted-foreground">Carregando setores e leitos...</p>;
  }
  if (!canManage.allowed) {
    return (
      <p className="rounded-lg border border-dashed p-6 text-center text-muted-foreground">
        Só a administração do hospital pode alterar setores e leitos.
      </p>
    );
  }

  const active = structure.filter((sector) => sector.active);
  const inactive = structure.filter((sector) => !sector.active);
  const totalBeds = active.reduce((sum, sector) => sum + sector.bedCount, 0);

  const confirmRemove = async () => {
    if (!removing) return;
    setIsRemoving(true);
    try {
      const { result } = await removeSector({ organizationId, sectorId: removing._id });
      toast.success(
        result === 'excluido'
          ? `Setor "${removing.name}" excluído`
          : `Setor "${removing.name}" desativado. Os pedidos antigos continuam no Histórico.`
      );
      setRemoving(null);
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setIsRemoving(false);
    }
  };

  return (
    <div className="space-y-6" data-testid="sectors-settings">
      <div>
        <h2 className="text-xl font-semibold">Setores e leitos</h2>
        <p className="text-muted-foreground">
          {active.length === 1 ? '1 setor' : `${active.length} setores`} ·{' '}
          {totalBeds === 1 ? '1 leito' : `${totalBeds} leitos`}. Os leitos são numerados
          automaticamente (Leito 01, Leito 02...).
        </p>
      </div>

      <NewSectorForm organizationId={organizationId} />

      {active.length === 0 ? (
        <p className="rounded-lg border border-dashed p-6 text-center text-muted-foreground">
          Nenhum setor cadastrado ainda. Adicione o primeiro acima.
        </p>
      ) : (
        <ul className="space-y-3">
          {active.map((sector) => (
            <SectorCard
              key={`${sector._id}-${sector.name}-${sector.bedCount}`}
              organizationId={organizationId}
              sector={sector}
              onRemove={setRemoving}
            />
          ))}
        </ul>
      )}

      {inactive.length > 0 ? (
        <section className="space-y-2">
          <h3 className="text-base font-semibold">Setores desativados</h3>
          <p className="text-sm text-muted-foreground">
            Não aparecem para a enfermagem e a farmácia, mas os pedidos antigos continuam no
            Histórico.
          </p>
          <ul className="space-y-2">
            {inactive.map((sector) => (
              <li
                key={sector._id}
                className="flex items-center justify-between gap-3 rounded-lg border border-dashed p-3"
              >
                <span>{sector.name}</span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    reactivateSector({ organizationId, sectorId: sector._id, bedCount: 1 })
                      .then(() =>
                        toast.success(
                          `Setor "${sector.name}" reativado com 1 leito. Ajuste a quantidade acima.`
                        )
                      )
                      .catch((error: unknown) => toast.error(errorMessage(error)))
                  }
                >
                  <RotateCcw className="mr-1 h-4 w-4" />
                  Reativar
                </Button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <Dialog
        open={removing !== null}
        onOpenChange={(open) => (open ? undefined : setRemoving(null))}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Remover o setor {removing?.name}?</DialogTitle>
            <DialogDescription>
              {removing?.hasRequests
                ? 'Este setor já tem pedidos. Ele será desativado: some das telas de enfermagem e farmácia, mas os pedidos antigos continuam no Histórico.'
                : 'Este setor nunca teve pedidos e será excluído com todos os seus leitos.'}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="ghost" onClick={() => setRemoving(null)}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              disabled={isRemoving}
              onClick={() => void confirmRemove()}
              data-testid="confirm-remove-sector"
            >
              {isRemoving
                ? 'Removendo...'
                : removing?.hasRequests
                  ? 'Desativar setor'
                  : 'Excluir setor'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
