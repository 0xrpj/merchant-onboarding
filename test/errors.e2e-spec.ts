import {
  Body,
  Controller,
  Get,
  HttpStatus,
  INestApplication,
  Module,
  Post,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Type } from 'class-transformer';
import { IsString, ValidateNested } from 'class-validator';
import request from 'supertest';
import { App } from 'supertest/types';
import { configureApp } from '@/app.setup';
import { AppException } from '@/common/errors/app.exception';
import { ErrorCode } from '@/common/errors/error-codes';

// A small controller that exists only in this test, to trigger each kind of error.
class OwnerDto {
  @IsString()
  fullName: string;
}

class CreateThingDto {
  @IsString()
  name: string;

  @ValidateNested()
  @Type(() => OwnerDto)
  owner: OwnerDto;
}

@Controller('test-errors')
class TestErrorsController {
  @Post()
  create(@Body() body: CreateThingDto) {
    return body;
  }

  @Get('conflict')
  conflict() {
    throw new AppException(
      HttpStatus.CONFLICT,
      ErrorCode.INVALID_STATE_TRANSITION,
      'Cannot approve an application in DRAFT state',
    );
  }

  @Get('crash')
  crash() {
    throw new Error('connect ECONNREFUSED 10.0.3.12:5432');
  }
}

@Module({ controllers: [TestErrorsController] })
class TestErrorsModule {}

describe('Error format and request ID (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [TestErrorsModule],
    }).compile();

    // logger: false keeps the expected 500 error out of the test output.
    app = moduleRef.createNestApplication({ logger: false });
    configureApp(app);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  const validBody = { name: 'Himal Brew', owner: { fullName: 'Sita Sharma' } };

  it('accepts a valid body', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/test-errors')
      .send(validBody)
      .expect(201);
  });

  it('rejects unknown fields with 400 VALIDATION_FAILED and per-field details', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/test-errors')
      .send({ ...validBody, status: 'APPROVED' })
      .expect(400);

    expect(res.body).toMatchObject({
      statusCode: 400,
      error: 'Bad Request',
      code: 'VALIDATION_FAILED',
      details: [
        { field: 'status', messages: ['property status should not exist'] },
      ],
    });
  });

  it('names nested fields with a dotted path', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/test-errors')
      .send({ name: 'Himal Brew', owner: { fullName: 42 } })
      .expect(400);

    expect(res.body.details).toEqual([
      { field: 'owner.fullName', messages: ['fullName must be a string'] },
    ]);
  });

  it('treats malformed JSON as VALIDATION_FAILED', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/test-errors')
      .set('Content-Type', 'application/json')
      .send('{"name": ')
      .expect(400);

    expect(res.body.code).toBe('VALIDATION_FAILED');
  });

  it('keeps the code of an AppException', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/test-errors/conflict')
      .expect(409);

    expect(res.body).toMatchObject({
      code: 'INVALID_STATE_TRANSITION',
      message: 'Cannot approve an application in DRAFT state',
    });
  });

  it('hides the details of unexpected errors', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/test-errors/crash')
      .expect(500);

    expect(res.body).toMatchObject({
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred',
    });
    expect(JSON.stringify(res.body)).not.toContain('10.0.3.12');
  });

  it('answers unknown routes with 404 NOT_FOUND', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/does-not-exist')
      .expect(404);

    expect(res.body.code).toBe('NOT_FOUND');
  });

  it('puts the same request ID in the header and the error body', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/does-not-exist')
      .expect(404);

    expect(res.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
    expect(res.body.requestId).toBe(res.headers['x-request-id']);
    expect(res.body.timestamp).toEqual(expect.any(String));
  });

  it('reuses a safe X-Request-Id sent by the caller', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/does-not-exist')
      .set('X-Request-Id', 'trace-abc-123')
      .expect(404);

    expect(res.headers['x-request-id']).toBe('trace-abc-123');
    expect(res.body.requestId).toBe('trace-abc-123');
  });

  it('replaces an unsafe X-Request-Id with a fresh one', async () => {
    const unsafe = 'x'.repeat(500);

    const res = await request(app.getHttpServer())
      .get('/api/v1/does-not-exist')
      .set('X-Request-Id', unsafe)
      .expect(404);

    expect(res.headers['x-request-id']).not.toBe(unsafe);
    expect(res.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
  });
});
