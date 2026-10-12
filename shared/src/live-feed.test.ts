import { describe, expect, it } from 'vitest';
import { parseLiveFeed } from './live-feed';

describe('parseLiveFeed', () => {
  it('keeps valid games and drops invalid ones', () => {
    const f = parseLiveFeed({
      source: 'nhl', fetchedAt: '2026-10-12T18:00:00Z',
      games: [
        { id: 'nhl:1', home: 'BUF', away: 'FLA', homeScore: 2, awayScore: 1, phase: 'live', clock: '2. třetina 12:34', startsAt: '2026-10-12T17:00:00Z' },
        { home: 'A', away: 'B', phase: 'weird' },
        { home: '', away: 'B', phase: 'pre' },
        { home: 'A', away: 'B', phase: 'pre', homeScore: -1, awayScore: 1.5, startsAt: 'nope' },
        null,
      ],
    });
    expect(f?.games).toEqual([
      { id: 'nhl:1', home: 'BUF', away: 'FLA', homeScore: 2, awayScore: 1, phase: 'live', clock: '2. třetina 12:34', startsAt: '2026-10-12T17:00:00Z' },
      { home: 'A', away: 'B', phase: 'pre' },
    ]);
  });
  it('rejects a bad envelope', () => {
    expect(parseLiveFeed(null)).toBeUndefined();
    expect(parseLiveFeed({ source: 'espn', games: [] })).toBeUndefined();
    expect(parseLiveFeed({ source: 'nbl' })).toBeUndefined();
    expect(parseLiveFeed([])).toBeUndefined();
  });
});
