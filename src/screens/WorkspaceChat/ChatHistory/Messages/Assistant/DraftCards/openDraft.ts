import { focusCalendarEvent, focusEmailDraft, focusTextDraft } from "@/screens/WorkspaceChat/ChatHistory/DraftSheet";
import { type EmailDraft, type TextDraft } from "@/utils/messaging";
import { type CalendarEvent } from "@/utils/calendar";

/**
 * What tapping a draft card does. Android opens the draft sheet, where the user picks the messaging,
 * mail or calendar app (events can also be saved as an .ics file).
 * @see openDraft.ios.ts
 */

export function openTextDraft(draft: TextDraft) {
    focusTextDraft(draft);
}

export function openEmailDraft(draft: EmailDraft) {
    focusEmailDraft(draft);
}

export function addCalendarEvent(event: CalendarEvent) {
    focusCalendarEvent(event);
}
