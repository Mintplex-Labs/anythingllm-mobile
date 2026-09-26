import { useCallback, useEffect, useState } from "react";
import VectorDB from "@/utils/VectorDB";
import Document from "@/database/models/Document";
import AwaitableAlert from "@/components/AwaitableAlert";
import { showToast } from "@/utils/Notification";
import i18n from "@/i18n";

export default function useVectorCount(workspaceSlug: string) {
    const [vectorCount, setVectorCount] = useState<number>(0);

    const getVectorCount = useCallback(async () => {
        const count = await VectorDB.getWorkspaceVectorCount(workspaceSlug);
        setVectorCount(count);
    }, [workspaceSlug]);

    const resetVectorsForWorkspace = useCallback(async () => {
        await VectorDB.resetVectorsForWorkspace(workspaceSlug);
        // Document.delete removes the processed text files no remaining document references
        await Document.delete([{ field: 'workspace_slug', value: workspaceSlug }]);
        setVectorCount(0);
    }, [workspaceSlug]);

    const askToResetVectorsForWorkspace = useCallback(async () => {
        const shouldReset = await AwaitableAlert(
            i18n.t('models.vector_storage.reset_title'),
            i18n.t('models.vector_storage.reset_message'),
            { text: i18n.t('common.cancel'), style: 'cancel' },
            { text: i18n.t('common.reset'), style: 'destructive' }
        );
        if (!shouldReset) return;
        await resetVectorsForWorkspace();
        setVectorCount(0);
        showToast(i18n.t('models.vector_storage.cleared'));
    }, [workspaceSlug, resetVectorsForWorkspace]);

    useEffect(() => {
        getVectorCount();
    }, [workspaceSlug, getVectorCount]);

    return { vectorCount, getVectorCount, resetVectorsForWorkspace, askToResetVectorsForWorkspace };
}