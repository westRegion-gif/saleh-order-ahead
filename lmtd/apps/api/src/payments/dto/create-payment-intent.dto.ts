import { IsString, IsUUID, MaxLength } from 'class-validator';

export class CreatePaymentIntentDto {
  @IsUUID()
  orderId!: string;

  @IsString()
  @MaxLength(120)
  idempotencyKey!: string;
}
