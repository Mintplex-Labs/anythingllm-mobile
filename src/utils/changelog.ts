type ChangelogEntry = {
  version: string;
  content: string;
};

const CHANGELOG: ChangelogEntry[] = [
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
