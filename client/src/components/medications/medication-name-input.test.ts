import { describe, expect, it } from 'vitest';
import { findControlledSubstance } from '../../../../convex/lib/controlledSubstances';
import { suggestMedications } from './medication-name-input';

describe('suggestMedications', () => {
  it('needs at least two letters', () => {
    expect(suggestMedications('d')).toEqual([]);
  });

  it('lists names starting with what was typed, ignoring accents and case', () => {
    const suggestions = suggestMedications('DI');
    expect(suggestions.length).toBeGreaterThan(0);
    expect(suggestions.length).toBeLessThanOrEqual(10);
    expect(suggestions.every((name) => name.toLowerCase().startsWith('di'))).toBe(true);
    expect(suggestions.some((name) => name.startsWith('Dipirona'))).toBe(true);
    expect(suggestMedications('dipi')).toContain('Dipirona sódica monoidratada');
    expect(suggestMedications('fenitoi')).toContain('Fenitoína');
  });
});

describe('findControlledSubstance', () => {
  it('finds the Portaria 344 list and the required prescription', () => {
    expect(findControlledSubstance('Morfina (sulfato pentahidratado)')).toMatchObject({
      list: 'A1',
      prescriptionType: 'Notificação de Receita A (amarela)',
    });
    expect(findControlledSubstance('midazolam')?.list).toBe('B1');
    expect(findControlledSubstance('Fenitoína sódica')?.list).toBe('C1');
  });

  it('does not ask for a prescription for ordinary medications', () => {
    expect(findControlledSubstance('Dipirona sódica monoidratada')).toBeNull();
    expect(findControlledSubstance('Noradrenalina')).toBeNull();
    expect(findControlledSubstance('')).toBeNull();
  });
});
