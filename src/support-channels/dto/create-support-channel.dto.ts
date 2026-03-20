import { IsEmail, IsEnum, IsString } from 'class-validator';
import { ChannelContext } from '../entities/supportChannel';

export class CreateSupportChannelDto {
  @IsEnum(ChannelContext)
  context: ChannelContext;

  @IsString()
  whatsapp: string;

  @IsEmail()
  email: string;
}
