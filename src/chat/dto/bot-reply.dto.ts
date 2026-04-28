import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';

class ButtonDto {
  @IsString()
  @IsNotEmpty()
  label!: string;

  @IsOptional()
  @IsString()
  message?: string;

  @IsOptional()
  @IsString()
  url?: string;
}

export class BotReplyDto {
  @IsString()
  @IsNotEmpty()
  chatSessionId!: string;

  @IsString()
  @IsNotEmpty()
  message!: string;

  @IsBoolean()
  @Transform(({ value }) => {
    if (value === 'true') return true;
    if (value === 'false') return false;
    return value;
  })
  resolved!: boolean;

  @IsOptional()
  @IsIn(['posgrados', 'mesa_ayuda'])
  context?: 'posgrados' | 'mesa_ayuda';

  @IsOptional()
  @IsString()
  intent?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ButtonDto)
  buttons?: ButtonDto[];
}
