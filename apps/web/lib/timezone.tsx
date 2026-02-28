'use client';

import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { getTimezone, setTimezone } from './auth';

interface TimezoneContextValue {
  timezone: string;
  setTz: (tz: string) => void;
  formatDate: (value: string | Date) => string;
}

const TimezoneContext = createContext<TimezoneContextValue | null>(null);

export const TimezoneProvider = ({ children }: { children: React.ReactNode }) => {
  const [timezone, setTimezoneState] = useState('Asia/Kolkata');

  useEffect(() => {
    setTimezoneState(getTimezone());
  }, []);

  const value = useMemo<TimezoneContextValue>(
    () => ({
      timezone,
      setTz: (tz: string) => {
        setTimezoneState(tz);
        setTimezone(tz);
      },
      formatDate: (value: string | Date) =>
        new Intl.DateTimeFormat('en-IN', {
          dateStyle: 'medium',
          timeStyle: 'short',
          timeZone: timezone,
        }).format(new Date(value)),
    }),
    [timezone],
  );

  return <TimezoneContext.Provider value={value}>{children}</TimezoneContext.Provider>;
};

export const useTimezone = () => {
  const ctx = useContext(TimezoneContext);
  if (!ctx) {
    throw new Error('useTimezone must be used within TimezoneProvider');
  }
  return ctx;
};
