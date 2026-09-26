import semver from 'semver';
import DeviceInfo from 'react-native-device-info';
import { tKey } from '@/i18n';

/**
 * Feature highlights: short media-led cards that show off what the app can do. Two audiences see
 * them, picked from the same flat list of cards:
 *
 *  - **Upgrading users** see what changed since the version they last dismissed the carousel on.
 *    Skipped releases aggregate: 1.2.0 -> 1.4.0 shows the 1.3.0 and 1.4.0 cards together.
 *    Selected by each card's `since` version - see `cardsSince`.
 *  - **New users** (fresh install) have no "new" - they get a short evergreen tour of the best
 *    features regardless of when each shipped. Selected by the `tour` flag - see `tourCards`.
 *    Curate it by hand each release: tag the cards worth a first impression, untag the ones a
 *    newer card supersedes, and keep it to about five.
 *
 * The manifest ships with the app (typed, reviewed in the PR, cannot be broken by a CDN outage)
 * while the media bytes live on the CDN so the binary stays small and clips can be re-encoded
 * without a release. A card whose media fails to load falls back to its poster, then to text only,
 * so a highlight never blocks the user.
 *
 * Media notes:
 *  - Video must be H.264 MP4. WebM does not play on iOS.
 *  - `poster` is a JPEG/PNG frame shown while the video buffers and if it fails.
 *  - `aspectRatio` is width / height of the media so the slot is sized before anything loads.
 */
export const HIGHLIGHTS_CDN_BASE = 'https://webassets.anythingllm.com/mobile';

export type HighlightMedia =
  | { type: 'video'; src: string; poster?: string; aspectRatio: number }
  | { type: 'image'; src: string; aspectRatio: number };

export type HighlightCard = {
  /** Stable id - used for keys and telemetry */
  id: string;
  /** App version that introduced the feature - drives the upgrade carousel */
  since: string;
  /** Part of the evergreen tour shown to fresh installs */
  tour?: boolean;
  /** Translation key - resolved with t() when rendered */
  title: string;
  /** Translation key - resolved with t() when rendered */
  body: string;
  media?: HighlightMedia;
  /** Optional deep link into the app, eg. open a settings page or a tool. `label` is a translation key. */
  cta?: { label: string; route: string; params?: Record<string, unknown> };
};

/** A set of cards ready for the carousel */
export type HighlightsDeck = {
  /** Heading shown above the pager - translation key */
  title: string;
  cards: HighlightCard[];
};

/** Phone screen recordings (720x1560 / 1080x2340) */
const PHONE_PORTRAIT = 720 / 1560;

const asset = (version: string, name: string) => `${HIGHLIGHTS_CDN_BASE}/${version}/${name}`;

/** Group by version, newest release first, to keep the manifest readable; `cardsSince` sorts for display. */
const HIGHLIGHTS: HighlightCard[] = [
  {
    id: 'quick-actions',
    since: '1.2.0',
    tour: true,
    title: tKey('highlights.quick_actions.title'),
    body: tKey('highlights.quick_actions.body'),
    media: { type: 'video', src: asset('1.2.0', 'quick-actions.mp4'), poster: asset('1.2.0', 'quick-actions.jpg'), aspectRatio: PHONE_PORTRAIT },
  },
  {
    id: 'share-sheet',
    since: '1.2.0',
    tour: true,
    title: tKey('highlights.share_sheet.title'),
    body: tKey('highlights.share_sheet.body'),
    media: { type: 'video', src: asset('1.2.0', 'share-sheet.mp4'), poster: asset('1.2.0', 'share-sheet.jpg'), aspectRatio: PHONE_PORTRAIT },
  },
  {
    id: 'scheduled-jobs',
    since: '1.2.0',
    tour: true,
    title: tKey('highlights.scheduled_jobs.title'),
    body: tKey('highlights.scheduled_jobs.body'),
    media: { type: 'video', src: asset('1.2.0', 'scheduled_job.mp4'), poster: asset('1.2.0', 'scheduled_job.jpg'), aspectRatio: PHONE_PORTRAIT },
  },
];

/** Normalized semver string, or null when the input is not a version */
function normalize(v: string | null | undefined): string | null {
  if (!v) return null;
  return semver.coerce(v)?.version ?? null;
}

/** Ascending by `since`, manifest order within a version */
function byVersion(a: HighlightCard, b: HighlightCard): number {
  const va = normalize(a.since);
  const vb = normalize(b.since);
  if (!va || !vb) return 0;
  return semver.compare(va, vb);
}

/**
 * Cards introduced after `lastSeen` and no later than `current` - what an upgrading user has not
 * seen yet. `lastSeen` null means never dismissed, which for an existing install (onboarding done)
 * means everything up to `current`.
 */
export function cardsSince(lastSeen: string | null, current: string = DeviceInfo.getVersion()): HighlightCard[] {
  const upper = normalize(current);
  if (!upper) return [];
  const lower = normalize(lastSeen);
  return HIGHLIGHTS
    .filter((card) => {
      const since = normalize(card.since);
      if (!since || semver.gt(since, upper)) return false;
      return lower ? semver.gt(since, lower) : true;
    })
    .sort(byVersion);
}

/** The evergreen tour for fresh installs */
export function tourCards(): HighlightCard[] {
  return HIGHLIGHTS.filter((card) => card.tour);
}

/** Upgrade deck: everything since `lastSeen`, or null when there is nothing to show */
export function whatsNewDeck(lastSeen: string | null, current: string = DeviceInfo.getVersion()): HighlightsDeck | null {
  const cards = cardsSince(lastSeen, current);
  if (!cards.length) return null;
  return { title: tKey('highlights.whats_new'), cards };
}

/** Evergreen deck for fresh installs */
export function tourDeck(): HighlightsDeck | null {
  const cards = tourCards();
  if (!cards.length) return null;
  return { title: tKey('highlights.tour_title'), cards };
}
