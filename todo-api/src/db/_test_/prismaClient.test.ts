import { describe, expect, it } from "vitest";
import { prisma } from "../prismaClient";

describe("prismaClient", () => {
  it("connects to the database via prisma.$connect()", async () => {
    await expect(prisma.$connect()).resolves.toBeUndefined();
    await prisma.$disconnect();
  });
});
