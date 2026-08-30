import { IsOptional, IsString, Matches, MaxLength } from 'class-validator';

export class RequestOtpDto {
  @IsString()
  @MaxLength(32)
  phone!: string;
}

export class VerifyOtpDto {
  @IsString()
  @MaxLength(32)
  phone!: string;

  @IsString()
  @Matches(/^\d{6}$/)
  code!: string;
}

export class UpdateCustomerDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  fullName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(16)
  preferredLanguage?: string;
}
