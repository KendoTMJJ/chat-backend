import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';

export class BotReplyDto {
  @IsString()
  @IsNotEmpty()
  chatSessionId: string;

  @IsString()
  @IsNotEmpty()
  message: string;

  @IsBoolean()
  @Transform(({ value }) => {
    if (value === 'true') return true;
    if (value === 'false') return false;
    return value;
  })
  resolved: boolean;

  @IsOptional()
  @IsIn(['posgrados', 'mesa_ayuda'])
  context?: 'posgrados' | 'mesa_ayuda';
}
