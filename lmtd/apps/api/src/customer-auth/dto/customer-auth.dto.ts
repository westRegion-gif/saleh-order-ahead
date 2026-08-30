import { IsEmail, IsIn, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

export class RequestOtpDto {
  @IsString()
  @MaxLength(24)
  phone!: string;
}

export class VerifyOtpDto {
  @IsString()
  @MaxLength(24)
  phone!: string;

  @IsString()
  @Matches(/^\d{6}$/)
  code!: string;
}

export class UpdateCustomerProfileDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  fullName?: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(200)
  email?: string;

  @IsOptional()
  @IsIn(['ar', 'en'])
  preferredLanguage?: 'ar' | 'en';
}
