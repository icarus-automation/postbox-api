import { ArrayMaxSize, IsArray, IsOptional, IsString, IsUUID, Length, Matches, ValidateIf } from 'class-validator';

export class UpdateDraftDTO {
  @IsOptional()
  @IsString()
  @Length(1, 200)
  title?: string;

  @IsOptional()
  @IsString()
  @Length(1, 200)
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  slug?: string;

  @IsOptional()
  @IsString()
  @Length(0, 500)
  excerpt?: string;

  @IsOptional()
  @IsString()
  @Length(0, 200)
  metaTitle?: string;

  @IsOptional()
  @IsString()
  @Length(0, 500)
  metaDescription?: string;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsUUID()
  ogImageId?: string | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsUUID()
  coverImageId?: string | null;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  blocks?: unknown[];
}
