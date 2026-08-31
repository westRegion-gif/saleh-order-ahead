import { Body, Controller, Get, Headers, Param, ParseUUIDPipe, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { CustomerAuthService } from '../customer-auth/customer-auth.service';
import { OperationsActor, OperationsAuthGuard } from '../pos-auth/pos-auth.guard';
import { UpdateOperationalOrderStatusDto, UpdatePrintJobDto } from './operations.dto';
import { OperationsService } from './operations.service';

@UseGuards(OperationsAuthGuard)
@Controller('admin/operations')
export class OperationsController {
  constructor(private readonly operations: OperationsService) {}

  private branchScope(req: any, requestedBranchId?: string) {
    const actor = req.operator as OperationsActor;
    return actor.kind === 'pos' ? actor.branchId : requestedBranchId;
  }

  @Get('orders')
  orders(@Req() req: any, @Query('branchId') branchId?: string, @Query('scope') scope?: string) {
    return this.operations.listOrders(this.branchScope(req, branchId), scope || 'live');
  }

  @Patch('orders/:id/status')
  updateOrderStatus(@Req() req: any, @Param('id', new ParseUUIDPipe()) id: string, @Body() dto: UpdateOperationalOrderStatusDto) {
    return this.operations.updateStatus(id, dto.status, dto.note, this.branchScope(req));
  }

  @Post('orders/:id/print')
  printOrder(@Req() req: any, @Param('id', new ParseUUIDPipe()) id: string) {
    return this.operations.requestPrint(id, 'MANUAL', this.branchScope(req));
  }

  @Get('print-jobs')
  printJobs(@Req() req: any, @Query('branchId') branchId?: string) {
    return this.operations.listPrintJobs(this.branchScope(req, branchId));
  }

  @Patch('print-jobs/:id')
  updatePrintJob(@Req() req: any, @Param('id', new ParseUUIDPipe()) id: string, @Body() dto: UpdatePrintJobDto) {
    return this.operations.updatePrintJob(id, dto.status as 'PRINTING' | 'COMPLETED' | 'FAILED', dto.error, this.branchScope(req));
  }
}

@Controller('orders')
export class CustomerArrivalController {
  constructor(private readonly operations: OperationsService, private readonly auth: CustomerAuthService) {}

  @Post(':id/arrived')
  async arrived(@Param('id', new ParseUUIDPipe()) id: string, @Headers('authorization') authorization?: string) {
    const customer = await this.auth.customerFromAuthorization(authorization);
    return this.operations.markCustomerArrived(id, customer.id);
  }
}
