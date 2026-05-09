import { IsOptional, IsString } from 'class-validator';

export class UpdateHelpdeskCategoryDto {
  @IsOptional()
  @IsString()
  description?: string | null;
}
