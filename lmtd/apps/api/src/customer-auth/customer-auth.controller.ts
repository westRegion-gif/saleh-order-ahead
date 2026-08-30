import { Body, Controller, Get, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { CustomerAuthGuard, CustomerRequest } from './customer-auth.guard';
import { RequestOtpDto, UpdateCustomerDto, VerifyOtpDto } from './customer-auth.dto';
import { CustomerAuthService } from './customer-auth.service';

@Controller('customer')
export class CustomerAuthController {
  constructor(private readonly auth: CustomerAuthService) {}

  @Post('auth/request-otp')
  requestOtp(@Body() dto: RequestOtpDto) {
    return this.auth.requestOtp(dto.phone);
  }

  @Post('auth/verify-otp')
  verifyOtp(@Body() dto: VerifyOtpDto) {
    return this.auth.verifyOtp(dto.phone, dto.code);
  }

  @Get('me')
  @UseGuards(CustomerAuthGuard)
  me(@Req() request: CustomerRequest) {
    return this.auth.getMe(request.customer!.sub);
  }

  @Patch('me')
  @UseGuards(CustomerAuthGuard)
  updateMe(@Req() request: CustomerRequest, @Body() dto: UpdateCustomerDto) {
    return this.auth.updateMe(request.customer!.sub, dto);
  }

  @Get('orders')
  @UseGuards(CustomerAuthGuard)
  orders(@Req() request: CustomerRequest) {
    return this.auth.listOrders(request.customer!.sub);
  }
}
