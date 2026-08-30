import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { CustomerAuthService, CustomerClaims } from './customer-auth.service';

export type CustomerRequest = { headers: { authorization?: string }; customer?: CustomerClaims };

@Injectable()
export class CustomerAuthGuard implements CanActivate {
  constructor(private readonly auth: CustomerAuthService) {}

  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<CustomerRequest>();
    const authorization = request.headers.authorization;
    if (!authorization?.startsWith('Bearer ')) throw new UnauthorizedException('Customer login required');
    request.customer = await this.auth.verifyToken(authorization.slice(7));
    return true;
  }
}
