import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateHelpdeskCategoryDto {
  @IsString()
  @IsNotEmpty()
  intent!: string;

  @IsOptional()
  @IsString()
  description?: string | null;

  @IsOptional()
  @IsString()
  pdf_url?: string | null;
}
