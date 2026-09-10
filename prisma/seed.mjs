import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const client = await prisma.client.upsert({
    where: { id: "seed-client" },
    update: {},
    create: { id: "seed-client", name: "Importadora Atlântico", whatsapp: "+5511987654321" },
  });

  const driver = await prisma.driver.upsert({
    where: { id: "seed-driver" },
    update: {},
    create: { id: "seed-driver", name: "João Motorista", phone: "+5513991234567" },
  });

  await prisma.container.upsert({
    where: { code: "MSCU1234567" },
    update: {},
    create: {
      code: "MSCU1234567",
      clientId: client.id,
      driverId: driver.id,
      origin: "São Paulo/SP",
      destination: "Porto de Santos",
    },
  });

  // Portão de liberação do Tecon Santos (aproximado)
  await prisma.geofence.upsert({
    where: { id: "seed-geofence" },
    update: {},
    create: {
      id: "seed-geofence",
      name: "Portão de liberação - Tecon Santos",
      latitude: -23.94215,
      longitude: -46.31056,
      radiusM: 400,
      status: "CHEGADA_PORTAO",
    },
  });
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
