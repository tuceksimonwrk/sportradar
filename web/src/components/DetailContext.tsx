import { createContext, useContext } from 'react';
import type { Match } from '@sportradar/shared';

export interface DetailInfo {
  ids: ReadonlySet<string>;          // zápasy s detailem (z data/detail/index.json)
  open: (match: Match) => void;      // otevře panel s detailem
}

export const DetailContext = createContext<DetailInfo>({ ids: new Set(), open: () => {} });
export const useDetail = () => useContext(DetailContext);
