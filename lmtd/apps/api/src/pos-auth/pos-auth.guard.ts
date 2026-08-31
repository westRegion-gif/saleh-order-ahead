import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';

export type OperationsActor = {
  id: string;
  username: string;
  kind: 'owner' | 'pos';
  branchId?: string;
};

function branchIdFromRole(role: string) {
  return role.startsWith('POS:') ? role.slice(4) : null;
}

@Injectable()
export class PosAuthGuard implements CanActivate {
  constructor(private readonly jwt: JwtService, private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest();
    const auth = String(req.headers.authorization || '');
    if (!auth.startsWith('Bearer ')) throw new UnauthorizedException('Missing POS token');
    try {
      const payload = await this.jwt.verifyAsync<{ sub: string }>(auth.slice(7));
      const user = await this.prisma.adminUser.findUnique({ where: { id: payload.sub } });
      if (!user || !user.isActive) throw new Error('inactive');
      const branchId = branchIdFromRole(user.role);
      if (!branchId) throw new Error('not-pos');
      const branch = await this.prisma.branch.findFirst({ where: { id: branchId, isActive: true } });
      if (!branch) throw new Error('branch');
      req.pos = { id: user.id, username: user.username, branchId, branch };
      return true;
    } catch {
      throw new UnauthorizedException('Invalid or expired POS token');
    }
  }
}

@Injectable()
export class OperationsAuthGuard implements CanActivate {
  constructor(private readonly jwt: JwtService, private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest();
    const auth = String(req.headers.authorization || '');
    if (!auth.startsWith('Bearer ')) throw new UnauthorizedException('Missing operations token');
    try {
      const payload = await this.jwt.verifyAsync<{ sub: string }>(auth.slice(7));
      const user = await this.prisma.adminUser.findUnique({ where: { id: payload.sub } });
      if (!user || !user.isActive) throw new Error('inactive');
      if (user.role === 'OWNER') {
        req.operator = { id: user.id, username: user.username, kind: 'owner' } satisfies OperationsActor;
        return true;
      }
      const branchId = branchIdFromRole(user.role);
      if (!branchId) throw new Error('role');
      const branch = await this.prisma.branch.findFirst({ where: { id: branchId, isActive: true }, select: { id: true } });
      if (!branch) throw new Error('branch');
      req.operator = { id: user.id, username: user.username, kind: 'pos', branchId } satisfies OperationsActor;
      return true;
    } catch {
      throw new UnauthorizedException('Invalid or expired operations token');
    }
  }
}
