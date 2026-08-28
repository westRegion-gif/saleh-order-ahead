import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { AdminCatalogService } from './admin-catalog.service';
import { CreateCategoryDto, CreateProductDto, SetBranchProductDto, UpdateCategoryDto, UpdateProductDto } from './admin-catalog.dto';

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

  @Get('branches') branches() { return this.service.listBranches(); }
  @Patch('branches/:branchId/products/:productId') setBranchProduct(
    @Param('branchId', new ParseUUIDPipe()) branchId: string,
    @Param('productId', new ParseUUIDPipe()) productId: string,
    @Body() dto: SetBranchProductDto,
  ) { return this.service.setBranchProduct(branchId, productId, dto); }
}
