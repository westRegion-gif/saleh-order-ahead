import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AdminAuthGuard implements CanActivate {
  constructor(private readonly jwt: JwtService, private readonly prisma: PrismaService) {}
  async canActivate(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest();
    const auth = String(req.headers.authorization || '');
    if (!auth.startsWith('Bearer ')) throw new UnauthorizedException('Missing admin token');
    try {
      const payload = await this.jwt.verifyAsync(auth.slice(7));
      const user = await this.prisma.adminUser.findUnique({ where: { id: payload.sub } });
      if (!user || !user.isActive || user.role !== 'OWNER') throw new Error('forbidden');
      req.admin = { id: user.id, username: user.username, role: user.role };
      return true;
    } catch {
      throw new UnauthorizedException('Invalid or expired admin token');
    }
  }
}
