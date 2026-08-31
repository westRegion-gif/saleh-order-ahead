import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { AdminAuthGuard } from '../admin-auth/admin-auth.guard';
import { PosLoginDto, PosMachineStatusDto } from './pos-auth.dto';
import { PosAuthGuard } from './pos-auth.guard';
import { PosAuthService } from './pos-auth.service';

@Controller('pos/auth')
export class PosAuthController {
  constructor(private readonly auth: PosAuthService) {}

  @Post('login')
  login(@Body() dto: PosLoginDto) {
    return this.auth.login(dto.username, dto.password);
  }

  @UseGuards(PosAuthGuard)
  @Get('me')
  me(@Req() req: any) {
    return this.auth.me(req.pos.id);
  }
}

@UseGuards(AdminAuthGuard)
@Controller('admin/pos-machines')
export class PosMachineAdminController {
  constructor(private readonly auth: PosAuthService) {}

  @Get()
  list() {
    return this.auth.listMachines();
  }

  @Post('provision-all')
  provisionAll() {
    return this.auth.provisionAll();
  }

  @Post(':branchId/provision')
  provision(@Param('branchId', new ParseUUIDPipe()) branchId: string) {
    return this.auth.provision(branchId);
  }

  @Patch(':branchId')
  setActive(@Param('branchId', new ParseUUIDPipe()) branchId: string, @Body() dto: PosMachineStatusDto) {
    return this.auth.setActive(branchId, dto.isActive);
  }
}
