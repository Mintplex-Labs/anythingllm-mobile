import {generateRoleplayPrompt} from '../utils';
import {PalType, RoleplayFormData} from '../types';

describe('PalsSheets utils', () => {
  const basePal: RoleplayFormData = {
    name: 'Test Roleplay',
    palType: PalType.ROLEPLAY,
    world: 'Fantasy World',
    location: 'Ancient Castle',
    aiRole: 'Wise Wizard',
    userRole: 'Brave Knight',
    situation: 'A dark curse has fallen upon the kingdom',
    toneStyle: 'Mysterious and dramatic',
    systemPrompt: '',
    defaultModel: undefined,
    useAIPrompt: false,
    isSystemPromptChanged: false,
    promptGenerationModel: undefined,
    generatingPrompt: '',
    color: undefined,
  };

  describe('generateRoleplayPrompt', () => {
    it('should generate prompt with all fields', () => {
      const prompt = generateRoleplayPrompt(basePal);

      expect(prompt).toContain('**World:** Fantasy World');
      expect(prompt).toContain('**Location:** Ancient Castle');
      expect(prompt).toContain('**AI Role:** Wise Wizard');
      expect(prompt).toContain('**User Role:** Brave Knight');
      expect(prompt).toContain(
        '**Situation:** A dark curse has fallen upon the kingdom',
      );
      expect(prompt).toContain('**Tone/Style:** Mysterious and dramatic');
      expect(prompt).toContain('Chat exclusively as Wise Wizard');
    });

    it('should handle missing optional fields', () => {
      const minimalPal: RoleplayFormData = {
        ...basePal,
        world: '',
        location: '',
        userRole: '',
        situation: '',
        toneStyle: '',
      };

      const prompt = generateRoleplayPrompt(minimalPal);

      expect(prompt).not.toContain('**World:**');
      expect(prompt).not.toContain('**Location:**');
      expect(prompt).not.toContain('**User Role:**');
      expect(prompt).not.toContain('**Situation:**');
      expect(prompt).not.toContain('**Tone/Style:**');
      expect(prompt).toContain('**AI Role:** Wise Wizard');
    });

    it('should include all roleplay rules', () => {
      const prompt = generateRoleplayPrompt(basePal);

      expect(prompt).toContain('ROLEPLAY RULES:');
      expect(prompt).toContain('Avoid overly elaborate introductions');
      expect(prompt).toContain("Stay responsive to the user's cues");
      expect(prompt).toContain('Keep responses fluid');
      expect(prompt).toContain('Subtly build intrigue');
      expect(prompt).toContain('Use subtle physical cues');
      expect(prompt).toContain('Maintain a crisp and minimalist style');
      expect(prompt).toContain('Pay careful attention to all past events');
    });
  });
});
