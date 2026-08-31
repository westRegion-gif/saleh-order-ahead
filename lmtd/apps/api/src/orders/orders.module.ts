import { Module } from '@nestjs/common';
import { CustomerAuthModule } from '../customer-auth/customer-auth.module';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';

@Module({ imports: [CustomerAuthModule], controllers: [OrdersController], providers: [OrdersService] })
export class OrdersModule {}
