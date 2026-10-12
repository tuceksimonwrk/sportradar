import { describe, expect, it } from 'vitest';
import { MONOGRAM_PALETTE, monogramColor, monogramText } from './crest';

function luminance(hex: string): number {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
const contrastWithWhite = (hex: string) => 1.05 / (luminance(hex) + 0.05);

describe('monogramText', () => {
  it('krátká přípona id', () => {
    expect(monogramText('cz-hockey:PCE', 'HC Dynamo Pardubice')).toBe('PCE');
    expect(monogramText('nhl:pit', 'Pittsburgh Penguins')).toBe('PIT');
    expect(monogramText('nba:LA', 'Los Angeles')).toBe('LA');
  });
  it('dlouhé id → iniciály bez HC/BK', () => {
    expect(monogramText('cz-basket:bk-kvis-pardubice', 'BK KVIS Pardubice')).toBe('KP');
    expect(monogramText('cz-basket:x-y', 'ERA Basketball Nymburk')).toBe('EN');
    expect(monogramText(undefined, 'Bílí Tygři Liberec')).toBe('BL');
    expect(monogramText(undefined, 'Č. Budějovice')).toBe('ČB');
  });
  it('jedno slovo → 3 písmena; prázdné → ?', () => {
    expect(monogramText(undefined, 'Mercedes')).toBe('MER');
    expect(monogramText(undefined, 'HC')).toBe('HC');
    expect(monogramText(undefined, '  ')).toBe('?');
  });
});

describe('monogramColor', () => {
  it('deterministická a z palety', () => {
    expect(monogramColor('nhl:PIT')).toBe(monogramColor('nhl:PIT'));
    expect(MONOGRAM_PALETTE).toContain(monogramColor('cz-hockey:LIB'));
  });
  it('rozkládá se po paletě', () => {
    const ids = Array.from({ length: 60 }, (_, i) => `team:${i}`);
    expect(new Set(ids.map(monogramColor)).size).toBeGreaterThanOrEqual(6);
  });
  it('všechny barvy mají kontrast ≥ 4.5 s bílým textem', () => {
    for (const c of MONOGRAM_PALETTE) expect(contrastWithWhite(c)).toBeGreaterThanOrEqual(4.5);
  });
});
