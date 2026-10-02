type ChangelogEntry = {
  version: string;
  content: string;
};

const CHANGELOG: ChangelogEntry[] = [
  {
    version: '1.3.2',
    content: [
      '- **Onboarding fix** — if setup was interrupted, the app now picks up where you left off instead of skipping the last step',
    ].join('\n'),
  },
  {
    version: '1.3.1',
    content: [
      '- **Device Assistant (Android)** — replace Gemini with your own AI. Open AnythingLLM over any app with the same gesture, talk or type, and share your screen with vision models. Set it up under Settings > Special tools > Device Assistant',
      '- **Sign in with ChatGPT (experimental)** — use your ChatGPT Plus or Pro plan as a provider, no API key needed',
      '- **Alarms, timers and reminders (Android)** — ask in chat and the assistant sets a timer, an alarm or a calendar reminder for you',
      '- **Always approve tools** — tick "Always approve this tool" to skip the prompt next time. Manage them under Settings > Utility > Tool auto-approvals',
      '- **YouTube transcripts** — share or paste a YouTube link and the assistant reads the video\'s transcript',
      '- **Newer OpenAI models** — tool calling now works with the latest OpenAI models',
      '- **Scheduled jobs** — a heads-up when battery optimization could stop jobs from running in the background',
    ].join('\n'),
  },
  {
    version: '1.3.0',
    content: [
      '- **Draft texts, emails and events** — drafts show as a card you tap to open in the messaging, mail or calendar app of your choice. Your last used app is remembered',
      '- **Calendar tools** — create events (with repeats, reminders and invitees) or read your calendar, and tap any event the assistant finds to open it. No calendar app? Share or save the event as a .ics file',
      '- **Switch providers from the model chip** — change between On-Device and cloud providers, or connect a new one, without leaving the chat',
      '- **New chat greeting** — empty chats open with a friendly greeting and suggested prompts, and load faster',
      '- **Max tool calls** — set how many tools the assistant can use per reply in workspace settings, so it always ends with an answer',
      '- **Safer model downloads** — an interrupted download is no longer shown as installed, and you can now cancel a download',
      '- **Accurate speed stats** for cloud providers like Gemini and DeepSeek',
      '- **Fixed** DeepSeek errors after tool calls, a crash when backgrounding the app after a large paste, onboarding screens cut off on small screens, and more',
    ].join('\n'),
  },
  {
    version: '1.2.3',
    content: [
      '- **Choose your language** — the app is now available in 17 languages and follows your phone\'s language by default. Change it under Settings > App language',
      '- **Low memory warning** — get a heads-up before an on-device chat runs out of memory and the app is closed by your phone',
      '- **Clearer chat errors** — failed replies show as an error card, with a Show more toggle for long errors, and stay marked as errors when you reopen the thread',
      '- **Fixed crashes** when using on-device models, including while switching models or embedding documents',
      '- **Fixed a crash** when tapping a reply notification for a thread or workspace that was deleted',
      '- **Cleaner notifications** — reply notifications now show just the workspace and the reply',
    ].join('\n'),
  },
  {
    version: '1.2.2',
    content: [
      '- **Fixed a crash** when tapping a suggested context length in workspace settings',
    ].join('\n'),
  },
  {
    version: '1.2.1',
    content: [
      '- **Fewer crashes** — a screen or message that fails to load now shows an error instead of closing the app',
      '- **Crash reports** — crashes are reported automatically so we can fix them faster. Follows your Anonymous telemetry setting',
      '- **Report on GitHub** — with telemetry off, error screens let you copy the error or open a pre-filled GitHub issue',
    ].join('\n'),
  },
  {
    version: '1.2.0',
    content: [
      '- **Ask with AnythingLLM** — select text in any app and tap it to polish, shorten, summarize or explain with your model. Turn off under Settings > Special tools',
      '- **Share to AnythingLLM** — send photos, documents and links from any app straight into a chat',
      '- **Memory** — the assistant remembers what you tell it, globally or per workspace, and recalls it when relevant',
      '- **Scheduled jobs** — ask for a recurring task (a morning digest, a weekly check-in) and it runs on schedule',
      '- **Create documents** — generate Word, PDF, PowerPoint and text files from a chat',
      '- **Read more file types** — attach Word, Excel, PowerPoint and more',
      '- **Model fit badges** — see whether an on-device model will run well on your phone before you download it',
      '- **Better voice input** — longer pauses allowed, transcripts accumulate as you speak',
      '- **Lock-screen notifications** when a reply finishes while your phone is locked',
      '- **Faster on-device replies** — prompt layout preserves the KV cache between turns; Anthropic prompt caching on by default',
      '- **Redesigned new-workspace flow**',
      '- **Linked files are read automatically** when the link points to a parseable document',
      '- **New provider: llmman** — connect to a self-hosted llmman server',
      '- Bug fixes: sidebar refresh after onboarding, rotated images in PDF export, stale files cleaned from disk',
      '- **License** — now GPLv3 to keep the project free and open',
    ].join('\n'),
  },
  {
    version: '1.1.0',
    content: [
      '- **Voice input** — talk to your AI with speech-to-text',
      '- **Image attachments** with on-device vision support',
      '- **Smart tool selection** picks the right tool automatically',
      '- **HuggingFace model browser** — find and download models in-app',
      '- **Export chats to PDF** with images',
      '- **Auto-rename** chat threads',
      '- **Rebuilt model engine** with better performance',
      '- **Context window** scales to your device\'s RAM',
      '- **Connect any OpenAI-compatible API** with auto model discovery',
      '- **15 new external providers** (Anthropic, Novita, Moonshot, Bedrock, etc.)',
      '- **Provider cache** so you don\'t have to fiddle with keys or endpoints when swapping providers',
      '- Many **bug fixes and UI improvements**',
    ].join('\n'),
  },
];

export function getChangelogForVersion(
  version: string,
): ChangelogEntry | undefined {
  const entry = CHANGELOG.find(e => e.version === version);
  if (!entry) return undefined;
  return {
    ...entry,
    content: `# What's new in v${entry.version}\n\n${entry.content}`,
  };
}
