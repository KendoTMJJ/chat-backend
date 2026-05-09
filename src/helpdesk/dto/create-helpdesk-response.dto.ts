import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateHelpdeskCategoryDto {
  @IsString()
  @IsNotEmpty()
  intent!: string;

  @IsOptional()
  @IsString()
  description?: string | null;
}
