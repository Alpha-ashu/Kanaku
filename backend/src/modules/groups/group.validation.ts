import { z } from '../../middleware/validate';

const groupMemberSchema = z.object({
  name: z.string().min(1),
  share: z.number().nonnegative(),
  paid: z.boolean().optional(),
  friendId: z.union([z.string(), z.number()]).optional(),
  email: z.string().optional(),
  phone: z.string().optional(),
  isCurrentUser: z.boolean().optional(),
  paidAmount: z.number().optional(),
  paymentStatus: z.string().optional(),
});

const groupItemSchema = z.object({
  name: z.string().min(1),
  amount: z.number().nonnegative(),
  sharedBy: z.array(z.string()).optional(),
});

export const groupCreateSchema = z.object({
  name: z.string().min(1),
  totalAmount: z.number().nonnegative(),
  paidBy: z.union([z.string(), z.number()]).optional(),
  date: z.string().datetime().or(z.string().min(1)),
  members: z.array(z.union([z.string(), groupMemberSchema])),
  items: z.array(groupItemSchema).optional(),
  description: z.string().optional(),
  category: z.string().optional(),
  splitType: z.enum(['equal', 'custom']).optional(),
  yourShare: z.number().optional(),
  status: z.enum(['pending', 'settled']).optional(),
});

export const groupUpdateSchema = groupCreateSchema.partial();

export const groupIdParamSchema = z.object({
  id: z.string().min(1),
});
