import { IsEmail, IsOptional, IsString, MinLength } from 'class-validator';

export class RegisterDto {
  @IsEmail({}, { message: 'Введите корректный email' })
  email!: string;

  @IsString()
  @MinLength(8, { message: 'Пароль не короче 8 символов' })
  password!: string;

  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  phone?: string;
}

export class LoginDto {
  @IsEmail({}, { message: 'Введите корректный email' })
  email!: string;

  @IsString({ message: 'Введите пароль' })
  password!: string;
}

export class RefreshDto {
  @IsString()
  refreshToken!: string;
}
