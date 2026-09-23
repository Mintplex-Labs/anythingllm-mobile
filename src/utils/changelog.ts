type ChangelogEntry = {
  version: string;
  content: string;
};

const CHANGELOG: ChangelogEntry[] = [
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
