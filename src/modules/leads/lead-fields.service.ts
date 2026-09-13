import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { FieldCollection, FieldType, type Prisma } from '@prisma/client';

import { PrismaService } from '../../core/database/prisma.service';
import type { CreateLeadFieldDTO } from './dto/create-lead-field.dto';
import type { UpdateLeadFieldDTO } from './dto/update-lead-field.dto';
import type { LeadField } from './types/leads.types';

const LEAD_FIELD_SELECT = {
  id: true,
  key: true,
  label: true,
  type: true,
  options: true,
  isRequired: true,
  isReadOnly: true,
  isSystem: true,
  position: true,
} satisfies Prisma.FieldDefinitionSelect;

const OPTIONS_ON_NON_SELECT_MESSAGE =
  'options are only allowed on select fields';

@Injectable()
export class LeadFieldsService {
  constructor(private readonly prisma: PrismaService) {}

  getAllLeadFields(organizationId: string): Promise<LeadField[]> {
    return this.prisma.fieldDefinition.findMany({
      where: { organizationId, collection: FieldCollection.lead },
      select: LEAD_FIELD_SELECT,
      orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
    });
  }

  async createLeadField(
    organizationId: string,
    body: CreateLeadFieldDTO,
  ): Promise<LeadField> {
    if (body.type === FieldType.select && !body.options) {
      throw new BadRequestException(['options are required on select fields']);
    }
    if (body.type !== FieldType.select && body.options) {
      throw new BadRequestException([OPTIONS_ON_NON_SELECT_MESSAGE]);
    }

    const scope = { organizationId, collection: FieldCollection.lead };
    const [existing, last] = await Promise.all([
      this.prisma.fieldDefinition.findFirst({
        where: { ...scope, key: body.key },
        select: { id: true },
      }),
      this.prisma.fieldDefinition.findFirst({
        where: scope,
        select: { position: true },
        orderBy: { position: 'desc' },
      }),
    ]);

    if (existing) {
      throw new ConflictException(`Lead field ${body.key} already exists`);
    }

    return this.prisma.fieldDefinition.create({
      data: {
        ...scope,
        key: body.key,
        label: body.label,
        type: body.type,
        options: body.options ?? [],
        isRequired: body.isRequired ?? false,
        position: (last?.position ?? -1) + 1,
      },
      select: LEAD_FIELD_SELECT,
    });
  }

  // A required flag or options change only affects later writes. Leads keep the
  // values they already hold.
  async updateLeadField(
    organizationId: string,
    id: string,
    body: UpdateLeadFieldDTO,
  ): Promise<LeadField | null> {
    const field = await this.getLeadField(organizationId, id);

    if (!field) return null;

    if (
      field.isReadOnly &&
      (body.isRequired !== undefined || body.options !== undefined)
    ) {
      throw new BadRequestException([
        `${field.key} is read-only, so only its label and position can change`,
      ]);
    }
    if (body.options !== undefined && field.type !== FieldType.select) {
      throw new BadRequestException([OPTIONS_ON_NON_SELECT_MESSAGE]);
    }

    return this.prisma.fieldDefinition.update({
      where: { id: field.id },
      data: {
        label: body.label,
        isRequired: body.isRequired,
        options: body.options,
        position: body.position,
      },
      select: LEAD_FIELD_SELECT,
    });
  }

  // Deleting a field also deletes every value leads hold for it.
  async deleteLeadField(
    organizationId: string,
    id: string,
  ): Promise<LeadField | null> {
    const field = await this.getLeadField(organizationId, id);

    if (!field) return null;

    if (field.isSystem) {
      throw new ConflictException(
        `${field.key} is a system field and cannot be deleted`,
      );
    }

    return this.prisma.fieldDefinition.delete({
      where: { id: field.id },
      select: LEAD_FIELD_SELECT,
    });
  }

  private getLeadField(
    organizationId: string,
    id: string,
  ): Promise<LeadField | null> {
    return this.prisma.fieldDefinition.findFirst({
      where: { id, organizationId, collection: FieldCollection.lead },
      select: LEAD_FIELD_SELECT,
    });
  }
}
