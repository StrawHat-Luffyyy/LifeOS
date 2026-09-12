import { AppError } from './errors.js';

export interface GoogleTokenResponse {
  accessToken: string;
  refreshToken?: string;
  expiresIn: number;
  tokenType: string;
  scope: string;
}

export interface GoogleUserInfo {
  email: string;
  name?: string;
  picture?: string;
}

export interface GoogleCalendarEvent {
  id: string;
  summary: string;
  startTime: string;
  endTime: string;
  location?: string;
  htmlLink?: string;
}

interface RawGoogleCalendarEvent {
  id: string;
  status?: string;
  summary?: string;
  start?: {
    dateTime?: string;
    date?: string;
  };
  end?: {
    dateTime?: string;
    date?: string;
  };
  location?: string;
  htmlLink?: string;
}

interface RawCalendarListResponse {
  items?: RawGoogleCalendarEvent[];
  error?: {
    message?: string;
    code?: number;
  };
}

export class GoogleCalendarClient {
  private readonly tokenEndpoint = 'https://oauth2.googleapis.com/token';
  private readonly userInfoEndpoint = 'https://www.googleapis.com/oauth2/v2/userinfo';
  private readonly calendarEndpoint = 'https://www.googleapis.com/calendar/v3/calendars/primary/events';

  /**
   * Generates Google OAuth 2.0 authorization URL with offline access and consent prompt.
   */
  getAuthorizationUrl(params: { clientId: string; redirectUri: string; state: string }): string {
    const scopes = [
      'https://www.googleapis.com/auth/calendar.readonly',
      'https://www.googleapis.com/auth/userinfo.email',
    ].join(' ');

    const searchParams = new URLSearchParams({
      client_id: params.clientId,
      redirect_uri: params.redirectUri,
      response_type: 'code',
      scope: scopes,
      access_type: 'offline',
      prompt: 'consent',
      state: params.state,
    });

    return `https://accounts.google.com/o/oauth2/v2/auth?${searchParams.toString()}`;
  }

  /**
   * Exchanges an authorization code for access and refresh tokens.
   */
  async exchangeCode(params: {
    code: string;
    clientId: string;
    clientSecret: string;
    redirectUri: string;
  }): Promise<GoogleTokenResponse> {
    const body = new URLSearchParams({
      code: params.code,
      client_id: params.clientId,
      client_secret: params.clientSecret,
      redirect_uri: params.redirectUri,
      grant_type: 'authorization_code',
    });

    const res = await fetch(this.tokenEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: body.toString(),
    });

    const data = (await res.json()) as {
      access_token?: string;
      refresh_token?: string;
      expires_in?: number;
      token_type?: string;
      scope?: string;
      error?: string;
      error_description?: string;
    };

    if (!res.ok || !data.access_token) {
      throw new AppError(
        data.error_description || data.error || 'Failed to exchange authorization code with Google',
        res.status >= 400 && res.status < 500 ? 400 : 502,
        'GOOGLE_OAUTH_EXCHANGE_FAILED',
      );
    }

    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresIn: data.expires_in ?? 3600,
      tokenType: data.token_type ?? 'Bearer',
      scope: data.scope ?? '',
    };
  }

  /**
   * Refreshes an expired access token using the stored refresh token.
   */
  async refreshAccessToken(params: {
    refreshToken: string;
    clientId: string;
    clientSecret: string;
  }): Promise<{ accessToken: string; expiresIn: number }> {
    const body = new URLSearchParams({
      refresh_token: params.refreshToken,
      client_id: params.clientId,
      client_secret: params.clientSecret,
      grant_type: 'refresh_token',
    });

    const res = await fetch(this.tokenEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: body.toString(),
    });

    const data = (await res.json()) as {
      access_token?: string;
      expires_in?: number;
      error?: string;
      error_description?: string;
    };

    if (!res.ok || !data.access_token) {
      throw new AppError(
        data.error_description || data.error || 'Failed to refresh Google access token',
        res.status >= 400 && res.status < 500 ? 401 : 502,
        'GOOGLE_TOKEN_REFRESH_FAILED',
      );
    }

    return {
      accessToken: data.access_token,
      expiresIn: data.expires_in ?? 3600,
    };
  }

  /**
   * Fetches the user's Google email address using an active access token.
   */
  async getUserInfo(accessToken: string): Promise<GoogleUserInfo> {
    const res = await fetch(this.userInfoEndpoint, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    const data = (await res.json()) as {
      email?: string;
      name?: string;
      picture?: string;
      error?: { message?: string };
    };

    if (!res.ok || !data.email) {
      throw new AppError(
        data.error?.message || 'Failed to fetch Google user info',
        res.status >= 400 && res.status < 500 ? 401 : 502,
        'GOOGLE_USER_INFO_FAILED',
      );
    }

    return {
      email: data.email,
      name: data.name,
      picture: data.picture,
    };
  }

  /**
   * Lists events from the primary calendar within the specified time range.
   */
  async listEvents(
    accessToken: string,
    timeMin: string,
    timeMax: string,
  ): Promise<GoogleCalendarEvent[]> {
    const query = new URLSearchParams({
      timeMin,
      timeMax,
      singleEvents: 'true',
      orderBy: 'startTime',
    });

    const url = `${this.calendarEndpoint}?${query.toString()}`;
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    const data = (await res.json()) as RawCalendarListResponse;

    if (!res.ok) {
      throw new AppError(
        data.error?.message || 'Failed to fetch Google Calendar events',
        res.status >= 400 && res.status < 500 ? 401 : 502,
        'GOOGLE_CALENDAR_FETCH_FAILED',
      );
    }

    const items = data.items ?? [];

    return items
      .filter((item) => item.id && item.status !== 'cancelled')
      .map((item) => {
        // Handle all-day vs timed events
        const startIso = item.start?.dateTime || (item.start?.date ? `${item.start.date}T00:00:00.000Z` : new Date().toISOString());
        const endIso = item.end?.dateTime || (item.end?.date ? `${item.end.date}T23:59:59.999Z` : startIso);

        return {
          id: item.id,
          summary: item.summary?.trim() || '(No title)',
          startTime: startIso,
          endTime: endIso,
          location: item.location?.trim() || undefined,
          htmlLink: item.htmlLink || undefined,
        };
      });
  }
}

export const googleCalendarClient = new GoogleCalendarClient();
