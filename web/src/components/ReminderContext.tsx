import { createContext, useContext } from 'react';
import { REMINDER_MINUTES } from '@sportradar/shared';

export interface ReminderInfo { minutes: number; setMinutes: (m: number) => void }

/** Zvolený předstih připomínky (minuty); změna se okamžitě projeví u všech tlačítek „do kalendáře“. */
export const ReminderContext = createContext<ReminderInfo>({ minutes: REMINDER_MINUTES, setMinutes: () => {} });
export const useReminder = () => useContext(ReminderContext);
