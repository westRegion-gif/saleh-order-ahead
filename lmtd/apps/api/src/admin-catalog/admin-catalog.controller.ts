import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { AdminAuthGuard } from '../admin-auth/admin-auth.guard';
import { AdminCatalogService } from './admin-catalog.service';
import {
  CreateBranchDto, CreateCategoryDto, CreateModifierDto, CreateModifierGroupDto, CreateProductDto, CreatePromotionDto,
  SetBranchModifierDto, SetBranchProductDto, UpdateBranchDto, UpdateCategoryDto, UpdateModifierDto, UpdateModifierGroupDto,
  UpdateProductDto, UpdatePromotionDto, UpdateSettingDto,
} from './admin-catalog.dto';

@UseGuards(AdminAuthGuard)
@Controller('admin/catalog')
export class AdminCatalogController {
  constructor(private readonly service: AdminCatalogService) {}

  @Get('products') products() { return this.service.listProducts(); }
  @Post('products') createProduct(@Body() dto: CreateProductDto) { return this.service.createProduct(dto); }
  @Patch('products/:id') updateProduct(@Param('id', new ParseUUIDPipe()) id: string, @Body() dto: UpdateProductDto) { return this.service.updateProduct(id, dto); }
  @Delete('products/:id') deleteProduct(@Param('id', new ParseUUIDPipe()) id: string) { return this.service.deactivateProduct(id); }

  @Get('categories') categories() { return this.service.listCategories(); }
  @Post('categories') createCategory(@Body() dto: CreateCategoryDto) { return this.service.createCategory(dto); }
  @Patch('categories/:id') updateCategory(@Param('id', new ParseUUIDPipe()) id: string, @Body() dto: UpdateCategoryDto) { return this.service.updateCategory(id, dto); }
  @Delete('categories/:id') deleteCategory(@Param('id', new ParseUUIDPipe()) id: string) { return this.service.deactivateCategory(id); }

  @Get('branches') branches() { return this.service.listBranches(); }
  @Post('branches') createBranch(@Body() dto: CreateBranchDto) { return this.service.createBranch(dto); }
  @Patch('branches/:id') updateBranch(@Param('id', new ParseUUIDPipe()) id: string, @Body() dto: UpdateBranchDto) { return this.service.updateBranch(id, dto); }
  @Patch('branches/:branchId/products/:productId') setBranchProduct(@Param('branchId', new ParseUUIDPipe()) branchId: string, @Param('productId', new ParseUUIDPipe()) productId: string, @Body() dto: SetBranchProductDto) { return this.service.setBranchProduct(branchId, productId, dto); }
  @Patch('branches/:branchId/modifiers/:modifierId') setBranchModifier(@Param('branchId', new ParseUUIDPipe()) branchId: string, @Param('modifierId', new ParseUUIDPipe()) modifierId: string, @Body() dto: SetBranchModifierDto) { return this.service.setBranchModifier(branchId, modifierId, dto); }

  @Get('modifier-groups') modifierGroups() { return this.service.listModifierGroups(); }
  @Post('modifier-groups') createModifierGroup(@Body() dto: CreateModifierGroupDto) { return this.service.createModifierGroup(dto); }
  @Patch('modifier-groups/:id') updateModifierGroup(@Param('id', new ParseUUIDPipe()) id: string, @Body() dto: UpdateModifierGroupDto) { return this.service.updateModifierGroup(id, dto); }
  @Delete('modifier-groups/:id') deleteModifierGroup(@Param('id', new ParseUUIDPipe()) id: string) { return this.service.deactivateModifierGroup(id); }
  @Post('modifiers') createModifier(@Body() dto: CreateModifierDto) { return this.service.createModifier(dto); }
  @Patch('modifiers/:id') updateModifier(@Param('id', new ParseUUIDPipe()) id: string, @Body() dto: UpdateModifierDto) { return this.service.updateModifier(id, dto); }
  @Delete('modifiers/:id') deleteModifier(@Param('id', new ParseUUIDPipe()) id: string) { return this.service.deactivateModifier(id); }

  @Get('promotions') promotions() { return this.service.listPromotions(); }
  @Post('promotions') createPromotion(@Body() dto: CreatePromotionDto) { return this.service.createPromotion(dto); }
  @Patch('promotions/:id') updatePromotion(@Param('id', new ParseUUIDPipe()) id: string, @Body() dto: UpdatePromotionDto) { return this.service.updatePromotion(id, dto); }
  @Delete('promotions/:id') deletePromotion(@Param('id', new ParseUUIDPipe()) id: string) { return this.service.deactivatePromotion(id); }

  @Get('customers') customers() { return this.service.listCustomers(); }
  @Get('orders') orders() { return this.service.listOrders(); }
  @Get('reports') reports(@Query('from') from?: string, @Query('to') to?: string, @Query('branchId') branchId?: string) { return this.service.report(from, to, branchId); }
  @Get('settings') settings() { return this.service.listSettings(); }
  @Patch('settings/:key') setSetting(@Param('key') key: string, @Body() dto: UpdateSettingDto) { return this.service.setSetting(key, dto.value); }
}
