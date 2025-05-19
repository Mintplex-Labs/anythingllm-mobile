import Share from 'react-native-share';
import * as RNFS from '@dr.pogodin/react-native-fs';
import {exportLegacyChatSessions} from '../exportUtils';

// Mock dependencies
jest.mock('react-native', () => ({
  Platform: {
    OS: 'ios',
  },
  Alert: {
    alert: jest.fn(),
  },
}));

// Mock react-native-share
jest.mock('react-native-share', () => ({
  open: jest.fn().mockResolvedValue({success: true}),
}));

jest.mock('@dr.pogodin/react-native-fs', () => ({
  writeFile: jest.fn().mockResolvedValue(undefined),
  readFile: jest.fn().mockResolvedValue('{"legacy":"data"}'),
  exists: jest.fn().mockResolvedValue(true),
  copyFile: jest.fn().mockResolvedValue(undefined),
  DocumentDirectoryPath: '/mock/document/path',
  CachesDirectoryPath: '/mock/cache/path',
  DownloadDirectoryPath: '/mock/download/path',
}));

jest.mock('date-fns', () => ({
  format: jest.fn().mockReturnValue('2024-01-01_12-00-00'),
}));

jest.mock('../../repositories/ChatSessionRepository');

describe('exportUtils', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('exportLegacyChatSessions', () => {
    it('should export legacy sessions if file exists', async () => {
      // Setup
      (RNFS.exists as jest.Mock).mockResolvedValueOnce(true);

      // Execute
      await exportLegacyChatSessions();

      // Verify
      expect(RNFS.exists).toHaveBeenCalled();
      expect(RNFS.readFile).toHaveBeenCalled();
      expect(RNFS.writeFile).toHaveBeenCalled();
      expect(Share.open).toHaveBeenCalled();
    });
  });
});
