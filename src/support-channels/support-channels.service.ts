// src/support-channels/support-channels.service.ts
import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { Repository } from 'typeorm';
import { SupportChannel } from './entities/supportChannel';
import { DataSource } from 'typeorm'; // ← corregido: era 'typeorm/browser'

@Injectable()
export class SupportChannelsService {
  private SupportChannelRepository: Repository<SupportChannel>;

  constructor(private poolConection: DataSource) {
    this.SupportChannelRepository = poolConection.getRepository(SupportChannel);
  }

  public async showSupportChannels(): Promise<SupportChannel[]> {
    return await this.SupportChannelRepository.find();
  }

  public async createSupportChannel(
    objSupportChannel: SupportChannel,
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

  public async deleteRecipie(id: string) {
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
    objSupportChannel: SupportChannel,
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
