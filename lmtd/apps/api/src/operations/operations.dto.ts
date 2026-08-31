import { IsIn, IsOptional, IsString } from 'class-validator';

export class UpdateOperationalOrderStatusDto {
  @IsIn(['ACCEPTED', 'PREPARING', 'READY', 'CUSTOMER_ARRIVED', 'COLLECTED', 'COMPLETED'])
  status!: string;

  @IsOptional()
  @IsString()
  note?: string;
}

export class UpdatePrintJobDto {
  @IsIn(['PRINTING', 'COMPLETED', 'FAILED'])
  status!: string;

  @IsOptional()
  @IsString()
  error?: string;
}
