import { type AgentRecord } from './types';

/**
 * The message list for the next action: system prompt, the task briefing, then the step history as
 * OpenAI-style tool calls and results. Only the latest step is shown in full (the page state is
 * most of it); older steps shrink to a line. Over budget, results shorten from the oldest forward,
 * then the oldest steps are dropped.
 */
export function buildMessages({ system, briefing, records, contextLimit, vision, nudge }: {
    system: string;
    /** The task, notes, digests - and the page state when there are no steps yet */
    briefing: string;
    records: AgentRecord[];
    /** The model's context window in tokens */
    contextLimit: number;
    vision: boolean;
    /** A one-off reminder appended as a user message */
    nudge: string | null;
}) {
    // ~4 characters per token, leaving 30% of the window for the reply and tool schemas.
    const budget = contextLimit * 4 * 0.7 - system.length - briefing.length;
    const latest = records.length - 1;
    const contents = records.map((record, i) => {
        if (i === latest) return record.full;
        if (record.medium && i >= records.length - 3) return record.medium;
        return record.short;
    });
    let size = contents.reduce((sum, c) => sum + c.length + 80, 0);
    for (let i = 0; i < contents.length - 1 && size > budget; i++) {
        size -= contents[i].length - records[i].short.length;
        contents[i] = records[i].short;
    }
    let first = 0;
    while (size > budget && first < contents.length - 1) size -= contents[first++].length + 80;

    const messages: any[] = [
        { role: 'system', content: system },
        { role: 'user', content: first ? `${briefing}\n\n(${first} earlier steps omitted)` : briefing },
    ];
    for (let i = first; i < records.length; i++) {
        const { call, image } = records[i];
        messages.push({
            role: 'assistant',
            content: '',
            tool_calls: [{
                id: call.raw.id,
                type: 'function',
                ...(call.raw.extra_content ? { extra_content: call.raw.extra_content } : {}),
                function: { name: call.raw.name, arguments: call.raw.arguments },
            }],
        });
        messages.push({ role: 'tool', tool_call_id: call.raw.id, content: contents[i] });
        // A screenshot is only shown while it is the latest step - images are expensive. Tool results
        // cannot carry images on most providers, so it goes in a user message.
        if (vision && i === latest && image)
            messages.push({
                role: 'user',
                content: [
                    { type: 'text', text: 'Screenshot of the current screen:' },
                    { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${image}`, detail: 'low' } },
                ],
            });
    }
    if (nudge) messages.push({ role: 'user', content: nudge });
    return messages;
}
