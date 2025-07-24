import { TouchableOpacity } from "react-native";
import { AttachmentInterface } from "@/hooks/useAttachments";
import { Paperclip } from "phosphor-react-native";
import { ChatHandlerInterface } from '@/hooks/useChatHandler/index';

export default function AttachmentsButton({ chatHandler, attachmentHandler }: { chatHandler: ChatHandlerInterface, attachmentHandler: AttachmentInterface }) {
    if (chatHandler.isRemote) return null;
    return (
        <TouchableOpacity
            onPress={attachmentHandler.askForAttachment}
            disabled={attachmentHandler.isMaxAttachments}
            onLongPress={attachmentHandler.clearWorkspaceVectors}
            className='flex flex-row items-center gap-x-2 disabled:opacity-50'
        >
            <Paperclip size={25} color="#FFF" />
        </TouchableOpacity>
    );
}