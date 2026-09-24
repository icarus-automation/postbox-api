import { Prisma } from '@prisma/client';

// The unique constraint a P2002 is allowed to mean, named both ways a driver can
// report it.
export type UniqueConstraint = {
  index: string;
  fields: string[];
};

type UniqueConstraintMeta = {
  driverAdapterError?: {
    cause?: {
      constraint?: { index?: string; fields?: string[] };
    };
  };
};

// Prisma 7 reports the violated constraint through the driver adapter instead of
// `meta.target`, so a P2002 says nothing on its own about which constraint failed.
// Callers name the one they expect and everything else keeps propagating.
export function isUniqueConstraintViolation(
  error: unknown,
  constraint: UniqueConstraint,
): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) return false;
  if (error.code !== 'P2002') return false;

  const violated = (error.meta as UniqueConstraintMeta | undefined)
    ?.driverAdapterError?.cause?.constraint;

  if (violated?.index) return violated.index === constraint.index;
  if (violated?.fields) {
    return constraint.fields.every((field) => violated.fields?.includes(field));
  }

  return false;
}
