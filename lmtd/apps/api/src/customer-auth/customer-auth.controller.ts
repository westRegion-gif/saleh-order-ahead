import { Body, Controller, Get, Headers, Patch, Post } from '@nestjs/common';
import { CustomerAuthService } from './customer-auth.service';
import { RequestOtpDto, UpdateCustomerProfileDto, VerifyOtpDto } from './dto/customer-auth.dto';

@Controller('customer/auth')
export class CustomerAuthController {
  constructor(private readonly auth: CustomerAuthService) {}

  @Post('request-otp')
  requestOtp(@Body() dto: RequestOtpDto) {
    return this.auth.requestOtp(dto.phone);
  }

  @Post('verify-otp')
  verifyOtp(@Body() dto: VerifyOtpDto) {
    return this.auth.verifyOtp(dto.phone, dto.code);
  }

  @Get('me')
  async me(@Headers('authorization') authorization?: string) {
    return this.auth.customerFromAuthorization(authorization);
  }

  @Patch('me')
  async updateMe(@Headers('authorization') authorization: string | undefined, @Body() dto: UpdateCustomerProfileDto) {
    const customer = await this.auth.customerFromAuthorization(authorization);
    return this.auth.updateProfile(customer.id, dto);
  }
}
