import {z} from 'zod';
import {Model} from '../../utils/types';

export enum PalType {
  ROLEPLAY = 'roleplay',
  ASSISTANT = 'assistant',
}

// We'll use this factory function to create schemas with the current localization
export function createSchemaWithL10n(l10n: any) {
  // Base schema with common fields
  const baseFormSchema = {
    name: z.string().min(1, l10n.validation.nameRequired),
    defaultModel: z.any().optional(),
    useAIPrompt: z.boolean(),
    systemPrompt: z.string().min(1, l10n.validation.systemPromptRequired),
    originalSystemPrompt: z.string().optional(),
    isSystemPromptChanged: z.boolean().default(false),
    color: z.tuple([z.string(), z.string()]).optional(),
    promptGenerationModel: z.any().optional(),
    generatingPrompt: z.string().optional(),
  };

  // Assistant-specific schema
  const assistantSchema = z.object({
    ...baseFormSchema,
    palType: z.literal(PalType.ASSISTANT),
  });

  // Roleplay-specific schema
  const roleplaySchema = z.object({
    ...baseFormSchema,
    palType: z.literal(PalType.ROLEPLAY),
    world: z.string().min(1, l10n.validation.worldRequired),
    location: z.string().min(1, l10n.validation.locationRequired),
    aiRole: z.string().min(1, l10n.validation.aiRoleRequired),
    userRole: z.string().min(1, l10n.validation.userRoleRequired),
    situation: z.string().min(1, l10n.validation.situationRequired),
    toneStyle: z.string().min(1, l10n.validation.toneStyleRequired),
  });

  return {
    assistantSchema,
    roleplaySchema,
  };
}

// Default schemas with fallback English messages
export const assistantFormSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  defaultModel: z.any().optional(),
  useAIPrompt: z.boolean(),
  systemPrompt: z.string().min(1, 'System prompt is required'),
  originalSystemPrompt: z.string().optional(),
  isSystemPromptChanged: z.boolean().default(false),
  color: z.tuple([z.string(), z.string()]).optional(),
  promptGenerationModel: z.any().optional(),
  generatingPrompt: z.string().optional(),
  palType: z.literal(PalType.ASSISTANT),
});

export const roleplayFormSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  defaultModel: z.any().optional(),
  useAIPrompt: z.boolean(),
  systemPrompt: z.string().min(1, 'System prompt is required'),
  originalSystemPrompt: z.string().optional(),
  isSystemPromptChanged: z.boolean().default(false),
  color: z.tuple([z.string(), z.string()]).optional(),
  promptGenerationModel: z.any().optional(),
  generatingPrompt: z.string().optional(),
  palType: z.literal(PalType.ROLEPLAY),
  world: z.string().min(1, 'World is required'),
  location: z.string().min(1, 'Location is required'),
  aiRole: z.string().min(1, "AI's role is required"),
  userRole: z.string().min(1, 'User role is required'),
  situation: z.string().min(1, 'Situation is required'),
  toneStyle: z.string().min(1, 'Tone/Style is required'),
});

// Base type for common fields
interface BaseFormData {
  id?: string;
  name: string;
  defaultModel?: Model;
  useAIPrompt: boolean;
  systemPrompt: string;
  originalSystemPrompt?: string;
  isSystemPromptChanged: boolean;
  color?: [string, string];
  promptGenerationModel?: Model;
  generatingPrompt?: string;
}

// Assistant-specific type
export interface AssistantFormData extends BaseFormData {
  palType: PalType.ASSISTANT;
}

// Roleplay-specific type
export interface RoleplayFormData extends BaseFormData {
  palType: PalType.ROLEPLAY;
  world: string;
  location: string;
  aiRole: string;
  userRole: string;
  situation: string;
  toneStyle: string;
}

// Union type for form data
export type PalFormData = AssistantFormData | RoleplayFormData;
