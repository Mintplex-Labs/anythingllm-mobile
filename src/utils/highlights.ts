import semver from 'semver';
import DeviceInfo from 'react-native-device-info';

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
  title: string;
  body: string;
  media?: HighlightMedia;
  /** Optional deep link into the app, eg. open a settings page or a tool */
  cta?: { label: string; route: string; params?: Record<string, unknown> };
};

/** A set of cards ready for the carousel */
export type HighlightsDeck = {
  /** Heading shown above the pager */
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
    title: 'Ask with AnythingLLM anywhere',
    body: 'Select text in any app and tap "Ask with AnythingLLM" to polish, shorten, summarize or explain it with your model. Turn it off any time under Settings > Special tools.',
    media: { type: 'video', src: asset('1.2.0', 'quick-actions.mp4'), poster: asset('1.2.0', 'quick-actions.jpg'), aspectRatio: PHONE_PORTRAIT },
  },
  {
    id: 'share-sheet',
    since: '1.2.0',
    tour: true,
    title: 'Share anything into a chat',
    body: 'Send photos, documents and links from any app straight to AnythingLLM. They land in a new thread, attached and ready to ask about.',
    media: { type: 'video', src: asset('1.2.0', 'share-sheet.mp4'), poster: asset('1.2.0', 'share-sheet.jpg'), aspectRatio: PHONE_PORTRAIT },
  },
  {
    id: 'scheduled-jobs',
    since: '1.2.0',
    tour: true,
    title: 'Scheduled jobs',
    body: 'Ask for a recurring task - a morning news digest, a weekly check-in - and it runs on schedule, even when the app is closed. Results wait for you with a notification.',
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
  return { title: "What's new", cards };
}

/** Evergreen deck for fresh installs */
export function tourDeck(): HighlightsDeck | null {
  const cards = tourCards();
  if (!cards.length) return null;
  return { title: 'What AnythingLLM can do', cards };
}
