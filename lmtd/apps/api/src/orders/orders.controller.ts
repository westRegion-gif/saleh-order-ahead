import { Body, Controller, Get, Headers, Param, Post } from '@nestjs/common';
import { CustomerAuthService } from '../customer-auth/customer-auth.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { OrdersService } from './orders.service';

@Controller('orders')
export class OrdersController {
  constructor(private readonly orders: OrdersService, private readonly customerAuth: CustomerAuthService) {}

  @Get(':id')
  get(@Param('id') id: string) {
    return this.orders.getPublic(id);
  }

  @Post()
  async create(@Body() dto: CreateOrderDto, @Headers('authorization') authorization?: string) {
    const customer = await this.customerAuth.resolveOptionalAuthorization(authorization);
    return this.orders.create(dto, customer?.sub);
  }
}
