import { IsString, IsUrl, Length, ValidateIf } from 'class-validator';

export class SetWebhookDTO {
  @ValidateIf((_, value) => value !== null)
  @IsUrl({ protocols: ['http', 'https'], require_protocol: true, require_tld: false })
  url: string | null;

  @ValidateIf((body: SetWebhookDTO) => body.url !== null)
  @IsString()
  @Length(1, 500)
  secret?: string;
}
