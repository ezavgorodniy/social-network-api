import { Test } from '@nestjs/testing';
import { REQUEST } from '@nestjs/core';
import type { IncomingMessage } from 'node:http';

import { AuthModule } from '@app/auth/auth.module';
import { TOKEN_PROVIDER, type TokenProvider, PLATFORM_TOKEN_HEADER } from '@app/auth/token-provider';
import { HttpClientModule } from '@app/http-client/http-client.module';
import { HTTP_CLIENT, type HttpClient } from '@app/http-client/http-client';

describe('AuthModule', () => {
  it('resolves a TokenProvider that reads the request header', async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AuthModule] })
      .overrideProvider(REQUEST)
      .useValue({ headers: { [PLATFORM_TOKEN_HEADER]: 'wired-token' } } as unknown as IncomingMessage)
      .compile();

    const provider = await moduleRef.resolve<TokenProvider>(TOKEN_PROVIDER);
    expect(provider.getToken()).toBe('wired-token');
  });
});

describe('HttpClientModule', () => {
  it('resolves an HttpClient implementation', async () => {
    const moduleRef = await Test.createTestingModule({ imports: [HttpClientModule] }).compile();

    const client = moduleRef.get<HttpClient>(HTTP_CLIENT);
    expect(typeof client.send).toBe('function');
  });
});
