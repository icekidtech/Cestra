import { IsString, IsNotEmpty, IsIn } from 'class-validator';

export class LoginDto {
  @IsString()
  @IsNotEmpty()
  zklogin_token: string;

  @IsIn(['google', 'apple'])
  provider: 'google' | 'apple';
}
