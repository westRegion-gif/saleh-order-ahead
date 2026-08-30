import { IsEmail, IsIn, IsOptional, IsString, Matches, MaxLength, ValidateIf } from 'class-validator';

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
  @ValidateIf((_object, value) => value !== '')
  @IsEmail()
  @MaxLength(200)
  email?: string;

  @IsOptional()
  @IsIn(['ar', 'en'])
  preferredLanguage?: 'ar' | 'en';
}
