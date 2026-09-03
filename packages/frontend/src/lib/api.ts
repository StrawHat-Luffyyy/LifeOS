import { type ApiResponse, type ApiErrorResponse, type RefreshTokenResponse } from '@lifeos/shared';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

// ---------------------------------------------------------------------------
// Token management (client-side only)
// ---------------------------------------------------------------------------

const TOKEN_KEY = 'lifeos_token';
const REFRESH_TOKEN_KEY = 'lifeos_refresh_token';

export function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function getRefreshToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(REFRESH_TOKEN_KEY);
}

export function setToken(token: string): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(TOKEN_KEY, token);
}

export function setTokens(accessToken: string, refreshToken: string): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(TOKEN_KEY, accessToken);
  localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
}

export function clearTokens(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
}

// Backward-compatible alias
export const clearToken = clearTokens;

// ---------------------------------------------------------------------------
// API Client
// ---------------------------------------------------------------------------

class ApiClient {
  private baseUrl: string;
  private isRefreshing = false;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  private async request<T>(
    path: string,
    options: RequestInit = {},
    isRetry = false,
  ): Promise<ApiResponse<T>> {
    const token = getToken();
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...((options.headers as Record<string, string>) || {}),
    };

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch(`${this.baseUrl}${path}`, {
      ...options,
      headers,
    });

    // Handle token expiration & automatic refresh on 401
    if (response.status === 401 && !isRetry && !path.startsWith('/api/auth/')) {
      const refreshToken = getRefreshToken();
      if (refreshToken && !this.isRefreshing) {
        this.isRefreshing = true;
        try {
          const refreshRes = await fetch(`${this.baseUrl}/api/auth/refresh`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ refreshToken }),
          });

          if (refreshRes.ok) {
            const refreshBody = (await refreshRes.json()) as ApiResponse<RefreshTokenResponse>;
            setTokens(refreshBody.data.token, refreshBody.data.refreshToken);
            this.isRefreshing = false;
            // Retry the original request with the fresh access token
            return this.request<T>(path, options, true);
          } else {
            clearTokens();
          }
        } catch {
          clearTokens();
        } finally {
          this.isRefreshing = false;
        }
      }
    }

    const body = await response.json();

    if (!response.ok) {
      const errorBody = body as ApiErrorResponse;
      throw new ApiError(
        errorBody.error?.message || 'An error occurred',
        errorBody.error?.code || 'UNKNOWN_ERROR',
        response.status,
        errorBody.error?.details,
      );
    }

    return body as ApiResponse<T>;
  }

  async get<T>(path: string): Promise<ApiResponse<T>> {
    return this.request<T>(path, { method: 'GET' });
  }

  async post<T>(path: string, data?: unknown): Promise<ApiResponse<T>> {
    return this.request<T>(path, {
      method: 'POST',
      body: data ? JSON.stringify(data) : undefined,
    });
  }

  async patch<T>(path: string, data?: unknown): Promise<ApiResponse<T>> {
    return this.request<T>(path, {
      method: 'PATCH',
      body: data ? JSON.stringify(data) : undefined,
    });
  }

  async delete<T>(path: string): Promise<ApiResponse<T>> {
    return this.request<T>(path, { method: 'DELETE' });
  }

  async logout(): Promise<void> {
    const refreshToken = getRefreshToken();
    if (refreshToken) {
      try {
        await fetch(`${this.baseUrl}/api/auth/logout`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken }),
        });
      } catch {
        // Ignore network errors during logout
      }
    }
    clearTokens();
  }
}

// ---------------------------------------------------------------------------
// Error class for API errors
// ---------------------------------------------------------------------------

export class ApiError extends Error {
  public readonly code: string;
  public readonly status: number;
  public readonly details?: Record<string, unknown>;

  constructor(
    message: string,
    code: string,
    status: number,
    details?: Record<string, unknown>,
  ) {
    super(message);
    this.code = code;
    this.status = status;
    this.details = details;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

// Singleton API client
export const api = new ApiClient(API_BASE_URL);
