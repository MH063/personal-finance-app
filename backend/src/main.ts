import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import compression from 'compression';
import { AppModule } from './app.module';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule, {
    logger: ['error', 'warn', 'log', 'debug', 'verbose'],
  });

  // 启用响应压缩
  app.use(compression());

  const configService = app.get(ConfigService);
  const port = configService.get<number>('PORT', 3000);
  const apiPrefix = configService.get<string>('API_PREFIX', 'api/v1');
  const nodeEnv = configService.get<string>('NODE_ENV', 'development');

  app.setGlobalPrefix(apiPrefix);

  // 注册统一响应格式拦截器
  app.useGlobalInterceptors(new TransformInterceptor());

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

  const corsOrigins = configService.get<string>('CORS_ORIGINS', 'http://localhost:8000,http://127.0.0.1:8000').split(',');

  app.enableCors({
    origin: corsOrigins,
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

  const host = '192.168.66.41';
  await app.listen(port, '0.0.0.0');
  logger.log(`🚀 应用已启动: http://${host}:${port}/${apiPrefix}`);
  logger.log(`📚 API文档: http://${host}:${port}/docs`);
  logger.log(`🌍 环境: ${nodeEnv}`);
}

bootstrap();
