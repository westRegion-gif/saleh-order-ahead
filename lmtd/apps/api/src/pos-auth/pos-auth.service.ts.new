import { ConflictException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { PrismaService } from '../prisma/prisma.service';

const POS_PREFIX = 'POS:';

function roleForBranch(branchId: string) {
  return `${POS_PREFIX}${branchId}`;
}

function branchIdFromRole(role: string) {
  return role.startsWith(POS_PREFIX) ? role.slice(POS_PREFIX.length) : null;
}

@Injectable()
export class PosAuthService {
  constructor(private readonly prisma: PrismaService, private readonly jwt: JwtService) {}

  async login(username: string, password: string) {
    const user = await this.prisma.adminUser.findUnique({ where: { username: username.trim() } });
    const branchId = user ? branchIdFromRole(user.role) : null;
    if (!user || !user.isActive || !branchId || !(await argon2.verify(user.passwordHash, password))) {
      throw new UnauthorizedException('Invalid POS credentials');
    }
    const branch = await this.prisma.branch.findFirst({ where: { id: branchId, isActive: true } });
    if (!branch) throw new UnauthorizedException('POS branch is unavailable');
    await this.prisma.adminUser.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    const accessToken = await this.jwt.signAsync(
      { sub: user.id, username: user.username, role: user.role, typ: 'pos', branchId },
      { expiresIn: '12h' },
    );
    return {
      accessToken,
      user: { id: user.id, username: user.username, role: 'POS', branchId, branch },
    };
  }

  async me(userId: string) {
    const user = await this.prisma.adminUser.findUnique({ where: { id: userId } });
    const branchId = user ? branchIdFromRole(user.role) : null;
    if (!user || !user.isActive || !branchId) throw new UnauthorizedException('POS session unavailable');
    const branch = await this.prisma.branch.findFirst({ where: { id: branchId, isActive: true } });
    if (!branch) throw new UnauthorizedException('POS branch unavailable');
    return { id: user.id, username: user.username, role: 'POS', branchId, branch };
  }

  async listMachines() {
    const branches = await this.prisma.branch.findMany({ orderBy: { code: 'asc' } });
    const users = await this.prisma.adminUser.findMany({ where: { role: { startsWith: POS_PREFIX } } });
    const byBranch = new Map(users.map((user) => [branchIdFromRole(user.role), user]));
    return branches.map((branch) => {
      const user = byBranch.get(branch.id);
      return {
        branch: { id: branch.id, code: branch.code, nameAr: branch.nameAr, nameEn: branch.nameEn, isActive: branch.isActive },
        machine: user ? {
          id: user.id,
          username: user.username,
          isActive: user.isActive,
          lastLoginAt: user.lastLoginAt,
          createdAt: user.createdAt,
        } : null,
      };
    });
  }

  async saveMachine(branchId: string, username: string, password: string) {
    const branch = await this.prisma.branch.findUnique({ where: { id: branchId } });
    if (!branch) throw new NotFoundException('Branch not found');

    const cleanUsername = username.trim();
    const role = roleForBranch(branchId);
    const current = await this.prisma.adminUser.findFirst({ where: { role } });
    const usernameOwner = await this.prisma.adminUser.findUnique({ where: { username: cleanUsername } });
    if (usernameOwner && usernameOwner.id !== current?.id) {
      throw new ConflictException('Username is already in use');
    }

    const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
    const user = current
      ? await this.prisma.adminUser.update({
          where: { id: current.id },
          data: { username: cleanUsername, passwordHash, isActive: true },
        })
      : await this.prisma.adminUser.create({
          data: { username: cleanUsername, passwordHash, role, isActive: true },
        });

    return {
      id: user.id,
      username: user.username,
      isActive: user.isActive,
      branchId,
      branchName: branch.nameEn || branch.nameAr,
    };
  }

  async setActive(branchId: string, isActive: boolean) {
    const user = await this.prisma.adminUser.findFirst({ where: { role: roleForBranch(branchId) } });
    if (!user) throw new NotFoundException('POS machine account not found');
    const updated = await this.prisma.adminUser.update({ where: { id: user.id }, data: { isActive } });
    return { id: updated.id, username: updated.username, isActive: updated.isActive, branchId };
  }
}
