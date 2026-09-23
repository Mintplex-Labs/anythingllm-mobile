import { useCallback, useEffect, useRef, useState } from 'react';
import DeviceInfo from 'react-native-device-info';
import uiStore from '@/store/UIStore';
import Telemetry from '@/utils/Telemetry';
import { navigateWhenReady } from '@/utils/navigationRef';
import { tourDeck, whatsNewDeck, type HighlightsDeck } from '@/utils/highlights';
import HighlightsCarousel from './index';

/** Let the destination screen mount and settle before the sheet slides over it */
const SHOW_DELAY_MS = 1200;

type Audience = 'new_user' | 'upgrade';

/**
 * Mounted once at the app root. Decides when the highlights carousel shows on its own:
 *  - a **fresh install** gets the evergreen tour right after onboarding lands on the first chat
 *  - an **existing install** gets everything that shipped since the version it last dismissed
 *    the carousel on, the first time it launches after an update (skipped releases aggregate)
 * Both stamp `highlights_last_seen_version` with the installed version on dismiss, so a new user
 * who just took the tour is not shown the same features again as "new", and an upgrade shows once.
 * Settings reopens either deck on demand through `HighlightsCarousel` directly.
 */
export default function HighlightsHost() {
  const [deck, setDeck] = useState<HighlightsDeck | null>(null);
  const [visible, setVisible] = useState(false);
  const audience = useRef<Audience>('upgrade');

  const present = useCallback((next: HighlightsDeck | null, who: Audience) => {
    if (!next) return;
    audience.current = who;
    setDeck(next);
    setTimeout(() => setVisible(true), SHOW_DELAY_MS);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const onboarded = await uiStore.getFromStorage('onboarding_data_handling_completed', false);
      if (cancelled || !onboarded) return; // fresh install - wait for onboarding to finish below
      const lastSeen = await uiStore.getFromStorage<string | null>('highlights_last_seen_version', null);
      if (cancelled) return;
      present(whatsNewDeck(lastSeen), 'upgrade');
    })();
    const sub = uiStore.emitter.addListener(uiStore.globalEvents.ONBOARDING_COMPLETED, () => present(tourDeck(), 'new_user'));
    return () => { cancelled = true; sub.remove(); };
  }, [present]);

  const dismiss = useCallback(() => {
    setVisible(false);
    uiStore.setToStorage('highlights_last_seen_version', DeviceInfo.getVersion());
    if (deck) Telemetry.logEvent(Telemetry.CUSTOM_EVENTS.ACTIONS.HIGHLIGHTS_VIEWED, { audience: audience.current, cards: deck.cards.length });
  }, [deck]);

  return (
    <HighlightsCarousel
      visible={visible}
      deck={deck}
      onClose={dismiss}
      onCta={(cta) => navigateWhenReady(cta.route, cta.params)}
    />
  );
}
