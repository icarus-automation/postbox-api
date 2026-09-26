import { IsString, Length } from 'class-validator';

export class ConfirmMediaDTO {
  @IsString()
  @Length(1, 500)
  storageKey: string;

  @IsString()
  @Length(1, 500)
  alt: string;
}
