import React from 'react';
import { Modal, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Warning } from 'phosphor-react-native';
import { describeLowMemory, LowMemoryStatus } from '@/utils/models/lowMemory';

export const LOW_MEMORY_COLOR = '#FBBF24';

/**
 * Explains that the on-device model is short on free RAM. Used as the model chip's popover
 * (info only, "Got it") and as the once-per-launch warning before a prompt is sent, where
 * `onConfirm` adds a "Send anyway" button and `onClose` acts as cancel.
 *
 * StyleSheet instead of className: NativeWind does not reliably style content rendered inside an RN Modal.
 */
export default function LowMemoryModal({
  status,
  visible,
  onClose,
  onConfirm,
}: {
  status: LowMemoryStatus | null;
  visible: boolean;
  onClose: () => void;
  onConfirm?: () => void;
}) {
  if (!status) return null;
  const { title, advice, stats } = describeLowMemory(status);

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.card} onPress={e => e.stopPropagation()}>
          <View style={styles.header}>
            <View style={styles.iconBadge}>
              <Warning size={18} color={LOW_MEMORY_COLOR} weight="bold" />
            </View>
            <Text style={styles.title}>{title}</Text>
          </View>

          <View style={styles.stats}>
            <MemoryStat label="Free" value={stats.free} highlight />
            <View style={styles.statDivider} />
            <MemoryStat label="Total" value={stats.total} />
            <View style={styles.statDivider} />
            <MemoryStat label={status.loaded ? 'Model (loaded)' : 'Model needs'} value={stats.model} />
          </View>

          <Text style={styles.body}>{advice}</Text>

          <View style={styles.actions}>
            {onConfirm ? (
              <>
                <TouchableOpacity onPress={onClose} style={styles.secondaryButton} activeOpacity={0.7}>
                  <Text style={styles.secondaryButtonText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={onConfirm} style={styles.button} activeOpacity={0.7}>
                  <Text style={styles.buttonText}>Send anyway</Text>
                </TouchableOpacity>
              </>
            ) : (
              <TouchableOpacity onPress={onClose} style={styles.button} activeOpacity={0.7}>
                <Text style={styles.buttonText}>Got it</Text>
              </TouchableOpacity>
            )}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function MemoryStat({ label, value, highlight = false }: { label: string; value: string; highlight?: boolean }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statLabel} numberOfLines={1}>{label}</Text>
      <Text style={[styles.statValue, highlight && { color: LOW_MEMORY_COLOR }]} numberOfLines={1}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  card: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: '#1B1B1E',
    borderRadius: 16,
    padding: 20,
    gap: 16,
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  iconBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(251,191,36,0.12)',
  },
  title: { color: '#FFFFFF', fontSize: 17, fontWeight: '600' },
  stats: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#27282A',
    borderRadius: 12,
    paddingVertical: 12,
  },
  stat: { flex: 1, alignItems: 'center', gap: 2, paddingHorizontal: 4 },
  statDivider: { width: StyleSheet.hairlineWidth, alignSelf: 'stretch', backgroundColor: 'rgba(255,255,255,0.12)' },
  statLabel: { color: '#9F9FA0', fontSize: 12 },
  statValue: { color: '#FFFFFF', fontSize: 15, fontWeight: '600' },
  body: { color: '#C4C4C7', fontSize: 14, lineHeight: 21 },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8 },
  button: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 10,
    paddingHorizontal: 18,
    paddingVertical: 9,
  },
  buttonText: { color: '#FFFFFF', fontSize: 14, fontWeight: '500' },
  secondaryButton: {
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  secondaryButtonText: { color: '#9F9FA0', fontSize: 14, fontWeight: '500' },
});
