import { Injectable } from '@nestjs/common';
import { LeadChannel, Prisma } from '@prisma/client';

import type { PaginatedResponse } from '../../common/responses/paginated-api.response';
import { PrismaService } from '../../core/database/prisma.service';
import type { CreateLeadDTO } from './dto/create-lead.dto';
import type { FilterLeadsDTO } from './dto/filter-leads.dto';
import type { UpdateLeadValuesDTO } from './dto/update-lead-values.dto';
import { LeadFieldsService } from './lead-fields.service';
import {
  LEAD_EMAIL_KEY,
  LEAD_INITIAL_STATUS,
  LEAD_PHONE_KEY,
  LEAD_RECEIVED_AT_KEY,
  LEAD_STATUS_KEY,
  LEAD_WHY_KEY,
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
  channel: true,
  isArchived: true,
  createdAt: true,
  updatedAt: true,
  values: { select: { fieldId: true, value: true } },
  submissions: {
    select: { id: true, channel: true, values: true, createdAt: true },
    orderBy: { createdAt: 'asc' },
  },
} satisfies Prisma.LeadSelect;

type StoredLead = Prisma.LeadGetPayload<{ select: typeof LEAD_SELECT }>;

type LeadRef = { id: string; channel: LeadChannel };

type SetValues = LeadValueChanges['set'];

// Email matches in any case and phone on its digits alone, so spacing and
// punctuation never hide a repeat. A value that cannot be either matches nothing.
function emailMatchKey(value: LeadFieldValue): string | null {
  const email = String(value).trim().toLowerCase();
  return email.includes('@') ? email : null;
}

const PHONE_MIN_DIGITS = 7;

function phoneMatchKey(value: LeadFieldValue): string | null {
  const digits = String(value).replace(/\D/g, '');
  return digits.length >= PHONE_MIN_DIGITS ? digits : null;
}

function contactConditions(set: SetValues): Prisma.Sql[] {
  return set.flatMap(({ field, value }) => {
    if (field.key === LEAD_EMAIL_KEY) {
      const email = emailMatchKey(value);
      return email
        ? [
            Prisma.sql`(v."field_id" = ${field.id} AND lower(btrim(v."value" #>> '{}')) = ${email})`,
          ]
        : [];
    }
    if (field.key === LEAD_PHONE_KEY) {
      const phone = phoneMatchKey(value);
      return phone
        ? [
            Prisma.sql`(v."field_id" = ${field.id} AND regexp_replace(v."value" #>> '{}', '[^0-9]', '', 'g') = ${phone})`,
          ]
        : [];
    }
    return [];
  });
}

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
    channel: lead.channel,
    nowInbound:
      lead.channel === LeadChannel.agent &&
      lead.submissions.some(
        (submission) => submission.channel === LeadChannel.form,
      ),
    values,
    submissions: lead.submissions.map((submission) => ({
      id: submission.id,
      channel: submission.channel,
      values: submission.values as Record<string, LeadFieldValue>,
      createdAt: submission.createdAt,
    })),
    isArchived: lead.isArchived,
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

  // `channel` comes from the key that filed the lead, never from the body. A
  // submission that shares an email or phone with a lead in the inbox is attached
  // to that lead instead of filed as a second one.
  async createLead(
    organizationId: string,
    channel: LeadChannel,
    body: CreateLeadDTO,
  ): Promise<OrganizationLead> {
    const fields =
      await this.leadFieldsService.getAllLeadFields(organizationId);
    const { set } = parseLeadValues(fields, body.values, 'create', channel);
    const match = await this.findContactMatch(organizationId, set);

    if (match) return this.attachSubmission(fields, match, channel, set);

    const statusField = getSystemField(fields, LEAD_STATUS_KEY);

    const lead = await this.prisma.lead.create({
      data: {
        organizationId,
        channel,
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

    // The archive is a separate view, so a list is either the inbox or the
    // archive and never both.
    const where: Prisma.LeadWhereInput = {
      organizationId,
      isArchived: query.archived,
    };
    // Form reads as inbound, so it takes in an agent lead whose person has since
    // sent the form. Agent lists every lead an agent found.
    if (query.channel === LeadChannel.form) {
      where.OR = [
        { channel: LeadChannel.form },
        { submissions: { some: { channel: LeadChannel.form } } },
      ];
    } else if (query.channel === LeadChannel.agent) {
      where.channel = LeadChannel.agent;
    }
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
      this.findLead(organizationId, id),
    ]);

    if (!lead) return null;

    const changes = parseLeadValues(
      fields,
      body.values,
      'update',
      lead.channel,
    );

    return this.writeLeadValues(fields, lead.id, changes);
  }

  // Any status can follow any other, so a person can undo a misclick.
  async setLeadStatus(
    organizationId: string,
    id: string,
    status: LeadStatus,
  ): Promise<OrganizationLead | null> {
    const [fields, lead] = await Promise.all([
      this.leadFieldsService.getAllLeadFields(organizationId),
      this.findLead(organizationId, id),
    ]);

    if (!lead) return null;

    return this.writeLeadValues(fields, lead.id, {
      set: [{ field: getSystemField(fields, LEAD_STATUS_KEY), value: status }],
      clear: [],
    });
  }

  // Archiving takes a lead out of the inbox and restoring puts it back. Neither
  // touches the status, so a lead comes back at the stage it left on.
  async setLeadArchived(
    organizationId: string,
    id: string,
    isArchived: boolean,
  ): Promise<OrganizationLead | null> {
    const [fields, lead] = await Promise.all([
      this.leadFieldsService.getAllLeadFields(organizationId),
      this.findLead(organizationId, id),
    ]);

    if (!lead) return null;

    const archived = await this.prisma.lead.update({
      where: { id: lead.id },
      data: { isArchived },
      select: LEAD_SELECT,
    });

    return toOrganizationLead(fields, archived);
  }

  private findLead(
    organizationId: string,
    id: string,
  ): Promise<LeadRef | null> {
    return this.prisma.lead.findFirst({
      where: { id, organizationId },
      select: { id: true, channel: true },
    });
  }

  // The oldest lead in the inbox that holds the same email or phone. An archived
  // lead is left alone: only a person brings one back, and a repeat attached to
  // it would never be seen.
  private async findContactMatch(
    organizationId: string,
    set: SetValues,
  ): Promise<LeadRef | null> {
    const conditions = contactConditions(set);

    if (conditions.length === 0) return null;

    const [match] = await this.prisma.$queryRaw<LeadRef[]>`
      SELECT l."id", l."channel"::text AS "channel"
      FROM "leads" AS l
      WHERE l."organization_id" = ${organizationId}
        AND NOT l."is_archived"
        AND EXISTS (
          SELECT 1 FROM "lead_values" AS v
          WHERE v."lead_id" = l."id" AND (${Prisma.join(conditions, ' OR ')})
        )
      ORDER BY l."created_at" ASC
      LIMIT 1
    `;

    return match ?? null;
  }

  // A repeat keeps what the lead holds, fills only what it is missing, and is
  // logged whole on the lead. A form lead never takes whyLead from an agent
  // repeat. Neither the status nor the archive flag moves.
  private async attachSubmission(
    fields: LeadField[],
    lead: LeadRef,
    channel: LeadChannel,
    set: SetValues,
  ): Promise<OrganizationLead> {
    const fills = set.filter(
      ({ field }) =>
        !(field.key === LEAD_WHY_KEY && lead.channel === LeadChannel.form),
    );

    const attached = await this.prisma.lead.update({
      where: { id: lead.id },
      data: {
        updatedAt: new Date(),
        values: {
          createMany: {
            data: fills.map(({ field, value }) => ({
              fieldId: field.id,
              value,
            })),
            skipDuplicates: true,
          },
        },
        submissions: {
          create: {
            channel,
            values: Object.fromEntries(
              set.map(({ field, value }) => [field.key, value]),
            ),
          },
        },
      },
      select: LEAD_SELECT,
    });

    return toOrganizationLead(fields, attached);
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
