import { Controller, Get } from '@nestjs/common';
import { BranchesService } from './branches.service';

@Controller('branches')
export class BranchesController {
  constructor(private readonly branches: BranchesService) {}
  @Get() list() { return this.branches.list(); }
}
