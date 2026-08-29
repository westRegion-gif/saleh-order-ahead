import { Type } from 'class-transformer';
import { IsArray, IsBoolean, IsInt, IsNumber, IsOptional, IsString, IsUUID, Min } from 'class-validator';

export class CreateProductDto {
  @IsString() sku!: string;
  @IsString() nameAr!: string;
  @IsOptional() @IsString() nameEn?: string;
  @IsOptional() @IsString() descriptionAr?: string;
  @IsOptional() @IsString() descriptionEn?: string;
  @IsOptional() @IsString() imageUrl?: string;
  @Type(() => Number) @IsNumber() @Min(0) basePrice!: number;
  @IsOptional() @IsUUID() categoryId?: string;
  @IsOptional() @Type(() => Number) @IsInt() sortOrder?: number;
  @IsOptional() @IsBoolean() isActive?: boolean;
}
export class UpdateProductDto {
  @IsOptional() @IsString() sku?: string;
  @IsOptional() @IsString() nameAr?: string;
  @IsOptional() @IsString() nameEn?: string;
  @IsOptional() @IsString() descriptionAr?: string;
  @IsOptional() @IsString() descriptionEn?: string;
  @IsOptional() @IsString() imageUrl?: string;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) basePrice?: number;
  @IsOptional() @IsUUID() categoryId?: string;
  @IsOptional() @Type(() => Number) @IsInt() sortOrder?: number;
  @IsOptional() @IsBoolean() isActive?: boolean;
}
export class CreateCategoryDto {
  @IsString() nameAr!: string;
  @IsOptional() @IsString() nameEn?: string;
  @IsOptional() @IsString() imageUrl?: string;
  @IsOptional() @Type(() => Number) @IsInt() sortOrder?: number;
  @IsOptional() @IsBoolean() isActive?: boolean;
}
export class UpdateCategoryDto {
  @IsOptional() @IsString() nameAr?: string;
  @IsOptional() @IsString() nameEn?: string;
  @IsOptional() @IsString() imageUrl?: string;
  @IsOptional() @Type(() => Number) @IsInt() sortOrder?: number;
  @IsOptional() @IsBoolean() isActive?: boolean;
}
export class SetBranchProductDto {
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) priceOverride?: number;
  @IsBoolean() isAvailable!: boolean;
  @IsOptional() @IsString() soldOutReason?: string;
}
export class SetBranchModifierDto {
  @IsBoolean() isAvailable!: boolean;
  @IsOptional() @Type(() => Number) @IsNumber() priceDeltaOverride?: number;
}
export class CreateBranchDto {
  @IsString() code!: string;
  @IsString() nameAr!: string;
  @IsOptional() @IsString() nameEn?: string;
  @IsOptional() @IsString() addressAr?: string;
  @IsOptional() @IsString() addressEn?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsString() imageUrl?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsOptional() @IsBoolean() acceptsOrders?: boolean;
}
export class UpdateBranchDto {
  @IsOptional() @IsString() code?: string;
  @IsOptional() @IsString() nameAr?: string;
  @IsOptional() @IsString() nameEn?: string;
  @IsOptional() @IsString() addressAr?: string;
  @IsOptional() @IsString() addressEn?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsString() imageUrl?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsOptional() @IsBoolean() acceptsOrders?: boolean;
  @IsOptional() @IsBoolean() isOpenOverride?: boolean;
}
export class CreateModifierGroupDto {
  @IsUUID() productId!: string;
  @IsString() nameAr!: string;
  @IsOptional() @IsString() nameEn?: string;
  @IsOptional() @IsString() selectionType?: string;
  @IsOptional() @Type(() => Number) @IsInt() minSelect?: number;
  @IsOptional() @Type(() => Number) @IsInt() maxSelect?: number;
  @IsOptional() @IsBoolean() isRequired?: boolean;
  @IsOptional() @IsBoolean() isActive?: boolean;
}
export class UpdateModifierGroupDto {
  @IsOptional() @IsString() nameAr?: string;
  @IsOptional() @IsString() nameEn?: string;
  @IsOptional() @IsString() selectionType?: string;
  @IsOptional() @Type(() => Number) @IsInt() minSelect?: number;
  @IsOptional() @Type(() => Number) @IsInt() maxSelect?: number;
  @IsOptional() @IsBoolean() isRequired?: boolean;
  @IsOptional() @IsBoolean() isActive?: boolean;
}
export class CreateModifierDto {
  @IsUUID() modifierGroupId!: string;
  @IsString() nameAr!: string;
  @IsOptional() @IsString() nameEn?: string;
  @IsOptional() @Type(() => Number) @IsNumber() priceDelta?: number;
  @IsOptional() @IsBoolean() isActive?: boolean;
}
export class UpdateModifierDto {
  @IsOptional() @IsString() nameAr?: string;
  @IsOptional() @IsString() nameEn?: string;
  @IsOptional() @Type(() => Number) @IsNumber() priceDelta?: number;
  @IsOptional() @IsBoolean() isActive?: boolean;
}
export class CreatePromotionDto {
  @IsString() name!: string;
  @IsOptional() @IsString() code?: string;
  @IsString() type!: string;
  @Type(() => Number) @IsNumber() @Min(0) value!: number;
  @IsOptional() @IsString() scope?: string;
  @IsOptional() @IsString() targetId?: string;
  @IsOptional() @IsArray() @IsString({each:true}) branchIds?: string[];
  @IsOptional() @IsString() startsAt?: string;
  @IsOptional() @IsString() endsAt?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
}
export class UpdatePromotionDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() code?: string;
  @IsOptional() @IsString() type?: string;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) value?: number;
  @IsOptional() @IsString() scope?: string;
  @IsOptional() @IsString() targetId?: string;
  @IsOptional() @IsArray() @IsString({each:true}) branchIds?: string[];
  @IsOptional() @IsString() startsAt?: string;
  @IsOptional() @IsString() endsAt?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
}
export class UpdateSettingDto { @IsString() value!: string; }
