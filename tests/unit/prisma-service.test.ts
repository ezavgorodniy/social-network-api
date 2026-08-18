describe('PrismaService', () => {
  const originalDatabaseUrl = process.env.DATABASE_URL;

  afterEach(() => {
    if (originalDatabaseUrl === undefined) {
      delete process.env.DATABASE_URL;
    } else {
      process.env.DATABASE_URL = originalDatabaseUrl;
    }
    jest.resetModules();
  });

  it('throws when DATABASE_URL is not set', async () => {
    delete process.env.DATABASE_URL;
    const { PrismaService } = await import('@app/prisma/prisma.service');
    expect(() => new PrismaService()).toThrow('DATABASE_URL must be set');
  });

  it('throws when DATABASE_URL is empty', async () => {
    process.env.DATABASE_URL = '';
    const { PrismaService } = await import('@app/prisma/prisma.service');
    expect(() => new PrismaService()).toThrow('DATABASE_URL must be set');
  });

  it('constructs with the pg driver adapter when DATABASE_URL is set', async () => {
    process.env.DATABASE_URL = 'postgresql://app:app@localhost:5432/social_network';
    const { PrismaService } = await import('@app/prisma/prisma.service');
    expect(() => new PrismaService()).not.toThrow();
  });

  it('connects on module init and disconnects on destroy', async () => {
    process.env.DATABASE_URL = 'postgresql://app:app@localhost:5432/social_network';
    const { PrismaService } = await import('@app/prisma/prisma.service');
    const service = new PrismaService();
    const connect = jest.spyOn(service, '$connect').mockResolvedValue(undefined);
    const disconnect = jest.spyOn(service, '$disconnect').mockResolvedValue(undefined);

    await service.onModuleInit();
    await service.onModuleDestroy();

    expect(connect).toHaveBeenCalledTimes(1);
    expect(disconnect).toHaveBeenCalledTimes(1);
  });
});
