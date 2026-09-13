import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';

import type { PaginatedResponse } from '../../common/responses/paginated-api.response';
import { PrismaService } from '../../core/database/prisma.service';
import type { CreateLeadDTO } from './dto/create-lead.dto';
import type { FilterLeadsDTO } from './dto/filter-leads.dto';
import type { UpdateLeadValuesDTO } from './dto/update-lead-values.dto';
import { LeadFieldsService } from './lead-fields.service';
import {
  LEAD_INITIAL_STATUS,
  LEAD_RECEIVED_AT_KEY,
  LEAD_STATUS_KEY,
  type LeadStatus,
} from './lead-system-fields';
import {
  type LeadValueChanges,
  parseLeadLookup,
  parseLeadValues,
} from './lead-values';
import type {
  LeadField,
  LeadFieldValue,
  OrganizationLead,
} from './types/leads.types';

const LEAD_SELECT = {
  id: true,
  createdAt: true,
  updatedAt: true,
  values: { select: { fieldId: true, value: true } },
} satisfies Prisma.LeadSelect;

type StoredLead = Prisma.LeadGetPayload<{ select: typeof LEAD_SELECT }>;

// Every organization is provisioned with the system fields, so a missing one is a
// server fault rather than a client error.
function getSystemField(fields: LeadField[], key: string): LeadField {
  const field = fields.find((candidate) => candidate.key === key);

  if (!field) throw new Error(`Lead system field ${key} is missing`);

  return field;
}

function toOrganizationLead(
  fields: LeadField[],
  lead: StoredLead,
): OrganizationLead {
  const stored = new Map(
    lead.values.map(({ fieldId, value }) => [
      fieldId,
      value as LeadFieldValue,
    ]),
  );

  const values = Object.fromEntries(
    fields.map((field) => [
      field.key,
      field.key === LEAD_RECEIVED_AT_KEY
        ? lead.createdAt.toISOString()
        : (stored.get(field.id) ?? null),
    ]),
  );

  return {
    id: lead.id,
    values,
    createdAt: lead.createdAt,
    updatedAt: lead.updatedAt,
  };
}

@Injectable()
export class LeadsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly leadFieldsService: LeadFieldsService,
  ) {}

  async createLead(
    organizationId: string,
    body: CreateLeadDTO,
  ): Promise<OrganizationLead> {
    const fields =
      await this.leadFieldsService.getAllLeadFields(organizationId);
    const { set } = parseLeadValues(fields, body.values, 'create');
    const statusField = getSystemField(fields, LEAD_STATUS_KEY);

    const lead = await this.prisma.lead.create({
      data: {
        organizationId,
        values: {
          create: [
            ...set.map(({ field, value }) => ({ fieldId: field.id, value })),
            { fieldId: statusField.id, value: LEAD_INITIAL_STATUS },
          ],
        },
      },
      select: LEAD_SELECT,
    });

    return toOrganizationLead(fields, lead);
  }

  async getAllLeads(
    organizationId: string,
    query: FilterLeadsDTO,
  ): Promise<PaginatedResponse<OrganizationLead>> {
    const fields =
      await this.leadFieldsService.getAllLeadFields(organizationId);
    const matches: Prisma.LeadValueWhereInput[] = [];

    if (query.status) {
      matches.push({
        fieldId: getSystemField(fields, LEAD_STATUS_KEY).id,
        value: { equals: query.status },
      });
    }
    if (query.field !== undefined && query.value !== undefined) {
      const lookup = parseLeadLookup(fields, query.field, query.value);
      matches.push({
        fieldId: lookup.field.id,
        value: { equals: lookup.value },
      });
    }

    const where: Prisma.LeadWhereInput = { organizationId };
    if (matches.length > 0) {
      where.AND = matches.map((match) => ({ values: { some: match } }));
    }

    const [total, leads] = await Promise.all([
      this.prisma.lead.count({ where }),
      this.prisma.lead.findMany({
        where,
        select: LEAD_SELECT,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
    ]);

    return {
      data: leads.map((lead) => toOrganizationLead(fields, lead)),
      meta: {
        total,
        page: query.page,
        limit: query.limit,
        lastPage: Math.max(Math.ceil(total / query.limit), 1),
      },
    };
  }

  async getLead(
    organizationId: string,
    id: string,
  ): Promise<OrganizationLead | null> {
    const [fields, lead] = await Promise.all([
      this.leadFieldsService.getAllLeadFields(organizationId),
      this.prisma.lead.findFirst({
        where: { id, organizationId },
        select: LEAD_SELECT,
      }),
    ]);

    return lead ? toOrganizationLead(fields, lead) : null;
  }

  async updateLeadValues(
    organizationId: string,
    id: string,
    body: UpdateLeadValuesDTO,
  ): Promise<OrganizationLead | null> {
    const [fields, lead] = await Promise.all([
      this.leadFieldsService.getAllLeadFields(organizationId),
      this.findLeadId(organizationId, id),
    ]);

    if (!lead) return null;

    const changes = parseLeadValues(fields, body.values, 'update');

    return this.writeLeadValues(fields, lead.id, changes);
  }

  // Any status can follow any other, so a person can undo a misclick or bring a
  // lead back out of the archive.
  async setLeadStatus(
    organizationId: string,
    id: string,
    status: LeadStatus,
  ): Promise<OrganizationLead | null> {
    const [fields, lead] = await Promise.all([
      this.leadFieldsService.getAllLeadFields(organizationId),
      this.findLeadId(organizationId, id),
    ]);

    if (!lead) return null;

    return this.writeLeadValues(fields, lead.id, {
      set: [{ field: getSystemField(fields, LEAD_STATUS_KEY), value: status }],
      clear: [],
    });
  }

  private findLeadId(
    organizationId: string,
    id: string,
  ): Promise<{ id: string } | null> {
    return this.prisma.lead.findFirst({
      where: { id, organizationId },
      select: { id: true },
    });
  }

  // Each value is its own row, so a write only touches the fields it names and
  // cannot undo a concurrent change to another field.
  private async writeLeadValues(
    fields: LeadField[],
    leadId: string,
    changes: LeadValueChanges,
  ): Promise<OrganizationLead> {
    const lead = await this.prisma.lead.update({
      where: { id: leadId },
      data: {
        // Only value rows change, so the lead's own timestamp is set explicitly.
        updatedAt: new Date(),
        values: {
          upsert: changes.set.map(({ field, value }) => ({
            where: { leadId_fieldId: { leadId, fieldId: field.id } },
            create: { fieldId: field.id, value },
            update: { value },
          })),
          deleteMany: {
            fieldId: { in: changes.clear.map((field) => field.id) },
          },
        },
      },
      select: LEAD_SELECT,
    });

    return toOrganizationLead(fields, lead);
  }
}
