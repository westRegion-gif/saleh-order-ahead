import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';
import { CatalogService } from './catalog.service';

@Controller('branches')
export class CatalogController {
  constructor(private readonly catalog: CatalogService) {}
  @Get(':branchId/menu') menu(@Param('branchId', new ParseUUIDPipe()) branchId: string) { return this.catalog.menu(branchId); }
}
