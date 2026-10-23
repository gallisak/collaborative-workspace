import { config } from 'dotenv';
import { fileURLToPath } from 'node:url';
import argon2 from 'argon2';
import { PrismaPg } from '@prisma/adapter-pg';
import { generateNKeysBetween } from 'fractional-indexing';
import { PrismaClient, WorkspaceRole } from '../src/generated/prisma/client.js';

config({ path: fileURLToPath(new URL('../../.env', import.meta.url)), quiet: true });

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

const SEED_PASSWORD = 'Password123!';

const USERS = [
  { email: 'ann@collab.local', name: 'Ann Owner', role: WorkspaceRole.OWNER },
  { email: 'bob@collab.local', name: 'Bob Editor', role: WorkspaceRole.EDITOR },
  { email: 'cara@collab.local', name: 'Cara Viewer', role: WorkspaceRole.VIEWER },
];

async function main() {
  if (await prisma.user.findUnique({ where: { email: USERS[0].email } })) {
    console.log('Seed data already present, skipping');
    return;
  }

  const passwordHash = await argon2.hash(SEED_PASSWORD);
  await prisma.$transaction(async (tx) => {
    const users = await Promise.all(
      USERS.map(({ email, name }) => tx.user.create({ data: { email, name, passwordHash } })),
    );
    const workspace = await tx.workspace.create({
      data: {
        name: 'Demo workspace',
        members: {
          create: USERS.map(({ role }, index) => ({ userId: users[index].id, role })),
        },
      },
    });
    const [first, second] = generateNKeysBetween(null, null, 2);
    const createdById = users[0].id;
    const guide = await tx.document.create({
      data: { workspaceId: workspace.id, title: 'Getting started', position: first, createdById },
    });
    await tx.document.create({
      data: { workspaceId: workspace.id, title: 'Team notes', position: second, createdById },
    });
    await tx.document.create({
      data: {
        workspaceId: workspace.id,
        parentId: guide.id,
        title: 'Roadmap',
        position: generateNKeysBetween(null, null, 1)[0],
        createdById,
      },
    });
  });

  console.log(`Seeded ${USERS.map((u) => u.email).join(', ')} with password ${SEED_PASSWORD}`);
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
