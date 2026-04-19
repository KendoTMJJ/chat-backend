import { IsOptional, IsString } from 'class-validator';

export class UpdateHelpdeskCategoryDto {
  @IsOptional()
  @IsString()
  label?: string;

  @IsOptional()
  @IsString()
  description?: string | null;

  @IsOptional()
  @IsString()
  pdf_url?: string | null;
}
