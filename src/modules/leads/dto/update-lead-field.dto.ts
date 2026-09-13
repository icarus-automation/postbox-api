import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsString,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';

// An omitted property is left alone. Unlike @IsOptional(), null is validated and
// refused instead of passing for omitted.
const isGiven = (_body: object, value: unknown): boolean => value !== undefined;

// key and type never change, so they are not accepted here.
export class UpdateLeadFieldDTO {
  @ValidateIf(isGiven)
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  label?: string;

  @ValidateIf(isGiven)
  @IsBoolean()
  isRequired?: boolean;

  @ValidateIf(isGiven)
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ArrayUnique()
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  @MaxLength(80, { each: true })
  options?: string[];

  @ValidateIf(isGiven)
  @IsInt()
  @Min(0)
  position?: number;
}
