import { TouchableOpacity } from "react-native";
import { Plus } from "phosphor-react-native";
import { AttachmentInterface } from "@/hooks/useAttachments";
import { ChatHandlerInterface } from '@/hooks/useChatHandler/index';
import { useBottomSheet, BOTTOM_SHEET_NAMES } from '@/contexts/BottomSheetContext';

/**
 * The "+" in the prompt input. Opens the attachments sheet (files / gallery / camera) -
 * see `Actions/Attachments`. Long press keeps the hidden "clear workspace vectors" gesture.
 */
export default function AttachmentsButton({ attachmentHandler }: { chatHandler: ChatHandlerInterface, attachmentHandler: AttachmentInterface }) {
    const { presentSheet } = useBottomSheet();
    return (
        <TouchableOpacity
            onPress={() => presentSheet(BOTTOM_SHEET_NAMES.ATTACHMENTS)}
            disabled={attachmentHandler.isMaxAttachments}
            onLongPress={attachmentHandler.clearWorkspaceVectors}
            accessibilityLabel='Add attachment'
            className='flex flex-row items-center gap-x-2 disabled:opacity-50'
        >
            <Plus size={25} color="#FFF" />
        </TouchableOpacity>
    );
}
