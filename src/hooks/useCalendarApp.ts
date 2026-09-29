import { useEffect, useState } from 'react';
import { getCalendarApp } from '@/utils/calendar';
import { type MessagingApp } from '@/utils/messaging';

/**
 * The calendar app events open in, for its icon on event cards and calendar sources. Null off
 * Android, or when several are installed with no default (Android then asks which one to use).
 */
export default function useCalendarApp(): MessagingApp | null {
  const [app, setApp] = useState<MessagingApp | null>(null);
  useEffect(() => {
    let cancelled = false;
    getCalendarApp().then(found => { if (!cancelled) setApp(found); });
    return () => { cancelled = true; };
  }, []);
  return app;
}
