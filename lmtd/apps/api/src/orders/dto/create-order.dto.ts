import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsIn, IsInt, IsOptional, IsString, IsUUID, MaxLength, Min, ValidateNested } from 'class-validator';

export class CreateOrderModifierDto {
  @IsUUID()
  modifierId!: string;
}

export class CreateOrderItemDto {
  @IsUUID()
  productId!: string;

  @IsInt()
  @Min(1)
  quantity!: number;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateOrderModifierDto)
  modifiers!: CreateOrderModifierDto[];

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class CreateOrderDto {
  @IsUUID()
  branchId!: string;

  @IsIn(['WALK_IN', 'VEHICLE'])
  pickupMethod!: 'WALK_IN' | 'VEHICLE';

  @IsString()
  @MaxLength(120)
  idempotencyKey!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateOrderItemDto)
  items!: CreateOrderItemDto[];

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  vehiclePlate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  vehicleEmirate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  vehicleMakeModel?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  vehicleColor?: string;
}
