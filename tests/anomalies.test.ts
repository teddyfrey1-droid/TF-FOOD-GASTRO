import { describe, expect, it } from 'vitest';
import {
  detectProductAnomalies,
  detectSessionAnomalies,
  sortAnomalies,
  type ProductObservation,
  type SessionObservation,
} from '@/lib/mep/anomalies';

function session(overrides: Partial<SessionObservation> = {}): SessionObservation {
  return {
    date: '2026-08-17',
    session: 'morning',
    status: 'submitted',
    durationMinutes: 12,
    ...overrides,
  };
}

function product(overrides: Partial<ProductObservation> = {}): ProductObservation {
  return {
    date: '2026-08-17',
    productName: 'Saumon',
    qtyTotal: 5,
    targetSnapshot: 8,
    thresholdSnapshot: 4,
    isNotApplicable: false,
    ...overrides,
  };
}

describe('anomalies de session', () => {
  it('signale une session manquante', () => {
    const anomalies = detectSessionAnomalies([session()], ['2026-08-17']);
    expect(anomalies).toHaveLength(1);
    expect(anomalies[0].kind).toBe('session_manquante');
    expect(anomalies[0].message).toContain("l'après-midi");
  });

  it('ne signale rien quand les deux comptages sont validés', () => {
    const anomalies = detectSessionAnomalies(
      [session(), session({ session: 'afternoon' })],
      ['2026-08-17'],
    );
    expect(anomalies).toEqual([]);
  });

  it('signale un comptage validé en moins de deux minutes', () => {
    const anomalies = detectSessionAnomalies(
      [session({ durationMinutes: 1 }), session({ session: 'afternoon' })],
      ['2026-08-17'],
    );
    expect(anomalies.map((a) => a.kind)).toEqual(['comptage_expedie']);
  });

  it('ne compte pas un brouillon comme validé', () => {
    const anomalies = detectSessionAnomalies(
      [session({ status: 'draft' }), session({ session: 'afternoon' })],
      ['2026-08-17'],
    );
    expect(anomalies.map((a) => a.kind)).toEqual(['session_manquante']);
  });
});

describe('anomalies de produit', () => {
  it('signale une rupture avérée', () => {
    const anomalies = detectProductAnomalies([product({ qtyTotal: 0 })]);
    expect(anomalies.map((a) => a.kind)).toEqual(['rupture_averee']);
    expect(anomalies[0].severity).toBe('critique');
  });

  it('signale une variation aberrante par rapport à la veille', () => {
    const anomalies = detectProductAnomalies([
      product({ date: '2026-08-16', qtyTotal: 8 }),
      product({ date: '2026-08-17', qtyTotal: 1 }),
    ]);
    expect(anomalies.map((a) => a.kind)).toContain('variation_aberrante');
  });

  it('ne signale pas une variation normale', () => {
    const anomalies = detectProductAnomalies([
      product({ date: '2026-08-16', qtyTotal: 6 }),
      product({ date: '2026-08-17', qtyTotal: 4 }),
    ]);
    expect(anomalies).toEqual([]);
  });

  it('ignore les produits marqués non applicables', () => {
    const anomalies = detectProductAnomalies([
      product({ qtyTotal: 0, isNotApplicable: true }),
    ]);
    expect(anomalies).toEqual([]);
  });

  it('suggère d’abaisser une cible jamais atteinte', () => {
    const observations = Array.from({ length: 12 }, (_, index) =>
      product({ date: `2026-08-${String(index + 1).padStart(2, '0')}`, qtyTotal: 7 }),
    );
    const anomalies = detectProductAnomalies(observations);
    expect(anomalies.map((a) => a.kind)).toContain('cible_trop_haute');
  });

  it('ne suggère rien si le produit est déjà passé sous son seuil', () => {
    const observations = Array.from({ length: 12 }, (_, index) =>
      product({
        date: `2026-08-${String(index + 1).padStart(2, '0')}`,
        qtyTotal: index === 5 ? 3 : 7,
      }),
    );
    expect(
      detectProductAnomalies(observations).map((a) => a.kind),
    ).not.toContain('cible_trop_haute');
  });

  it('n’a pas assez de recul sur quelques jours seulement', () => {
    const observations = Array.from({ length: 4 }, (_, index) =>
      product({ date: `2026-08-0${index + 1}`, qtyTotal: 7 }),
    );
    expect(detectProductAnomalies(observations).map((a) => a.kind)).not.toContain(
      'cible_trop_haute',
    );
  });
});

describe('tri des anomalies', () => {
  it('remonte le critique, puis le plus récent', () => {
    const sorted = sortAnomalies([
      { kind: 'cible_trop_haute', severity: 'info', date: '2026-08-17', message: '' },
      { kind: 'session_manquante', severity: 'attention', date: '2026-08-15', message: '' },
      { kind: 'rupture_averee', severity: 'critique', date: '2026-08-10', message: '' },
      { kind: 'session_manquante', severity: 'attention', date: '2026-08-16', message: '' },
    ]);
    expect(sorted.map((a) => [a.severity, a.date])).toEqual([
      ['critique', '2026-08-10'],
      ['attention', '2026-08-16'],
      ['attention', '2026-08-15'],
      ['info', '2026-08-17'],
    ]);
  });
});
