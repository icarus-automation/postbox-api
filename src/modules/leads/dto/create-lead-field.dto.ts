import { FieldType } from '@prisma/client';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';

// datetime stays with the read-only system fields for now.
const CUSTOM_FIELD_TYPES = [
  FieldType.text,
  FieldType.long_text,
  FieldType.number,
  FieldType.select,
  FieldType.url,
  FieldType.date,
];

export class CreateLeadFieldDTO {
  @Matches(/^[a-z][a-zA-Z0-9]*$/, {
    message:
      'key must start with a lowercase letter and contain only letters and digits',
  })
  @MaxLength(40)
  key: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  label: string;

  @IsIn(CUSTOM_FIELD_TYPES)
  type: FieldType;

  @IsOptional()
  @IsBoolean()
  isRequired?: boolean;

  // Required on select fields and refused on the rest, which LeadFieldsService
  // checks because it depends on type.
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ArrayUnique()
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  @MaxLength(80, { each: true })
  options?: string[];
}
