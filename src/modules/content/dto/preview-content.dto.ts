import { ArrayMaxSize, IsArray } from 'class-validator';

export class PreviewContentDTO {
  @IsArray()
  @ArrayMaxSize(100)
  blocks: unknown[];
}
