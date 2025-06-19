import { useEffect, useState } from "react";
import Document, { DocumentType } from "@/database/models/Document";

export default function useWorkspaceFiles(workspaceSlug: string, { runOnMount = false }: { runOnMount?: boolean } = {}) {
    const [files, setFiles] = useState<DocumentType[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<Error | null>(null);

    async function fetchFiles() {
        if (!workspaceSlug) return;
        try {
            const files = await Document.find([{ field: 'workspace_slug', value: workspaceSlug }]);
            setFiles(files);
        } catch (error) {
            setError(error as Error);
        } finally {
            setIsLoading(false);
        }
    }

    useEffect(() => {
        if (runOnMount) fetchFiles();
    }, [runOnMount]);

    return { files, isLoading, error, fetchFiles };
}