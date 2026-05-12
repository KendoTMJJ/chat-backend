import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class HelpdeskProxyService {
  private readonly logger = new Logger(HelpdeskProxyService.name);
  private readonly baseUrl: string;
  private readonly internalKey: string;

  constructor(private readonly config: ConfigService) {
    this.baseUrl = this.config.getOrThrow<string>('RAG_BASE_URL');
    this.internalKey = this.config.getOrThrow<string>('RAG_INTERNAL_API_KEY');
  }

  private headers(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      'x-internal-key': this.internalKey,
    };
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
    params?: Record<string, string>,
  ): Promise<T> {
    const url = new URL(this.baseUrl + path);
    if (params) {
      Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
    }

    try {
      const res = await fetch(url.toString(), {
        method,
        headers: this.headers(),
        body: body ? JSON.stringify(body) : undefined,
      });

      const data = await res.json();

      if (!res.ok) {
        throw new InternalServerErrorException(
          `RAG Backend respondió ${res.status} en ${path}`,
        );
      }

      return data as T;
    } catch (err) {
      if (err instanceof InternalServerErrorException) throw err;
      throw new InternalServerErrorException(
        `Error comunicando con RAG Backend: ${(err as Error).message}`,
      );
    }
  }

  async listPublic(): Promise<Array<{ intent: string; display_label: string; description: string | null; has_document: boolean; document_url: string | null }>> {
    try {
      const res = await fetch(`${this.baseUrl}/helpdesk/categories`);
      if (!res.ok) return [];
      return res.json();
    } catch {
      return [];
    }
  }

  list(intent?: string) {
    const params: Record<string, string> = {};
    if (intent) params['intent'] = intent;
    return this.request('GET', '/helpdesk/admin/categories', undefined, params);
  }

  getOne(id: number) {
    return this.request('GET', `/helpdesk/admin/categories/${id}`);
  }

  create(body: unknown) {
    return this.request('POST', '/helpdesk/admin/categories', body);
  }

  update(id: number, body: unknown) {
    return this.request('PATCH', `/helpdesk/admin/categories/${id}`, body);
  }

  remove(id: number) {
    return this.request('DELETE', `/helpdesk/admin/categories/${id}`);
  }

  async uploadDocument(id: number, buffer: Buffer, filename: string, mimetype: string): Promise<unknown> {
    const url = `${this.baseUrl}/helpdesk/admin/categories/${id}/document`;
    const form = new FormData();
    form.append('file', new Blob([new Uint8Array(buffer)], { type: mimetype }), filename);

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'x-internal-key': this.internalKey },
        body: form,
      });
      const data = await res.json();
      if (!res.ok) {
        throw new InternalServerErrorException(
          `RAG Backend respondió ${res.status} al subir documento`,
        );
      }
      return data;
    } catch (err) {
      if (err instanceof InternalServerErrorException) throw err;
      throw new InternalServerErrorException(
        `Error subiendo documento: ${(err as Error).message}`,
      );
    }
  }

  deleteDocument(id: number) {
    return this.request('DELETE', `/helpdesk/admin/categories/${id}/document`);
  }
}
