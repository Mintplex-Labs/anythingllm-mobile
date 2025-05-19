import * as RNFS from '@dr.pogodin/react-native-fs';
import {
  readJsonFile,
  validateImportedData,
  ImportedChatSession,
} from '../importUtils';

// Mock dependencies
jest.mock('react-native', () => ({
  Platform: {
    OS: 'ios',
  },
  Alert: {
    alert: jest.fn(),
  },
}));

jest.mock('@dr.pogodin/react-native-fs', () => ({
  readFile: jest.fn(),
}));

jest.mock('react-native-document-picker', () => ({
  pick: jest.fn(),
  isCancel: jest.fn(err => err && err.code === 'DOCUMENT_PICKER_CANCELED'),
  types: {
    allFiles: 'public.all-files',
  },
}));

jest.mock('../../repositories/ChatSessionRepository');

// Mock uuid
jest.mock('uuid', () => ({
  v4: jest.fn().mockReturnValue('mock-uuid-12345'),
}));

describe('importUtils', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('readJsonFile', () => {
    it('should read and parse a JSON file successfully', async () => {
      // Setup
      const mockJsonData = '{"test":"data"}';
      (RNFS.readFile as jest.Mock).mockResolvedValueOnce(mockJsonData);

      // Execute
      const result = await readJsonFile('file:///mock/path/test.json');

      // Verify
      expect(RNFS.readFile).toHaveBeenCalled();
      expect(result).toEqual({test: 'data'});
    });
  });

  describe('validateImportedData', () => {
    it('should validate a single session correctly', () => {
      // Setup
      const mockSession = {
        id: 'test-id',
        title: 'Test Session',
        date: '2024-01-01T12:00:00.000Z',
        messages: [
          {
            id: 'msg1',
            author: 'user',
            text: 'Hello',
            type: 'text',
          },
        ],
        completionSettings: {
          temperature: 0.7,
        },
      };

      // Execute
      const result = validateImportedData(mockSession);

      // Verify
      expect(result).toEqual(mockSession);
    });

    it('should add missing fields with default values', () => {
      // Setup
      const incompleteSession = {
        title: 'Incomplete Session',
      };

      // Execute
      const result = validateImportedData(
        incompleteSession,
      ) as ImportedChatSession;

      // Verify
      expect(result.id).toBe('mock-uuid-12345');
      expect(result.date).toBeDefined();
      expect(result.messages).toEqual([]);
      expect(result.completionSettings).toBeDefined();
    });
  });
});
