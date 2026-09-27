import { useEffect, useState } from 'react';
import DeviceInfo from 'react-native-device-info';
import { Model } from '@/utils/types';
import i18n from '@/i18n';

function memoryRequirementEstimate(model: Model) {
  // Model parameters derived by fitting a linear regression to benchmark data
  // from: https://huggingface.co/spaces/a-ghorbani/ai-phone-leaderboard
  return 0.43 + (0.92 * model.size) / 1000 / 1000 / 1000;
}

export const useMemoryCheck = (model: Model) => {
  const [memoryWarning, setMemoryWarning] = useState('');
  const [shortMemoryWarning, setShortMemoryWarning] = useState('');

  useEffect(() => {
    const checkMemory = async () => {
      try {
        // Parameters derived from observations of max device memory usage for each device ram category in the benchmark data.
        const totalMemory = await DeviceInfo.getTotalMemory();
        const totalMemoryGB = totalMemory / 1000 / 1000 / 1000;
        const availableMemory = Math.min(
          totalMemoryGB * 0.65,
          totalMemoryGB - 1.2,
        );
        const memoryRequirement = memoryRequirementEstimate(model);

        if (memoryRequirement > availableMemory) {
          setShortMemoryWarning(i18n.t('models.memory_warning.short'));
          setMemoryWarning(i18n.t('models.memory_warning.full'));
        }
      } catch (error) {
        // TODO: Handle error appropriately
        console.error('Memory check failed:', error);
      }
    };

    checkMemory();
  }, [model.size, model]);

  return { memoryWarning, shortMemoryWarning };
};
