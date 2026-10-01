import { useCallback, useEffect, useState } from 'react';
import { FlatList, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import ReanimatedSwipeable from 'react-native-gesture-handler/ReanimatedSwipeable';
import { ArrowLeft, ShieldCheck, Trash } from 'phosphor-react-native';
import moment from 'moment';
import { useTranslation } from 'react-i18next';
import SafeView from '@/components/SafeView';
import useHighjackBackButtonPress from '@/hooks/useHighjackBackButtonPress';
import { showToast } from '@/utils/Notification';
import ToolsManager from '@/utils/ToolsManager';
import { listAutoApprovals, removeAutoApproval, type ToolAutoApproval } from '@/utils/ToolsManager/toolAutoApprovals';
import { IWorkspacePageKey } from '../index';

interface ToolAutoApprovalsProps {
  goToPage: (page: IWorkspacePageKey) => void;
}

/**
 * Settings > Utility > Tool auto-approvals: every tool the user ticked "always approve" for on the
 * chat approval card. Those tools run without asking; swiping a row away (or tapping its trash
 * button) removes it so the tool asks for approval again next time.
 */
export default function ToolAutoApprovals({ goToPage }: ToolAutoApprovalsProps) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [approvals, setApprovals] = useState<ToolAutoApproval[] | null>(null);
  const goBack = () => {
    goToPage('main');
    return true;
  };
  useHighjackBackButtonPress(goBack);

  useEffect(() => {
    listAutoApprovals()
      .then(setApprovals)
      .catch(() => setApprovals([]));
  }, []);

  const remove = useCallback(async (item: ToolAutoApproval) => {
    const name = ToolsManager.displayNameFor(item.skillName);
    setApprovals(current => (current ?? []).filter(a => a.skillName !== item.skillName));
    try {
      await removeAutoApproval(item.skillName);
      showToast(t('settings.tool_auto_approvals.removed_toast', { tool: name }));
    } catch (e) {
      console.error('[ToolAutoApprovals] could not remove auto-approval', e);
      showToast(t('settings.update_failed'));
      listAutoApprovals().then(setApprovals).catch(() => {});
    }
  }, [t]);

  return (
    <SafeView
      scrollable={false}
      safeAreaClassNames="pt-[21px]"
      containerClassNames="flex flex-col flex-1"
      safeAreaStyle={{ backgroundColor: '#0E0F0F' }}>
      {/* Header */}
      <View
        style={{ paddingTop: insets.top, paddingBottom: 20 }}
        className="w-full flex flex-row items-center justify-center relative">
        <TouchableOpacity onPress={goBack} className="absolute left-0 flex flex-row items-center gap-2">
          <ArrowLeft size={24} color="#FFF" weight="bold" />
        </TouchableOpacity>
        <Text className="text-white text-lg font-medium">{t('settings.utility.tool_auto_approvals')}</Text>
      </View>

      <FlatList
        data={approvals ?? []}
        keyExtractor={item => item.skillName}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 8, paddingBottom: insets.bottom + 20, gap: 8 }}
        ListHeaderComponent={
          <Text style={{ color: '#9F9FA0' }} className="text-sm mb-2">
            {t('settings.tool_auto_approvals.description')}
          </Text>
        }
        ListEmptyComponent={
          approvals === null ? null : (
            <View className="flex flex-col items-center rounded-lg" style={{ backgroundColor: '#1B1B1E', padding: 24, gap: 8 }}>
              <ShieldCheck size={28} color="#9F9FA0" />
              <Text className="text-white text-base font-medium text-center">{t('settings.tool_auto_approvals.empty_title')}</Text>
              <Text style={{ color: '#9F9FA0' }} className="text-sm text-center">{t('settings.tool_auto_approvals.empty_description')}</Text>
            </View>
          )
        }
        renderItem={({ item }) => <AutoApprovalRow item={item} onRemove={remove} />}
      />
    </SafeView>
  );
}

function AutoApprovalRow({ item, onRemove }: { item: ToolAutoApproval; onRemove: (item: ToolAutoApproval) => void }) {
  const { t } = useTranslation();
  const name = ToolsManager.displayNameFor(item.skillName);

  return (
    <ReanimatedSwipeable
      friction={2}
      rightThreshold={60}
      overshootRight={false}
      // Swiping all the way open removes it - the revealed red area is just the affordance
      onSwipeableOpen={() => onRemove(item)}
      renderRightActions={() => (
        <View className="flex flex-row items-center justify-end rounded-lg" style={{ backgroundColor: '#7A271A', width: 96, marginLeft: 8 }}>
          <View className="flex flex-col items-center" style={{ width: 96, gap: 2 }}>
            <Trash size={20} color="#F97066" />
            <Text style={{ color: '#F97066' }} className="text-xs font-medium">{t('settings.tool_auto_approvals.remove')}</Text>
          </View>
        </View>
      )}>
      <View className="flex flex-row items-center rounded-lg" style={{ backgroundColor: '#1B1B1E', padding: 14, gap: 12 }}>
        <ShieldCheck size={20} color="#FFF" />
        <View className="flex-1 flex flex-col" style={{ gap: 2 }}>
          <Text numberOfLines={1} className="text-white text-lg">{name}</Text>
          <Text numberOfLines={1} style={{ color: '#9F9FA0' }} className="text-sm">
            {t('settings.tool_auto_approvals.approved_since', { when: moment(item.approvedAt).fromNow() })}
          </Text>
        </View>
        <TouchableOpacity
          onPress={() => onRemove(item)}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={t('settings.tool_auto_approvals.remove_label', { tool: name })}
          className="flex items-center justify-center rounded-lg"
          style={{ width: 36, height: 36, backgroundColor: 'rgba(122,39,26,0.2)' }}>
          <Trash size={18} color="#F97066" />
        </TouchableOpacity>
      </View>
    </ReanimatedSwipeable>
  );
}
