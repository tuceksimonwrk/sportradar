import { describe, expect, it } from 'vitest';
import type { Team } from '@sportradar/shared';
import { favoriteFeeds, feedUrl, webcalUrl } from './calendar';

const teams: Team[] = [
  { id: 'nhl:PIT', sport: 'nhl', name: 'Pittsburgh Penguins' },
  { id: 'cz-hockey:PCE', sport: 'cz-hockey', name: 'HC Dynamo Pardubice' },
];

describe('feedUrl', () => {
  it('složka předstihu, absolutní URL od stránky, https', () => {
    expect(feedUrl('nhl_PIT.ics', 30, 'https://u.github.io/sr/')).toBe('https://u.github.io/sr/data/cal/30/nhl_PIT.ics');
    expect(feedUrl('f1.ics', 0, 'https://u.github.io/sr/index.html?x=1#fav=f1')).toBe('https://u.github.io/sr/data/cal/0/f1.ics');
    expect(feedUrl('f1.ics', 60, 'http://localhost:5199/')).toBe('https://localhost:5199/data/cal/60/f1.ics');
  });
});

describe('webcalUrl', () => {
  it('nahradí protokol za webcal', () => {
    expect(webcalUrl('https://u.github.io/sr/data/cal/15/f1.ics')).toBe('webcal://u.github.io/sr/data/cal/15/f1.ics');
    expect(webcalUrl('http://localhost:5199/data/cal/f1.ics')).toBe('webcal://localhost:5199/data/cal/f1.ics');
  });
});

describe('favoriteFeeds', () => {
  it('sport i tým → štítek a soubor; neznámý tým se přeskočí; duplicity ne', () => {
    expect(favoriteFeeds(['f1', 'cz-hockey:PCE', 'nhl:PIT', 'nhl:XXX', 'f1'], teams)).toEqual([
      { id: 'f1', label: 'Formule 1', file: 'f1.ics', sport: 'f1' },
      { id: 'cz-hockey:PCE', label: 'HC Dynamo Pardubice', file: 'cz-hockey_PCE.ics', sport: 'cz-hockey' },
      { id: 'nhl:PIT', label: 'Pittsburgh Penguins', file: 'nhl_PIT.ics', sport: 'nhl' },
    ]);
  });
  it('prázdné oblíbené → prázdný seznam', () => expect(favoriteFeeds([], teams)).toEqual([]));
});
