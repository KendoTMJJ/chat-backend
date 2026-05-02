// src/support-channels/support-channels.service.ts
import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { Repository } from 'typeorm';
import { SupportChannel } from './entities/supportChannel';
import { DataSource } from 'typeorm';
import { CreateSupportChannelDto } from './dto/create-support-channel.dto';
import { UpdateSupportChannelDto } from './dto/update-support-channel.dto';

@Injectable()
export class SupportChannelsService {
  private SupportChannelRepository: Repository<SupportChannel>;

  constructor(private poolConection: DataSource) {
    this.SupportChannelRepository = poolConection.getRepository(SupportChannel);
  }

  public async showSupportChannels(): Promise<SupportChannel[]> {
    return await this.SupportChannelRepository.find();
  }

  /**
   * Busca el canal más específico disponible para un contexto e intent.
   * Prioridad: (context + intent) → (context + intent=null) → null
   */
  public async findByContextAndIntent(
    context: string,
    intent?: string | null,
  ): Promise<SupportChannel | null> {
    // 1. Canal específico del intent
    if (intent) {
      const specific = await this.SupportChannelRepository.findOne({
        where: { context: context as any, intent },
      });
      if (specific) return specific;
    }

    // 2. Canal genérico del contexto (intent = null)
    const generic = await this.SupportChannelRepository.findOne({
      where: { context: context as any, intent: null as any },
    });
    return generic ?? null;
  }

  public async createSupportChannel(
    objSupportChannel: CreateSupportChannelDto,
  ): Promise<SupportChannel> {
    try {
      return await this.SupportChannelRepository.save(objSupportChannel);
    } catch (error) {
      throw new HttpException(
        'Error al crear el canal de soporte',
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  public async deleteChannel(id: string) {
    try {
      return await this.SupportChannelRepository.delete({ id });
    } catch (error) {
      throw new HttpException(
        'No se pudo eliminar el canal de soporte',
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  public async updateSupportChannel(
    objSupportChannel: UpdateSupportChannelDto,
  ): Promise<any> {
    try {
      return await this.SupportChannelRepository.update(
        { id: objSupportChannel.id },
        objSupportChannel,
      );
    } catch (error) {
      throw new HttpException(
        'Error al actualizar el canal de soporte',
        HttpStatus.BAD_REQUEST,
      );
    }
  }
}
