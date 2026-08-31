import { Injectable, NotFoundException, OnModuleInit, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';

const POS_PREFIX = 'POS:';

function roleForBranch(branchId: string) {
  return `${POS_PREFIX}${branchId}`;
}

function branchIdFromRole(role: string) {
  return role.startsWith(POS_PREFIX) ? role.slice(POS_PREFIX.length) : null;
}

function usernameFromCode(code: string) {
  const clean = code.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return `pos-${clean || 'branch'}`;
}

function temporaryPassword() {
  return `Lm!${randomBytes(9).toString('base64url')}`;
}

@Injectable()
export class PosAuthService implements OnModuleInit {
  constructor(private readonly prisma: PrismaService, private readonly jwt: JwtService) {}

  async onModuleInit() {
    const branches = await this.prisma.branch.findMany({ where: { isActive: true }, select: { id: true, code: true } });
    let created = 0;
    for (const branch of branches) {
      const role = roleForBranch(branch.id);
      const existing = await this.prisma.adminUser.findFirst({ where: { role } });
      if (existing) continue;
      let username = usernameFromCode(branch.code);
      const collision = await this.prisma.adminUser.findUnique({ where: { username } });
      if (collision) username = `${username}-${branch.id.slice(0, 6)}`;
      const passwordHash = await argon2.hash(randomBytes(32).toString('hex'), { type: argon2.argon2id });
      await this.prisma.adminUser.create({ data: { username, passwordHash, role, isActive: false } });
      created += 1;
    }
    console.log(`[pos] branch machine accounts ensured: ${branches.length} total, ${created} created`);
  }

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

  async provision(branchId: string) {
    const branch = await this.prisma.branch.findUnique({ where: { id: branchId } });
    if (!branch) throw new NotFoundException('Branch not found');
    const role = roleForBranch(branch.id);
    let user = await this.prisma.adminUser.findFirst({ where: { role } });
    const password = temporaryPassword();
    const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
    if (user) {
      user = await this.prisma.adminUser.update({ where: { id: user.id }, data: { passwordHash, isActive: true } });
    } else {
      let username = usernameFromCode(branch.code);
      if (await this.prisma.adminUser.findUnique({ where: { username } })) username = `${username}-${branch.id.slice(0, 6)}`;
      user = await this.prisma.adminUser.create({ data: { username, passwordHash, role, isActive: true } });
    }
    return {
      machine: { id: user.id, username: user.username, isActive: user.isActive, branchId: branch.id, branchName: branch.nameEn || branch.nameAr },
      temporaryPassword: password,
      warning: 'This temporary password is returned once. Store it securely on the branch device.',
    };
  }

  async provisionAll() {
    const branches = await this.prisma.branch.findMany({ where: { isActive: true }, orderBy: { code: 'asc' }, select: { id: true } });
    const results = [];
    for (const branch of branches) results.push(await this.provision(branch.id));
    return results;
  }

  async setActive(branchId: string, isActive: boolean) {
    const user = await this.prisma.adminUser.findFirst({ where: { role: roleForBranch(branchId) } });
    if (!user) throw new NotFoundException('POS machine account not found');
    const updated = await this.prisma.adminUser.update({ where: { id: user.id }, data: { isActive } });
    return { id: updated.id, username: updated.username, isActive: updated.isActive, branchId };
  }
}
