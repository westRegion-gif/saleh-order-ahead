import { Body, Controller, Get, Headers, Param, Post } from '@nestjs/common';
import { CustomerAuthService } from '../customer-auth/customer-auth.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { OrdersService } from './orders.service';

@Controller('orders')
export class OrdersController {
  constructor(private readonly orders: OrdersService, private readonly auth: CustomerAuthService) {}

  @Get()
  async list(@Headers('authorization') authorization?: string) {
    const customer = await this.auth.customerFromAuthorization(authorization);
    return this.orders.listForCustomer(customer.id);
  }

  @Get(':id')
  async get(@Param('id') id: string, @Headers('authorization') authorization?: string) {
    const customer = await this.auth.customerFromAuthorization(authorization);
    return this.orders.getForCustomer(id, customer.id);
  }

  @Post()
  async create(@Body() dto: CreateOrderDto, @Headers('authorization') authorization?: string) {
    const customer = await this.auth.customerFromAuthorization(authorization);
    return this.orders.create(dto, customer.id);
  }
}
