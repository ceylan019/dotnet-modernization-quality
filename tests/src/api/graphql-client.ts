import type { APIRequestContext } from '@playwright/test';

export interface GraphQLResponse {
  status: number;
  body: unknown;
  raw: string;
}

export class GraphQLClient {
  constructor(
    private readonly request: APIRequestContext,
    private readonly url: string,
  ) {}

  async send(query: string, variables?: Record<string, unknown>): Promise<GraphQLResponse> {
    const response = await this.request.post(this.url, {
      data: { query, variables },
    });
    const raw = await response.text();
    let body: unknown;
    try {
      body = JSON.parse(raw);
    } catch {
      body = null;
    }
    return { status: response.status(), body, raw };
  }
}
