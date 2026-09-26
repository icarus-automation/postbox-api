import { IsIn, IsInt, Max, Min } from 'class-validator';

import {
  IMAGE_CONTENT_TYPES,
  MAX_IMAGE_BYTES,
  type ImageContentType,
} from '../document/blog.types';

export class CreateMediaUploadDTO {
  @IsIn(IMAGE_CONTENT_TYPES)
  contentType: ImageContentType;

  @IsInt()
  @Min(1)
  @Max(MAX_IMAGE_BYTES)
  byteSize: number;
}
