import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Max,
  Min,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

import {
  IMAGE_CONTENT_TYPES,
  MAX_IMAGE_BYTES,
  type ImageContentType,
} from '../blog/document/blog.types';

export class SlugPreviewDto {
  @IsString()
  slug: string;
}

export class LogoHoldDto {
  @IsIn(IMAGE_CONTENT_TYPES)
  contentType: ImageContentType;

  @IsInt()
  @Min(1)
  @Max(MAX_IMAGE_BYTES)
  byteSize: number;
}

export class FoundWorkspaceDto {
  @IsString()
  @Length(1, 100)
  name: string;

  @IsString()
  @Length(1, 80)
  slug: string;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  website?: string | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  logoHoldKey?: string | null;
}

export class LogoChangeDto {
  @IsIn(['unchanged', 'clear', 'hold'])
  kind: 'unchanged' | 'clear' | 'hold';

  @ValidateIf((logo: LogoChangeDto) => logo.kind === 'hold')
  @IsString()
  @MinLength(1)
  storageKey?: string;
}

export class SaveProfileDto {
  @IsString()
  @Length(1, 100)
  name: string;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  website?: string | null;

  @ValidateNested()
  @Type(() => LogoChangeDto)
  logo: LogoChangeDto;
}
