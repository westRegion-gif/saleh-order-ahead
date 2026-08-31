import { Injectable, OnModuleInit, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AdminAuthService implements OnModuleInit {
  constructor(private readonly prisma: PrismaService, private readonly jwt: JwtService) {}

  async onModuleInit() {
    const username = process.env.ADMIN_BOOTSTRAP_USERNAME?.trim();
    const password = process.env.ADMIN_BOOTSTRAP_PASSWORD;
    if (!username || !password) return;

    const existing = await this.prisma.adminUser.findUnique({ where: { username } });
    if (existing) return;

    const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
    await this.prisma.adminUser.create({
      data: { username, passwordHash, role: 'OWNER', isActive: true },
    });
  }

  async login(username: string, password: string) {
    const user = await this.prisma.adminUser.findUnique({ where: { username } });
    if (!user || !user.isActive || user.role !== 'OWNER' || !(await argon2.verify(user.passwordHash, password))) {
      throw new UnauthorizedException('Invalid credentials');
    }
    await this.prisma.adminUser.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    const accessToken = await this.jwt.signAsync({ sub: user.id, username: user.username, role: user.role, typ: 'owner' });
    return { accessToken, user: { id: user.id, username: user.username, role: user.role } };
  }
}
