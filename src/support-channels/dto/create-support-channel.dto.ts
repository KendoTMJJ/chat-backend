import { IsEmail, IsEnum, IsOptional, IsString } from 'class-validator';
import { ChannelContext } from '../entities/supportChannel';

export class CreateSupportChannelDto {
  @IsEnum(ChannelContext)
  context: ChannelContext;

  @IsOptional()
  @IsString()
  intent?: string | null;

  @IsString()
  whatsapp: string;

  @IsEmail()
  email: string;
}
