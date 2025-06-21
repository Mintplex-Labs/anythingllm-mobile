import { TouchableOpacity } from "react-native";
import { AttachmentInterface } from "@/hooks/useAttachments";
import { Paperclip } from "phosphor-react-native";

export default function AttachmentsButton({ attachmentHandler }: { attachmentHandler: AttachmentInterface }) {
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