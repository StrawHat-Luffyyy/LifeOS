import { describe, it, expect, vi, beforeEach } from 'vitest';
import { connectGitHub, disconnectGitHub, getConnection, getDecryptedToken } from './integration.service.js';
import * as integrationRepo from './integration.repository.js';
import { githubClient } from '../../lib/github-client.js';
import { NotFoundError, UnauthorizedError } from '../../lib/errors.js';
import { encryptToken } from '../../lib/encryption.js';

const { mockTransaction } = vi.hoisted(() => ({
  mockTransaction: vi.fn(),
}));

vi.mock('../../db/index.js', () => ({
  db: {
    transaction: mockTransaction,
  },
}));

vi.mock('../../db/schema/index.js', () => ({
  integrations: { id: 'id', userId: 'user_id', provider: 'provider' },
  activityEvents: {},
}));

vi.mock('./integration.repository.js', () => ({
  findByUserIdAndProvider: vi.fn(),
  upsertIntegration: vi.fn(),
  deleteByUserIdAndProvider: vi.fn(),
}));

vi.mock('../../lib/github-client.js', () => ({
  githubClient: {
    validateToken: vi.fn(),
  },
}));

describe('IntegrationService (GitHub)', () => {
  const userId = 'user-123-uuid';
  const token = 'ghp_secretPersonalAccessToken123';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('connectGitHub', () => {
    it('validates PAT, encrypts token at rest, persists integration, and logs activity event', async () => {
      vi.mocked(githubClient.validateToken).mockResolvedValue({
        login: 'octocat',
        avatarUrl: 'https://github.com/octocat.png',
        name: 'The Octocat',
      });

      let savedData: any = null;
      let loggedActivity: any = null;

      vi.mocked(integrationRepo.upsertIntegration).mockImplementation(async (data) => {
        savedData = data;
        return {
          id: 'int-uuid-456',
          userId: data.userId,
          provider: data.provider,
          encryptedToken: data.encryptedToken,
          iv: data.iv,
          authTag: data.authTag,
          metadata: data.metadata,
          connectedAt: new Date('2026-09-09T10:00:00Z'),
          createdAt: new Date('2026-09-09T10:00:00Z'),
          updatedAt: new Date('2026-09-09T10:00:00Z'),
        } as any;
      });

      mockTransaction.mockImplementation(async (cb: any) => {
        const tx = {
          insert: vi.fn().mockReturnValue({
            values: vi.fn().mockImplementation((val) => {
              loggedActivity = val;
              return Promise.resolve();
            }),
          }),
        };
        return cb(tx);
      });

      const result = await connectGitHub(userId, token);

      // Verify token was validated
      expect(githubClient.validateToken).toHaveBeenCalledWith(token);

      // Verify stored data is encrypted — never plaintext
      expect(savedData).toBeDefined();
      expect(savedData.encryptedToken).not.toBe(token);
      expect(savedData.encryptedToken).not.toContain(token);
      expect(savedData.iv).toBeDefined();
      expect(savedData.authTag).toBeDefined();
      expect(savedData.metadata).toEqual({
        username: 'octocat',
        avatarUrl: 'https://github.com/octocat.png',
        name: 'The Octocat',
      });

      // Verify activity was logged
      expect(loggedActivity).toBeDefined();
      expect(loggedActivity.eventType).toBe('GITHUB_CONNECTED');
      expect(loggedActivity.entityType).toBe('integration');
      expect(loggedActivity.summary).toContain('@octocat');

      // Verify returned DTO does not leak credentials
      expect(result.provider).toBe('github');
      expect(result.metadata?.username).toBe('octocat');
      expect((result as any).encryptedToken).toBeUndefined();
      expect((result as any).token).toBeUndefined();
      expect((result as any).iv).toBeUndefined();
      expect((result as any).authTag).toBeUndefined();
    });

    it('rejects connection when GitHub rejects the PAT', async () => {
      vi.mocked(githubClient.validateToken).mockRejectedValue(
        new UnauthorizedError('Invalid or expired GitHub Personal Access Token'),
      );

      await expect(connectGitHub(userId, 'invalid-pat')).rejects.toThrow(UnauthorizedError);
      expect(integrationRepo.upsertIntegration).not.toHaveBeenCalled();
    });
  });

  describe('disconnectGitHub', () => {
    it('deletes integration and logs activity event', async () => {
      vi.mocked(integrationRepo.findByUserIdAndProvider).mockResolvedValue({
        id: 'int-uuid-456',
        userId,
        provider: 'github',
      } as any);

      let loggedActivity: any = null;
      mockTransaction.mockImplementation(async (cb: any) => {
        const tx = {
          insert: vi.fn().mockReturnValue({
            values: vi.fn().mockImplementation((val) => {
              loggedActivity = val;
              return Promise.resolve();
            }),
          }),
        };
        return cb(tx);
      });

      const res = await disconnectGitHub(userId);
      expect(res).toEqual({ disconnected: true });
      expect(integrationRepo.deleteByUserIdAndProvider).toHaveBeenCalledWith(userId, 'github', expect.anything());
      expect(loggedActivity.eventType).toBe('GITHUB_DISCONNECTED');
    });

    it('throws NotFoundError if no GitHub integration exists', async () => {
      vi.mocked(integrationRepo.findByUserIdAndProvider).mockResolvedValue(undefined);
      await expect(disconnectGitHub(userId)).rejects.toThrow(NotFoundError);
    });
  });

  describe('getConnection', () => {
    it('returns null when user has not connected GitHub', async () => {
      vi.mocked(integrationRepo.findByUserIdAndProvider).mockResolvedValue(undefined);
      const res = await getConnection(userId);
      expect(res).toBeNull();
    });

    it('returns sanitized IntegrationDto without exposing encryptedToken', async () => {
      vi.mocked(integrationRepo.findByUserIdAndProvider).mockResolvedValue({
        id: 'int-123',
        userId,
        provider: 'github',
        encryptedToken: 'secret_cipher',
        iv: 'iv_value',
        authTag: 'tag_value',
        metadata: { username: 'luffy' },
        connectedAt: new Date('2026-09-09T10:00:00Z'),
        createdAt: new Date('2026-09-09T10:00:00Z'),
        updatedAt: new Date('2026-09-09T10:00:00Z'),
      } as any);

      const res = await getConnection(userId);
      expect(res).toBeDefined();
      expect(res?.provider).toBe('github');
      expect(res?.metadata?.username).toBe('luffy');
      expect((res as any).encryptedToken).toBeUndefined();
    });
  });

  describe('getDecryptedToken', () => {
    it('decrypts and returns the original plaintext token', async () => {
      const originalToken = 'ghp_RealSecretToken1234567890';
      const encrypted = encryptToken(originalToken);

      vi.mocked(integrationRepo.findByUserIdAndProvider).mockResolvedValue({
        id: 'int-123',
        userId,
        provider: 'github',
        encryptedToken: encrypted.ciphertext,
        iv: encrypted.iv,
        authTag: encrypted.authTag,
      } as any);

      const decrypted = await getDecryptedToken(userId);
      expect(decrypted).toBe(originalToken);
    });

    it('throws NotFoundError when not connected', async () => {
      vi.mocked(integrationRepo.findByUserIdAndProvider).mockResolvedValue(undefined);
      await expect(getDecryptedToken(userId)).rejects.toThrow(NotFoundError);
    });
  });
});
