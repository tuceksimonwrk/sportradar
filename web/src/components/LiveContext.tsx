import { createContext, useContext } from 'react';
import type { LiveInfo } from '../useLiveScores';

export const LiveContext = createContext<LiveInfo>({ states: new Map(), unavailable: new Set(), proxyDown: false });
export const useLive = () => useContext(LiveContext);
