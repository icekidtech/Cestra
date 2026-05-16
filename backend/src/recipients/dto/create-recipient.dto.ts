import { IsString, IsNotEmpty, IsISO31661Alpha2 } from 'class-validator';

export class CreateRecipientDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsISO31661Alpha2({ message: 'country must be a valid ISO 3166-1 alpha-2 country code' })
  country: string;

  @IsString()
  @IsNotEmpty()
  mobile_money_type: string;

  @IsString()
  @IsNotEmpty()
  account_number: string;
}
