import { ArrayMaxSize, IsArray } from 'class-validator';

export class PreviewPostDTO {
  @IsArray()
  @ArrayMaxSize(100)
  blocks: unknown[];
}
