import { IsEmail, IsOptional, IsString, IsUUID } from 'class-validator';

export class UpdateSupportChannelDto {
  @IsUUID()
  id: string;

  @IsString()
  @IsOptional()
  whatsapp?: string;

  @IsEmail()
  @IsOptional()
  email?: string;
}
