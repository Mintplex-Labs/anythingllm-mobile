import { useCallback, useEffect, useState } from "react";
import VectorDB from "@/utils/VectorDB";
import Document from "@/database/models/Document";
import AwaitableAlert from "@/components/AwaitableAlert";
import { showToast } from "@/utils/Notification";
import { deleteProcessedFilesByName } from "@/utils/fs";

export default function useVectorCount(workspaceSlug: string) {
    const [vectorCount, setVectorCount] = useState<number>(0);

    const getVectorCount = useCallback(async () => {
        const count = await VectorDB.getWorkspaceVectorCount(workspaceSlug);
        setVectorCount(count);
    }, [workspaceSlug]);

    const resetVectorsForWorkspace = useCallback(async () => {
        const documents = await Document.find([{ field: 'workspace_slug', value: workspaceSlug }]);
        await VectorDB.resetVectorsForWorkspace(workspaceSlug);
        await Document.delete([{ field: 'workspace_slug', value: workspaceSlug }]);
        const filenames = documents.map((doc: { name: string }) => doc.name).filter(Boolean);
        await deleteProcessedFilesByName(filenames);
        setVectorCount(0);
    }, [workspaceSlug]);

    const askToResetVectorsForWorkspace = useCallback(async () => {
        const shouldReset = await AwaitableAlert(
            'Reset Vector Storage',
            'Are you sure you want to reset the vector storage for this workspace?',
            { text: 'Cancel', style: 'cancel' },
            { text: 'Reset', style: 'destructive' }
        );
        if (!shouldReset) return;
        await resetVectorsForWorkspace();
        setVectorCount(0);
        showToast('Vector storage cleared!');
    }, [workspaceSlug, resetVectorsForWorkspace]);

    useEffect(() => {
        getVectorCount();
    }, [workspaceSlug, getVectorCount]);

    return { vectorCount, getVectorCount, resetVectorsForWorkspace, askToResetVectorsForWorkspace };
}