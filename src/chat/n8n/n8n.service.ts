import { Injectable } from '@nestjs/common';
import axios from 'axios';

type N8nMeta = {
  source?: 'text' | 'quick_reply';
  optionId?: string;
};

@Injectable()
export class N8nService {
  private readonly webhookUrl = String(process.env.POST);

  async sendMessage(payload: {
    chatSessionId: string;
    message: string;
    userId: string;

    isFirstTurn?: boolean;
    meta?: N8nMeta;
  }) {
    await axios.post(this.webhookUrl, payload);
  }
}
