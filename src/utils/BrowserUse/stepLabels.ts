import i18n from '@/i18n';
import { clip } from './text';
import { hostOf } from './urls';

/**
 * What the user sees for a step in the chat card and the session history - no ids, no jargon.
 * Translated, unlike everything the model sees. Keys are written out in full so the translation
 * tooling (translations:unused / prune) sees them.
 */
export function stepLabel(tool: string, args: Record<string, any> = {}, result: { target?: string; sensitive?: boolean } = {}) {
    const t = i18n.t.bind(i18n);
    const target = result.target ? `“${clip(result.target, 50)}”` : '';
    switch (tool) {
        case 'navigate':
            return t('browser_use.steps.opening', { site: hostOf(args.url) || args.url });
        case 'click':
            return target ? t('browser_use.steps.clicking', { target }) : t('browser_use.steps.clicking_page');
        case 'type': {
            if (result.sensitive) return target ? t('browser_use.steps.entering_password_into', { target }) : t('browser_use.steps.entering_password');
            const text = `“${clip(args.text, 40)}”`;
            return target ? t('browser_use.steps.typing_into', { text, target }) : t('browser_use.steps.typing', { text });
        }
        case 'select_option':
            return t('browser_use.steps.choosing', { option: target || `“${clip(args.option, 40)}”` });
        case 'press_key':
            return t('browser_use.steps.pressing', { key: args.key });
        case 'scroll':
            return args.direction === 'up' ? t('browser_use.steps.scrolling_up') : t('browser_use.steps.scrolling_down');
        case 'go_back':
            return t('browser_use.steps.going_back');
        case 'read_page':
            return t('browser_use.steps.reading');
        case 'screenshot':
            return t('browser_use.steps.screenshot');
        case 'wait':
            return t('browser_use.steps.waiting');
        case 'ask_user':
            return t('browser_use.steps.asking');
        case 'checkpoint':
            if (args.verdict === 'FINISH') return t('browser_use.steps.checkpoint_finish');
            if (args.verdict === 'BACK') return t('browser_use.steps.checkpoint_back', { title: `“${clip(args.title, 40)}”` });
            if (args.verdict === 'GIVE_UP') return t('browser_use.steps.checkpoint_give_up');
            return t('browser_use.steps.checkpoint_on_track');
        case 'resume':
            return t('browser_use.steps.resuming');
        case 'done':
            return t('browser_use.steps.finished');
        default:
            return t('browser_use.steps.using', { tool });
    }
}
