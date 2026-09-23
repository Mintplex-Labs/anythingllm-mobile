import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Image, Modal, Pressable, Text, TouchableOpacity, View, useWindowDimensions, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Video from 'react-native-video';
import { ArrowRight, Pause, Play, X } from 'phosphor-react-native';
import { type HighlightCard, type HighlightMedia, type HighlightsDeck } from '@/utils/highlights';

const COLORS = {
  page: '#0E0F0F',
  card: '#1B1B1E',
  muted: '#9F9FA0',
  accent: '#B2DDFF',
  dotIdle: 'rgba(255,255,255,0.25)',
};

/**
 * Swipeable pager of highlight cards. Each card has a media slot (video or image, both remote)
 * over a title and body, with an optional call to action. Only the visible card's video plays.
 *
 * Presented as a full-screen modal so it works from anywhere: over the first chat after
 * onboarding, over whatever screen is up when an update lands, and from Settings.
 */
export default function HighlightsCarousel({
  visible,
  deck,
  onClose,
  onCta,
}: {
  visible: boolean;
  deck: HighlightsDeck | null;
  /** Called when the user finishes or skips - stamp the version as seen here */
  onClose: () => void;
  /** Navigate to a card's deep link. The carousel closes first. */
  onCta?: (cta: NonNullable<HighlightCard['cta']>) => void;
}) {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const listRef = useRef<FlatList<HighlightCard>>(null);
  const [index, setIndex] = useState(0);
  const cards = deck?.cards ?? [];
  const last = index >= cards.length - 1;

  useEffect(() => { if (visible) setIndex(0); }, [visible]);

  const onScrollEnd = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const next = Math.round(event.nativeEvent.contentOffset.x / width);
    if (next !== index) setIndex(Math.max(0, Math.min(cards.length - 1, next)));
  }, [width, index, cards.length]);

  const goNext = () => {
    if (last) return onClose();
    listRef.current?.scrollToIndex({ index: index + 1, animated: true });
    setIndex(index + 1);
  };

  if (!deck || !cards.length) return null;

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <View style={{ flex: 1, backgroundColor: COLORS.page, paddingTop: insets.top + 12, paddingBottom: insets.bottom + 16 }}>
        {/* Header */}
        <View className="flex flex-row items-center justify-between" style={{ paddingHorizontal: 20, marginBottom: 8 }}>
          <Text className="text-white text-lg font-semibold">{deck.title}</Text>
          <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityLabel="Close">
            <X size={22} color="#FFF" />
          </TouchableOpacity>
        </View>

        <FlatList
          ref={listRef}
          data={cards}
          horizontal
          pagingEnabled
          bounces={false}
          showsHorizontalScrollIndicator={false}
          keyExtractor={(card) => card.id}
          onMomentumScrollEnd={onScrollEnd}
          getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
          renderItem={({ item, index: i }) => (
            <View style={{ width }}>
              <HighlightPage card={item} active={visible && i === index} onCta={(cta) => { onClose(); onCta?.(cta); }} />
            </View>
          )}
        />

        {/* Footer: dots + primary button */}
        <View style={{ paddingHorizontal: 20, gap: 18 }}>
          <View className="flex flex-row items-center justify-center" style={{ gap: 6 }}>
            {cards.map((card, i) => (
              <View key={card.id} style={{ width: i === index ? 18 : 6, height: 6, borderRadius: 3, backgroundColor: i === index ? COLORS.accent : COLORS.dotIdle }} />
            ))}
          </View>
          <TouchableOpacity
            onPress={goNext}
            activeOpacity={0.8}
            className="flex flex-row items-center justify-center rounded-lg"
            style={{ backgroundColor: COLORS.accent, paddingVertical: 14, gap: 8 }}>
            <Text style={{ color: '#0E0F0F' }} className="text-lg font-semibold">{last ? 'Done' : 'Next'}</Text>
            {!last && <ArrowRight size={18} color="#0E0F0F" weight="bold" />}
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

function HighlightPage({ card, active, onCta }: { card: HighlightCard; active: boolean; onCta: (cta: NonNullable<HighlightCard['cta']>) => void }) {
  const { width, height } = useWindowDimensions();
  return (
    <View style={{ flex: 1, paddingHorizontal: 20, paddingTop: 8, gap: 18 }}>
      {card.media && (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <HighlightMediaView media={card.media} active={active} maxWidth={width - 40} maxHeight={height * 0.52} />
        </View>
      )}
      <View style={{ gap: 8, flexGrow: card.media ? 0 : 1, justifyContent: card.media ? 'flex-start' : 'center' }}>
        <Text className="text-white text-2xl font-bold">{card.title}</Text>
        <Text style={{ color: COLORS.muted, lineHeight: 22 }} className="text-base">{card.body}</Text>
        {card.cta && (
          <TouchableOpacity onPress={() => onCta(card.cta!)} activeOpacity={0.7} style={{ marginTop: 6, alignSelf: 'flex-start' }} className="flex flex-row items-center" >
            <Text style={{ color: COLORS.accent }} className="text-base font-medium">{card.cta.label}</Text>
            <ArrowRight size={16} color={COLORS.accent} style={{ marginLeft: 4 }} />
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

/**
 * The media slot. Sized from `aspectRatio` before anything loads so the page does not jump.
 * Video autoplays muted and loops while its page is visible; tap toggles pause. On error the
 * poster (video) or a neutral placeholder (image) is shown instead - never a broken frame.
 */
export function HighlightMediaView({ media, active, maxWidth, maxHeight }: { media: HighlightMedia; active: boolean; maxWidth: number; maxHeight: number }) {
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [paused, setPaused] = useState(false);

  // Fit the media's aspect ratio inside the slot
  let w = maxWidth;
  let h = w / media.aspectRatio;
  if (h > maxHeight) { h = maxHeight; w = h * media.aspectRatio; }
  const frame = { width: w, height: h, borderRadius: 16, overflow: 'hidden' as const, backgroundColor: COLORS.card };

  useEffect(() => { if (active) setPaused(false); }, [active]);

  if (media.type === 'image' || failed) {
    const uri = media.type === 'image' ? media.src : media.poster;
    return (
      <View style={frame}>
        {uri ? (
          <Image source={{ uri }} resizeMode="cover" style={{ width: '100%', height: '100%' }} onLoad={() => setLoaded(true)} onError={() => setLoaded(true)} />
        ) : null}
        {!loaded && <Spinner />}
      </View>
    );
  }

  return (
    <Pressable onPress={() => setPaused((p) => !p)} style={frame} accessibilityLabel={paused ? 'Play video' : 'Pause video'}>
      <Video
        source={{ uri: media.src }}
        poster={media.poster ? { source: { uri: media.poster }, resizeMode: 'cover' } : undefined}
        style={{ width: '100%', height: '100%' }}
        resizeMode="cover"
        repeat
        muted
        paused={!active || paused}
        controls={false}
        playInBackground={false}
        ignoreSilentSwitch="ignore"
        onLoad={() => setLoaded(true)}
        onError={(error) => { console.log('[Highlights] video failed', media.src, error); setFailed(true); }}
      />
      {!loaded && <Spinner />}
      {loaded && paused && (
        <View style={{ position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.25)' }}>
          <Play size={44} color="#FFF" weight="fill" />
        </View>
      )}
      {loaded && !paused && active && (
        <View style={{ position: 'absolute', right: 10, bottom: 10, opacity: 0.7 }}>
          <Pause size={18} color="#FFF" weight="fill" />
        </View>
      )}
    </Pressable>
  );
}

function Spinner() {
  return (
    <View style={{ position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center' }}>
      <ActivityIndicator size="small" color={COLORS.muted} />
    </View>
  );
}
