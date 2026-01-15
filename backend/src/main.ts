import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import compression from 'compression';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { AppModule } from './app.module';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { getPrimaryIP } from './common/utils/ip.util';
import { MaskedLogger } from './common/logger/masked.logger';
import { RedisIoAdapter } from './common/redis/redis-io.adapter';
import { UpdateLifecycleInterceptor } from './common/interceptors/update-lifecycle.interceptor';
import { LedgerGateway } from './ledgers/ledger.gateway';

/**
 * 启动应用程序
 */
async function bootstrap() {
  const logger = new MaskedLogger('Bootstrap');
  const app = await NestFactory.create(AppModule, {
    logger: logger,
  });

  // 设置为全局日志器，这样所有使用 Logger 类的服务都会应用脱敏逻辑
  app.useLogger(logger);

  // 启用安全头
  app.use(helmet());

  // 启用响应压缩
  app.use(compression());

  const configService = app.get(ConfigService);
  const port = configService.get<number>('PORT', 3000);
  const host = configService.get<string>('APP_HOST', '0.0.0.0');

  // 配置 Redis Socket.io 适配器
  const redisIoAdapter = new RedisIoAdapter(app);
  const redisClient = app.get('REDIS_CLIENT');
  await redisIoAdapter.connectToRedis(redisClient);
  app.useWebSocketAdapter(redisIoAdapter);

  const apiPrefix = configService.get<string>('API_PREFIX', 'api/v1');
  const nodeEnv = configService.get<string>('NODE_ENV', 'development');

  // 速率限制
  app.use(
    rateLimit({
      windowMs: 15 * 60 * 1000, // 15 分钟
      max: 1000, // 每个 IP 限制 1000 个请求
      message: '请求过于频繁，请稍后再试',
    }),
  );

  app.setGlobalPrefix(apiPrefix);

  // 获取 LedgerGateway 实例用于拦截器
  const ledgerGateway = app.get(LedgerGateway);

  // 注册统一响应格式拦截器
  app.useGlobalInterceptors(
    new TransformInterceptor(),
    new LoggingInterceptor(),
    new UpdateLifecycleInterceptor(ledgerGateway),
  );

  // 注册全局异常过滤器
  app.useGlobalFilters(new AllExceptionsFilter());

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  const corsOrigins = configService
    .get<string>('CORS_ORIGINS', 'http://localhost:8000,http://127.0.0.1:8000')
    .split(',');

  app.enableCors({
    origin: (origin, callback) => {
      // 允许没有 origin 的请求 (如移动端或 curl)
      if (!origin) {
        callback(null, true);
        return;
      }

      const originUrl = new URL(origin);
      const hostname = originUrl.hostname;

      // 动态允许本地 IP 和配置的 Origins
      // 注意：生产环境应严格限制域名模式，此处正则表达式已脱敏处理
      if (
        hostname === 'localhost' ||
        hostname === '127.0.0.1' ||
        hostname === '::1' ||
        corsOrigins.some((o) => o.includes(hostname)) ||
        /^192\.168\.\d{1,3}\.\d{1,3}$/.test(hostname) || // 允许局域网 IP
        /^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname) ||
        /^172\.(1[6-9]|2[0-9]|3[0-1])\.\d{1,3}\.\d{1,3}$/.test(hostname)
      ) {
        callback(null, true);
      } else {
        logger.warn(`CORS 拒绝了来自 ${origin} 的请求`);
        callback(new Error('Not allowed by CORS'));
      }
    },
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    credentials: true,
  });

  if (nodeEnv === 'development') {
    const swaggerConfig = new DocumentBuilder()
      .setTitle(configService.get<string>('SWAGGER_TITLE', '个人财务管理 API'))
      .setDescription(
        configService.get<string>('SWAGGER_DESCRIPTION', '个人财务管理应用程序接口文档'),
      )
      .setVersion(configService.get<string>('SWAGGER_VERSION', '1.0.0'))
      .addBearerAuth()
      .addTag('认证', '用户认证相关接口')
      .addTag('分类', '收支分类管理接口')
      .addTag('交易', '交易记录管理接口')
      .addTag('债务', '债务管理接口')
      .addTag('统计', '数据统计分析接口')
      .addTag('备份', '数据备份与恢复接口')
      .build();

    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('docs', app, document, {
      customSiteTitle: '个人财务管理 API Docs',
      customCss: `
        .swagger-ui .topbar { display: none }
        .swagger-ui .info { margin: 20px 0 }
      `,
      swaggerOptions: {
        persistAuthorization: true,
        docExpansion: 'none',
        filter: true,
        showRequestDuration: true,
      },
    });
  }

  const primaryIP = getPrimaryIP();
  await app.listen(port, host);

  logger.log(`🚀 应用已启动并监听所有网卡接口`);
  logger.log(`🏠 本地访问: http://localhost:${port}/${apiPrefix}`);
  logger.log(`🌐 网络访问: http://${primaryIP}:${port}/${apiPrefix}`);
  logger.log(`📚 API文档: http://${primaryIP}:${port}/docs`);
  logger.log(`🌍 环境: ${nodeEnv}`);
}

bootstrap();
