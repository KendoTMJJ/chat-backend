import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

interface MulterFile {
  buffer: Buffer;
  mimetype: string;
  originalname: string;
}

@Injectable()
export class KnowledgeProxyService {
  private readonly baseUrl: string;
  private readonly internalKey: string;

  constructor(private readonly config: ConfigService) {
    this.baseUrl = this.config.getOrThrow<string>('RAG_BASE_URL');
    this.internalKey = this.config.getOrThrow<string>('RAG_INTERNAL_API_KEY');
  }

  async uploadFile(file: MulterFile): Promise<unknown> {
    const url = `${this.baseUrl}/admin/knowledge/upload`;

    const formData = new FormData();
    formData.append(
      'file',
      new Blob([file.buffer as unknown as ArrayBuffer], { type: file.mimetype }),
      file.originalname,
    );

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'x-internal-key': this.internalKey },
        body: formData,
      });

      if (!res.ok) {
        throw new InternalServerErrorException(
          `RAG Backend respondió ${res.status} en /admin/knowledge/upload`,
        );
      }

      return res.json();
    } catch (err) {
      if (err instanceof InternalServerErrorException) throw err;
      throw new InternalServerErrorException(
        `Error comunicando con RAG Backend: ${(err as Error).message}`,
      );
    }
  }
}
