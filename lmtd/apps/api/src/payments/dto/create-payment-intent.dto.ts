import { IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

export class CreatePaymentIntentDto {
  @IsUUID()
  orderId!: string;

  @IsString()
  @MinLength(16)
  @MaxLength(120)
  idempotencyKey!: string;
}
