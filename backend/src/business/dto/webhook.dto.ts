import { IsUrl } from 'class-validator';

export class RegisterWebhookDto {
  @IsUrl({}, { message: 'webhook_url must be a valid URL' })
  webhook_url: string;
}
