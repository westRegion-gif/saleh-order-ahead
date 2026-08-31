import { Body, Controller, Get, Headers, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { AdminAuthGuard } from '../admin-auth/admin-auth.guard';
import { CustomerAuthService } from '../customer-auth/customer-auth.service';
import { UpdateOperationalOrderStatusDto, UpdatePrintJobDto } from './operations.dto';
import { OperationsService } from './operations.service';

@UseGuards(AdminAuthGuard)
@Controller('admin/operations')
export class OperationsController {
  constructor(private readonly operations: OperationsService) {}

  @Get('orders')
  orders(@Query('branchId') branchId?: string, @Query('scope') scope?: string) {
    return this.operations.listOrders(branchId, scope || 'live');
  }

  @Patch('orders/:id/status')
  updateOrderStatus(@Param('id', new ParseUUIDPipe()) id: string, @Body() dto: UpdateOperationalOrderStatusDto) {
    return this.operations.updateStatus(id, dto.status, dto.note);
  }

  @Post('orders/:id/print')
  printOrder(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.operations.requestPrint(id);
  }

  @Get('print-jobs')
  printJobs(@Query('branchId') branchId?: string) {
    return this.operations.listPrintJobs(branchId);
  }

  @Patch('print-jobs/:id')
  updatePrintJob(@Param('id', new ParseUUIDPipe()) id: string, @Body() dto: UpdatePrintJobDto) {
    return this.operations.updatePrintJob(id, dto.status as 'PRINTING' | 'COMPLETED' | 'FAILED', dto.error);
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
