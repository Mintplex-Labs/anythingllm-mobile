import {palStore} from '../PalStore';
import {
  PalType,
  AssistantFormData,
  RoleplayFormData,
} from '../../components/PalsSheets/types';
import {modelsList} from '../../../jest/fixtures/models';

describe('PalStore', () => {
  beforeEach(() => {
    // Clear pals before each test
    palStore.pals = [];
  });

  describe('addPal', () => {
    it('should add an assistant pal correctly', () => {
      const assistantPal: AssistantFormData = {
        name: 'Test Assistant',
        palType: PalType.ASSISTANT,
        systemPrompt: 'Test system prompt',
        defaultModel: modelsList[0],
        useAIPrompt: false,
        isSystemPromptChanged: false,
        originalSystemPrompt: '',
        promptGenerationModel: modelsList[0],
        generatingPrompt: '',
        color: undefined,
      };

      palStore.addPal(assistantPal);

      expect(palStore.pals).toHaveLength(1);
      expect(palStore.pals[0]).toEqual(
        expect.objectContaining({
          ...assistantPal,
          id: expect.any(String),
        }),
      );
    });

    it('should add a roleplay pal correctly', () => {
      const roleplayPal: RoleplayFormData = {
        name: 'Test Roleplay',
        palType: PalType.ROLEPLAY,
        world: 'Test world',
        location: 'Test location',
        aiRole: 'Test AI role',
        userRole: 'Test user role',
        situation: 'Test situation',
        toneStyle: 'Test tone',
        systemPrompt: 'Test system prompt',
        defaultModel: modelsList[0],
        useAIPrompt: false,
        isSystemPromptChanged: false,
        promptGenerationModel: modelsList[0],
        generatingPrompt: '',
        color: undefined,
      };

      palStore.addPal(roleplayPal);

      expect(palStore.pals).toHaveLength(1);
      expect(palStore.pals[0]).toEqual(
        expect.objectContaining({
          ...roleplayPal,
          id: expect.any(String),
        }),
      );
    });
  });

  describe('updatePal', () => {
    it('should update an existing pal', () => {
      // First add a pal
      const initialPal: AssistantFormData = {
        name: 'Test Assistant',
        palType: PalType.ASSISTANT,
        systemPrompt: 'Initial prompt',
        defaultModel: modelsList[0],
        useAIPrompt: false,
        isSystemPromptChanged: false,
        originalSystemPrompt: '',
        promptGenerationModel: modelsList[0],
        generatingPrompt: '',
        color: undefined,
      };
      palStore.addPal(initialPal);
      const palId = palStore.pals[0].id;

      // Update the pal
      const updates = {
        name: 'Updated Assistant',
        systemPrompt: 'Updated prompt',
      };
      palStore.updatePal(palId, updates);

      expect(palStore.pals[0]).toEqual(
        expect.objectContaining({
          ...initialPal,
          ...updates,
          id: palId,
        }),
      );
    });

    it('should not update pal type when updating', () => {
      // First add a pal
      const initialPal: AssistantFormData = {
        name: 'Test Assistant',
        palType: PalType.ASSISTANT,
        systemPrompt: 'Initial prompt',
        defaultModel: modelsList[0],
        useAIPrompt: false,
        isSystemPromptChanged: false,
        originalSystemPrompt: '',
        promptGenerationModel: undefined,
        generatingPrompt: '',
        color: undefined,
      };
      palStore.addPal(initialPal);
      const palId = palStore.pals[0].id;

      // Try to update the pal type
      const updates = {
        palType: PalType.ROLEPLAY,
      };
      palStore.updatePal(palId, updates);

      // Verify pal type remains unchanged
      expect(palStore.pals[0].palType).toBe(PalType.ASSISTANT);
    });

    it('should not update non-existent pal', () => {
      const updates = {
        name: 'Updated Name',
      };
      palStore.updatePal('non-existent-id', updates);

      expect(palStore.pals).toHaveLength(0);
    });
  });

  describe('deletePal', () => {
    it('should delete an existing pal', () => {
      // First add a pal
      const pal: AssistantFormData = {
        name: 'Test Assistant',
        palType: PalType.ASSISTANT,
        systemPrompt: 'Test prompt',
        defaultModel: modelsList[0],
        useAIPrompt: false,
        isSystemPromptChanged: false,
        originalSystemPrompt: '',
        promptGenerationModel: modelsList[0],
        generatingPrompt: '',
        color: undefined,
      };
      palStore.addPal(pal);
      const palId = palStore.pals[0].id;

      // Delete the pal
      palStore.deletePal(palId);

      expect(palStore.pals).toHaveLength(0);
    });

    it('should not throw when deleting non-existent pal', () => {
      expect(() => palStore.deletePal('non-existent-id')).not.toThrow();
    });
  });

  describe('getPals', () => {
    it('should return all pals', () => {
      const pals: AssistantFormData[] = [
        {
          name: 'Assistant 1',
          palType: PalType.ASSISTANT,
          systemPrompt: 'Prompt 1',
          defaultModel: modelsList[0],
          useAIPrompt: false,
          isSystemPromptChanged: false,
          originalSystemPrompt: '',
          promptGenerationModel: modelsList[0],
          generatingPrompt: '',
          color: undefined,
        },
        {
          name: 'Assistant 2',
          palType: PalType.ASSISTANT,
          systemPrompt: 'Prompt 2',
          defaultModel: modelsList[0],
          useAIPrompt: false,
          isSystemPromptChanged: false,
          originalSystemPrompt: '',
          promptGenerationModel: modelsList[0],
          generatingPrompt: '',
          color: undefined,
        },
      ];

      pals.forEach(pal => palStore.addPal(pal));

      const retrievedPals = palStore.getPals();
      expect(retrievedPals).toHaveLength(2);
      expect(retrievedPals).toEqual(
        expect.arrayContaining([
          expect.objectContaining({...pals[0]}),
          expect.objectContaining({...pals[1]}),
        ]),
      );
    });

    it('should return empty array when no pals exist', () => {
      const pals = palStore.getPals();
      expect(pals).toEqual([]);
    });
  });
});
