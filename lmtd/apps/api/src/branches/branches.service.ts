import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class BranchesService {
  constructor(private readonly prisma: PrismaService) {}

  list() {
    return this.prisma.branch.findMany({
      where: { isActive: true },
      orderBy: { code: 'asc' },
      include: { hours: { orderBy: { dayOfWeek: 'asc' } }, specialHours: true },
    });
  }
}
